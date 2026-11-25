import { OfficeRepository } from '../apps/api/src/repositories/office.js';
import { classifyRoom } from '../apps/api/src/domain/classification.js';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { postgres, embedded, type Database } from '../apps/api/src/repositories/database.js';
import { migrate } from './migrate.js';
import {
  parsePosition,
  parseShape,
  type BitrixSnapshot,
  type LegacyElement,
} from '../apps/api/src/adapters/bitrix.js';
import { ensure } from '../apps/api/src/domain/errors.js';
import { harSchema, templateEvidence, floorEvidence, itemEvidence, type HarEvidence } from './har-evidence.js';
export async function importSnapshot(
  db: Database,
  source: BitrixSnapshot,
  apply = false,
  har?: HarEvidence,
) {
  const report = {
    sourceHash: source.report.sha256,
    counts: {} as Record<string, number>,
    quarantine: [] as { sourceId: string; reason: string }[],
    resolved: [] as { sourceId: string; reason: string }[],
    warnings: [] as { sourceId: string; reason: string }[],
  };
  const rollback = new Error('dry-run');
  try {
    await db.transaction(async (tx) => {
      await tx.query('LOCK TABLE import_runs IN EXCLUSIVE MODE');
      if (
        (await tx.query('SELECT id FROM import_runs WHERE source_hash=$1', [source.report.sha256]))
          .rows.length
      ) {
        report.warnings.push({ sourceId: 'snapshot', reason: 'Already imported; no changes' });
        return;
      }
      ensure(
        !(await tx.query('SELECT id FROM buildings LIMIT 1')).rows.length,
        409,
        'Initial migration requires empty office database; post-cutover office overwrite prohibited',
      );
      const runId = randomUUID();
      await tx.query('INSERT INTO import_runs(id,source_hash,report) VALUES($1,$2,$3)', [
        runId,
        source.report.sha256,
        '{}',
      ]);
      const reject = async (id: string, reason: string, payload: unknown) => {
        report.quarantine.push({ sourceId: id, reason });
        await tx.query(
          'INSERT INTO migration_quarantine(id,run_id,source_id,reason,payload) VALUES($1,$2,$3,$4,$5)',
          [randomUUID(), runId, id, reason, JSON.stringify(payload)],
        );
      };
      const warn = (id: string, reason: string) => report.warnings.push({ sourceId: id, reason });
      const insert = async (table: string, values: Record<string, unknown>) => {
        const keys = Object.keys(values);
        await tx.query(
          `INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map((_, i) => '$' + (i + 1)).join(',')})`,
          Object.values(values),
        );
        report.counts[table] = (report.counts[table] ?? 0) + 1;
      };
      const p = (e: LegacyElement, k: string) => e.properties[k]?.[0] ?? '';
      const groups = (b: number) => source.elements.filter((e) => e.iblock === b);
      const buildings = new Set<string>(),
        floors = new Map<string, string>(),
        rooms = new Map<string, string>(),
        templates = new Map<string, boolean>(),
        workplaces = new Map<string, string>();
      const invCounts = new Map<string, number>();
      for (const e of groups(136)) {
        const code = p(e, 'INV').trim();
        if (code) invCounts.set(code, (invCounts.get(code) ?? 0) + 1);
      }
      await insert('space_types', { id: 'unclassified', name: 'Требует классификации' });
      for (const e of groups(133)) {
        await insert('buildings', {
          id: 'b-' + e.id,
          legacy_bitrix_id: e.id,
          name: e.name,
          address: p(e, 'ADDRESS'),
          city: p(e, 'TOWN'),
          active: e.active,
        });
        buildings.add(e.id);
      }
      for (const e of groups(134)) {
        const b = p(e, 'BUILDING_ID');
        if (!buildings.has(b)) {
          await reject(e.id, 'Missing building', e);
          continue;
        }
        await insert('floors', {
          id: 'fl-' + e.id,
          legacy_bitrix_id: e.id,
          building_id: 'b-' + b,
          name: e.name,
          legacy_bg_file_id: p(e, 'BG') || null,
          active: e.active,
          width: floorEvidence(e.id, har)?.width ?? 12000,
          height: floorEvidence(e.id, har)?.height ?? 8000,
          background_svg: floorEvidence(e.id, har)?.renderSvg ?? null,
          api_geometry_evidence: JSON.stringify(floorEvidence(e.id, har) ?? {}),
        });
        floors.set(e.id, b);
        warn(
          e.id,
          'SVG asset and viewport require b_file/upload export; fallback canvas is not a measured scale',
        );
      }
      for (const e of groups(135)) {
        const fl = p(e, 'LEVEL_ID');
        if (!floors.has(fl)) {
          await reject(e.id, 'Missing floor', e);
          continue;
        }
        const shape = parseShape(p(e, 'SHAPE'));
        if (shape.needsReview) warn(e.id, 'Path retained; polygon needs review');
        const rawArea = p(e, 'AREA').trim().replace(',', '.'),
          area =
            rawArea.trim() && Number.isFinite(Number(rawArea)) && Number(rawArea) >= 0
              ? Number(rawArea)
              : null;
        if (area === null) warn(e.id, 'Area unavailable; NULL preserved');
        await insert('rooms', {
          id: 'r-' + e.id,
          legacy_bitrix_id: e.id,
          floor_id: 'fl-' + fl,
          name: e.name,
          area_m2: area,
          shape: JSON.stringify(shape),
          ...classifyRoom(e.name,groups(136).some(o=>p(o,'ZONE_ID')===e.id&&groups(132).some(t=>t.id===p(o,'TEMPLATE_ID')&&p(t,'IS_TABLE')==='225'))),
          active: e.active,
        });
        await tx.query("INSERT INTO room_area_history(id,room_id,area_m2,valid_from,source,created_by) VALUES($1,$2,$3,CURRENT_DATE,'legacy import, earlier validity unknown','import')",['import-area-'+e.id,'r-'+e.id,area]);
        rooms.set(e.id, fl);
      }
      for (const e of groups(132)) {
        const isTable = p(e, 'IS_TABLE') === '225';
        await insert('furniture_templates', {
          id: 't-' + e.id,
          legacy_bitrix_id: e.id,
          name: e.name,
          legacy_svg_file_id: p(e, 'SVG') || null,
          is_workplace: isTable,
          api_geometry_evidence: JSON.stringify(templateEvidence(e, source, har) ?? {}),
        });
        templates.set(e.id, isTable);
        warn(e.id, 'Dimensions and SVG unavailable; IS_TABLE enum 225=Y verified in supplied dump');
      }
      const activeWorkplaces = new Set<string>();
      for (const e of groups(136)) {
        const fl = p(e, 'LEVEL_ID'),
          t = p(e, 'TEMPLATE_ID'),
          r = p(e, 'ZONE_ID'),
          code = p(e, 'INV').trim();
        if (!floors.has(fl) || !templates.has(t)) {
          await reject(e.id, 'Missing floor or template', e);
          continue;
        }
        let position;
        try {
          position = parsePosition(p(e, 'POSITION'));
        } catch {
          await reject(e.id, 'Malformed position', e);
          continue;
        }
        const observed = itemEvidence(e.id, fl, t, har);
        const templateElement = groups(132).find(x=>x.id===t)!;
        const observedTemplate = templateEvidence(templateElement,source,har);
        const basis = observedTemplate && 'geometry' in observedTemplate && observedTemplate.geometry.basis.length===1 ? observedTemplate.geometry.basis[0] : null;
        const dimensions = basis && basis.width>0 && basis.height>0 ? {width:basis.width,depth:basis.height} : {};
        const originalPosition = {...position};
        if(observed && 'x' in observed) position={x:observed.x,y:observed.y,rotation:observed.r};
        const room = rooms.get(r) === fl ? 'r-' + r : null;
        if (r && !room)
          warn(e.id, 'Invalid/cross-floor room reference; detached for reconciliation');
        await insert('furniture', {
          id: 'f-' + e.id,
          legacy_bitrix_id: e.id,
          floor_id: 'fl-' + fl,
          room_id: room,
          template_id: 't-' + t,
          inventory_number: code || null,
          ...position,
          ...dimensions,
          api_geometry_evidence: JSON.stringify({observation:observed,legacyPosition:originalPosition,dimensionsSource:basis?'API template basis in SVG units':null,physicalScaleConfirmed:false,placementValidated:false}),
          active: e.active,
        });
        if (templates.get(t)) {
          const internal = !code || invCounts.get(code) !== 1;
          let workplaceCode = internal ? 'LEGACY-' + e.id : code;
          // Internal identity is not an inventory number and never resolves employee seating.
          while (internal && (invCounts.has(workplaceCode) || workplaces.has(workplaceCode)))
            workplaceCode += '-local';
          const id = 'w-' + e.id;
          await insert('workplaces', {
            id,
            furniture_id: 'f-' + e.id,
            code: workplaceCode,
            code_provenance: internal ? 'generated_legacy_id' : 'source',
          });
          if (internal)
            report.resolved.push({
              sourceId: e.id,
              reason:
                'Workplace created with internal legacy ID; original INV preserved, no employee inferred',
            });
          else workplaces.set(code, id);
          const floor = groups(134).find((a) => a.id === fl),
            building = groups(133).find((a) => a.id === floors.get(fl)),
            roomElement = groups(135).find((a) => a.id === r);
          if (e.active && floor?.active && building?.active && (!r || roomElement?.active))
            activeWorkplaces.add(id);
        }
      }
      const departments = new Set<string>();
      for (const u of source.employees) {
        const d = u.department_raw;
        if (d && /^\d+$/.test(d) && !departments.has(d)) {
          await insert('departments_projection', { id: 'd-' + d, name: source.departments?.find(dep=>dep.id===d)?.name || 'Bitrix department ' + d });
          departments.add(d);
        }
      }
      const activeCodes = new Map<string, number>();
      for (const u of source.employees) {
        const c = u.table_num?.trim();
        if (u.active && c) activeCodes.set(c, (activeCodes.get(c) ?? 0) + 1);
      }
      for (const u of source.employees) {
        const d = u.department_raw;
        await insert('employees_projection', {
          id: 'e-' + u.id,
          bitrix_user_id: u.id,
          display_name: u.name,
          department_id: d && departments.has(d) ? 'd-' + d : null,
          position: u.position,
          active: u.active,
        });
        if (d && !departments.has(d)) warn(u.id, 'Unsupported department representation');
        const code = u.table_num?.trim();
        if (!code || !u.active) continue;
        const target = workplaces.get(code);
        if (activeCodes.get(code) !== 1 || !target || !activeWorkplaces.has(target)) {
          await reject(u.id, 'Ambiguous, missing or inactive workplace assignment', {
            employeeId: u.id,
            code,
          });
          continue;
        }
        await insert('workplace_assignments', {
          id: 'a-' + u.id,
          employee_id: 'e-' + u.id,
          workplace_id: target,
          created_by: 'migration',
        });
      }
      for (const legacyFloorId of floors.keys()) {
        const floorId='fl-'+legacyFloorId;
        const snapshot=await new OfficeRepository(tx).layout(floorId);
        await tx.query('INSERT INTO layout_versions(id,floor_id,version,snapshot,comment,created_by) VALUES($1,$2,$3,$4,$5,$6)',[randomUUID(),floorId,snapshot!.floor.version,JSON.stringify(snapshot),'Imported baseline','migration']);
      }
      await tx.query('UPDATE import_runs SET report=$1 WHERE id=$2', [
        JSON.stringify(report),
        runId,
      ]);
      await insert('audit_log', {
        id: randomUUID(),
        actor_id: 'migration',
        action: 'initial_import',
        entity_id: runId,
        details: JSON.stringify({ sourceHash: source.report.sha256, counts: report.counts }),
      });
      if (!apply) throw rollback;
    });
  } catch (e) {
    if (e !== rollback) throw e;
  }
  return report;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file)
    throw new Error(
      'Usage: npm run import -- staging.json [--apply] [--report path.json] [--har-evidence evidence/har-editor-data.json]',
    );
  const source = JSON.parse(await readFile(file, 'utf8'));
  const apply = process.argv.includes('--apply');
  if (apply && !process.env.DATABASE_URL) throw new Error('DATABASE_URL required for --apply');
  const db = process.env.DATABASE_URL ? postgres(process.env.DATABASE_URL) : embedded();
  try {
    await migrate(db);
    const harIndex = process.argv.indexOf('--har-evidence');
    const har =
      harIndex < 0
        ? undefined
        : harSchema.parse(JSON.parse(await readFile(process.argv[harIndex + 1], 'utf8')));
    const result = await importSnapshot(db, source, apply, har);
    const reportIndex = process.argv.indexOf('--report');
    if (reportIndex >= 0)
      await writeFile(process.argv[reportIndex + 1], JSON.stringify(result, null, 2));
    console.log(
      JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        counts: result.counts,
        quarantined: result.quarantine.length,
        warnings: result.warnings.length,
      }),
    );
  } finally {
    await db.close();
  }
}
