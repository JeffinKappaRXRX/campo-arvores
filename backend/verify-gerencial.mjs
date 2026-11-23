import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import app from './worker.js';
import '../docs/consulta-arbora-filtros.js';
import Q from '../docs/span-quality.js';
import {gzipSync} from 'node:zlib';

const sql=new DatabaseSync(':memory:');
for(const schema of ['shared','admin','homologacao','user-auth','vera','gerencial']){
 sql.exec(await fs.readFile(new URL(schema+'-schema.sql',import.meta.url),'utf8'));
}
class Query{
 constructor(statement,args=[]){this.statement=statement;this.args=args;}
 bind(...args){return new Query(this.statement,args);}
 async first(){return sql.prepare(this.statement).get(...this.args)||null;}
 async all(){return {results:sql.prepare(this.statement).all(...this.args)};}
 async run(){return {meta:sql.prepare(this.statement).run(...this.args)};}
}
const DB={
 prepare:statement=>new Query(statement),withSession(){return this;},
 async batch(queries){
  sql.exec('BEGIN');
  try{
   const results=[];
   for(const query of queries)results.push(await query.run());
   sql.exec('COMMIT');
   return results;
  }catch(error){sql.exec('ROLLBACK');throw error;}
 }
};
const env={
 APP_ORIGIN:'https://arbora.test',ADMIN_PASSWORD:'fixture-admin-secret',ADMIN_SESSION_SECRET:'s'.repeat(40),
 LOGIN_GUARD:{get:async()=>0,put:async()=>{}},SHARED_DB:DB
};
function call(path,{cookie='',body,method=body===undefined?'GET':'POST',headers={}}={}){
 return app.fetch(new Request(env.APP_ORIGIN+path,{
  method,headers:{Origin:env.APP_ORIGIN,Cookie:cookie,'Content-Type':'application/json',...headers},
  body:body===undefined?undefined:JSON.stringify(body)
 }),env);
}
const treeMap='/api/gerencial/arvores';
const login='/api/gerencial/entrar',status='/api/gerencial/sessao',dataPath='/api/gerencial/dados',audit='/api/admin/gerencial/acessos';
assert.equal((await call(dataPath)).status,401);
assert.equal((await call(treeMap)).status,401);
assert.equal((await call(audit)).status,403);
const admin=(await call('/api/admin/login',{body:{password:env.ADMIN_PASSWORD}})).headers.get('Set-Cookie').split(';')[0];
const linkPath='/api/admin/gerencial/link';
assert.equal((await call(linkPath)).status,403);
const makeLink=async()=>{
 const response=await call(linkPath,{cookie:admin,body:{action:'rotate'}});
 assert.equal(response.status,200);
 return new URLSearchParams((await response.json()).fragment).get('acesso');
};
const link=await makeLink();
for(const token of ['', 'a'.repeat(43)]){
 const denied=await call(login,{body:{token}});
 assert.equal(denied.status,401);
 assert.equal(denied.headers.get('Set-Cookie'),null);
}
const logged=await call(login,{body:{token:link},headers:{'CF-Connecting-IP':'192.0.2.1'}});
assert.equal(logged.status,200);
assert.match(logged.headers.get('Set-Cookie'),/^__Host-arbora-gerencial=.*; Secure; HttpOnly; SameSite=Lax$/);
const viewer={cookie:logged.headers.get('Set-Cookie').split(';')[0]};
assert.deepEqual(await (await call(status,viewer)).json(),{authenticated:true,admin:false,viewer:true});
await call(login,{body:{token:link},...viewer});
assert.equal(sql.prepare('SELECT COUNT(*) n FROM campo_gerencial_acessos').get().n,1);
const third=await call(login,{body:{token:link},headers:{'CF-Connecting-IP':'192.0.2.2'}});
assert(third.headers.get('Set-Cookie'));
assert.equal((await call(linkPath,{...viewer,body:{action:'rotate'}})).status,403);
assert.equal((await call(audit,viewer)).status,403);
assert.equal((await call(dataPath,{method:'POST',...viewer})).status,405);
for(const path of ['/api/control/data','/api/admin/users','/api/network/manifest','/api/shared/changes','/api/routes','/api/vera/trees','/api/central/source']){
 assert.equal((await call(path,viewer)).status===200,false,path);
}
assert.equal((await call('/api/shared/save',{...viewer,body:{id:'attempt'}})).status,401);
assert.equal((await (await call('/api/auth/status',viewer)).json()).authenticated,false);
const insert=sql.prepare('INSERT INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)');
const createdAt='2026-11-24T03:20:00Z';
for(const [id,species,feeder,key,poda,inspector] of [
 ['tree-alpha','Açaí','TAQ-01C1','RBR554','sim','Herlen'],['vera-41','Azeitona','TAQ-01C1','RBR444','nao','Herlen'],
 ['tree-beta','Oiti','TAN-01C9','RBR555','sim','Lucivaldo'],['tree-test','Homologação','TAQ-01C1','','sim','Herlen'],['tree-deleted','Excluída','TAQ-01C1','','sim','Herlen']
]){
 const row={id,species,lat:-9.9,lon:-67.8,feeder,key,poda,inspector,createdAt,updatedAt:createdAt,height:9,operatorAccountEmail:'hidden@energisa.com.br',note:'internal fixture',photos:[{assetId:'asset-1'}],inspectionTiming:{collectionSeconds:180}};
 if(id==='tree-alpha'){
  row.span='V-101';
  row.spanReference=Q.reference(row,[-67.799,-9.9]);
 }
 if(id==='tree-beta')row.span='V-102';
 insert.run(id,JSON.stringify(row),createdAt,'op-'+id,inspector);
}
sql.prepare('UPDATE shared_trees SET deleted=1 WHERE id=?').run('tree-deleted');
sql.prepare("INSERT INTO campo_record_labels(tree_id,classification,revision,updated_at,actor) VALUES(?, 'homologacao', 1, ?, ?)").run('tree-test',createdAt,'Fixture');
const selection='/api/admin/gerencial/inspetores';
const accounts={};
const password='fixture-password-2026';
for(const name of ['Herlen','Lucivaldo','Outros']){
 const username=name.toLowerCase();
 const created=await call('/api/admin/users',{cookie:admin,body:{name,email:username+'@fixture.example',username,password,role:'inspector'}});
 assert.equal(created.status,200);
 accounts[name]=(await created.json()).id;
}
assert.equal((await call(selection,viewer)).status,403);
assert.equal((await call(selection,{...viewer,body:{ids:[accounts.Outros]}})).status,403);
const defaultScope=await (await call(selection,{cookie:admin})).json();
assert.deepEqual(defaultScope.enabled.map(row=>row.name).sort(),['Herlen','Lucivaldo']);
const getData=async()=>{
 const response=await call(dataPath,viewer),body=await response.json();
 assert.equal(response.status,200,JSON.stringify(body));
 assert.equal(response.headers.get('Cache-Control'),'no-store');
 return body;
};
const packageData=gzipSync(JSON.stringify({feeders:['TAN-01C9'],localities:[],blocks:[],rows:[
 ['ignored',0,0,0,0,0,100,0,0,0,[-67802000,-9901000,-67801000,-9901000]],
 ['V-102',0,0,0,0,0,100,0,0,0,[-67802000,-9901000,-67801000,-9901000]]
]}));
const getKV=env.LOGIN_GUARD.get;
env.LOGIN_GUARD.get=async(key,type)=>{
 if(key==='arbora:route-geometry:campo-20260803-v2'&&type==='json')return {feeders:['TAN-01C9'],parts:1,size:packageData.length};
 if(key==='arbora:route-geometry:campo-20260803-v2:0'&&type==='arrayBuffer')return Uint8Array.from(packageData).buffer;
 return getKV(key,type);
};
const data=await getData();
assert.deepEqual(data.field.filter(row=>row.spanAlert).map(row=>row.spanAlert.span).sort(),['V-101','V-102']);
assert.equal(data.field.filter(row=>row.spanChecked).length,2);
assert.equal((await call('/api/control/span-quality',viewer)).status,401);
const quality=await (await call('/api/control/span-quality',{cookie:admin})).json();
assert.equal(quality.count,2);
assert.equal(quality.checked,2);
assert(quality.items.every(item=>item.metres>60&&item.nearest.length===2));
const line={type:'LineString',coordinates:[[-.01,0],[.01,0]]};
const offset=60/(Math.PI*6371000/180);
assert.equal(Q.measure(offset,0,line).metres,60);
assert(Q.measure(offset+1e-8,0,line).metres>60);
assert(Q.measure(offset-1e-8,0,line).metres<60);
assert.equal(Q.measure('',0,line),null);
assert.equal(Q.measure(0,0,{type:'MultiLineString',coordinates:[[[-.01,0],[.01,0]],[[1,1],[2,2]]]}).metres,0);
assert.equal(Q.read({span:'V-2',lat:0,lon:0,spanReference:Q.reference({span:'V-1',lat:0,lon:0},[1,1])}),null);

