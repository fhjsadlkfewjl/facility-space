import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { embedded } from '../apps/api/src/repositories/database.js';
import { migrate } from '../scripts/migrate.js';
import { seed } from '../scripts/seed.js';
import { buildApp } from '../apps/api/src/app.js';
import { identityFromEnv } from '../apps/api/src/adapters/identity.js';
const db = embedded();
let app: Awaited<ReturnType<typeof buildApp>>;
before(async () => {
  process.env.AUTH_MODE = 'demo';
  process.env.DEMO_TOKEN = 'test-token-123456789';
  await migrate(db);
  await seed(db);
  app = await buildApp(db, identityFromEnv());
});
after(async () => {
  await app?.close();
  await db.close();
});
const request = (method: any, url: string, payload?: unknown, role = 'employee') =>
  app.inject({
    method,
    url,
    payload: payload as any,
    headers: { authorization: 'Bearer test-token-123456789:' + role },
  });
test('requires authentication, denies cost and audit data to employee', async () => {
  assert.equal((await app.inject('/api/buildings')).statusCode, 401);
  for (const url of ['/api/costs', '/api/cost-rates', '/api/audit'])
    assert.equal((await request('GET', url)).statusCode, 403);
  assert.equal((await request('GET', '/api/costs', undefined, 'admin')).statusCode, 200);
  assert.equal((await request('POST', '/api/cost-rates', { rate_per_m2: 1 })).statusCode, 400);
});
test('cost field absent from ordinary read routes', async () => {
  for (const url of [
    '/api/buildings',
    '/api/floors',
    '/api/rooms?floorId=demo-floor',
    '/api/workplaces',
    '/api/floors/demo-floor/layout',
    '/api/search',
  ]) {
    const r = await request('GET', url);
    assert.equal(r.statusCode, 200);
    assert(!r.body.includes('rate_per_m2'));
    assert(!r.body.includes('total_cost'));
  }
});
test('employee cannot change other employee, invalid body rejected', async () => {
  assert.equal(
    (
      await request('POST', '/api/assignments', {
        employeeId: 'employee-2',
        workplaceId: 'workplace-7',
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (await request('POST', '/api/assignments', { employeeId: 'employee-1', workplaceId: 42 }))
      .statusCode,
    400,
  );
});
test('atomic reassign releases old seat, logs history, occupied target leaves old state', async () => {
  assert.equal(
    (
      await request('POST', '/api/assignments', {
        employeeId: 'employee-1',
        workplaceId: 'workplace-7',
      }, 'admin')
    ).statusCode,
    200,
  );
  let rows = (
    await db.query(
      "SELECT * FROM workplace_assignments WHERE employee_id='employee-1' AND valid_to IS NULL",
    )
  ).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].workplace_id, 'workplace-7');
  assert.equal(
    (
      await request('POST', '/api/assignments', {
        employeeId: 'employee-1',
        workplaceId: 'workplace-2',
      }, 'admin')
    ).statusCode,
    409,
  );
  rows = (
    await db.query(
      "SELECT * FROM workplace_assignments WHERE employee_id='employee-1' AND valid_to IS NULL",
    )
  ).rows;
  assert.equal(rows[0].workplace_id, 'workplace-7');
  assert((await db.query("SELECT * FROM audit_log WHERE action='workplace.reassign'")).rows.length);
});
test('unique seat under concurrent requests', async () => {
  const responses = await Promise.all([
    request(
      'POST',
      '/api/assignments',
      { employeeId: 'employee-7', workplaceId: 'workplace-8' },
      'admin',
    ),
    request(
      'POST',
      '/api/assignments',
      { employeeId: 'employee-8', workplaceId: 'workplace-8' },
      'admin',
    ),
  ]);
  assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
  assert.equal(
    (
      await db.query(
        "SELECT * FROM workplace_assignments WHERE workplace_id='workplace-8' AND valid_to IS NULL",
      )
    ).rows.length,
    1,
  );
});
test('layout role, geometry and version guards; snapshot/audit commit', async () => {
  const payload = {
    expectedVersion: 1,
    changes: [{ id: 'furniture-1', x: 140, y: 170, rotation: 0 }],
  };
  assert.equal((await request('PUT', '/api/floors/demo-floor/layout', payload)).statusCode, 403);
  assert.equal(
    (
      await request(
        'PUT',
        '/api/floors/demo-floor/layout',
        { ...payload, changes: [{ id: 'furniture-1', x: -100, y: -100, rotation: 0 }] },
        'admin',
      )
    ).statusCode,
    422,
  );
  assert.equal(
    (await request('PUT', '/api/floors/demo-floor/layout', payload, 'admin')).statusCode,
    200,
  );
  assert.equal(
    (await request('PUT', '/api/floors/demo-floor/layout', payload, 'admin')).statusCode,
    409,
  );
  assert.equal(
    (await db.query("SELECT version FROM floors WHERE id='demo-floor'")).rows[0].version,
    2,
  );
  assert.equal((await db.query('SELECT * FROM layout_versions')).rows.length, 2);
});
test('collision rollback leaves version and coordinates unchanged', async () => {
  const r = await request(
    'PUT',
    '/api/floors/demo-floor/layout',
    { expectedVersion: 2, changes: [{ id: 'furniture-1', x: 240, y: 160, rotation: 0 }] },
    'admin',
  );
  assert.equal(r.statusCode, 422);
  assert.equal((await db.query("SELECT x FROM furniture WHERE id='furniture-1'")).rows[0].x, 140);
});
test('parking enforces permissions, exclusivity and release', async () => {
  assert.equal(
    (
      await request('POST', '/api/parking/assignments', {
        employeeId: 'employee-1',
        parkingSpotId: 'parking-1',
      })
    ).statusCode,
    200,
  );
  assert.equal(
    (
      await request(
        'POST',
        '/api/parking/assignments',
        { employeeId: 'employee-2', parkingSpotId: 'parking-1' },
        'admin',
      )
    ).statusCode,
    409,
  );
  assert.equal(
    (
      await request('POST', '/api/parking/assignments', {
        employeeId: 'employee-1',
        parkingSpotId: null,
      })
    ).statusCode,
    200,
  );
});
test('rates use room > building > global precedence, reject overlapping validity', async () => {
  const p = {
    space_type_id: 'office',
    building_id: 'demo-building',
    room_id: null,
    rate_per_m2: 99,
    currency: 'RUB',
    period: 'month',
    valid_from: '2026-01-01',
    valid_to: null,
  };
  assert.equal((await request('POST', '/api/cost-rates', p, 'admin')).statusCode, 200);
  assert.equal((await request('POST', '/api/cost-rates', p, 'admin')).statusCode, 409);
  const costs = (await request('GET', '/api/costs', undefined, 'admin')).json();
  assert.equal(Number(costs.find((r: any) => r.id === 'room-a').rate_per_m2), 99);
});
test('unknown resources and SQL injection input do not broaden queries', async () => {
  assert.equal((await request('GET', '/api/buildings/missing')).statusCode, 404);
  assert.equal(
    (await request('GET', '/api/search?q=' + encodeURIComponent("' OR 1=1--"))).json().length,
    0,
  );
});
test('people directory distinguishes assigned records and missing names without deleting accounts',async()=>{
 await db.query("INSERT INTO employees_projection(id,display_name,active) VALUES('directory-unnamed','Employee 999999',true),('directory-named','Named unassigned fixture',true)");
 const missing=await request('GET','/api/search?scope=missing_name');assert.equal(missing.statusCode,200,missing.body);assert.ok(missing.json().some((r:any)=>r.id==='directory-unnamed'));assert.ok(!missing.json().some((r:any)=>r.id==='directory-named'));
 const assigned=await request('GET','/api/search?scope=assigned');assert.equal(assigned.statusCode,200);assert.ok(assigned.json().every((r:any)=>r.workplace_id));
 const all=await request('GET','/api/search?q=Named%20unassigned&scope=all');assert.equal(all.json()[0].id,'directory-named');
 assert.equal((await request('GET','/api/search?scope=unsupported')).statusCode,400);
});
test('admin release rejects stale assignment and accepts the displayed current assignment',async()=>{
 const current=(await db.query("SELECT id FROM workplace_assignments WHERE employee_id='employee-3' AND valid_to IS NULL")).rows[0];
 assert(current);
 assert.equal((await request('POST','/api/assignments',{employeeId:'employee-3',workplaceId:null,expectedAssignmentId:'stale-assignment'},'admin')).statusCode,409);
 assert.equal((await db.query('SELECT valid_to FROM workplace_assignments WHERE id=$1',[current.id])).rows[0].valid_to,null);
 assert.equal((await request('POST','/api/assignments',{employeeId:'employee-3',workplaceId:null,expectedAssignmentId:current.id},'admin')).statusCode,200);
});
test('imported floors with zero numbers use natural floor-name ordering within their building',async()=>{
 await db.query("INSERT INTO buildings(id,name) VALUES('sort-building','Sort test')");
 for(const name of ['10','2','1'])await db.query('INSERT INTO floors(id,building_id,name,number,width,height) VALUES($1,$2,$3,0,100,100)',['sort-'+name,'sort-building',name]);
 const response=await request('GET','/api/floors?buildingId=sort-building',undefined,'admin');
 assert.equal(response.statusCode,200);
 assert.deepEqual(response.json().map((f:any)=>f.name),['1','2','10']);
});
test('parking release rejects stale assignment and preserves current place',async()=>{
 const assigned=await request('POST','/api/parking/assignments',{employeeId:'employee-4',parkingSpotId:'parking-3'},'admin');
 assert.equal(assigned.statusCode,200);
 const spots=(await request('GET','/api/parking',undefined,'admin')).json();
 const spot=spots.find((p:any)=>p.id==='parking-3');assert(spot.assignment_id);
 assert.equal((await request('POST','/api/parking/assignments',{employeeId:'employee-4',parkingSpotId:null,expectedAssignmentId:'stale'},'admin')).statusCode,409);
 assert.equal((await request('POST','/api/parking/assignments',{employeeId:'employee-4',parkingSpotId:null,expectedAssignmentId:spot.assignment_id},'admin')).statusCode,200);
});
