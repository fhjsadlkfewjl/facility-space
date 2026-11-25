import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';
import { buildApp } from '../apps/api/src/app.js';
import { identityFromEnv } from '../apps/api/src/adapters/identity.js';
import { safeSvg } from '../apps/api/src/domain/svg.js';
import { polygonArea, csv } from '../apps/api/src/facility.js';
const db = embedded();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  process.env.AUTH_MODE = 'demo';
  process.env.DEMO_TOKEN = 'facility-test-token';
  await migrate(db);
  await seed(db);
  app = await buildApp(db, identityFromEnv());
});
after(async () => {
  await app?.close();
  await db.close();
});
const req = (method: any, url: string, payload?: unknown, role = 'admin') =>
  app.inject({
    method,
    url,
    payload: payload as any,
    headers: { authorization: 'Bearer facility-test-token:' + role },
  });
const post = (url: string, p: unknown, role = 'admin') => req('POST', url, p, role);
const version = async () =>
  Number((await db.query("SELECT version FROM floors WHERE id='demo-floor'")).rows[0].version);
const startsAt = new Date(Date.now() + 86400000).toISOString(),
  endsAt = new Date(Date.now() + 90000000).toISOString();
const b = {
  kind: 'workplace',
  resourceId: 'workplace-7',
  employeeId: 'employee-7',
  startsAt,
  endsAt,
};
let bookingId: string;
test('booking conflict and assignment conflict preserve audit atomically', async () => {
  const created = await post('/api/bookings', b);
  assert.equal(created.statusCode, 200, created.body);
  bookingId = created.json().id;
  assert.equal((await post('/api/bookings', { ...b, employeeId: 'employee-8' })).statusCode, 409);
  assert.equal((await post('/api/bookings', { ...b, resourceId: 'workplace-8' })).statusCode, 409);
  assert.equal(
    (await post('/api/assignments', { employeeId: 'employee-8', workplaceId: 'workplace-7' }))
      .statusCode,
    409,
  );
  assert.equal(
    (await post('/api/bookings', { ...b, resourceId: 'workplace-1', employeeId: 'employee-8' }))
      .statusCode,
    409,
  );
  assert.equal(
    (await db.query("SELECT * FROM audit_log WHERE action='booking.create'")).rows.length,
    1,
  );
});
test('half-open booking windows allow adjacent intervals; ownership and cancellation', async () => {
  const adjacent = await post('/api/bookings', {
    ...b,
    startsAt: endsAt,
    endsAt: new Date(Date.parse(endsAt) + 3600000).toISOString(),
  });
  assert.equal(adjacent.statusCode, 200, adjacent.body);
  assert.equal(
    (await post('/api/bookings/' + bookingId + '/cancel', {}, 'employee')).statusCode,
    403,
  );
  assert.equal((await post('/api/bookings/' + bookingId + '/cancel', {})).statusCode, 200);
  assert.equal((await post('/api/bookings/' + bookingId + '/cancel', {})).statusCode, 200);
  assert.equal((await post('/api/bookings', b)).statusCode, 200);
});
test('booking validation and independent parking availability', async () => {
  assert.equal((await post('/api/bookings', { ...b, endsAt: startsAt })).statusCode, 400);
  assert.equal(
    (
      await post('/api/bookings', {
        ...b,
        startsAt: '2020-01-01T10:00:00Z',
        endsAt: '2020-01-01T11:00:00Z',
      })
    ).statusCode,
    400,
  );
  assert.equal((await post('/api/bookings', b, 'employee')).statusCode, 403);
  const p = await post('/api/bookings', {
    ...b,
    kind: 'parking',
    resourceId: 'parking-1',
    vehicle: 'DEMO-123',
  });
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(
    (
      await post('/api/parking/assignments', {
        employeeId: 'employee-7',
        parkingSpotId: 'parking-1',
      })
    ).statusCode,
    409,
  );
  assert.equal((await req('GET', '/api/bookings', undefined, 'employee')).json().length, 0);
});
test('facilities cannot mutate an unassigned building or grant themselves access', async () => {
  const building = await post('/api/buildings', { name: 'Protected' });
  assert.equal(building.statusCode, 200);
  const key = building.json().id;
  assert.equal(
    (
      await post(
        '/api/floors',
        { building_id: key, name: '1', number: 1, width: 100, height: 100 },
        'facilities',
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await req(
        'PUT',
        '/api/managers',
        { building_id: key, employee_id: 'employee-1', role: 'manager' },
        'facilities',
      )
    ).statusCode,
    403,
  );
  assert.equal(
    (await post('/api/parking', { building_id: key, number: 'P1' }, 'facilities')).statusCode,
    403,
  );
  assert.equal(
    (
      await req('PUT', '/api/managers', {
        building_id: key,
        employee_id: 'employee-1',
        role: 'manager',
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await post(
        '/api/floors',
        { building_id: key, name: '1', number: 1, width: 100, height: 100 },
        'facilities',
      )
    ).statusCode,
    200,
  );
  assert.equal(
    (await req('DELETE', '/api/managers', { building_id: key, employee_id: 'employee-1' }))
      .statusCode,
    200,
  );
});
test('room shape uses explicit scale, preserves official area and rejects stale and bowtie contours', async () => {
  const v = await version(),
    room = {
      floor_id: 'demo-floor',
      name: 'New room',
      space_type_id: 'office',
      area_m2: 99,
      polygon: [
        [50, 370],
        [150, 370],
        [150, 410],
        [50, 410],
      ],
      expectedVersion: v,
    };
  const r = await post('/api/rooms', room);
  assert.equal(r.statusCode, 200, r.body);
  const row = (await req('GET', '/api/rooms/' + r.json().id)).json();
  assert.equal(Number(row.area_m2), 99);
  assert(Math.abs(Number(row.calculated_area_m2) - 2) < 1e-8);
  assert.equal((await post('/api/rooms', room)).statusCode, 409);
  assert.equal(
    (
      await post('/api/rooms', {
        ...room,
        expectedVersion: await version(),
        polygon: [
          [0, 0],
          [50, 50],
          [0, 50],
          [50, 0],
        ],
      })
    ).statusCode,
    422,
  );
  assert.equal(
    (
      await req('PATCH', '/api/floors/demo-floor/scale', {
        meters_per_unit: 0.1,
        expectedVersion: await version(),
      })
    ).statusCode,
    200,
  );
  const updated = (await req('GET', '/api/rooms/' + row.id)).json();
  assert.equal(Number(updated.area_m2), 99);
  assert.equal(Number(updated.calculated_area_m2), 40);
});
test('furniture create, resize, arbitrary rotation and safe archive with history', async () => {
  const item = {
    floor_id: 'demo-floor',
    template_id: 'desk',
    x: 600,
    y: 500,
    width: 30,
    depth: 20,
    rotation: 37,
    inventory_number: 'INV-NEW',
    workplace_code: 'NEW-DESK',
    expectedVersion: await version(),
  };
  const created = await post('/api/furniture', item);
  assert.equal(created.statusCode, 200, created.body);
  const key = created.json().id;
  const resized = await req('PUT', '/api/floors/demo-floor/layout', {
    expectedVersion: await version(),
    changes: [{ id: key, x: 610, y: 510, width: 32, depth: 22, rotation: 397 }],
  });
  assert.equal(resized.statusCode, 200, resized.body);
  const saved = (await db.query('SELECT * FROM furniture WHERE id=$1', [key])).rows[0];
  assert.equal(saved.rotation, 37);
  assert.equal(saved.width, 32);
  const workplace = (await db.query('SELECT id FROM workplaces WHERE furniture_id=$1', [key]))
    .rows[0].id;
  assert.equal(
    (await post('/api/assignments', { employeeId: 'employee-8', workplaceId: workplace }))
      .statusCode,
    200,
  );
  assert.equal(
    (await post('/api/furniture/' + key + '/archive', { expectedVersion: await version() }))
      .statusCode,
    409,
  );
  await post('/api/assignments', { employeeId: 'employee-8', workplaceId: null });
  assert.equal(
    (await post('/api/furniture/' + key + '/archive', { expectedVersion: await version() }))
      .statusCode,
    200,
  );
  assert.equal((await post('/api/bookings', { ...b, resourceId: workplace })).statusCode, 409);
});
test('multiple workplaces per furniture and inventory verification are persisted', async () => {
  const second = await post('/api/workplaces', { furniture_id: 'furniture-16', code: 'SHARED-2' });
  assert.equal(second.statusCode, 200, second.body);
  const l = (await req('GET', '/api/floors/demo-floor/layout')).json();
  assert.equal(l.furniture.filter((f: any) => f.id === 'furniture-16').length, 1);
  const check = await req(
    'PATCH',
    '/api/inventory/furniture-16',
    { inventory_number: 'INV-CHECKED', condition: 'repair', note: 'Demo inspection' },
    'facilities',
  );
  assert.equal(check.statusCode, 200, check.body);
  const rows = (await req('GET', '/api/inventory?q=INV-CHECKED')).json();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].condition, 'repair');
  assert(rows[0].checked_at);
  assert.equal((await req('GET', '/api/inventory', undefined, 'employee')).statusCode, 403);
});
test('SVG is reconstructed, active content/external references rejected; upload is versioned', async () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="1" y="1" width="10" height="10" fill="#fff"/></svg>';
  assert.equal(safeSvg(svg), svg);
  for (const unsafe of [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="alert(1)"></svg>',
    '<svg><image href="https://example.com"/></svg>',
    '<!DOCTYPE svg><svg/>',
    '<svg><rect fill="url(#x)"/></svg>',
    '<svg><g></svg>',
  ])
    assert.throws(() => safeSvg(unsafe));
  const v = await version(),
    r = await req('PUT', '/api/floors/demo-floor/background', { svg, expectedVersion: v });
  assert.equal(r.statusCode, 200, r.body);
  assert.equal(
    (await req('GET', '/api/floors/demo-floor/layout')).json().floor.background_svg,
    svg,
  );
  assert.equal(
    (await req('PUT', '/api/floors/demo-floor/background', { svg, expectedVersion: v })).statusCode,
    409,
  );
});
test('dashboard, scoped parking tariffs and protected CSV reports', async () => {
  const d = await req('GET', '/api/dashboard');
  assert.equal(d.statusCode, 200, d.body);
  assert(d.json().rooms.length >= 4);
  assert.equal((await req('GET', '/api/dashboard', undefined, 'employee')).statusCode, 403);
  const rate = {
    building_id: 'demo-building',
    rate_per_spot: 5000,
    currency: 'RUB',
    valid_from: '2026-01-01',
  };
  assert.equal((await post('/api/parking-rates', rate, 'facilities')).statusCode, 200);
  assert.equal((await post('/api/parking-rates', rate)).statusCode, 409);
  const p = await req('GET', '/api/parking-costs');
  assert.equal(p.statusCode, 200, p.body);
  assert.equal(Number(p.json()[0].monthly_cost), 30000);
  const report = await req('GET', '/api/reports/inventory.csv');
  assert.equal(report.statusCode, 200, report.body);
  assert.match(report.headers['content-type'] as string, /text\/csv/);
  assert(report.body.includes('INV-CHECKED'));
  assert.equal(
    (await req('GET', '/api/reports/inventory.csv', undefined, 'employee')).statusCode,
    403,
  );
  assert(csv([{ name: '=WEBSERVICE("x")' }]).includes("'=WEBSERVICE"));
  assert.equal(
    polygonArea(
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ],
      0.1,
    ),
    1,
  );
});

