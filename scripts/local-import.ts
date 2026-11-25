import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import { importSnapshot } from './import.js';
import { harSchema } from './har-evidence.js';
import { recoveryEvidence, property } from './recovery.js';
import type { BitrixSnapshot } from '../apps/api/src/adapters/bitrix.js';
const sourcePath = process.argv[2],
  dbPath = process.argv[3];
if (!sourcePath || !dbPath)
  throw Error('Usage: npm run import:local -- staging.json local-db-directory');
// Deliberately never reads DATABASE_URL or connects to a server.
const raw = await readFile(sourcePath, 'utf8'),
  source: BitrixSnapshot = JSON.parse(raw);
const db = embedded(resolve(dbPath));
try {
  await migrate(db);
  const harIndex = process.argv.indexOf('--har-evidence');
  const har = harIndex < 0 ? undefined : harSchema.parse(JSON.parse(await readFile(process.argv[harIndex + 1], 'utf8')));
  const report = await importSnapshot(db, source, true, har);
  const evidence = recoveryEvidence(source, har);
  await db.transaction(async (tx) => {
    for (const f of evidence.floors)
      await tx.query(
        'UPDATE floors SET scale_evidence=$2 WHERE id=$1 AND meters_per_unit IS NULL',
        [f.id, JSON.stringify(f.scale)],
      );
    for (const t of evidence.templates)
      await tx.query(
        'UPDATE furniture_templates SET default_width=$2,default_depth=$3,dimensions_evidence=$4 WHERE id=$1',
        [
          t.id,
          t.dimensions.default_width,
          t.dimensions.default_depth,
          JSON.stringify(t.dimensions),
        ],
      );
  });
  const elements = new Map(source.elements.map((e) => [e.id, e]));
  const furniture = source.elements.filter((e) => e.iblock === 136);
  const activeCodes = new Map<string, number>();
  for (const u of source.employees)
    if (u.active && u.table_num?.trim())
      activeCodes.set(u.table_num.trim(), (activeCodes.get(u.table_num.trim()) ?? 0) + 1);
  const quarantine = (
    await db.query('SELECT source_id,reason,payload FROM migration_quarantine ORDER BY source_id')
  ).rows.map((r) => {
    let category = 'missing_floor',
      action = 'Provide authoritative LEVEL_ID; no parent floor in source';
    const code = r.payload.code;
    if (r.payload.employeeId) {
      const matching = furniture.filter((e) => property(e, 'INV').trim() === code);
      if ((activeCodes.get(code) ?? 0) > 1) {
        category = 'multiple_active_employees';
        action = 'Choose valid occupant or confirm shared-seat policy';
      } else if (!matching.length) {
        category = 'unmatched_inventory';
        action = 'Correct employee table number or supply missing furniture';
      } else if (matching.length > 1) {
        category = 'duplicate_inventory';
        action = 'Disambiguate furniture inventory codes';
      } else if (
        property(elements.get(property(matching[0], 'TEMPLATE_ID'))!, 'IS_TABLE') !== '225'
      ) {
        category = 'non_workplace_template';
        action = 'Confirm whether this furniture provides a workplace';
      } else {
        category = 'inactive_resource';
        action = 'Confirm whether building, floor, room or furniture should be reactivated';
      }
    }
    return { sourceId: r.source_id, category, reason: r.reason, code: code ?? null, action };
  });
  const counts: Record<string, number> = {};
  for (const t of [
    'buildings',
    'floors',
    'rooms',
    'furniture_templates',
    'furniture',
    'workplaces',
    'employees_projection',
    'departments_projection',
    'workplace_assignments',
    'migration_quarantine',
  ])
    counts[t] = Number((await db.query('SELECT count(*) n FROM ' + t)).rows[0].n);
  const categories = Object.fromEntries(
    [...new Set(quarantine.map((q) => q.category))].map((c) => [
      c,
      quarantine.filter((q) => q.category === c).length,
    ]),
  );
  const summary = {
    source: 'Locally extracted redacted SQL snapshot plus separately captured allowlisted geometry evidence',
    sourceSha256: source.report.sha256,
    stagingSha256: createHash('sha256').update(raw).digest('hex'),
    database: resolve(dbPath),
    counts,
    resolvedWorkplaces: Number(
      (
        await db.query(
          "SELECT count(*) n FROM workplaces WHERE code_provenance='generated_legacy_id'",
        )
      ).rows[0].n,
    ),
    quarantineCategories: categories,
    scaleConfidence: Object.fromEntries(
      ['unknown', 'low', 'medium', 'high'].map((c) => [
        c,
        evidence.floors.filter((f) => f.scale.confidence === c).length,
      ]),
    ),
    dimensionsInferred: evidence.templates.filter((t) => t.dimensions.status === 'inferred').length,
    apiTemplatesConfirmed: evidence.templates.filter(t => t.apiGeometry?.status === 'observed').length,
    apiFloorsConfirmed: evidence.floors.filter(f => f.apiGeometry?.status === 'observed').length,
    officialScalesConfirmed: 0,
    officialDimensionsConfirmed: 0,
  };
  await mkdir('docs/recovery', { recursive: true });
  for (const [name, data] of Object.entries({ summary, evidence, quarantine, import: report }))
    await writeFile('docs/recovery/' + name + '.json', JSON.stringify(data, null, 2));
  console.log(JSON.stringify(summary, null, 2));
} finally {
  await db.close();
}
