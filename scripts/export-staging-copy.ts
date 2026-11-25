// Local, read-only export of an OFFLINE PGlite copy. Never open the live database here.
import { embedded } from '../apps/api/src/repositories/database.js';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const [source, destination]=process.argv.slice(2);
if(!source||!destination||!source.includes('backups/')) throw Error('Usage: export-staging-copy.ts backups/OFFLINE/db staging-data');
const db=embedded(resolve(source));
const quote=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const secretKey=/^(password|passwd|pwd|secret|client_secret|access_token|refresh_token|authorization|cookie|cookies|session_cookie|api_key|private_key)$/i;
const findings:string[]=[];
function scan(v:any,path:string){
 if(v&&typeof v==='object') for(const [k,x] of Object.entries(v)){if(secretKey.test(k)&&x) findings.push(path+'.'+k);scan(x,path+'.'+k);}
 else if(typeof v==='string'&&(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|Bearer\s+[A-Za-z0-9._~-]{20,}|eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/.test(v)))findings.push(path+':credential-pattern');
}
try{
 const columns=(await db.query("SELECT table_name,column_name,data_type FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
 const tables: {name:string;columns:{name:string;type:string}[];rows:Record<string,any>[]}[]=[];
 for(const name of [...new Set(columns.map(c=>c.table_name))]){
  const cols=columns.filter(c=>c.table_name===name);
  const numeric=cols.filter(c=>c.data_type==='numeric');
  const casts=numeric.map(c=>quote(c.column_name)+'::text AS '+quote(c.column_name));
  const rows=(await db.query(`SELECT row_to_json(t) AS data${casts.length?', '+casts.join(', '):''} FROM ${quote(name)} t`)).rows.map(r=>{const row=r.data;for(const c of numeric)row[c.column_name]=r[c.column_name];return row;});
  rows.forEach((row,i)=>scan(row,`${name}[${i}]`));
  tables.push({name,columns:cols.map(c=>({name:c.column_name,type:c.data_type})),rows});
 }
 if(findings.length)throw Error('Export blocked: possible credential fields/patterns at '+JSON.stringify(findings.slice(0,30)));
 const sequences=[];
 for(const seq of (await db.query("SELECT sequencename FROM pg_sequences WHERE schemaname='public'")).rows){
  const value=(await db.query('SELECT last_value::text,is_called FROM '+quote(seq.sequencename))).rows[0];
  sequences.push({name:seq.sequencename,...value});
 }
 const data={sequences,format:'facility-space-exact-copy-v1',createdAt:new Date().toISOString(),tables};
 const text=JSON.stringify(data),sha256=createHash('sha256').update(text).digest('hex');
 const get=(name:string)=>tables.find(t=>t.name===name)!.rows;
 const floors=get('floors'), buildings=get('buildings'),templates=get('furniture_templates');
 const report={format:data.format,sha256,containsRealEmployeeData:true,anonymized:false,source:'Consistent offline copy of current private-pilot-db; no seed/reimport',counts:Object.fromEntries(tables.map(t=>[t.name,t.rows.length])),buildings:buildings.map(b=>({id:b.id,name:b.name,active:b.active,imported:!!b.legacy_bitrix_id,floors:floors.filter(f=>f.building_id===b.id).map(f=>({id:f.id,name:f.name,active:f.active,svg:!!f.background_svg,sha256:f.background_svg?createHash('sha256').update(f.background_svg).digest('hex'):null}))})),floorSVGs:floors.filter(f=>f.background_svg).length,activeImportedFloors:floors.filter(f=>f.active&&f.legacy_bitrix_id).length,inactiveImportedFloors:floors.filter(f=>!f.active&&f.legacy_bitrix_id).length,templateSVGs:templates.filter(t=>t.api_geometry_evidence?.renderSvg||t.svg).length,credentialScan:{findings:0,limitations:'Known credential keys and bearer/JWT/private-key patterns, not a complete secret detection audit'},excludedFiles:['.env and credentials','HAR/cookies','source SQL dumps','raw Mac PGlite directory','screenshots/reports containing employee data'],tableExclusions:[],identity:'Original employee directory and assignment graph preserved. Existing local-reviewer remains the demo identity.'};
 await mkdir(destination,{recursive:true});
 await writeFile(resolve(destination,'snapshot.json'),text,{mode:0o600});
 await writeFile(resolve(destination,'manifest.json'),JSON.stringify(report,null,2),{mode:0o600});
 console.log(JSON.stringify({sha256,bytes:Buffer.byteLength(text),counts:report.counts,floorSVGs:report.floorSVGs,activeImportedFloors:report.activeImportedFloors,inactiveImportedFloors:report.inactiveImportedFloors}));
}finally{await db.close();}