test('availability respects interval boundaries, cancellation, inactive resources and inventory filters', async () => {
  const start = new Date(Date.now() + 30 * 86400000).toISOString(),
    end = new Date(Date.now() + 30 * 86400000 + 3600000).toISOString();
  const path = (kind = 'parking', a = start, b = end) =>
    '/api/availability?' + new URLSearchParams({ kind, startsAt: a, endsAt: b });
  assert.equal((await req('GET', path('parking', end, start))).statusCode, 400);
  const initial = await req('GET', path());
  assert.equal(initial.statusCode, 200, initial.body);
  const id = initial.json()[0].id;
  const booked = await post('/api/bookings', {
    kind: 'parking',
    resourceId: id,
    employeeId: 'employee-8',
    startsAt: start,
    endsAt: end,
  });
  assert.equal(booked.statusCode, 200, booked.body);
  assert.ok(!(await req('GET', path())).json().some((r: any) => r.id === id));
  assert.ok(
    (await req('GET', path('parking', end, new Date(Date.parse(end) + 3600000).toISOString())))
      .json()
      .some((r: any) => r.id === id),
  );
  await post('/api/bookings/' + booked.json().id + '/cancel', {});
  assert.ok((await req('GET', path())).json().some((r: any) => r.id === id));
  await db.query("UPDATE parking_spots SET status='disabled' WHERE id=$1", [id]);
  assert.ok(!(await req('GET', path())).json().some((r: any) => r.id === id));
  await db.query("UPDATE parking_spots SET status='available' WHERE id=$1", [id]);
  assert.deepEqual((await req('GET', '/api/inventory?building=nonexistent')).json(), []);
  assert.deepEqual((await req('GET', '/api/inventory?condition=retired')).json(), []);
  assert.equal((await req('GET', '/api/inventory?condition=invalid')).statusCode, 400);
});
