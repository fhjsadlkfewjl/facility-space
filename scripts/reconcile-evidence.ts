import {readFile,writeFile} from 'node:fs/promises';
import {harSchema,itemEvidence} from './har-evidence.js';
import {parsePosition,type BitrixSnapshot} from '../apps/api/src/adapters/bitrix.js';
import {property} from './recovery.js';
const [stagePath,evidencePath,out]=process.argv.slice(2);
if(!stagePath||!evidencePath||!out)throw Error('Usage: staging evidence output');
const stage:BitrixSnapshot=JSON.parse(await readFile(stagePath,'utf8'));
const raw=JSON.parse(await readFile(evidencePath,'utf8')), evidence=harSchema.parse(raw);
const objects=stage.elements.filter(e=>e.iblock===136),known=new Set(objects.map(e=>e.id));
const seen=new Set(evidence.editors.map(e=>String(e.levelId)));
const geometryChanges:string[]=[],matched:string[]=[],unmatched:string[]=[],unobserved:string[]=[];
for(const obj of objects){const floor=property(obj,'LEVEL_ID'),tpl=property(obj,'TEMPLATE_ID');const actual=itemEvidence(obj.id,floor,tpl,evidence);
 if(actual&&'x' in actual){matched.push(obj.id);const original=parsePosition(property(obj,'POSITION'));if(original.x!==actual.x||original.y!==actual.y||original.rotation!==actual.r)geometryChanges.push(obj.id);}
 else if(seen.has(floor))unobserved.push(obj.id);
}
for(const e of evidence.editors)for(const item of e.items)if(!known.has(String(item.id)))unmatched.push(String(item.id));
const floors=stage.elements.filter(e=>e.iblock===134).map(e=>({legacyId:e.id,canvasObserved:seen.has(e.id),background:!!evidence.editors.find(x=>String(x.levelId)===e.id)?.canvas.renderSvg,status:seen.has(e.id)?'observed':raw.missingLevelIds?.includes(Number(e.id))?'portal-floor-not-found':'portal-http-502'}));
await writeFile(out,JSON.stringify({sourceSha256:evidence.sourceSha256,floors,counts:{floors:floors.length,observed:seen.size,backgrounds:foldersBackgrounds(),matchedObjects:matched.length,changedPositions:geometryChanges.length,liveOnlyObjects:new Set(unmatched).size,legacyObjectsNotObserved:unobserved.length},matchedLegacyIds:matched,changedPositionLegacyIds:geometryChanges,liveOnlyObjectIds:[...new Set(unmatched)],legacyObjectIdsNotObserved:unobserved,policy:'Update observed geometry only for matching legacy object/floor/template. Never infer employee assignment, delete legacy objects, or create live-only resources without legacy context.'},null,2));
function foldersBackgrounds(){return floors.filter(f=>f.background).length;}
