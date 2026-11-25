import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from '../scripts/migrate.js';
import {seed} from '../scripts/seed.js';
import {buildApp} from '../apps/api/src/app.js';
import {identityFromEnv} from '../apps/api/src/adapters/identity.js';
import {parseCsv} from '../apps/api/src/domain/csv-import.js';
import {classifyRoom} from '../apps/api/src/domain/classification.js';
const db=embedded();let app:Awaited<ReturnType<typeof buildApp>>;
before(async()=>{process.env.AUTH_MODE='demo';process.env.DEMO_TOKEN='operations-test-token';await migrate(db);await seed(db);app=await buildApp(db,identityFromEnv());});
after(async()=>{await app?.close();await db.close();});
const request=(method:any,url:string,payload?:any,role='admin')=>app.inject({method,url,payload,headers:{authorization:'Bearer operations-test-token:'+role}});
test('CSV parser handles multiline and rejects malformed/duplicate columns',()=>{
 assert.throws(()=>parseCsv('id,name\n'), /нет строк данных/);
 assert.throws(()=>parseCsv('id,name\n'+Array.from({length:501},(_,i)=>i+',Office').join('\n')), /больше 500/);
 assert.equal(parseCsv('id,name\n'+Array.from({length:500},(_,i)=>i+',Office').join('\n')).length,500);
 assert.deepEqual(parseCsv('\ufeffid,space_type_id\r\n"a\nb","x"'),[{id:'a\nb',space_type_id:'x'}]);
 for(const x of ['id,id\na,b','id,type\n"unclosed,x','id,type\n"a"x,b','id,type\na,b,c'])assert.throws(()=>parseCsv(x));
});
test('classification exposes conflicting names and numeric-room uncertainty',()=>{
 assert.equal(classifyRoom('Серверная').space_type_id,'standard_server_room');
 assert.equal(classifyRoom('Кухня / переговорная').classification_confidence,'unknown');
 assert.equal(classifyRoom('101').classification_confidence,'unknown');
 assert.equal(classifyRoom('101',true).classification_confidence,'medium');
 assert.equal(classifyRoom('Кабинет').needs_review,true);
});
test('CSV preview applies atomically, rejects stale data and reuse, enforces role',async()=>{
 const room=(await db.query('SELECT id,space_type_id FROM rooms ORDER BY id LIMIT 1')).rows[0];
 const body={csv:'id,space_type_id\n'+room.id+',standard_office'};
 assert.equal((await request('POST','/api/rooms/import-preview',body,'employee')).statusCode,403);
 const preview=(await request('POST','/api/rooms/import-preview',body)).json();assert.equal(preview.errors.length,0);
 await db.query('UPDATE rooms SET space_type_id=$2 WHERE id=$1',[room.id,'standard_kitchen']);
 assert.equal((await request('POST','/api/rooms/import-apply',{previewId:preview.previewId})).statusCode,409);
 const p=(await request('POST','/api/rooms/import-preview',body)).json();
 const a=await request('POST','/api/rooms/import-apply',{previewId:p.previewId});assert.equal(a.statusCode,200,a.body);
 assert.equal((await request('POST','/api/rooms/import-apply',{previewId:p.previewId})).statusCode,409);
 assert.equal((await request('POST','/api/rooms/import-preview',{csv:'id,space_type_id\n'+room.id+',invalid'})).json().previewId,null);
});
test('quality queue exports safe CSV and search returns typed destinations',async()=>{
 assert.equal((await request('GET','/api/quality-queue',undefined,'employee')).statusCode,403);
 const q=await request('GET','/api/quality-queue');assert.equal(q.statusCode,200,q.body);assert.ok(q.json().total>0);
 assert.equal((await request('GET','/api/quality-queue?format=csv')).headers['content-type'],'text/csv; charset=utf-8');
 const s=await request('GET','/api/unified-search?q=demo');assert.equal(s.statusCode,200,s.body);
 assert.equal((await request('GET','/api/unified-search?q=%27%3B%20DROP%20TABLE%20rooms%3B--')).statusCode,200);
 assert.ok((await db.query('SELECT count(*) FROM rooms')).rows.length);
});
test('bulk disabling rejects occupied members and rolls back',async()=>{
 assert.equal((await request('POST','/api/workplaces/bulk-status',{ids:['workplace-1'],status:'disabled'})).statusCode,409);
 assert.equal((await request('POST','/api/workplaces/bulk-status',{ids:['workplace-7','absent'],status:'disabled'})).statusCode,404);
 assert.equal((await db.query("SELECT status FROM workplaces WHERE id='workplace-7'")).rows[0].status,'available');
});
test('full restore archives additions, restores room and background, preserves history',async()=>{
 const l=(await request('GET','/api/floors/demo-floor/layout')).json();
 await db.query('INSERT INTO layout_versions(id,floor_id,version,snapshot,created_by) VALUES($1,$2,$3,$4,$5)',['restore-fixture','demo-floor',50,JSON.stringify(l),'test']);
 await db.query("UPDATE floors SET background_svg='<svg></svg>',version=51 WHERE id='demo-floor'");
 await db.query("UPDATE rooms SET name='Changed room' WHERE id=$1",[l.rooms[0].id]);
 const u='/api/floors/demo-floor/versions/50/restore';
 assert.equal((await request('POST',u,{expectedVersion:50})).statusCode,409);
 assert.equal((await request('POST',u,{expectedVersion:51},'employee')).statusCode,403);
 const result=await request('POST',u,{expectedVersion:51});assert.equal(result.statusCode,200,result.body);
 assert.equal(result.json().version,52);
 assert.equal((await db.query('SELECT name FROM rooms WHERE id=$1',[l.rooms[0].id])).rows[0].name,l.rooms[0].name);
 assert.equal((await db.query("SELECT count(*)::int n FROM layout_versions WHERE floor_id='demo-floor' AND version IN (50,52)")).rows[0].n,2);
});

