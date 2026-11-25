import { test,before,after } from 'node:test';
import assert from 'node:assert/strict';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from '../scripts/migrate.js';
import {seed} from '../scripts/seed.js';
import {buildApp} from '../apps/api/src/app.js';
import {identityFromEnv} from '../apps/api/src/adapters/identity.js';
const db=embedded();let app:Awaited<ReturnType<typeof buildApp>>;
before(async()=>{process.env.AUTH_MODE='demo';process.env.DEMO_TOKEN='area-history-test-token';await migrate(db);await seed(db);app=await buildApp(db,identityFromEnv());});
after(async()=>{await app?.close();await db.close();});
const request=(method:any,url:string,payload?:any,role='admin')=>app.inject({method,url,payload,headers:{authorization:'Bearer area-history-test-token:'+role}});
test('historical costs use half-open area intervals and never backfill unknown past',async()=>{
 const room=(await db.query('SELECT id,area_m2 FROM rooms ORDER BY id LIMIT 1')).rows[0];
 const url='/api/rooms/'+room.id+'/area-history';
 let area=Number(room.area_m2);
 const body={area_m2:100,valid_from:'2025-01-01',source:'synthetic measurement',expectedArea:area};
 assert.equal((await request('POST',url,body,'employee')).statusCode,403);
 const a=await request('POST',url,body);assert.equal(a.statusCode,200,a.body);
 assert.equal((await request('POST',url,{...body,area_m2:200,valid_from:'2025-06-01'})).statusCode,409);
 assert.equal((await request('POST',url,{...body,area_m2:200,valid_from:'2025-06-01',expectedArea:100})).statusCode,200);
 assert.equal((await request('POST',url,{...body,area_m2:300,valid_from:'2025-06-01',expectedArea:200})).statusCode,409);
 for(const [date,expected] of [['2024-12-31',null],['2025-05-31',100],['2025-06-01',200]] as const){
   const response=await request('GET','/api/costs?asOf='+date);assert.equal(response.statusCode,200,response.body);
   const r=response.json().find((x:any)=>x.id===room.id);assert.equal(r.area_m2===null?null:Number(r.area_m2),expected);
 }
 const history=(await request('GET',url)).json();assert.equal(history.length,2);
 assert.equal((await request('POST',url,{...body,area_m2:300,valid_from:'2999-01-01',expectedArea:200})).statusCode,400);
});
