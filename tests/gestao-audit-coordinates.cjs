'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const {index,nearby}=require('../docs/gestao-audit-coordinates.js');
const trees=[
 {id:'vera',lat:'-9,97',lon:'-67,8',especies:'Jambo',origem:'Base VERA',poste:'123'},
 {id:'campo',lat:-9.97,lon:-67.8,especies:'Faveira',origem:'Campo (prévia)',alimentador:'RBR-01C1'},
 {id:'perto',lat:-9.96997,lon:-67.8,especies:'Apuí'},
 {id:'longe',lat:-9.9697,lon:-67.8},
 {id:'ausente',lat:'',lon:-67.8},
 {id:'inválida',lat:91,lon:-67.8},
 {id:'origem',lat:0,lon:0},
];
const data=index(trees);
assert.equal(data.points.length,3);
assert.deepEqual(data.points[0].trees.map(t=>t.id),['vera','campo']);
assert.deepEqual(data.invalid.map(t=>t.id),['ausente','inválida','origem']);
assert.deepEqual(nearby(data.points,3),[]);
const [pair]=nearby(data.points,5);
assert(pair.distance>3.3&&pair.distance<3.4);
assert.equal(pair.points[1].trees[0].id,'perto');
assert.equal(nearby(index([{lat:0,lon:179.99999},{lat:0,lon:-179.99999}]).points,3).length,1);
const large=Array.from({length:3681},(_,i)=>({id:i,lat:-10+i*.0003,lon:-67.8}));
assert.equal(nearby(index(large).points,20).length,0);

(async()=>{
 const dom=new JSDOM(fs.readFileSync('docs/gestao.html','utf8'),{runScripts:'outside-only'});
 try{
  const w=dom.window,d=w.document,$=id=>d.getElementById(id),flush=()=>new Promise(resolve=>setTimeout(resolve,10));
  let calls=0,opened=null,mapped=null,latest=trees;
  w.setInterval=()=>0;
  w.CampoControl={authorized:()=>true};
  w.CampoParque={readCurrentTrees:async()=>{calls++;return latest;},openTree:id=>{opened=id;}};
  w.CampoControlMap={locateAudit:points=>{mapped=points;}};
  vm.runInContext(fs.readFileSync('docs/gestao-audit-coordinates.js','utf8'),dom.getInternalVMContext());
  assert.equal(calls,0);
  $('coordinateAudit').open=true;
  await flush();
  const rows=$('coordinateAuditRows');
  assert.equal(calls,1);
  assert.equal($('coordinateAuditRadius').value,'5');
  assert.equal(rows.children.length,5);
  assert.match(rows.textContent,/Coordenadas iguais0 m/);
  assert.match(rows.textContent,/Pontos distintos próximos3,336 m/);
  assert.match($('coordinateAuditStatus').textContent,/7 cadastros no parque/);
  const search=$('coordinateAuditSearch');
  search.value='RBR-01C1';
  search.dispatchEvent(new w.Event('input'));
  assert.equal(rows.children.length,2,'busca preserva o outro ponto do par');
  assert.match(rows.children[1].textContent,/Apuí/);
  [...rows.children[1].querySelectorAll('button')].find(b=>b.textContent==='Ver no mapa').click();
  assert.equal(mapped.length,2);
  [...rows.children[0].querySelectorAll('button')].find(b=>b.textContent==='Abrir ficha').click();
  assert.equal(opened,'vera');
  const radius=$('coordinateAuditRadius');
  radius.value='3';
  radius.dispatchEvent(new w.Event('change'));
  assert.equal(rows.children.length,1);
  latest=[...trees,{id:'novo',lat:-9.97,lon:-67.8,especies:'<img src=x>',origem:'Campo (prévia)'}];
  $('coordinateAuditRefresh').click();
  await flush();
  assert.match(rows.textContent,/3 cadastros/);
  assert.match($('coordinateAuditStatus').textContent,/8 cadastros no parque/);
  assert.equal(rows.querySelector('img'),null);
  w.dispatchEvent(new w.Event('campo-control-logout'));
  assert.equal(rows.children.length,0);
  assert.equal($('coordinateAuditUpdated').hidden,true);
 }finally{dom.window.close();}
 console.log('PASS auditoria de coordenadas: agrupamento exato, distância, filtros, fichas, mapa, sincronização e logout.');
})().catch(error=>{console.error(error);process.exitCode=1;});
