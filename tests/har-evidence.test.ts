import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {harSchema,templateEvidence,floorEvidence} from '../scripts/har-evidence.js';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from '../scripts/migrate.js';
import {importSnapshot} from '../scripts/import.js';
import type {BitrixSnapshot} from '../apps/api/src/adapters/bitrix.js';
const har=harSchema.parse(JSON.parse(await readFile(new URL('../evidence/har-editor-data.json',import.meta.url),'utf8')));
const t=har.editors[0].templates[0];
const element={id:String(t.id),iblock:132,name:t.name,active:true,properties:{IS_TABLE:['225']}};
const source={report:{sha256:'har-test'},employees:[],elements:[element,{id:'1',iblock:133,name:'Building',active:true,properties:{}},{id:'108760',iblock:134,name:'7',active:true,properties:{BUILDING_ID:['1']}}]} as unknown as BitrixSnapshot;
test('ID matching, name ambiguity and conflicting observations never promote guesses',()=>{
 assert.equal(templateEvidence(element,source,har)?.status,'observed');
 const other={...element,id:'different'};
 assert.equal(templateEvidence(other,{...source,elements:[other]},har)?.status,'observed');
 assert.equal(templateEvidence(other,{...source,elements:[other,{...other,id:'duplicate'}]},har),null);
 const conflicting=structuredClone(har); conflicting.editors.push(structuredClone(har.editors[0]));conflicting.editors[1].templates[0].box.w+=1;
 assert.equal(templateEvidence(element,source,conflicting)?.status,'conflict');
 assert.equal(floorEvidence('missing',har),null);
});
test('migration persists geometry and SVG provenance without inventing physical dimensions; dry-run rolls back',async()=>{
 const db=embedded();try{
 await migrate(db);await importSnapshot(db,source,false,har);
 assert.equal(Number((await db.query('SELECT count(*) n FROM furniture_templates')).rows[0].n),0);
 await importSnapshot(db,source,true,har);
 const row=(await db.query('SELECT * FROM furniture_templates')).rows[0];
 assert.equal(row.api_geometry_evidence.confidence,'confirmed-by-current-API');
 assert.equal(row.api_geometry_evidence.inlineSvg,t.inlineSvg);
 assert.equal(row.default_width,null);assert.equal(row.default_depth,null);
 const floor=(await db.query('SELECT * FROM floors')).rows[0];
 assert.equal(floor.api_geometry_evidence.width,6366);assert.equal(floor.meters_per_unit,null);
 }finally{await db.close();}
});