test('audit and layout history reject UPDATE DELETE and TRUNCATE',async()=>{
 for(const table of ['audit_log','layout_versions'])for(const verb of ['UPDATE','DELETE','TRUNCATE']){
  const sql=verb==='UPDATE'?`UPDATE ${table} SET id=id`:verb==='DELETE'?`DELETE FROM ${table}`:`TRUNCATE ${table}`;
  await assert.rejects(()=>db.query(sql),/append-only/);
 }
});

test('restore rejects removing assigned furniture and archives unoccupied additions',async()=>{
 const l=(await request('GET','/api/floors/demo-floor/layout')).json();
 const reduced={...l,furniture:l.furniture.filter((f:any)=>f.id!=='furniture-1')};
 await db.query('INSERT INTO layout_versions(id,floor_id,version,snapshot,created_by) VALUES($1,$2,$3,$4,$5)',['unsafe-restore','demo-floor',60,JSON.stringify(reduced),'test']);
 const denied=await request('POST','/api/floors/demo-floor/versions/60/restore',{expectedVersion:l.floor.version});assert.equal(denied.statusCode,409,denied.body);
 assert.equal((await db.query("SELECT active FROM furniture WHERE id='furniture-1'")).rows[0].active,true);
 await db.query("INSERT INTO furniture(id,floor_id,room_id,template_id,x,y,width,depth,active) SELECT 'new-item',floor_id,room_id,template_id,1000,600,10,10,true FROM furniture WHERE id='furniture-7'");
 const restored=await request('POST','/api/floors/demo-floor/versions/50/restore',{expectedVersion:l.floor.version});assert.equal(restored.statusCode,200,restored.body);
 assert.equal((await db.query("SELECT active FROM furniture WHERE id='new-item'")).rows[0].active,false);
});

test('malformed JSON and oversized requests do not change state',async()=>{
 const headers={authorization:'Bearer operations-test-token:admin','content-type':'application/json'};
 assert.equal((await app.inject({method:'POST',url:'/api/rooms/import-preview',headers,payload:'{bad'})).statusCode,400);
 assert.equal((await app.inject({method:'POST',url:'/api/rooms/import-preview',headers,payload:JSON.stringify({csv:'x'.repeat(1100000)})})).statusCode,413);
});
