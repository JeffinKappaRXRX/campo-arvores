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
const corridor=M.bufferRings(spans,30);
assert.equal(corridor.length,5);
assert(Math.abs(M.distance(spans[0].line[1],corridor[0][4])-30)<.001);
assert(M.matchedRanges(spans,spans[0].line[0],spans[1].line[1]).some(x=>x.spanId==='vao0'));
assert.equal(M.matchedRanges(spans,[-67.8,-9.969],[-67.8,-9.971]).length,0);
assert.equal(new URL(M.streetDirections(spans[4].line[1],spans[0].line[0],[spans[2].line[0]])).searchParams.get('waypoints'),'-9.970000,-67.799400');

(async()=>{
 const db=await new Promise(resolve=>{const q=indexedDB.open('route-test',1);q.onupgradeneeded=()=>q.result.createObjectStore('meta');q.onsuccess=()=>resolve(q.result);});
 const route={id:'test-route',name:'Piloto',assignee:'operator',feeder:'TAN-01I9',locality:'RIO BRANCO',zone:'URBANO',section:'1',spans};
 const remote=new Map();let online=true;
 const req=(name,mode,get)=>new Promise((resolve,reject)=>{const txn=db.transaction(name,mode),q=get(txn.objectStore(name));txn.oncomplete=()=>resolve(q.result);txn.onabort=()=>reject(txn.error);});
 function open(){
  const dom=new JSDOM(fs.readFileSync('docs/index.html','utf8'),{url:'https://example.test/',runScripts:'outside-only'}),w=dom.window,d=w.document;
  Object.defineProperty(w.navigator,'onLine',{get:()=>online});
  w.CampoAccount={current:()=>({id:'operator'}),verified:()=>online};w.req=req;w.openFieldDatabase=async()=>db;
  const options=[];
  w.fieldMap={getPane:()=>null,createPane:()=>({style:{}})};
  w.L={featureGroup:()=>({addTo(){return this;},remove(){}}),polyline:(_paths,style)=>{options.push(style);return {addTo(){}};}};
  w.confirm=()=>true;w.prompt=()=>'0-50';w.AbortSignal=AbortSignal;
  w.fetch=async(url,op)=>{
   if(url.endsWith('/visit')){const v=JSON.parse(op.body);remote.set(v.id,v);return {ok:true,json:async()=>({visit:v})};}
   return {ok:true,json:async()=>({routes:[route],visits:[...remote.values()]})};
  };
  for(const f of ['docs/route-core.js','docs/route-field.js'])vm.runInContext(fs.readFileSync(f,'utf8'),dom.getInternalVMContext());
  return {w,d,options,close:()=>dom.window.close(),click:id=>d.getElementById(id).click()};
 }
 const wait=async check=>{for(let i=0;i<100;i++){if(await check())return;await new Promise(r=>setTimeout(r,10));}assert.fail('state not reached');};
 const read=()=>req('meta','readonly',s=>s.get('campo-route-state-v1:operator'));
 let app=open();app.click('fieldRouteSync');await wait(async()=>(await read())?.routes.length===1);
 assert.match(app.d.getElementById('fieldRouteMapLegend').textContent,/0,179 km de rede/);
 const styles=app.options.filter(o=>o.pane==='myInspectionRoute');
 assert.equal(styles.length,2);assert(styles.every(o=>o.interactive===false));assert.equal(styles[0].weight,14);assert.equal(styles[1].color,M.pendingColor);
 const street=new URL(app.d.getElementById('fieldRouteNavigate').href);
 assert.equal(street.searchParams.get('dir_action'),'navigate');
 assert.equal(street.searchParams.get('destination'),'-9.970000,-67.800000');
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

(async()=>{
 const {DatabaseSync}=require('node:sqlite');
 const sql=new DatabaseSync(':memory:');
 sql.exec("CREATE TABLE campo_users(id TEXT, name TEXT, blocked INTEGER); CREATE TABLE campo_user_lifecycle(user_id TEXT, deleted_at TEXT); INSERT INTO campo_users VALUES('operator','Inspetor',0);");
 const db={prepare(text){let args=[];return {bind(...items){args=items;return this;},first(){return sql.prepare(text).get(...args);},all(){return {results:sql.prepare(text).all(...args)};},run(){return {meta:sql.prepare(text).run(...args)};}};},batch(items){return items.map(item=>item.run());}};
 const ctx=vm.createContext({Request,Response,Blob,URL,
  json:(data,status=200)=>Response.json(data,{status}),adminDb:async()=>db,isAdministrator:r=>r.headers.get('X-Test-Role')==='admin',
  sharedBody:r=>r.json(),sharedError:(message,status=400)=>Object.assign(Error(message),{status}),centralMissingTable:error=>/no such table/.test(error.message)});
 vm.runInContext(fs.readFileSync('docs/route-core.js','utf8')+'\n'+fs.readFileSync('backend/routes.js','utf8'),ctx);
 const env={CAMPO_USER:{id:'operator'},LOGIN_GUARD:{get:async(_key,type)=>type==='json'?{parts:2,size:2}:new Uint8Array([31]).buffer}};
 const request=(path,body,admin=false,identity=env)=>ctx.routeAPI(new Request('https://example.test'+path,{method:body?'POST':'GET',headers:admin?{'X-Test-Role':'admin'}:{},body:body?JSON.stringify(body):null}),identity);
 const plan={start:'2026-11-20',metresPerDay:9000,source:'manual'};
 assert.deepEqual(M.schedule(plan,12000),[{day:'2026-11-20',metres:9000},{day:'2026-11-23',metres:3000}]);
 const parallel=M.span({...spans[0],feeder:'AAL-01C8',poles:['123','456'],parallel:[{id:'vao-paralelo',feeder:'TAQ-01C1',metres:50,flip:true}]});
 const coverage=M.coverage([parallel],[{ranges:[{spanId:parallel.id,start:0,end:4000}]}]);
 assert.equal(coverage.sharedMetres,20);assert.deepEqual(coverage.shared.get('vao-paralelo').ranges,[[6000,10000]]);
 const campaign={id:'combined',total:2,name:'Vistoria por partes'};
 const part=i=>({id:'combined-'+i,assignee:'operator',name:'Vistoria ('+i+'/2)',campaign:{...campaign,index:i},locality:'Rio Branco',feeder:'TAQ-01C1',zone:'Urbano',section:'1',fromNetwork:true,spans:[spans[i-1]],buffer:55,plan});
 assert.equal((await request('/api/routes',part(1),true)).status,201);
 assert.deepEqual((await (await request('/api/routes')).json()).routes,[]);
 assert.equal((await request('/api/routes',part(2),true)).status,201);
 assert.equal((await request('/api/routes',part(2),true)).status,200);
 const data=await (await request('/api/routes')).json();
 assert.deepEqual(data.routes.map(r=>r.id),['combined-1','combined-2']);
 assert(data.routes.every(r=>r.buffer===55&&r.plan.metresPerDay===9000));
 assert.deepEqual((await (await request('/api/routes',null,false,{CAMPO_USER:{id:'another'}})).json()).routes,[]);
 assert.equal((await request('/api/routes/reference')).status,403);
 assert.deepEqual([...new Uint8Array(await (await request('/api/routes/reference',null,true)).arrayBuffer())],[31,31]);
 sql.close();console.log('PASS: publicação integral, retentativa idempotente, escopo por inspetor e complemento protegido.');
})().catch(e=>{console.error(e);process.exitCode=1;});
