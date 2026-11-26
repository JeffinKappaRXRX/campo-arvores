const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{indexedDB}=require('fake-indexeddb');
const dom=new JSDOM(fs.readFileSync('docs/index.html','utf8'),{url:'https://campo.test',runScripts:'outside-only'}),w=dom.window;let confirms=0;
Object.defineProperty(w,'crypto',{value:globalThis.crypto});
Object.defineProperty(w.navigator,'onLine',{value:false,configurable:true});
Object.assign(w,{indexedDB,structuredClone,sharedContext:{},fieldMap:null,updateMapPosition(){},renderInspectionPins(){},renderSyncStatus(){},syncLabel:()=>'',receiptValid:()=>false,driveBusy:false,syncAutomatic:false,syncDestination:'google',renderPlantResult(){},refreshDistanceUnits(){},confirm:()=>{confirms++;return true;},scrollTo(){},fetch:async()=>{throw Error('Unexpected network call');}});w.HTMLElement.prototype.scrollIntoView=function(){};const run=source=>vm.runInContext(source,dom.getInternalVMContext());
for(const f of ['distance-units.js','draft-store.js','inspection-rules.js'])run(fs.readFileSync('docs/'+f,'utf8'));run(fs.readFileSync('docs/app.js','utf8').split('\n').filter(line=>!line.startsWith("window.addEventListener('DOMContentLoaded'")).join('\n'));run(fs.readFileSync('docs/field-reliability.js','utf8').split('\n').find(line=>line.startsWith('function fieldSignature(')));run(fs.readFileSync('docs/plant.js','utf8'));
const expr=s=>run(s),flush=()=>new Promise(r=>setImmediate(r));const image='data:image/jpeg;base64,ZmFrZQ==';
const evidence=[image,'data:image/jpeg;base64,c2Vjb25k','data:image/jpeg;base64,dGhpcmQ='].map((original,i)=>({id:'photo-'+i,name:i+'.jpg',identify:true,original}));
function fill(note='work',items=evidence){w.document.getElementById('inspector').value='Tester';w.document.getElementById('feeder').value='RBR-01C1';w.document.getElementById('lat').value='-9.97';w.document.getElementById('lon').value='-67.81';w.document.getElementById('height').value='7';w.document.getElementById('note').value=note;for(const [id,value] of Object.entries({dap:'12',poda:'nao',grouped:'nao',treeSite:'publico',species:'Não identificada'}))w.document.getElementById(id).value=value;w.document.getElementById('noNetwork').checked=true;expr(`photos=${JSON.stringify(items)};renderPhotos();`);}
async function submit(kind='next'){const b=kind==='next'?w.document.querySelector('.actions button[type=submit]'):w.document.querySelector('[data-after-save="'+kind+'"]');await w.document.getElementById('form').onsubmit({preventDefault(){},submitter:b});assert.equal(b.disabled,false);return b;}
(async()=>{await expr('openFieldDatabase()');
const photoStatus=w.document.getElementById('photoMinimum'),saveStatus=w.document.getElementById('formSaveStatus');
for(const [action,count] of [['next',0],['keep',1],['sync',2],['zip',2]]){
 const items=action==='zip'?[...evidence.slice(0,2),{...evidence[0],id:'copy'}]:evidence.slice(0,count);
 fill('offline draft for '+action,items);
 assert.match(photoStatus.textContent,new RegExp(count+' de 3'));
 await submit(action);
 assert.match(saveStatus.textContent,/Falta(?:m)? [123] foto/);
 assert.equal(expr('records.length'),0);
 assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).photos.length,items.length);
 assert.equal(w.document.getElementById('note').value,'offline draft for '+action);
}
fill('dock');
const field=id=>w.document.getElementById(id);
field('noNetwork').checked=false;
await submit();
assert.match(saveStatus.textContent,/Sem rede próxima/i);
assert.equal(expr('records.length'),0);
assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).note,'dock');
field('bt').checked=true;field('bt').dispatchEvent(new w.Event('change',{bubbles:true}));
field('span').value='BT-12';field('position').value='Lateral';field('projection').value='nao';
await submit();
assert.match(saveStatus.textContent,/Distância copa → BT/);
assert.doesNotMatch(saveStatus.textContent,/ID do poste ou do vão/);
assert.equal(expr('records.length'),0);
field('btDistance').value='0';
assert.equal(expr('CampoInspectionRules.formMissing(read()).length'),0);
field('mt').checked=true;field('mt').dispatchEvent(new w.Event('change',{bubbles:true}));
assert.deepEqual(Array.from(expr('CampoInspectionRules.formMissing(read()).map(p=>p.field)')),['mtDistance']);
field('mtDistance').value='50';field('span').value='';field('pole').value='P-15';
assert.equal(expr('CampoInspectionRules.formMissing(read()).length'),0);
field('grouped').value='sim';field('dap').value=field('circ').value='';
assert.equal(expr('CampoInspectionRules.formMissing(read()).length'),0);
field('noNetwork').checked=true;field('noNetwork').dispatchEvent(new w.Event('change',{bubbles:true}));
assert.equal(field('bt').checked,false);assert.equal(field('mt').checked,false);
assert.equal(field('projection').disabled,true);
assert.equal(expr('CampoInspectionRules.formMissing(read()).length'),0);
fill();
w.document.querySelector('[data-remove="2"]').click();
assert.match(photoStatus.textContent,/2 de 3/);
fill();assert.match(photoStatus.textContent,/atingido/);expr(`plantIdentification=normalizePlantResponse({predictedOrgans:[{organ:'leaf',score:.91}],preferedReferential:'world',results:[{score:.473,species:{scientificName:'Bauhinia x blakeana Dunn',commonNames:['Pata-de-vaca']},images:[{url:{m:'https://images.example/reference.jpg'}},{url:{m:'http://unsafe.example/reference.jpg'}}]},{score:0,species:{scientificName:'Other'}}]},photos);renderPlantResult();`);assert.equal(expr('plantIdentification.results[0].referenceImages.length'),1);assert.equal(expr('plantIdentification.predictedOrgans[0].organ'),'leaf');assert.equal(expr("plantQualityWarnings({minSide:640,brightness:25,contrast:10,sharpness:2}).length"),4);assert.equal(expr("plantConfidence([{score:.9},{score:.4}]).good"),true);assert.match(w.document.querySelector('.plant-confidence').textContent,/Revisão adicional/);await w.document.querySelector('[data-species="1"]').onclick();assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).plantIdentification.acceptedIndex,1);let choice=w.document.querySelector('[data-species="0"]');await choice.onclick();assert(w.document.querySelector('.plant-candidates').open===false);assert.match(w.document.getElementById('species').value,/Pata-de-vaca/);assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).plantIdentification.status,'confirmed_by_inspector');expr("stamped=async()=> 'annotated-photo';");await submit();assert.equal(expr('records.length'),1);assert.equal(expr('photos.length'),0);assert.equal(await expr("req('meta','readonly',s=>s.get('draft'))"),undefined);assert.equal(expr('records[0].plantIdentification.results[0].score'),.473);assert.equal(confirms,0,'confidence score never asks for confirmation or blocks saving');
const local=await expr('loadLocalRecordIndex()');
assert.equal(local.length,1);
assert.equal(local[0].photos[0].hasLocalOriginal,true);
assert.equal(local[0].photos[0].hasLocalAnnotation,true);
assert.equal(local[0].photos[0].original,undefined);
assert.equal(local[0].photos[0].annotated,undefined);
assert.equal((await expr('readLocalRecord(records[0].id)')).photos[0].original,image);
fill('keep editing');await submit('keep');assert.equal(w.document.getElementById('note').value,'keep editing');assert(expr('editing'));assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).note,'keep editing');
expr("stamped=async()=>{throw Error('image decode failed');};");expr('photos[0].metadata=null;');w.document.getElementById('note').value='preserve on failure';await submit();assert.equal(w.document.getElementById('note').value,'preserve on failure');assert.equal(expr('photos[0].original'),image);assert.match(w.document.getElementById('formSaveStatus').textContent,/continua aberto/);assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).note,'preserve on failure');
// Editing during annotation must never be discarded by the automatic next-tree reset.
let resolveImage;w.annotationGate=new Promise(resolve=>resolveImage=resolve);expr('stamped=async()=>annotationGate;');w.document.getElementById('note').value='snapshot';const saving=submit();await new Promise(r=>setTimeout(r,20));w.document.getElementById('note').value='typed while saving';resolveImage('new-annotation');await saving;assert.equal(w.document.getElementById('note').value,'typed while saving');assert.equal((await expr("req('meta','readonly',s=>s.get('draft'))")).note,'typed while saving');
// Explicit synchronization starts after a local commit, without holding the save lock.
expr("stamped=async()=> 'annotation';syncGooglePending=()=>new Promise(()=>{});");w.document.getElementById('note').value='sync later';w.document.getElementById('treeSite').value='privado';await Promise.race([submit('sync'),new Promise((_,reject)=>setTimeout(()=>reject(Error('save waited for network')),1000))]);assert.equal(expr('formSaveBusy'),false);assert.equal(expr('records.find(r=>r.note==="sync later").treeSite'),'privado');
const prior=await expr('readLocalRecord(records[0].id)');
w.legacy={...prior,editing:prior.id,photos:prior.photos.slice(0,1),note:'legacy edit'};
expr('restore(legacy)');assert.equal(photoStatus.hidden,true);await submit();
assert.equal((await expr('readLocalRecord(legacy.id)')).photos.length,1);
assert.equal((await expr('readLocalRecord(legacy.id)')).note,'legacy edit');

// Real render function over a larger synthetic dataset: DOM remains bounded.
expr("records=Array.from({length:15000},(_,i)=>({id:'r'+i,createdAt:new Date(1700000000000+i).toISOString(),updatedAt:'v1',species:'Tree',pole:String(i),feeder:'RBR',photos:[],syncStatus:'pending'}));");const start=performance.now();expr('renderRecords()');const elapsed=performance.now()-start;assert.equal(w.document.querySelectorAll('#recordlist .record').length,50);assert.match(w.document.getElementById('recordsPageStatus').textContent,/15000/);w.document.getElementById('recordsNext').click();assert.match(w.document.getElementById('recordsPageStatus').textContent,/página 2/);assert.equal(w.document.querySelectorAll('#recordlist .record').length,50);console.log('PASS inspection save: 47.3%/zero-score choice, preserved photos, keep-open save, failure recovery, edits during save, no network wait; 15,000-record render limited to 50 cards ('+elapsed.toFixed(0)+' ms in jsdom test environment).');dom.window.close();})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1;});
