import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {embedded} from '../apps/api/src/repositories/database.js';
import {migrate} from './migrate.js';
import {importSnapshot} from './import.js';
import {harSchema} from './har-evidence.js';
import type {BitrixSnapshot} from '../apps/api/src/adapters/bitrix.js';
const [staging,directory]=process.argv.slice(2);if(!staging||!directory)throw Error('Usage: final-reconcile staging.json isolated-db');
const raw=await readFile(staging,'utf8'),source:BitrixSnapshot=JSON.parse(raw);
const evidenceRaw=await readFile('evidence/har-renderable-data.json','utf8'),evidence=harSchema.parse(JSON.parse(evidenceRaw));
const db=embedded(directory);const p=(e:any,k:string)=>e.properties[k]?.[0]??'';
try{
 await migrate(db);await importSnapshot(db,source,true,evidence);
 const count=async()=>Object.fromEntries(await Promise.all(['buildings','floors','rooms','furniture','workplaces','workplace_assignments','employees_projection','migration_quarantine'].map(async t=>[t,Number((await db.query('SELECT count(*) n FROM '+t)).rows[0].n)])));
 const before=await count();await importSnapshot(db,source,true,evidence);const after=await count();if(JSON.stringify(before)!==JSON.stringify(after))throw Error('Import replay changed counts');
 const imported=(await db.query(`SELECT f.id,f.legacy_bitrix_id,f.name,f.active,f.building_id,b.name building_name, f.background_svg IS NOT NULL svg,
 (SELECT count(*)::int FROM rooms r WHERE r.floor_id=f.id) rooms,
 (SELECT count(*)::int FROM furniture x WHERE x.floor_id=f.id) objects,
 (SELECT count(*)::int FROM workplaces w JOIN furniture x ON x.id=w.furniture_id WHERE x.floor_id=f.id) workplaces FROM floors f JOIN buildings b ON b.id=f.building_id ORDER BY b.name,f.name`)).rows;
 const rows=source.elements.filter(e=>e.iblock===134).map(f=>{
  const imp=imported.find(i=>String(i.legacy_bitrix_id)===f.id),editor=evidence.editors.find(e=>String(e.levelId)===f.id);
  const rooms=source.elements.filter(e=>e.iblock===135&&p(e,'LEVEL_ID')===f.id),objects=source.elements.filter(e=>e.iblock===136&&p(e,'LEVEL_ID')===f.id);
  const workplaceObjects=objects.filter(o=>source.elements.some(t=>t.iblock===132&&t.id===p(o,'TEMPLATE_ID')&&p(t,'IS_TABLE')==='225'));
  const missingLive=editor?objects.filter(o=>!editor.items.some(i=>String(i.id)===o.id)).map(o=>o.id):[];
  const liveOnly=editor?editor.items.filter(i=>!objects.some(o=>o.id===String(i.id))).map(i=>i.id):[];
  return {legacy_building_id:p(f,'BUILDING_ID'),legacy_building:source.elements.find(e=>e.iblock===133&&e.id===p(f,'BUILDING_ID'))?.name,imported_building_id:imp?.building_id,imported_building:imp?.building_name,legacy_floor_id:f.id,legacy_floor:f.name,active:f.active,imported_floor_id:imp?.id,imported_active:imp?.active,legacy_rooms:rooms.length,imported_rooms:imp?.rooms,legacy_objects:objects.length,live_objects:editor?.items.length??null,imported_objects:imp?.objects,legacy_workplace_objects:workplaceObjects.length,imported_workplaces:imp?.workplaces,svg:imp?.svg??false,editor_snapshot:!!editor,legacy_objects_not_in_live:missingLive,live_objects_not_in_legacy:liveOnly,mismatches:[...(rooms.length!==imp?.rooms?['room count']:[]),...(objects.length!==imp?.objects?['object count']:[]),...(workplaceObjects.length!==imp?.workplaces?['workplace count (check resource policy)']:[]),...(missingLive.length?['legacy objects absent from live snapshot']:[]),...(liveOnly.length?['live-only objects']:[])]};
 });
 const output={generated_at:new Date().toISOString(),source_sha256:createHash('sha256').update(raw).digest('hex'),editor_sha256:createHash('sha256').update(evidenceRaw).digest('hex'),basis:'Recovered October 2026 snapshots; no new live portal reads in this run',counts:after,idempotent:true,active:rows.filter(r=>r.active).length,inactive:rows.filter(r=>!r.active).length,active_with_editor:rows.filter(r=>r.active&&r.editor_snapshot).length,active_with_svg:rows.filter(r=>r.active&&r.svg).length,rows};
 const activeRows=rows.filter(r=>r.active);
 const objects={live:activeRows.reduce((n,r)=>n+(r.live_objects??0),0),imported:activeRows.reduce((n,r)=>n+(r.imported_objects??0),0),liveOnly:activeRows.reduce((n,r)=>n+r.live_objects_not_in_legacy.length,0),legacyAbsentLive:activeRows.reduce((n,r)=>n+r.legacy_objects_not_in_live.length,0)};
 Object.assign(output,{activeObjects:{...objects,matched:objects.live-objects.liveOnly,matchedPercent:100*(objects.live-objects.liveOnly)/objects.live}});
 await mkdir('docs',{recursive:true});await writeFile('docs/reconciliation-evidence.json',JSON.stringify(output,null,2));
 const columns=['Building','Legacy floor','Active','Imported floor','Rooms legacy/import','Objects legacy/live/import','Workplaces legacy/import','SVG','Editor','Mismatches'];
 const md=['# Office Map → Facility Space reconciliation','',`Verified ${output.generated_at}. ${output.basis}.`,'',`Active floors: **${output.active}**; active floors with recovered editor snapshots: **${output.active_with_editor}**; active floors with SVG: **${output.active_with_svg}**. Inactive legacy floors: **${output.inactive}**. These are snapshot migration coverage figures, not a claim of current live synchronization.`, '',`Import counts: ${JSON.stringify(after)}. Second import preserved counts.`, '', 'Room and workplace counts come from the legacy database and imported database. Editor snapshots establish object geometry, not an independent live room or workplace census. All differences remain listed; no ambiguous occupant is guessed. Inactive floors are retained for legacy traceability and excluded from active floor navigation.', '', `Active-floor object comparison: ${objects.live-objects.liveOnly}/${objects.live} live objects match legacy objects (${(100*(objects.live-objects.liveOnly)/objects.live).toFixed(2)}%). ${objects.liveOnly} live-only objects are not imported without authoritative legacy context. ${objects.legacyAbsentLive} imported legacy objects are absent from the live snapshot and are retained for review. This is not 100% object reconciliation.`, '', '|'+columns.join('|')+'|','|'+columns.map(()=>'---').join('|')+'|',...rows.map(r=>'|'+[r.legacy_building,r.legacy_floor_id+' '+r.legacy_floor,r.active?'ACTIVE':'INACTIVE',r.imported_floor_id,`${r.legacy_rooms}/${r.imported_rooms}`,`${r.legacy_objects}/${r.live_objects??'unavailable'}/${r.imported_objects}`,`${r.legacy_workplace_objects}/${r.imported_workplaces}`,r.svg?'yes':'no',r.editor_snapshot?'yes':'no',r.mismatches.join('; ')||'none in compared fields'].map(x=>String(x).replaceAll('|','/')).join('|')+'|'),'', 'Machine-readable evidence: [reconciliation-evidence.json](reconciliation-evidence.json). It includes building mappings, snapshot hashes, per-floor counts and unmatched object IDs. Quarantine remains a separate unresolved business-data queue; workflow statuses do not remove quarantine records.'];
 await writeFile('docs/reconciliation-report.md',md.join('\n'));console.log(JSON.stringify({...output,rows:undefined}));
}finally{await db.close();}
