const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
const from=f=>fs.readFileSync('docs/'+f,'utf8');
const start=file=>{
 const dom=new JSDOM(from(file),{url:'https://arbora.test',runScripts:'outside-only'}),w=dom.window,$=id=>w.document.getElementById(id);
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 w.HTMLElement.prototype.scrollIntoView=function(){};
 Object.defineProperty(w,'crypto',{value:globalThis.crypto});
 w.confirm=()=>true;
 const run=name=>vm.runInContext(from(name),dom.getInternalVMContext());
 run('inspection-rules.js');run('registration-quality.js');
 return {dom,w,$,run};
};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const item={id:'tree-1',treeId:'tree-1',species:'Oiti',inspector:'Ana',assignee:'ana',feeder:'RBR-01C1',
 coordinates:[-9.945,-67.82],lat:-9.945,lon:-67.82,issues:['photos','pole'],note:'Frente da praça'};
(async()=>{
 let {dom,w,$,run}=start('gestao.html'),request,located,editor,opened;
 const quality=w.CampoRegistrationQuality,mask=quality.mask({photos:[],mt:true}),summary=quality.summary([mask,0]);
 w.CampoControl={authorized:()=>true,mapParams:()=>new URLSearchParams('inspector=Ana&month=2026-11&bbox=0,0,1,1'),openRecord:id=>{opened=id;},api:async(path,body)=>{
  request={path,body};
  if(body)return {sent:1,alreadyPending:0,conflicts:[]};
  return {summary,total:1,page:0,pages:1,archive:{available:true},dispatches:{pending:0,completed:0},ranking:[{inspector:'Ana',...summary}],
   operators:[{id:'ana',name:'Ana'}],items:[item]};
 }};
 w.CampoManagementEdit={open:(id,issues)=>{editor={id,issues};}};
 w.CampoControlMap={locate:r=>{located=r;}};
 run('gestao-corrections.js');
 $('qualityAudit').open=true;await w.CampoQualityAdmin.refresh();
 assert.match(request.path,/inspector=Ana/);assert.doesNotMatch(request.path,/bbox/);
 assert.match($('auditSummary').textContent,/1 sem fotos/);
 assert.match($('auditSummary').textContent,/Ana.*50%/);
 const actions=$('auditQualityRows').querySelectorAll('button');
 actions[0].click();assert.equal(opened,'tree-1');
 actions[1].click();assert.equal(editor.id,'tree-1');assert.deepEqual(editor.issues,['photos','pole']);
 actions[2].click();assert.equal(located.lon,-67.82);
 $('auditPageSelect').click();assert.match($('auditSelection').textContent,/1 selecionados/);
 $('auditDispatch').click();assert.equal($('auditDispatchForm').parentElement.open,true);
 $('auditDispatchNote').value='Verificar em campo';await $('auditDispatchForm').onsubmit({preventDefault(){}});
 assert.match($('auditActionStatus').textContent,/1 retorno/);
 $('auditIssue').value='photos';$('auditIssue').dispatchEvent(new w.Event('change'));await tick();
 assert.match(request.path,/issue=photos/);
 dom.window.close();

 ({dom,w,$,run}=start('index.html'));
 let account={id:'ana',role:'inspector'},verified=true,listed=true,edited,completed;
 const cache=new Map();
 w.CampoAccount={current:()=>account,verified:()=>verified};
 Object.assign(w,{editing:null,req:async(_table,_mode,run)=>run({get:key=>cache.get(key),put:(value,key)=>cache.set(key,value)}),
  view:name=>{w.document.querySelectorAll('.view').forEach(view=>view.hidden=view.id!==name);},
  tell:message=>{$('message').textContent=message;},setMapFullscreen(){},sharedCycle:async()=>{},
  editSharedTree:async id=>{edited=id;w.editing=id;w.view('inspect');},
  fetch:async(path,options)=>{
   if(path.endsWith('/complete')){completed=JSON.parse(options.body).id;listed=false;return Response.json({ok:true});}
   return Response.json({items:listed?[{...item,id:'dispatch-1'}]:[]});
  }});
 run('field-corrections.js');await tick();
 assert.equal($('fieldCorrectionsNav').hidden,false);
 assert.match($('fieldCorrectionsNav').textContent,/· 1/);
 assert.match($('fieldCorrectionsItems').textContent,/Frente da praça/);
 assert(w.CampoFieldCorrections.includes('tree-1'));
 let buttons=$('fieldCorrectionsItems').querySelectorAll('button');
 buttons[1].click();await tick();assert.equal(edited,'tree-1');
 verified=false;buttons[2].click();assert.match($('fieldCorrectionsStatus').textContent,/Conecte-se/);
 verified=true;buttons[2].click();await tick();assert.equal(completed,'dispatch-1');
 assert.match($('fieldCorrectionsItems').textContent,/Nenhuma correção/);
 account=null;w.dispatchEvent(new w.Event('campo-account-changed'));await tick();
 assert.equal($('fieldCorrectionsNav').hidden,true);
 assert.equal($('fieldCorrectionsItems').textContent,'');
 dom.window.close();
 console.log('PASS correction UI: ranking, selection, scoped filters, map and editor actions, inspector inbox and online confirmation.');
})().catch(error=>{console.error(error);process.exit(1);});