assert.deepEqual(data.groups.map(group=>group.label),['Sem equipe 1','Sem equipe 2']);
assert.equal(data.field.length,3);
assert(!JSON.stringify(data).match(/Herlen|Lucivaldo/));
const teamsPath='/api/admin/gerencial/equipes';
const teamRequest=body=>call(teamsPath,{cookie:admin,body});
assert.equal((await call(teamsPath,viewer)).status,403);
assert.equal((await call(teamsPath,{...viewer,body:{action:'create',name:'Inválida'}})).status,403);
const createTeam=await teamRequest({action:'create',name:' bv-mt01 '});
assert.equal(createTeam.status,201);
const team=(await createTeam.json()).team;
assert.equal(team.name,'BV-MT01');
assert.equal((await teamRequest({action:'create',name:'BV-mt01'})).status,409);
const other=(await (await teamRequest({action:'create',name:'BV-MT02'})).json()).team;
assert.equal((await teamRequest({action:'assign',teamId:team.id,userId:accounts.Lucivaldo})).status,200);
assert.equal((await teamRequest({action:'assign',teamId:team.id,userId:accounts.Herlen})).status,200);
assert.deepEqual((await getData()).groups,[{id:team.id,label:'BV-MT01',operatorCount:2}]);
assert.equal((await teamRequest({action:'assign',teamId:other.id,userId:accounts.Herlen})).status,200);
const linked=await getData();
assert.deepEqual(linked.groups.map(group=>group.label),['BV-MT01','BV-MT02']);
assert.equal(linked.field.filter(row=>row.inspector===team.id).length,1);
assert.equal(linked.field.filter(row=>row.inspector===other.id).length,2);
assert.equal((await teamRequest({action:'visibility',showInspectorNames:true})).status,200);
assert.deepEqual((await getData()).groups.map(group=>group.label),['BV-MT01 · Lucivaldo','BV-MT02 · Herlen']);
assert.equal((await teamRequest({action:'visibility',showInspectorNames:false})).status,200);
assert(!JSON.stringify(data).includes('tree-alpha'));
assert(!JSON.stringify(data).includes('hidden@energisa.com.br'));
assert(!Object.hasOwn(data,'park'));
assert.equal((await call('/api/gerencial/foto?source=campo&id=tree-alpha',viewer)).status,404);
await call(selection,{cookie:admin,body:{ids:[accounts.Lucivaldo]}});
assert.deepEqual((await getData()).groups.map(group=>group.label),['BV-MT01']);
await call(selection,{cookie:admin,body:{ids:[accounts.Herlen,accounts.Lucivaldo]}});
assert.equal((await call(treeMap,{method:'POST',...viewer})).status,405);
const currentVera='vera-fixture';
sql.prepare("INSERT INTO vera_meta(key,value) VALUES('generation',?)").run(currentVera);
const insertVera=sql.prepare('INSERT INTO vera_trees(generation,id,data) VALUES(?,?,?)');
for(const [generation,id,lat,lon] of [
 [currentVera,'41',-9.91,-67.81],[currentVera,'42','-9.92','-67.82'],[currentVera,'43',-9.93,-67.83],
 [currentVera,'44',null,-67.84],['old-fixture','45',-9.95,-67.85]
]){
 insertVera.run(generation,id,JSON.stringify({lat,lon,observacao:'internal note'}));
}
const archiveUrl='https://archive.example/fixtures';
env.GOOGLE_SCRIPT_URL=archiveUrl;
env.GOOGLE_SCRIPT_TOKEN='archive-fixture';
const checkKeyFetch=globalThis.fetch;
globalThis.fetch=(url,options)=>{
 if(url!==archiveUrl)return checkKeyFetch(url);
 const payload=JSON.parse(options.body);
 assert.equal(payload.action,'admin_list');
 return Response.json({
  ok:true,revision:1,records:[{id:'archived',lat:-9.98,lon:-67.88,inspector:'Outros',createdAt:'2023-01-01'}],
  deletedIds:['vera-43'],pendingDeletes:[{id:'pending',lat:-9.99,lon:-67.89,updatedAt:createdAt}]
 });
};
const coordinates=await call(treeMap+'?from=2030-01-01&inspector=unused',viewer);
assert.equal(coordinates.status,200);
assert.equal(coordinates.headers.get('Cache-Control'),'no-store');
assert.deepEqual(await coordinates.json(),{
 vera:[[-9.9,-67.8],[-9.92,-67.82]],
 field:[[-9.9,-67.8],[-9.9,-67.8],[-9.98,-67.88]],veraAvailable:true,archiveAvailable:true
});
delete env.GOOGLE_SCRIPT_URL;
delete env.GOOGLE_SCRIPT_TOKEN;
globalThis.fetch=checkKeyFetch;
const F=globalThis.CampoConsultaFiltros;
const filtered=F.apply(linked.field,{from:'2026-11-23',through:'2026-11-23',inspectors:[other.id]});
assert.equal(filtered.length,2);
assert.equal(F.summary(filtered).mean,180);

