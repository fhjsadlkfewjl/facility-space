// Enrich an existing embedded local DB. Does not read DATABASE_URL.
import {readFile} from 'node:fs/promises';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from './migrate.js';
import {harSchema,templateEvidence,floorEvidence} from './har-evidence.js';
import type {BitrixSnapshot} from '../apps/api/src/adapters/bitrix.js';
const [staging,evidence,directory]=process.argv.slice(2);
if(!staging||!evidence||!directory)throw Error('Usage: staging.json evidence.json local-db-directory [--apply]');
const source:BitrixSnapshot=JSON.parse(await readFile(staging,'utf8'));
const har=harSchema.parse(JSON.parse(await readFile(evidence,'utf8')));
const templates=source.elements.filter(e=>e.iblock===132).map(e=>({id:'t-'+e.id,value:templateEvidence(e,source,har)})).filter(e=>e.value?.status==='observed');
const floors=source.elements.filter(e=>e.iblock===134).map(e=>({id:'fl-'+e.id,value:floorEvidence(e.id,har)})).filter(e=>e.value?.status==='observed');
if(!process.argv.includes('--apply')) console.log(JSON.stringify({dryRun:true,templates:templates.map(e=>e.id),floors:floors.map(e=>e.id)}));
else {
 const db=embedded(directory);try {
 await migrate(db);
 await db.transaction(async tx=>{
  for(const e of templates)await tx.query('UPDATE furniture_templates SET api_geometry_evidence=$2 WHERE id=$1',[e.id,JSON.stringify(e.value)]);
  // Existing layouts keep their viewport; current API canvas is recorded as evidence only.
  for(const e of floors)await tx.query('UPDATE floors SET api_geometry_evidence=$2 WHERE id=$1',[e.id,JSON.stringify(e.value)]);
 });console.log(JSON.stringify({applied:true,templateCandidates:templates.length,floorCandidates:floors.length}));
 }finally{await db.close();}
}
