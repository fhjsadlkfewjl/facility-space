import {writeFile} from 'node:fs/promises';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from './migrate.js';
import {buildApp} from '../apps/api/src/app.js';
import {identityFromEnv} from '../apps/api/src/adapters/identity.js';
const [directory,out]=process.argv.slice(2);if(!directory||!out)throw Error('Usage: local-db output-json');
process.env.AUTH_MODE='demo';process.env.DEMO_TOKEN='benchmark-local-only';
const db=embedded(directory);await migrate(db);const app=await buildApp(db,identityFromEnv());
try{
 const floor=(await db.query('SELECT floor_id,count(*) FROM furniture GROUP BY floor_id ORDER BY count(*) DESC LIMIT 1')).rows[0].floor_id;
 const endpoints=['/api/dashboard','/api/inventory?q=100','/api/search?q='+encodeURIComponent('Иван'),'/api/floors/'+floor+'/layout','/api/reports/space.csv','/api/quality-queue','/api/unified-search?q=100','/api/workplaces','/api/bookings','/api/availability?kind=workplace&startsAt='+encodeURIComponent(new Date(Date.now()+86400000).toISOString())+'&endsAt='+encodeURIComponent(new Date(Date.now()+90000000).toISOString())];
 const metrics=[];
 for(const url of endpoints){const timings=[];let status=0,bytes=0;for(let i=0;i<4;i++){const start=performance.now();const r=await app.inject({method:'GET',url,headers:{authorization:'Bearer benchmark-local-only:admin'}});status=r.statusCode;bytes=r.rawPayload.length;timings.push(Math.round((performance.now()-start)*100)/100);}metrics.push({endpoint:url,status,bytes,coldMs:timings[0],warmMs:timings.slice(1)});}
 const counts:Record<string,number>={};for(const t of ['rooms','furniture','employees_projection','room_area_history'])counts[t]=Number((await db.query('SELECT count(*) n FROM '+t)).rows[0].n);
 const classification=(await db.query('SELECT classification_confidence,needs_review,count(*)::int count FROM rooms GROUP BY classification_confidence,needs_review')).rows;
 await writeFile(out,JSON.stringify({engine:'PGlite; single process; not native PostgreSQL concurrency or load test',counts,classification,metrics},null,2));console.log(JSON.stringify({counts,metrics}));
}finally{await app.close();await db.close();}