const root=[-67.81,-9.97],junction=[-67.809,-9.97],tip=[-67.807,-9.97],branch=[-67.809,-9.969],branchTip=[-67.809,-9.968];
const span=(id,line,metres,section='1')=>({id,line,metres,locality:'RIO BRANCO',feeder:'TAN-01I9',zone:'URBANO',section,block:'RBR554'});
const spans=[span('trunk-a',[root,junction],100),span('trunk-b',[junction,tip],210,'2'),span('branch-a',[junction,branch],300,'3'),span('branch-b',[branch,branchTip],60,'3')];
const createRoute=(id,assignee,changes={})=>call('/api/routes',{cookie:admin,body:{id,assignee,name:id,spans,fromNetwork:true,outlet:root,...changes}});
const herlen=accounts.Herlen;
assert.equal((await createRoute('production',herlen)).status,201);
assert.equal((await createRoute('private',accounts.Outros)).status,201);
assert.equal((await createRoute('second',accounts.Lucivaldo,{name:'minha rota de Lucivaldo'})).status,201);
assert.equal((await createRoute('test',herlen,{homologation:true})).status,201);
const legacy=await call('/api/routes',{cookie:admin,body:{id:'legacy',assignee:herlen,name:'legacy',spans,fromNetwork:true,homologation:true}});
assert.equal(legacy.status,201);
const outletPath='/api/routes/saida';
assert.equal((await call(outletPath,{cookie:admin,body:{routeId:'legacy',outlet:[-67,-9]}})).status,400);
assert.equal((await call(outletPath,{cookie:admin,body:{routeId:'legacy',outlet:root}})).status,200);
const rangesPath='/api/routes/visit';
const inspectorCookie=(await call('/api/auth/login',{body:{username:'herlen',password}})).headers.get('Set-Cookie').split(';')[0];
const startedAt=new Date(Date.now()-60000).toISOString(),endedAt=new Date().toISOString();
const send=(id,segments,routeId='production')=>call(rangesPath,{cookie:inspectorCookie,body:{id,routeId,startedAt,endedAt,keyCheck:{code:'RBR554',segments}}});
assert.equal((await send('unknown-segment',['missing'])).status,409);
assert.equal((await send('other-inspector',['trunk-a'],'private')).status,404);
assert.equal((await send('principal',['trunk-a'])).status,200);
assert.equal((await send('principal',['trunk-a'])).status,200);
const current=await getData();
assert.deepEqual(current.routes.map(row=>row.id).sort(),['production','second']);
assert(!JSON.stringify(current).match(/Herlen|Lucivaldo/));
const production=current.routes.find(row=>row.id==='production');
assert.equal(production.confirmed,310);
assert.equal(production.pending,360);
assert.equal(production.closed,0);
const routeMap='/api/gerencial/rota?id=';
const map=await (await call(routeMap+'production',viewer)).json();
assert.equal(map.keys[0].pending,1);
assert.equal(map.lines.pending.length,2);
assert.deepEqual(map.lines.pending.at(-1).at(-1),branchTip);
assert.equal((await call(routeMap+'private',viewer)).status,404);
assert.equal((await call(routeMap+'test',viewer)).status,404);
const batch=await (await call(routeMap+'production&id=private&id=second&id=test&batch=1',viewer)).json();
assert.deepEqual(batch.routes.map(route=>route.id),['production','second']);
assert.equal((await send('branch',['branch-a'])).status,200);
assert.equal((await getData()).routes.find(row=>row.id==='production').closed,1);
assert.equal((await getData()).routes.find(row=>row.id==='production').confirmed,670);
assert.equal((await send('branch-repeated',['branch-a'])).status,200);
assert.equal((await getData()).routes.find(row=>row.id==='production').confirmed,670);
const testPath='/api/routes/homologacao';
assert.equal((await call(testPath,{cookie:admin,body:{routeId:'production',action:'delete'}})).status,409);
assert.equal((await call(testPath,{cookie:admin,body:{routeId:'test',action:'delete'}})).status,200);
assert.equal((await send('deleted',['trunk-a'],'test')).status,410);
assert.deepEqual((await (await call('/api/routes?mine=1',{cookie:inspectorCookie})).json()).deletedIds,['test']);

