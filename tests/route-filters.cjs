const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {DatabaseSync}=require('node:sqlite');
const {JSDOM}=require('jsdom');
const M=require('../docs/route-core');
const read=file=>fs.readFileSync(file,'utf8');

(async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE mt (Id TEXT, NAME_BLOCO TEXT, Alimentador TEXT, TIPO_TRECHO TEXT, Zona TEXT, geom TEXT); CREATE TABLE bt AS SELECT * FROM mt;');
 const coordinates=id=>JSON.stringify({type:'LineString',coordinates:[[-67.84+Number(id)/1000,-9.96],[-67.839+Number(id)/1000,-9.96]]});
 const rows=[
  ['1','RBR554','TAN-01I9',' 1 ','URBANO'],
  ['2','rbr444','TAN-01I9','T2','URBANO'],
  ['3','RBR444','FLO-01C3','2','URBANO'],
  ['4','RBR554','TAN-01I9','T3','URBANO'],
  ['5','RBR5540','TAN-01I9','T1','URBANO'],
  ['6','RBR554','TAN-01I9','1','RURAL']
 ];
 for(const row of rows)db.prepare('INSERT INTO mt VALUES (?,?,?,?,?,?)').run(...row,coordinates(row[0]));
 db.prepare('INSERT INTO bt VALUES (?,?,?,?,?,?)').run('7','RBR554','TAN-01I9','1','URBANO',coordinates(7));
 const worker=vm.createContext({importScripts(){},onmessage:null});
 vm.runInContext(read('docs/package-worker.js'),worker);
 // Exercise the production SQL and row conversion with an in-memory SQLite GPKG substitute.
 worker.database={
  exec:({sql,bind})=>db.prepare(sql).all(...bind),
  prepare(sql){const stmt=db.prepare(sql);let cursor,row;return {bind(values){cursor=stmt.iterate(...values);return this;},step(){const next=cursor.next();row=next.value;return !next.done;},get(){return row;},finalize(){cursor.return();}};}
 };
 const columns=['Id','NAME_BLOCO','Alimentador','TIPO_TRECHO','Zona','geom'];
 worker.layers=[{table_name:'mt',column_name:'geom',classification:'MT',columns,srs_id:4326},{table_name:'bt',column_name:'geom',classification:'BT',columns,srs_id:4326}];
 worker.decodeGeometry=value=>JSON.parse(value);
 vm.runInContext('sourceDb=database;currentLayers=layers;',worker);
 const query=filters=>{worker.filters=filters;return JSON.parse(JSON.stringify(vm.runInContext('routeNetwork(filters)',worker)));};
 const expected={blocks:['RBR554','RBR444','RBR999'],feeders:['TAN-01I9'],sections:['1','2'],zone:'URBANO'};
 const network=query(expected);
 assert.deepEqual(network.features.map(f=>f.properties.Id),['1','2']);
 assert.deepEqual(network.missing,['RBR999']);
 assert.equal(query({...expected,feeders:[]}).total,3);
 assert.equal(query({...expected,blocks:[],sections:['3']}).total,1);
 assert.deepEqual(M.codes('rbr554, RBR444\nRBR999\tRBR554'),expected.blocks);
 const first=M.feature(network.features[0]);assert(first.estimated&&first.metres>100);
 assert.equal(M.feature({...network.features[0],properties:{...network.features[0].properties,'Rede Comp M':42}}).metres,42);
 assert.deepEqual(query({featureId:network.features[0].id}).features.map(f=>f.properties.Id),['1']);
 assert(network.extent.west<network.extent.east);

 db.exec("CREATE TABLE mt_campo (Id TEXT, Alimentador TEXT, geom TEXT); CREATE TEMP TABLE campo_mt_ref (id TEXT PRIMARY KEY, feeder TEXT, locality TEXT, zone TEXT, section TEXT, block TEXT, metres REAL);");
 const actual=[
  ['6587410','AAL-01C8','RIO BRANCO','URBANO','1','RBR14528',35.432],
  ['6784695','AAL-01C8','RIO BRANCO','URBANO','2','RBR6496',28.731],
  ['00','AAL-01C8','RIO BRANCO','RURAL','2','RBR6496',52]
 ];
 db.prepare("INSERT INTO campo_mt_ref SELECT value->>0,value->>1,value->>2,value->>3,value->>4,value->>5,value->>6 FROM json_each(?)").run(JSON.stringify(actual));
 for(const [i,row] of actual.entries())db.prepare('INSERT INTO mt_campo VALUES (?,?,?)').run(row[0],row[1],coordinates(i));
 db.prepare('INSERT INTO mt_campo VALUES (?,?,?)').run('not-joined','AAL-01C8',coordinates(4));
 worker.installed=[{table_name:'mt_campo',column_name:'geom',classification:'MT',columns:['Id','Alimentador','geom'],srs_id:4326}];
 vm.runInContext('currentLayers=installed;routeReferenceReady=true;',worker);
 const linked=query({feeders:['AAL-01C8'],sections:['1','2'],zone:'URBANO'});
 assert.deepEqual(linked.features.map(f=>M.feature(f).id),['6587410','6784695']);
 assert(Math.abs(M.metres(linked.features.map(M.feature))-64.163)<1e-8);
 assert.deepEqual(query({blocks:['RBR6496'],sections:['1','2'],zone:'URBANO'}).features.map(f=>M.feature(f).id),['6784695']);
 const dom=new JSDOM('<main><div id="mapFrame"><div id="controlMap"></div></div></main>',{runScripts:'outside-only',url:'https://campo.test'});
 const w=dom.window,d=w.document,$=id=>d.getElementById(id);
 let onMap,submitted,response=network,failPart=false;
 const attempts=[];
 w.CampoControl={authorized:()=>true,api:async(path,body)=>{
  if(body){submitted=JSON.parse(JSON.stringify(body));attempts.push(submitted);if(failPart&&body.name.endsWith("(2/2)"))throw Error("Rede indisponível");return {};}
  return path.endsWith('users')?{users:[{id:'inspetor',name:'Inspetor',passwordConfigured:true}]}:{routes:[],visits:[]};
 }};
 w.CampoControlMap={routeNetwork:async filters=>{assert.deepEqual(JSON.parse(JSON.stringify(filters)),expected);return response;},setRouteFilter:features=>{onMap=features?Array.from(features,f=>f.properties.Id):undefined;},routeOverlay(){}};
 w.confirm=()=>true;w.TextEncoder=TextEncoder;
 for(const f of ['docs/route-core.js','docs/route-planner.js'])vm.runInContext(read(f),dom.getInternalVMContext());
 assert.equal($('routePlanner').nextElementSibling,$('mapFrame'));
 $('routePlan').open=true;
 const filter=$('routeNetworkForm');
 filter.querySelector('[value="1"]').checked=true;filter.querySelector('[value="2"]').checked=true;
 filter.elements.feeder.value='tan-01i9';filter.elements.zone.value='URBANO';filter.elements.blocks.value='rbr554, rbr444\nRBR999';
 await filter.onsubmit(new w.Event('submit'));
 assert.deepEqual(onMap,['1','2']);
 assert.equal($('routeCandidates').children.length,2);
 assert.match($('routeNetworkStatus').textContent,/RBR999/);
 $('routeAddAll').click();
 assert.equal($('routeDraftList').children.length,2);
 $('routeClearNetwork').click();assert.equal(onMap,undefined);assert.equal($('routeDraftList').children.length,2);
 await new Promise(resolve=>setTimeout(resolve,25));
 const form=$('routePlanForm');form.elements.name.value='Vistoria T1 + T2';form.elements.assignee.value='inspetor';form.elements.locality.value='Rio Branco';
 await form.onsubmit(new w.Event('submit'));
 assert.equal(submitted.fromNetwork,true);
 assert.deepEqual(submitted.spans.map(s=>s.section),['1','2']);
 assert.deepEqual(submitted.spans.map(s=>s.block),['RBR554','RBR444']);
 const all=Array.from({length:251},(_,i)=>({...network.features[0],properties:{...network.features[0].properties,Id:String(2000+i),_route_id:String(2000+i),'Rede Comp M':30}}));
 response={...network,features:all,total:all.length};
 filter.elements.feeder.value='TAN-01I9';filter.elements.zone.value='URBANO';filter.elements.blocks.value='rbr554 rbr444 rbr999';
 filter.querySelector('[value="1"]').checked=true;filter.querySelector('[value="2"]').checked=true;
 await filter.onsubmit(new w.Event('submit'));
 assert.equal(onMap.length,251);
 assert.match($('routeNetworkStatus').textContent,/7,530 km/);
 $('routeAddAll').click();
 form.elements.name.value='Alimentador inteiro';form.elements.assignee.value='inspetor';form.elements.locality.value='Rio Branco';
 failPart=true;
 await form.onsubmit(new w.Event('submit'));
 assert.equal(attempts.at(-2).spans.length,250);
 assert.equal(attempts.at(-1).spans.length,1);
 assert.equal(attempts.at(-1).campaign.total,2);
 assert.equal(attempts.at(-1).buffer,'30');
 assert.equal($('routeAssign').textContent,'Retomar atribuição');
 failPart=false;
 await form.onsubmit(new w.Event('submit'));
 assert.deepEqual(attempts.at(-1),attempts.at(-2));
 dom.window.close();db.close();
 console.log('PASS: filtro SQL exato no MT, T1 + T2, alimentador, zona, chaves ausentes, lista/mapa e atribuição.');
})().catch(e=>{console.error(e);process.exitCode=1;});
