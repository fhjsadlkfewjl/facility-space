import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';
import { buildApp } from '../apps/api/src/app.js';
import { identityFromEnv } from '../apps/api/src/adapters/identity.js';
import { readFile } from 'node:fs/promises';
import { safeSvg } from '../apps/api/src/domain/svg.js';
const db = embedded();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  process.env.AUTH_MODE = 'demo';
  process.env.DEMO_TOKEN = 'backlog-test-token-2026';
  await migrate(db);
  await migrate(db);
  await seed(db);
  app = await buildApp(db, identityFromEnv());
});
after(async () => {
  await app?.close();
  await db.close();
});
const get = (url: string, role = 'admin') =>
  app.inject({ url, headers: { authorization: 'Bearer backlog-test-token-2026:' + role } });
test('standard subtype catalog and room aggregates preserve unknown versus zero', async () => {
  const types = (await get('/api/space-types')).json();
  assert.equal(types.filter((t: any) => t.id.startsWith('standard_')).length, 14);
  await db.query("UPDATE rooms SET area_m2=NULL,calculated_area_m2=NULL WHERE id='room-a'");
  const r = await get('/api/dashboard');
  assert.equal(r.statusCode, 200, r.body);
  const a = r.json();
  const room = a.rooms.find((x: any) => x.id === 'room-a');
  assert.equal(room.area_per_person, null);
  assert.ok(room.flags.includes('missing_official_area'));
  assert.ok(a.floors[0].missing_official >= 1);
  assert.ok(a.buildings.length);
  assert.equal((await get('/api/dashboard', 'employee')).statusCode, 403);
});
test('inventory finds trim-equivalent duplicates and blanks without guessing identity', async () => {
  await db.query("UPDATE furniture SET inventory_number=' SAME ' WHERE id='furniture-1'");
  await db.query("UPDATE furniture SET inventory_number='SAME' WHERE id='furniture-2'");
  await db.query("UPDATE furniture SET inventory_number='  ' WHERE id='furniture-3'");
  const dup = await get('/api/inventory?quality=duplicate');
  assert.equal(dup.statusCode, 200, dup.body);
  assert.equal(dup.json().length, 2);
  assert.ok(dup.json().every((r: any) => r.inventory_copies === 2));
  const missing = (await get('/api/inventory?quality=missing')).json();
  assert.ok(missing.some((r: any) => r.id === 'furniture-3'));
  assert.deepEqual((await get('/api/inventory?quality=duplicate&floor=absent')).json(), []);
  assert.equal((await get('/api/inventory?quality=invalid')).statusCode, 400);
});
test('audit pages and queries, booking filters, rate date validation', async () => {
  assert.equal((await get('/api/audit?offset=-1')).statusCode, 400);
  assert.deepEqual((await get('/api/audit?q=no-such-action')).json(), []);
  assert.equal((await get('/api/bookings?status=invalid')).statusCode, 400);
  assert.equal((await get('/api/bookings?status=future')).statusCode, 200);
  assert.equal((await get('/api/costs?asOf=bad')).statusCode, 400);
  assert.equal((await get('/api/costs?asOf=2026-01-01')).statusCode, 200);
});
test('captured renderable floor passes the same sanitizer as uploads', async () => {
  const svg = await readFile(
    new URL('../evidence/renderable/floor-108760.svg', import.meta.url),
    'utf8',
  );
  assert.ok(safeSvg(svg).includes('6366 2348.001'));
  assert.throws(() => safeSvg('<svg><path stroke-miterlimit="url(https://example.com)"/></svg>'));
});

test('disable requires release and prevents booking, re-enable is audited', async () => {
  const patch = (id: string, status: string) =>
    app.inject({
      method: 'PATCH',
      url: '/api/workplaces/' + id + '/status',
      payload: { status },
      headers: { authorization: 'Bearer backlog-test-token-2026:admin' },
    });
  assert.equal((await patch('workplace-1', 'disabled')).statusCode, 409);
  const r = await patch('workplace-16', 'disabled');
  assert.equal(r.statusCode, 200, r.body);
  const start = new Date(Date.now() + 86400000).toISOString(),
    end = new Date(Date.now() + 90000000).toISOString();
  const availability = await get(
    '/api/availability?' + new URLSearchParams({ kind: 'workplace', startsAt: start, endsAt: end }),
  );
  assert.ok(!availability.json().some((x: any) => x.id === 'workplace-16'));
  assert.equal((await patch('workplace-16', 'available')).statusCode, 200);
  assert.equal((await get('/api/audit?q=workplace.status')).json().length, 2);
});