assert.equal((await call('/api/gerencial/sair',{...viewer,method:'POST'})).status,200);
assert.equal((await call(dataPath,viewer)).status,401);
const journal=await (await call(audit,{cookie:admin})).json();
assert.equal(journal.items.length,2);
assert(journal.items.find(row=>row.id===1).saiu_em);
assert(journal.items.every(row=>/^Link · rede [\w-]{12}$/.test(row.email)));
assert.notEqual(journal.items[0].email,journal.items[1].email);
const thirdViewer={cookie:third.headers.get('Set-Cookie').split(';')[0]};
assert.equal((await call(dataPath,thirdViewer)).status,200);
const rotated=await makeLink();
assert.equal((await call(dataPath,thirdViewer)).status,401);
assert.equal((await call(login,{body:{token:link}})).status,401);
assert.equal((await call(login,{body:{token:rotated}})).status,200);
assert.equal((await call(linkPath,{cookie:admin,body:{action:'revoke'}})).status,200);
assert.equal((await call(login,{body:{token:rotated}})).status,401);
assert(!Object.hasOwn(journal.items[0],'token_hash'));
assert.equal((await teamRequest({action:'assign',teamId:null,userId:accounts.Lucivaldo})).status,200);
const settings=await (await teamRequest()).json();
assert(!settings.members.some(member=>member.userId===accounts.Lucivaldo));
console.log('PASS ARBORA gerencial: link revogável sem login, isolamento de escopo, auditoria, escopo configurável, equipes, privacidade de nomes, múltiplas rotas, KPIs, crédito por chave, derivações e homologação.');
