const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const CP=require('../docs/ciclo-poda-core.js');
const today=CP.DATE(2026,11,22),origin=CP.DATE(2020,1,1);
const day=(...date)=>CP.DATE(...date)-origin;
const posts=[
 {id:'100',conj:'17306',per:'U',polo:'RBR',tr:1,nAb:1,arvE:3,lat:-9.97,lon:-67.81},
 {id:'200',conj:'17306',per:'URBANO',polo:'RBR',tr:2,nEx:1,ult:day(2026,6,21),arvE:2},
 {id:'300',conj:'17307',per:'R',polo:'RBR',tr:3,nEx:1,ult:day(2026,3,18),arvE:4},
 {id:'400',conj:'17307',per:'RURAL',polo:'RBR',nSS:1,ssAb:1,ssSem:1},
 {id:'500',conj:'99110',polo:'RBR',nEx:1,ult:day(2026,1,13),arvE:1}
];
const orders=[
 {os:'1',poste:'100',tipo:'PODA',status:'PROGRAMADA',desc:'PODA MT',criada:day(2026,10,19)},
 {os:'5',poste:'226-100',tipo:'PODA',status:'DESPACHADA',desc:'PODA MT',criada:day(2026,11,11)},
 {os:'7',poste:'200',tipo:'INSPEÇÃO',status:'CRIADA',criada:day(2026,11,12)}
];
const structures=CP.structureSources(posts,orders);
assert.equal(structures.get('100').orderId,'5');
assert.equal(structures.get('100').statusSGM,'DESPACHADA');
assert.equal(CP.fmt(structures.get('200').execucao),'21/06/2026');
assert.equal(structures.get('400').execucao,null);
assert.equal(structures.get('400').criacao,null);
assert.equal(CP.perimeter('R'),'RURAL');
assert.equal(CP.perimeter('U'),'URBANO');
const catalog={'17306':'Taquari','17307':'Tangará'};
const model=CP.centralPlan(structures,catalog,'04/11/2026');
assert.equal(model.index.get('100').conj,'TAQUARI');
assert.equal(model.index.get('500').conj,'');
assert.equal(CP.calcula(model.index.get('100'),model.par,today,4).P,CP.DATE(2026,11,11));

(async()=>{
 const read=name=>fs.readFileSync(path.join(__dirname,'../docs',name),'utf8');
 const dom=new JSDOM(read('gestao.html'),{url:'https://arbora.test/gestao.html#mapa',runScripts:'outside-only'});
 const w=dom.window,d=w.document;
 const ctx=dom.getInternalVMContext();
 w.CampoControl={authorized:()=>true,api:async p=>p.includes('/central/')?{generation:'fixture',manifest:{parque_postes:{},os_abertas:{},resumo:{}}}:{revision:null}};
 w.CampoParque={unifiedSnapshot:()=>({catalogReady:true,trees:[]}),refresh(){}};
 w.CampoControlMap={cycleMode(){}};
 w.sourceFixtures={posts,orders,catalog};
 vm.runInContext("const Central={rowsFromGeneration:async(_,name)=>name==='parque_postes'?sourceFixtures.posts:sourceFixtures.orders,dataFromGeneration:async()=>({conjuntos:sourceFixtures.catalog,corteOs:'2026-11-04'})};",ctx);
 vm.runInContext(read('ciclo-conjuntos.js'),ctx);
 vm.runInContext(read('ciclo-poda-core.js'),ctx);
 vm.runInContext('CP.hojeSerial=()=>CP.DATE(2026,11,22)',ctx);
 vm.runInContext(read('gestao-ciclo.js'),ctx);
 try{
  for(let i=0;i<50&&!d.getElementById('cycleSource').textContent.includes('previsão estimada');i++)await new Promise(resolve=>setTimeout(resolve,20));
  const fields=d.getElementById('cycleFilters').elements;
  const change=(input,value)=>{if(input.type==='checkbox')input.checked=value;else input.value=value;input.dispatchEvent(new w.Event('change',{bubbles:true}));};
  const rowText=()=>d.getElementById('cycleRows').textContent;
  const count=()=>d.getElementById('cycleLedgerCount').textContent;
  assert.equal(fields.cycle.options.length,4);
  assert.deepEqual([...fields.perim.options].map(o=>o.value),['','RURAL','URBANO']);
  change(fields.perim,'URBANO');
  assert.match(count(),/^2 postes/);
  assert.match(rowText(),/DESPACHADA.*11\/11\/2026/);
  assert.match(rowText(),/21\/06\/2026/);
  change(fields.state,'Pendente (OS aberta)');
  assert.match(count(),/^1 postes/);
  change(fields.state,'');
  change(fields.perim,'');
  const conjunto=name=>[...d.querySelectorAll('#cycleConjOptions input')].find(i=>i.value===name);
  change(conjunto('TAQUARI'),true);
  assert.match(count(),/^2 postes/);
  change(conjunto('TANGARÁ'),true);
  assert.match(count(),/^3 postes/);
  assert.match(rowText(),/TAQUARI.*TANGARÁ/);
  d.getElementById('cycleConjAll').click();
  assert.match(count(),/^4 postes/);
  change(fields.cycle,'2');
  assert.match(d.getElementById('cycleFilterCount').textContent,/C2/);
  change(fields.scheduled,false);
  change(fields.state,'SS aberta sem OS');
  assert.match(count(),/^1 postes/);
  assert.match(rowText(),/226-400/);
  assert.match(d.getElementById('cycleWindows').textContent,/Previsão estimada/);
  console.log('PASS C1–C4 sem Excel, perímetros normalizados, multi seleção, situação e datas verificáveis de OS.');
 }finally{dom.window.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
