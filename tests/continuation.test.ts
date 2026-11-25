import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from '../scripts/migrate.js';
import {seed} from '../scripts/seed.js';
import {buildApp} from '../apps/api/src/app.js';
import {identityFromEnv} from '../apps/api/src/adapters/identity.js';
const db=embedded();let app:Awaited<ReturnType<typeof buildApp>>;
before(async()=>{process.env.AUTH_MODE='demo';process.env.DEMO_TOKEN='continuation-test';await migrate(db);await seed(db);app=await buildApp(db,identityFromEnv());});
after(async()=>{await app?.close();await db.close();});
const request=(method:any,url:string,payload?:any,role='admin')=>app.inject({method,url,payload,headers:{authorization:'Bearer continuation-test:'+role}});
test('bulk inventory rolls back on missing member and denies employee',async()=>{
 const body={ids:['furniture-1','missing'],condition:'repair',note:'synthetic check'};
 assert.equal((await request('POST','/api/inventory/bulk-check',body)).statusCode,404);
 assert.equal((await db.query("SELECT condition FROM furniture WHERE id='furniture-1'")).rows[0].condition,'in_use');
 body.ids=['furniture-1','furniture-2'];
 assert.equal((await request('POST','/api/inventory/bulk-check',body,'employee')).statusCode,403);
 assert.equal((await request('POST','/api/inventory/bulk-check',body)).json().updated,2);
 assert.equal(Number((await db.query("SELECT count(*) n FROM audit_log WHERE action='inventory.bulk-check'")).rows[0].n),2);
});
test('rate closure preserves value and rejects stale or extending closure',async()=>{
 const url='/api/cost-rates/demo-rate/close';
 assert.equal((await request('POST',url,{valid_to:'2026-06-01',expectedValidTo:null},'employee')).statusCode,403);
 assert.equal((await request('POST',url,{valid_to:'2026-06-01',expectedValidTo:null})).statusCode,200);
 assert.equal((await request('POST',url,{valid_to:'2026-05-01',expectedValidTo:null})).statusCode,409);
 assert.equal((await request('POST',url,{valid_to:'2026-07-01',expectedValidTo:'2026-06-01'})).statusCode,400);
 assert.equal(Number((await db.query("SELECT rate_per_m2 FROM cost_rates WHERE id='demo-rate'")).rows[0].rate_per_m2),2500);
});
test('version diff and geometry restoration create a new version with stale-write protection',async()=>{
 const floor='/api/floors/demo-floor';const l=(await request('GET',floor+'/layout')).json();const f=l.furniture.find((x:any)=>x.id==='furniture-1');
 const save=async(x:number,v:number)=>request('PUT',floor+'/layout',{expectedVersion:v,changes:[{id:f.id,x,y:f.y,rotation:17,width:70,depth:40}],comment:'Synthetic version test'});
 const a=await save(f.x+2,l.floor.version);assert.equal(a.statusCode,200,a.body);
 const b=await save(f.x+4,a.json().version);assert.equal(b.statusCode,200,b.body);
 const detail=await request('GET',floor+'/versions/'+a.json().version);assert.equal(detail.statusCode,200);assert.equal(detail.json().diff.length,1);
 assert.equal((await request('GET',floor+'/versions/'+a.json().version,undefined,'employee')).statusCode,403);
 const url=floor+'/versions/'+a.json().version+'/restore-geometry';
 assert.equal((await request('POST',url,{expectedVersion:a.json().version})).statusCode,409);
 const restored=await request('POST',url,{expectedVersion:b.json().version});assert.equal(restored.statusCode,200,restored.body);assert.equal(restored.json().version,b.json().version+1);
 assert.equal(Number((await db.query('SELECT x FROM furniture WHERE id=$1',[f.id])).rows[0].x),f.x+2);
});

test('all captured floor SVGs accept only inert geometry and local masks',async()=>{
 const {readFile}=await import('node:fs/promises');const {safeSvg}=await import('../apps/api/src/domain/svg.js');
 const evidence=JSON.parse(await readFile(new URL('../evidence/har-renderable-data.json',import.meta.url),'utf8'));
 for(const editor of evidence.editors)if(editor.canvas.renderSvg)assert.ok(safeSvg(editor.canvas.renderSvg).startsWith('<svg'));
 for(const svg of ['<svg><clipPath id="x"><path d="M0 0"/></clipPath><g clip-path="url(https://evil.invalid/x)"/></svg>','<svg><mask id="x"><script/></mask></svg>','<svg><use href="https://evil.invalid"/></svg>'])assert.throws(()=>safeSvg(svg));
 assert.ok(safeSvg('<svg><line x1="1" y1="2" x2="3" y2="4"/></svg>').includes('x1="1"'));
});
