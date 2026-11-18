const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom'),{indexedDB}=require('fake-indexeddb');
const M=require('../docs/route-core.js');
const metres=[29.79,44.32,32.65,30.83,41.19];
const spans=metres.map((m,i)=>M.span({id:'vao'+i,metres:m,line:[[-67.8+i*.0003,-9.97],[-67.8+(i+1)*.0003,-9.97]]}));
const ranges=[{spanId:'vao0',start:0,end:10000},{spanId:'vao1',start:0,end:10000}];
const later=[{spanId:'vao1',start:0,end:10000},{spanId:'vao2',start:0,end:10000},{spanId:'vao3',start:0,end:10000},{spanId:'vao4',start:0,end:10000}];
const eq=(a,b)=>assert(Math.abs(a-b)<.00001,`${a} vs ${b}`);
eq(M.coverage(spans,[{ranges}]).metres,74.11);
eq(M.coverage(spans,[{ranges},{ranges:later}]).metres,178.78);
assert.deepEqual(M.remaining([[0,3000],[6000,8000]]),[[3000,6000],[8000,10000]]);
assert.equal(M.day('2026-11-18T03:00:00Z'),'2026-11-17');
assert.equal(M.phase('Rural','T3'),4);
const s=M.span({...spans[0],line:[...spans[0].line].reverse(),reverse:false});
assert.deepEqual(s.line,spans[0].line);
assert.equal(s.reverse,true);

(async()=>{
 const db=await new Promise(resolve=>{const q=indexedDB.open('route-test',1);q.onupgradeneeded=()=>q.result.createObjectStore('meta');q.onsuccess=()=>resolve(q.result);});
 const route={id:'test-route',name:'Piloto',assignee:'operator',feeder:'TAN-01I9',locality:'RIO BRANCO',zone:'URBANO',section:'1',spans};
 const remote=new Map();let online=true;
 const req=(name,mode,get)=>new Promise((resolve,reject)=>{const txn=db.transaction(name,mode),q=get(txn.objectStore(name));txn.oncomplete=()=>resolve(q.result);txn.onabort=()=>reject(txn.error);});
 function open(){
  const dom=new JSDOM(fs.readFileSync('docs/index.html','utf8'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
  Object.defineProperty(w.navigator,'onLine',{get:()=>online});
  w.CampoAccount={current:()=>({id:'operator'}),verified:()=>online};w.req=req;w.openFieldDatabase=async()=>db;
  w.confirm=()=>true;w.prompt=()=>'0-50';w.AbortSignal=AbortSignal;
  w.fetch=async(url,op)=>{
   if(url.endsWith('/visit')){const v=JSON.parse(op.body);remote.set(v.id,v);return {ok:true,json:async()=>({visit:v})};}
   return {ok:true,json:async()=>({routes:[route],visits:[...remote.values()]})};
  };
  for(const f of ['docs/route-core.js','docs/route-field.js'])vm.runInContext(fs.readFileSync(f,'utf8'),dom.getInternalVMContext());
  return {w,d,close:()=>dom.window.close(),click:id=>d.getElementById(id).click()};
 }
 const wait=async check=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('state not reached');};
 const read=()=>req('meta','readonly',s=>s.get('campo-route-state-v1:operator'));
 let app=open();app.click('fieldRouteSync');await wait(async()=>(await read())?.routes.length===1);
 online=false;app.click('fieldRouteStart');await wait(async()=>(await read())?.session);
 app.d.querySelector('[data-route-range="0,0,10000"]').click();await wait(async()=>(await read()).session.ranges.vao0);
 app.d.querySelector('[data-route-part="1"]').click();await wait(async()=>(await read()).session.ranges.vao1);
 app.click('fieldRouteFinal');await wait(async()=>(await read()).outbox.length===1);
 assert.equal(remote.size,0);app.close();app=open();
 app.click('fieldRouteSync');await wait(()=>app.d.getElementById('fieldRouteQueue').textContent.startsWith('1'));
 online=true;app.w.dispatchEvent(new app.w.Event('online'));await wait(async()=>(await read()).outbox.length===0);
 const saved=await read();assert.equal(remote.size,1);eq(M.coverage(spans,saved.visits).metres,51.95);
 assert.deepEqual(M.remaining(M.coverage(spans,saved.visits).bySpan.get('vao1')),[[5000,10000]]);
 assert.match(app.d.getElementById('fieldRouteStatus').textContent,/recebidas/);
 app.close();db.close();console.log('PASS: seleção, sobreposição, conclusão parcial offline, reabertura, sincronização e retomada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
