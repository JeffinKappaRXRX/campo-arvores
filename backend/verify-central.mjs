import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {DatabaseSync}from 'node:sqlite';
const sql=new DatabaseSync(':memory:');for(const file of ['shared-schema.sql','admin-schema.sql','homologacao-schema.sql','user-auth-schema.sql','vera-schema.sql'])sql.exec(await fs.readFile(new URL(file,import.meta.url),'utf8'));
class Query{constructor(text,args=[]){this.text=text;this.args=args;}bind(...a){return new Query(this.text,a);}async first(){return sql.prepare(this.text).get(...this.args)||null;}async all(){return {results:sql.prepare(this.text).all(...this.args)};}async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.args).changes)}};}}
const DB={prepare:s=>new Query(s),withSession(){return this;},async batch(qs){sql.exec('BEGIN');try{const out=[];for(const q of qs)out.push(await q.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const source=await fs.readFile(new URL('worker.js',import.meta.url),'utf8'),{default:app}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const token='t'.repeat(40),env={APP_ORIGIN:'https://team.example',ADMIN_PASSWORD:'private-bootstrap-password',ADMIN_SESSION_SECRET:'s'.repeat(40),LOGIN_GUARD:{get:async()=>0,put:async()=>{}},SHARED_DB:DB,VERA_SYNC_TOKEN:token,GOOGLE_SCRIPT_URL:'https://script.google.com/macros/s/test/exec'};
async function call(path,body,{cookie='',bearer=''}={}){const response=await app.fetch(new Request('https://api.test'+path,{method:body===undefined?'GET':'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{}),...(bearer?{Authorization:'Bearer '+bearer}:{})},body:body===undefined?undefined:JSON.stringify(body)}),env);return {response,status:response.status,data:await response.clone().json()};}
const sync=(body,bearer=token)=>call('/api/central/sync',body,{bearer});
const root=await call('/api/admin/login',{password:env.ADMIN_PASSWORD}),auth={cookie:root.response.headers.getSetCookie().find(s=>s.startsWith('__Host-campo-admin-recovery=')).split(';')[0]};
// Antes do schema o painel não quebra e o envio explica o que falta.
assert.equal((await call('/api/central/meta',undefined,auth)).data.generation,null);assert.equal((await sync({action:'part',generation:'cen-20261102',name:'resumo',part:0,data:'AAAA'})).status,503);
sql.exec(await fs.readFile(new URL('central-schema.sql',import.meta.url),'utf8'));
// Sem login não lê, inspetor não lê, token de envio não lê, token errado não escreve.
assert.equal((await call('/api/central/meta')).status,401);assert.equal((await call('/api/central/meta',undefined,{bearer:token})).status,401);assert.equal((await sync({action:'part',generation:'cen-20261102',name:'resumo',part:0,data:'AAAA'},'x'.repeat(40))).status,401);
const add=await call('/api/admin/users',{name:'i',email:'i@test.example',username:'inspetor',password:'Individual-password-2026',role:'inspector',blocked:false},auth);assert.equal(add.status,200);const login=await call('/api/auth/login',{username:'inspetor',password:'Individual-password-2026'}),inspector={cookie:login.response.headers.getSetCookie().find(s=>s.startsWith('__Host-campo-session=')).split(';')[0]};
assert.equal((await call('/api/central/meta',undefined,inspector)).status,403,'orçamento e carteira são só do administrador');assert.equal((await call('/api/central/data?name=resumo&part=0&generation=cen-20261102',undefined,inspector)).status,403);
// Validações.
assert.equal((await sync({action:'part',generation:'../x',name:'resumo',part:0,data:'AAAA'})).status,400);assert.equal((await sync({action:'part',generation:'cen-20261102',name:"x' OR 1",part:0,data:'AAAA'})).status,400);assert.equal((await sync({action:'part',generation:'cen-20261102',name:'resumo',part:0,data:'<script>'})).status,400);assert.equal((await sync({action:'nada',generation:'cen-20261102'})).status,400);
// Geração 1: incompleta não publica; completa publica.
assert.equal((await sync({action:'part',generation:'cen-20261102',name:'resumo',part:0,data:'AAAA'})).status,200);
assert.equal((await sync({action:'commit',generation:'cen-20261102',manifest:{resumo:{parts:2,bytes:8}}})).status,409);assert.equal((await call('/api/central/meta',undefined,auth)).data.generation,null);
assert.equal((await sync({action:'part',generation:'cen-20261102',name:'resumo',part:1,data:'BBBB'})).status,200);assert.equal((await sync({action:'commit',generation:'cen-20261102',manifest:{resumo:{parts:2,bytes:8}}})).status,200);
let m=(await call('/api/central/meta',undefined,auth)).data;assert.equal(m.generation,'cen-20261102');assert.equal(m.manifest.resumo.parts,2);assert.equal((await call('/api/central/data?name=resumo&part=1&generation=cen-20261102',undefined,auth)).data.body,'BBBB');
// Geração 2: durante o envio segue a anterior; no commit a antiga sai; quem pede a antiga é avisado.
await sync({action:'part',generation:'cen-20261103',name:'resumo',part:0,data:'CCCC'});assert.equal((await call('/api/central/meta',undefined,auth)).data.generation,'cen-20261102');
await sync({action:'commit',generation:'cen-20261103',manifest:{resumo:{parts:1,bytes:4}}});assert.equal((await call('/api/central/meta',undefined,auth)).data.generation,'cen-20261103');assert.equal((await call('/api/central/data?name=resumo&part=0&generation=cen-20261102',undefined,auth)).status,409);assert.equal(sql.prepare('SELECT COUNT(*) n FROM central_parts').get().n,1);
// O VERA não é tocado por este envio.
assert.equal((await call('/api/vera/trees',undefined,auth)).status,200);
console.log('central ok');
