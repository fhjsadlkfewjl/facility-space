import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

test('collector is dry-run by default, stops safely, resumes without repeating confirmed floors',async()=>{
 const source=await readFile('evidence/collect-editor-data.browser.js','utf8');
 const ids=JSON.parse(await readFile('evidence/level-ids.json','utf8'));
 const calls:number[]=[];
 let fail=true;
 const context=vm.createContext({window:{},location:{origin:'https://portal.irkutskoil.ru'},console:{info(){}},AbortSignal,setTimeout:(fn:()=>void)=>fn(),fetch:async(_url:string,options:any)=>{
  const body=JSON.parse(options.body);assert.equal(body.action,'getEditorData');assert.equal(options.method,'POST');assert.equal(options.redirect,'error');
  calls.push(body.params[0]);
  if(fail&&calls.length===2)return {ok:false,status:503};
  return {ok:true,json:async()=>({STATUS:'OK',RESULT:{levelId:body.params[0],items:[{id:1,tpl:2,x:0,y:0,r:17,ownerName:"PRIVATE",popupData:{token:"SECRET"}}]}})};
 }});
 const plan=await vm.runInContext(source,context);
 assert.equal(plan.dryRun,true);assert.equal(plan.count,77);assert.equal(calls.length,0);
 await assert.rejects(vm.runInContext('collectEditorData({execute:true})',context),/authorization/);
 await assert.rejects(vm.runInContext('collectEditorData({execute:true,authorized:true})',context),/503/);
 assert.equal(vm.runInContext('window.facilityEditorSnapshot.results.length',context),1);
 fail=false;
 const result=await vm.runInContext('collectEditorData({execute:true,authorized:true})',context);
 assert.ok(!vm.runInContext("JSON.stringify(window.facilityEditorSnapshot)",context).includes("PRIVATE"));
 assert.ok(!vm.runInContext("JSON.stringify(window.facilityEditorSnapshot)",context).includes("SECRET"));
 assert.equal(result.completed,77);assert.equal(calls.filter(x=>x===ids[0]).length,1);
 assert.equal(new Set(calls).size,77);
});
