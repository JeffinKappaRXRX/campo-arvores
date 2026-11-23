import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import app from './worker.js';
import '../docs/consulta-arbora-filtros.js';

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
 LOGIN_GUARD:{get:async()=>0,put:async()=>{}},SHARED_DB:DB,
 GERENCIAL_ACCESS_ISSUER:'https://arbora-test.cloudflareaccess.com',GERENCIAL_ACCESS_AUD:'fixture-audience',
 GERENCIAL_EMAIL_DOMAINS:'energisa.com.br,energisaterceiros.example'
};
const rsa=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
const publicKey=await crypto.subtle.exportKey('jwk',rsa.publicKey);
globalThis.fetch=async url=>{
 assert.equal(url,env.GERENCIAL_ACCESS_ISSUER+'/cdn-cgi/access/certs');
 return Response.json({keys:[{...publicKey,kid:'fixture-key'}]});
};
const encode=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function assertion(overrides={}){
 const now=Math.floor(Date.now()/1000);
 const claims={iss:env.GERENCIAL_ACCESS_ISSUER,aud:[env.GERENCIAL_ACCESS_AUD],exp:now+3600,nbf:now-5,type:'app',email:'gerente@energisa.com.br',...overrides};
 const body=encode({alg:'RS256',kid:'fixture-key'})+'.'+encode(claims);
 const signed=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',rsa.privateKey,new TextEncoder().encode(body));
 return body+'.'+Buffer.from(signed).toString('base64url');
}
function call(path,{cookie='',jwt='',body,method=body===undefined?'GET':'POST',headers={}}={}){
 return app.fetch(new Request(env.APP_ORIGIN+path,{
  method,headers:{Origin:env.APP_ORIGIN,Cookie:cookie,'Cf-Access-Jwt-Assertion':jwt,'Content-Type':'application/json',...headers},
  body:body===undefined?undefined:JSON.stringify(body)
 }),env);
}
const login='/api/gerencial/entrar',status='/api/gerencial/sessao',dataPath='/api/gerencial/dados',audit='/api/admin/gerencial/acessos';
assert.equal((await call(dataPath)).status,401);
assert.equal((await call(audit)).status,403);
for(const jwt of ['',await assertion({aud:['other']}),await assertion({exp:1}),await assertion({email:'energisa@external.example'}),await assertion({email:'gerente@energisa.com.br.external.example'})]){
 const denied=await call(login,{jwt,headers:{'Cf-Access-Authenticated-User-Email':'gerente@energisa.com.br'}});
 assert.equal(denied.headers.get('Location'),'/consulta-arbora.html?acesso=email');
 assert.equal(denied.headers.get('Set-Cookie'),null);
}
const signed=await assertion(),parts=signed.split('.');
parts[1]=encode({iss:env.GERENCIAL_ACCESS_ISSUER,aud:[env.GERENCIAL_ACCESS_AUD],email:'outro@energisa.com.br',type:'app',exp:Date.now()/1000+3600});
assert.equal((await call(login,{jwt:parts.join('.')})).headers.get('Set-Cookie'),null);
const logged=await call(login,{jwt:signed});
assert.equal(logged.status,303);
assert.equal(logged.headers.get('Location'),'/consulta-arbora.html');
assert.match(logged.headers.get('Set-Cookie'),/^__Host-arbora-gerencial=.*; Secure; HttpOnly; SameSite=Lax$/);
const viewer={cookie:logged.headers.get('Set-Cookie').split(';')[0]};
assert.equal((await (await call(status,viewer)).json()).email,'gerente@energisa.com.br');
await call(login,{jwt:signed,...viewer});
assert.equal(sql.prepare('SELECT COUNT(*) n FROM campo_gerencial_acessos').get().n,1);
const third=await call(login,{jwt:await assertion({email:'Gestora@energisaterceiros.example'})});
assert(third.headers.get('Set-Cookie'));
assert.equal((await call(audit,viewer)).status,403);
assert.equal((await call(dataPath,{method:'POST',...viewer})).status,405);
for(const path of ['/api/control/data','/api/admin/users','/api/network/manifest','/api/shared/changes','/api/routes','/api/vera/trees','/api/central/source']){
 assert.equal((await call(path,viewer)).status===200,false,path);
}
assert.equal((await call('/api/shared/save',{...viewer,body:{id:'attempt'}})).status,401);
assert.equal((await (await call('/api/auth/status',viewer)).json()).authenticated,false);
const admin=(await call('/api/admin/login',{body:{password:env.ADMIN_PASSWORD}})).headers.get('Set-Cookie').split(';')[0];

