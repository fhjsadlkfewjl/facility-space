import test from 'node:test';
import assert from 'node:assert/strict';
import { scaleEvidence, dimensionEvidence } from '../scripts/recovery.js';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { importSnapshot } from '../scripts/import.js';
const room = (id: string, area: string, path = 'M0 0h100v100h-100z') => ({
  id,
  iblock: 135,
  name: id,
  active: true,
  properties: { AREA: [area], SHAPE: [path] },
});
test('scale inference requires exact polygons and exposes sample disagreement', () => {
  assert.equal(scaleEvidence([room('a', '25')]).candidate, 0.05);
  assert.equal(scaleEvidence([room('a', '25')]).confidence, 'low');
  assert.equal(
    scaleEvidence(Array.from({ length: 6 }, (_, i) => room(String(i), '25'))).confidence,
    'medium',
  );
  assert.equal(
    scaleEvidence([room('a', '25', 'M0 0C0 1 2 3 4 5z'), room('b', '0')]).status,
    'unknown',
  );
  assert.equal(
    scaleEvidence(['25', '25', '25', '100', '100'].map((a, i) => room(String(i), a))).confidence,
    'low',
  );
});
test('label dimensions are inferred metres only, never SVG or verified geometry', () => {
  assert.equal(dimensionEvidence('Стол 160x70').default_width, 1.6);
  assert.equal(dimensionEvidence('Стол 160x70').confidence, 'low');
  assert.equal(dimensionEvidence('Стол L 160-120').default_depth, null);
  assert.equal(dimensionEvidence('Раковина').status, 'unknown');
});
test('missing and duplicate inventory recover internal workplace identity without guessing seating', async () => {
  const db = embedded();
  try {
    await migrate(db);
    const el = (id: string, iblock: number, properties: Record<string, string[]>) => ({
      id,
      iblock,
      name: id,
      active: true,
      properties,
    });
    const source = {
      source: 'test',
      report: { sha256: 'recovery' },
      elements: [
        el('b', 133, {}),
        el('fl', 134, { BUILDING_ID: ['b'] }),
        el('t', 132, { IS_TABLE: ['225'] }),
        ...['a', 'b', 'c'].map((id, i) =>
          el(id + '-f', 136, {
            LEVEL_ID: ['fl'],
            TEMPLATE_ID: ['t'],
            INV: [i < 2 ? 'dup' : ''],
            POSITION: ['10:10:0'],
          }),
        ),
      ],
      employees: [{ id: 'u', name: 'User', active: true, position: '', table_num: 'dup' }],
    };
    const r = await importSnapshot(db, source, true);
    assert.equal(r.resolved.length, 3);
    assert.equal(r.quarantine.length, 1);
    assert.equal((await db.query('SELECT * FROM workplace_assignments')).rows.length, 0);
    const rows = (await db.query('SELECT * FROM workplaces')).rows;
    assert.equal(new Set(rows.map((r) => r.code)).size, 3);
    assert.ok(rows.every((r) => r.code_provenance === 'generated_legacy_id'));
    assert.equal(
      (await db.query("SELECT * FROM furniture WHERE inventory_number='dup'")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
