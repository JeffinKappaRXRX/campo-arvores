const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const dom=new JSDOM('<div id="ledger"></div><div id="tools"></div><div id="map"></div>',{url:'https://campo.test/gestao.html#c-mapa',runScripts:'outside-only'});
const w=dom.window,context=dom.getInternalVMContext(),calls=[],handlers={};
const clone=value=>JSON.parse(JSON.stringify(value));
const layer=()=>({clearLayers(){},addTo(){return this;}});
const marker=()=>({bindPopup(){return this;},addTo(){return this;}});
w.L={layerGroup:layer,marker,divIcon:()=>({}),latLngBounds:points=>clone(points),polygon:layer,polyline:layer,circleMarker:layer};
const map={createPane:()=>({style:{}}),on:(event,fn)=>{handlers[event]=fn;},getContainer:()=>w.document.getElementById('map'),
 invalidateSize(){calls.push(['invalidate']);},setView(point,zoom){calls.push(['single',clone(point),zoom]);},fitBounds(points,options){calls.push(['multiple',clone(points),clone(options)]);}};
function load(file){vm.runInContext(fs.readFileSync('docs/'+file,'utf8'),context);}
for(const file of ['ciclo-poda-core.js','carteira-territorial-core.js','gestao-multiselect.js','sigora-acre.js','gestao-territorial.js'])load(file);
const api=vm.runInContext('GestaoTerritorial',context);
let panel,updates=0,serviceFits=0,area=null,classifications=0;
panel=api.create({anchor:w.document.getElementById('ledger'),tools:w.document.getElementById('tools'),getMap:()=>map,
 update(){updates++;panel.render([],46000,area);},plot(){},table:()=>'',fitServices(){serviceFits++;},
 classify(row){classifications++;return {...row,conj:'TAQUARI',conjCode:'test-code'};}});
panel.supplement({schema:'sigora-carteira-1',summary:{},orders:[{os:'OS-1',classe:'CRUZETA',lat:-9.97,lon:-67.81}]});
panel.attach(map,ring=>{area=ring;});panel.visible(true);panel.render([],46000,null);
function choose(id,values){const select=w.document.getElementById(id);for(const option of select.options)option.selected=values.includes(option.value);select.dispatchEvent(new w.Event('change',{bubbles:true}));}
function lastMove(){return calls.filter(c=>['single','multiple'].includes(c[0])).at(-1);}
choose('terrAsset',['cruzeta']);
const huerb=w.document.querySelector('[data-filter="terrOrgName"] .msel-lista input[value="huerb"]');
huerb.click();
assert.deepEqual(lastMove(),['single',[-9.9649084,-67.8144025],17]);
assert.deepEqual([...w.document.getElementById('terrAsset').selectedOptions].map(o=>o.value),['cruzeta'],'org selection preserves service filters');
choose('terrOrgName',['huerb','hospital-jurua']);
assert.equal(lastMove()[0],'multiple');assert.deepEqual(lastMove()[1],[[-7.59525,-72.68328],[-9.9649084,-67.8144025]]);
assert.equal(lastMove()[2].maxZoom,17);
const beforeMissing=calls.length;
choose('terrOrgName',['imac']);
assert.equal(calls.length,beforeMissing,'unlocated institution does not invent a position or move map');
assert.match(w.document.getElementById('terrOrgStatus').textContent,/IMAC/);
choose('terrOrgName',['huerb','imac']);
assert.deepEqual(lastMove(),['single',[-9.9649084,-67.8144025],17]);assert.match(w.document.getElementById('terrOrgStatus').textContent,/IMAC/);
w.document.querySelector('[data-filter="terrOrgName"] [data-clear]').click();
assert.equal(serviceFits,1,'clearing last organ filter restores bounds of filtered services');
assert.equal(w.document.getElementById('terrOrgStatus').textContent,'');
choose('terrOrgType',['upa']);assert.equal(lastMove()[0],'multiple');assert.equal(lastMove()[1].length,4);
choose('terrOrgType',[]);assert.equal(serviceFits,2);
assert(updates>=8,'select events continue updating portfolio and markers');
const first=panel.structures();assert.equal(first[0].conjCode,'test-code');panel.structures();assert.equal(classifications,2,'structure reads reapply current spatial classifier');
// The draw control passes the complete [lat,lon] ring to the common map/portfolio callback.
w.document.getElementById('terrDraw').click();
for(const [lat,lng] of [[-10,-68],[-10,-67],[-9,-67]])handlers.click({latlng:{lat,lng}});
w.document.getElementById('terrFinish').click();
assert.deepEqual(clone(area),[[-10,-68],[-10,-67],[-9,-67]]);
w.document.getElementById('terrClearArea').click();assert.equal(area,null);
(async()=>{
 choose('terrOrgName',['huerb']);
 const last=clone(lastMove()),moveCount=calls.length;
 // A delayed central refresh must keep the selected institution and its viewport.
 w.Central={rowsFromGeneration:async()=>{await new Promise(resolve=>setTimeout(resolve,1));return [];}};
 await panel.load({generation:'refresh-1',manifest:{dec_mes:{},equipes:{},cart_prog:{}}},{summary:{},orders:[],keys:[]});
 panel.render([],46000,null);
 assert.deepEqual([...w.document.getElementById('terrOrgName').selectedOptions].map(o=>o.value),['huerb']);
 assert.equal(calls.length,moveCount);assert.deepEqual(lastMove(),last);
 choose('terrAsset',[]);
 panel.supplement({schema:'sigora-carteira-1',summary:{},trees:[{id:'tree-one',conj:'DESATUALIZADO',point:[1,2]}]});
 panel.render([{id:'tree-one',kind:'arvore',origin:'campo',conj:'TAQUARI',conjCode:'17306',point:[-9.97,-67.81],poda:'SIM'}],46000,null);
 assert.match(w.document.getElementById('terrCandidates').textContent,/TAQUARI/);
 assert.doesNotMatch(w.document.getElementById('terrCandidates').textContent,/DESATUALIZADO/,'supplement cannot replace spatial classification');
 dom.window.close();
 console.log('PASS territorial UI: single/multiple/missing organs, actual checkbox/clear controls, delayed refresh, preserved filters, service bounds, refreshed structures and polygon callback.');
})().catch(error=>{dom.window.close();console.error(error);process.exitCode=1;});
