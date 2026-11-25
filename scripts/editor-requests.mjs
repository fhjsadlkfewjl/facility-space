// Offline planner: executing this file never contacts the portal.
import { readFile, writeFile } from 'node:fs/promises';
const ids = JSON.parse(await readFile(new URL('../evidence/level-ids.json', import.meta.url), 'utf8'));
if (!Array.isArray(ids) || !ids.every(x => Number.isSafeInteger(x) && x > 0) || new Set(ids).size !== ids.length) throw Error('Invalid level IDs');
const endpoint = 'https://portal.irkutskoil.ru/local/modules/adict.office_map/ajax.php';
const requests = ids.map(levelId => ({url:endpoint,method:'POST',headers:{'Content-Type':'text/plain;charset=UTF-8'},body:JSON.stringify({action:'getEditorData',params:[levelId]})}));
const browser = `// Use only through normal DevTools after explicit authorization; never bypass browser paste protection.
// Initial execution is dry-run. Save results before closing/restarting the browser.
window.facilityEditorSnapshot ??= {results:[],missing:[],status:'idle',error:null};
async function collectEditorData({execute=false,authorized=false,delayMs=1500,skipMissing=false}={}) {
 const requests=${JSON.stringify(requests)};
 const state=window.facilityEditorSnapshot;
 if(!execute) return {dryRun:true,count:requests.length,requests};
 if(!authorized) throw Error('Explicit authorization required');
 if(location.origin!==${JSON.stringify(new URL(endpoint).origin)}) throw Error('Run in the existing portal session');
 if(!Number.isFinite(delayMs)||delayMs<1000) throw Error('Minimum interval is 1000ms');
 if(state.status==='running') throw Error('Collector already running');
 const known=new Set(requests.map(r=>JSON.parse(r.body).params[0]));
 if(!Array.isArray(state.results)||state.results.some(r=>!known.has(r?.levelId))||new Set(state.results.map(r=>r.levelId)).size!==state.results.length) throw Error('Invalid saved results');
 state.missing ??= [];
 const done=new Set([...state.results.map(r=>r.levelId),...state.missing]);
 state.status='running'; state.error=null;
 try {
  for(const request of requests) {
   const levelId=JSON.parse(request.body).params[0];
   if(done.has(levelId)) continue;
   const response=await fetch(request.url,{method:request.method,headers:request.headers,body:request.body,credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(30000)});
   if(!response.ok) throw Error('Stopped at HTTP '+response.status+' for '+levelId);
   const data=await response.json();
   if(skipMissing && data.STATUS==='FAIL' && data.ERROR==='Этаж не найден'){state.missing.push(levelId);await new Promise(resolve=>setTimeout(resolve,delayMs));continue;}
   if(data.STATUS!=='OK'||data.RESULT?.levelId!==levelId) throw Error('API error or mismatched floor '+levelId);
   // Keep only payload; no cookies, request headers, or API request echo.
   const r=data.RESULT;
   state.results.push({levelId:r.levelId,canvas:r.canvas,templates:r.templates,items:(r.items??[]).map(i=>({id:i.id,tpl:i.tpl,x:i.x,y:i.y,r:i.r}))}); done.add(levelId);
   console.info('Collected',state.results.length,'/',requests.length,'level',levelId);
   await new Promise(resolve=>setTimeout(resolve,delayMs));
  }
  state.status='completed';
 } catch(error) {state.status='stopped';state.error=String(error.message);throw error;}
 return {completed:state.results.length,total:requests.length};
}
function downloadFacilityEditorSnapshot() {
 const state=window.facilityEditorSnapshot;
 const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download='facility-editor-snapshot.json';link.click();
 setTimeout(()=>URL.revokeObjectURL(url),1000);
}
collectEditorData();
// Authorized start/resume in SAME session: await collectEditorData({execute:true,authorized:true});
// Export at any time: downloadFacilityEditorSnapshot();
// Crash recovery: do not blindly rerun. Inspect saved export/HAR first; memory is not durable.
`;
if (process.argv.includes('--browser-script')) {
 const i=process.argv.indexOf('--browser-script');if(!process.argv[i+1])throw Error('Output path required');
 await writeFile(process.argv[i+1],browser);
} else console.log(JSON.stringify({dryRun:true,requests},null,2));
