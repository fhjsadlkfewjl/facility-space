import test from 'node:test';
import assert from 'node:assert/strict';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { importSnapshot } from '../scripts/import.js';
import type { BitrixSnapshot, LegacyElement } from '../apps/api/src/adapters/bitrix.js';
const element = (
  id: string,
  iblock: number,
  properties: Record<string, string[]>,
): LegacyElement => ({ id, iblock, properties, name: id, active: true });
const fixture: BitrixSnapshot = {
  source: 'fixture',
  report: { sha256: 'fixture-sha' },
  elements: [
    element('1', 133, {}),
    element('2', 134, { BUILDING_ID: ['1'] }),
    element('3', 135, { LEVEL_ID: ['2'], SHAPE: ['M0 0h100v100h-100z'], AREA: ['25'] }),
    element('4', 132, { IS_TABLE: ['225'] }),
    element('5', 136, {
      LEVEL_ID: ['2'],
      TEMPLATE_ID: ['4'],
      ZONE_ID: ['3'],
      INV: ['D1'],
      POSITION: ['20:20:0'],
    }),
    element('6', 136, {
      LEVEL_ID: ['2'],
      TEMPLATE_ID: ['4'],
      ZONE_ID: ['3'],
      INV: ['D2'],
      POSITION: ['50:50:0'],
    }),
  ],
  employees: [
    { id: '1', name: 'One', position: '', active: true, table_num: 'D1' },
    { id: '2', name: 'Two', position: '', active: true, table_num: 'D1' },
    { id: '3', name: 'Three', position: '', active: true, table_num: 'D2' },
  ],
};
test('dry-run leaves database empty; ambiguous assignments quarantined; apply is idempotent', async () => {
  const db = embedded();
  try {
    await migrate(db);
    const dry = await importSnapshot(db, fixture);
    assert.equal(dry.counts.workplace_assignments, 1);
    assert.equal(dry.quarantine.length, 2);
    assert.equal((await db.query('SELECT * FROM buildings')).rows.length, 0);
    await importSnapshot(db, fixture, true);
    assert.equal((await db.query('SELECT * FROM workplace_assignments')).rows.length, 1);
    assert.equal((await db.query('SELECT * FROM migration_quarantine')).rows.length, 2);
    const repeat = await importSnapshot(db, fixture, true);
    assert.equal(repeat.warnings[0].reason, 'Already imported; no changes');
    assert.equal((await db.query('SELECT * FROM workplace_assignments')).rows.length, 1);
    await assert.rejects(
      () => importSnapshot(db, { ...fixture, report: { sha256: 'other' } }, true),
      /empty office database/,
    );
  } finally {
    await db.close();
  }
});

test('legacy decimal comma is preserved as official area', async () => {
  const db = embedded();
  try {
    await migrate(db);
    const source = structuredClone(fixture);
    source.elements.find((e) => e.iblock === 135)!.properties.AREA = ['25,5'];
    await importSnapshot(db, source, true);
    const r = (await db.query("SELECT area_m2,calculated_area_m2 FROM rooms WHERE id='r-3'"))
      .rows[0];
    assert.equal(Number(r.area_m2), 25.5);
    assert.equal(r.calculated_area_m2, null);
  } finally {
    await db.close();
  }
});