const insert=sql.prepare('INSERT INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)');
const createdAt='2026-11-24T03:20:00Z';
for(const [id,species,feeder,key,poda,inspector] of [
 ['tree-alpha','Açaí','TAQ-01C1','RBR554','sim','Herlen'],['vera-41','Azeitona','TAQ-01C1','RBR444','nao','Herlen'],
 ['tree-beta','Oiti','TAN-01C9','RBR555','sim','Lucivaldo'],['tree-test','Homologação','TAQ-01C1','','sim','Herlen'],['tree-deleted','Excluída','TAQ-01C1','','sim','Herlen']
]){
 const row={id,species,lat:-9.9,lon:-67.8,feeder,key,poda,inspector,createdAt,updatedAt:createdAt,height:9,operatorAccountEmail:'hidden@energisa.com.br',note:'internal fixture',photos:[{assetId:'asset-1'}],inspectionTiming:{collectionSeconds:180}};
 insert.run(id,JSON.stringify(row),createdAt,'op-'+id,inspector);
}
sql.prepare('UPDATE shared_trees SET deleted=1 WHERE id=?').run('tree-deleted');
sql.prepare("INSERT INTO campo_record_labels(tree_id,classification,revision,updated_at,actor) VALUES(?, 'homologacao', 1, ?, ?)").run('tree-test',createdAt,'Fixture');
const generation='vera-test';
for(const [key,value] of Object.entries({generation,referencia:JSON.stringify({clientesMax:300,alimentadores:{'TAQ-01C1':{trecho:'T1',clientes:300},'TAN-01C9':{trecho:'T3',clientes:200}}})})){
 sql.prepare('INSERT INTO vera_meta(key,value) VALUES(?,?)').run(key,value);
}
const veraRows=[
 {id:'41',especies:'Azeitona',lat:-9.96,lon:-67.83,data:'23/11/2026',trecho:'2',alimentador:'TAQ-01C1',chave:'RBR444',classe:'ALTO'},
 {id:'42',especies:'Manga',lat:null,lon:null,data:'22/11/2026',trecho:'T2',alimentador:'TAN-01C9',chave:'RBR444',classe:'ALTO'}
];
for(const row of veraRows)sql.prepare('INSERT INTO vera_trees(generation,id,data) VALUES(?,?,?)').run(generation,row.id,JSON.stringify(row));
const reply=await call(dataPath,viewer),data=await reply.json();
assert.equal(reply.status,200,JSON.stringify(data));
assert.equal(reply.headers.get('Cache-Control'),'no-store');
assert.deepEqual(data.field.map(row=>row.id).sort(),['tree-alpha','tree-beta','vera-41']);
assert.equal(data.park.length,4,'shared VERA update counts once');
assert.equal(data.park.find(row=>row.id==='41').campoId,'vera-41');
assert(!JSON.stringify(data).includes('hidden@energisa.com.br'));
assert(!JSON.stringify(data).includes('internal fixture'));
assert.equal((await call('/api/gerencial/foto?source=campo&id=tree-test',viewer)).status,404);

const F=globalThis.CampoConsultaFiltros,prepared=F.prepare(data);
const defaults={inspectors:[],feeders:[],sections:[],risks:[]};
const filtered=F.apply(prepared,{...defaults,from:'2026-11-23',through:'2026-11-23',feeders:['taq01c1'],sections:['T1','T2'],inspectors:['herlen'],keys:'RBR554,\nRBR444'});
assert.deepEqual(filtered.park.map(row=>row.id).sort(),['41','tree-alpha']);
assert.equal(F.summary(filtered.field).mean,180);
assert.equal(F.apply(prepared,{...defaults,query:'acai'}).park[0].id,'tree-alpha');
assert.equal(F.apply(prepared,{...defaults,query:'RBR55 00000'}).park.length,0);
assert.deepEqual(F.apply(prepared,{...defaults,pruning:'sim',source:'campo'}).park.map(row=>row.id).sort(),['tree-alpha','tree-beta']);

assert.equal((await call('/api/gerencial/sair',{...viewer,method:'POST'})).status,200);
assert.equal((await call(dataPath,viewer)).status,401);
const journal=await (await call(audit,{cookie:admin})).json();
assert.equal(journal.items.length,2);
assert(journal.items.find(row=>row.email==='gerente@energisa.com.br').saiu_em);
assert(journal.items.some(row=>row.email==='gestora@energisaterceiros.example'));
assert(!Object.hasOwn(journal.items[0],'token_hash'));
console.log('PASS ARBORA gerencial: JWT assinado, domínio exato, isolamento de escopo, auditoria, registros ativos, VERA vinculado, filtros múltiplos e horário de Rio Branco.');
