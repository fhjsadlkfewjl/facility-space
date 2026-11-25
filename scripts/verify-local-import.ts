import { readFile, writeFile } from 'node:fs/promises';
import { embedded } from '../apps/api/src/repositories/database.js';
import { importSnapshot } from './import.js';
import { migrate } from './migrate.js';
import { harSchema } from './har-evidence.js';
import assert from 'node:assert/strict';
const [stage, directory] = process.argv.slice(2);
if (!stage || !directory) throw Error('Usage: staging.json LOCAL-db-directory');
const source = JSON.parse(await readFile(stage, 'utf8'));
const db = embedded(directory);
const tables = [
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
  'audit_log',
  'import_runs',
];
async function counts() {
  return Object.fromEntries(
    await Promise.all(
      tables.map(async (t) => [
        t,
        Number((await db.query('SELECT count(*) n FROM ' + t)).rows[0].n),
      ]),
    ),
  );
}
try {
  await migrate(db);
  const before = await counts();
  assert.equal(before.import_runs, 1);
  const evidence = harSchema.parse(
    JSON.parse(await readFile('evidence/har-renderable-data.json', 'utf8')),
  );
  const replay = await importSnapshot(db, source, true, evidence);
  const after = await counts();
  assert.deepEqual(after, before);
  assert.equal(replay.warnings[0].reason, 'Already imported; no changes');
  const captured = evidence.editors.filter(e=>e.canvas.renderSvg);
  for(const editor of captured) {
    const floor=(await db.query('SELECT meters_per_unit,background_svg FROM floors WHERE id=$1',['fl-'+editor.levelId])).rows[0];
    assert.equal(floor.meters_per_unit,null);
    assert.equal(floor.background_svg,editor.canvas.renderSvg);
  }
  const report = {
    verifiedAt: new Date().toISOString(),
    sameSnapshotReplay: 'unchanged',
    counts: after,
    officialScalePreserved: true,
    renderableFloorsImported: captured.length,
  };
  await writeFile('docs/recovery/idempotency.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally {
  await db.close();
}
