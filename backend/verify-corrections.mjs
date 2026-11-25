import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import app from './worker.js';

const sql=new DatabaseSync(':memory:');
for(const schema of ['shared','admin','homologacao','user-auth','vera','gerencial','corrections']){
 sql.exec(await fs.readFile(new URL(schema+'-schema.sql',import.meta.url),'utf8'));
}
class Query{
 constructor(statement,args=[]){this.statement=statement;this.args=args;}
 bind(...args){return new Query(this.statement,args);}
 async first(){return sql.prepare(this.statement).get(...this.args)||null;}
 async all(){return {results:sql.prepare(this.statement).all(...this.args)};}
 async run(){return {meta:{changes:Number(sql.prepare(this.statement).run(...this.args).changes)}};}
}
const DB={prepare:statement=>new Query(statement),withSession(){return this;},async batch(queries){
 sql.exec('BEGIN');
 try{const result=[];for(const query of queries)result.push(await query.run());sql.exec('COMMIT');return result;}
 catch(error){sql.exec('ROLLBACK');throw error;}
}};
const env={APP_ORIGIN:'https://arbora.test',ADMIN_PASSWORD:'fixture-admin-secret',ADMIN_SESSION_SECRET:'s'.repeat(40),
 LOGIN_GUARD:{get:async()=>0,put:async()=>{}},SHARED_DB:DB,GOOGLE_SCRIPT_URL:'https://drive.test',GOOGLE_SCRIPT_TOKEN:'test-token'};
async function call(path,body,cookie=''){
 const response=await app.fetch(new Request(env.APP_ORIGIN+path,{method:body===undefined?'GET':'POST',
  headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)}),env);
 const text=await response.text();
 return {status:response.status,headers:response.headers,value:response.headers.get('Content-Type').includes('json')?JSON.parse(text):text};
}
const signIn=async username=>(await call('/api/auth/login',{username,password:'Fixture-inspector-123'})).headers.getSetCookie().find(v=>v.startsWith('__Host-campo-session=')).split(';')[0];
const admin=(await call('/api/admin/login',{password:env.ADMIN_PASSWORD})).headers.getSetCookie().find(v=>v.startsWith('__Host-campo-admin-recovery=')).split(';')[0];
for(const name of ['Ana','Bruno']){
 const result=await call('/api/admin/users',{name,email:name+'@arbora.test',username:name.toLowerCase(),password:'Fixture-inspector-123',role:'inspector',blocked:false},admin);
 assert.equal(result.status,200,JSON.stringify(result.value));
}
const ana=sql.prepare('SELECT id FROM campo_users WHERE name=?').get('Ana').id,bruno=sql.prepare('SELECT id FROM campo_users WHERE name=?').get('Bruno').id;
const tokenAna=await signIn('ana'),tokenBruno=await signIn('bruno');
const stamp='2026-11-24T19:30:00Z';
const good={lat:-9.965,lon:-67.829,feeder:'RBR-01C1',span:'923',pole:'421',species:'Ipê & <Oiti>',height:'10',dap:'18',
 mt:true,bt:true,btDistance:0,mtDistance:'1.5',treeSite:'publico',poda:'sim',projection:'nao',createdAt:stamp,updatedAt:stamp,
 photos:[{id:'original',assetId:'original',name:'Foto.jpg'}]};
const items=[
 {...good,id:'ana-missing',pole:'',span:'',btDistance:'',photos:[],inspector:'Ana',createdByUserId:ana},
 {...good,id:'ana-good',inspector:'Ana',createdByUserId:ana},
 {...good,id:'bruno-missing',photos:[],inspector:'Bruno',createdByUserId:bruno},
 {...good,id:'bruno-folder',photos:[],photoReference:'https://drive.google.com/drive/folders/exemplo',inspector:'Bruno',createdByUserId:bruno},
 {...good,id:'missing-coords',lat:'',photos:[],inspector:'Ana',createdByUserId:ana},
 {...good,id:'test',photos:[],inspector:'Ana',createdByUserId:ana}
];
for(const item of items)sql.prepare('INSERT INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)').run(item.id,JSON.stringify(item),stamp,'seed-'+item.id,item.inspector);
sql.prepare('INSERT INTO campo_record_labels(tree_id,classification,revision,updated_at,actor) VALUES(?,?,1,?,?)').run('test','homologacao',stamp,'admin');
const legacy={...good,id:'drive-only',inspector:'Bruno',photos:[{id:'arquivo',originalUrl:'https://drive.google.com/file/d/exemplo/view'}],feeder:'RBR-01C2',height:''};
const fetchOriginal=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 assert.equal(String(url),env.GOOGLE_SCRIPT_URL);
 assert.equal(JSON.parse(options.body).action,'admin_list');
 return Response.json({ok:true,records:[legacy],deletedIds:[],nextOffset:null,revision:'snapshot'});
};
const get=(path,cookie=admin)=>call(path,undefined,cookie),send=(path,body,cookie=admin)=>call(path,body,cookie);
const quality='/api/control/quality',manage='/api/control/corrections',field='/api/corrections';
assert.equal((await get(quality,tokenAna)).status,403);
assert.equal((await get(field,'')).status,401);
let result=await get(quality+'?inspector=Ana&issue=photos');
assert.equal(result.status,200,JSON.stringify(result.value));
assert.deepEqual(result.value.items.map(r=>r.id).sort(),['ana-missing','missing-coords']);
assert.equal(result.value.summary.total,3);
assert.equal(result.value.ranking[0].rate,2/3);
result=await get(quality+'?issue=btDistance');
assert.deepEqual(result.value.items.map(r=>r.id),['ana-missing'],'zero distance is measured, not missing');
assert.deepEqual(result.value.items[0].issues,['photos','pole','span','btDistance']);
result=await get(quality+'?issue=photoReview');
assert.deepEqual(result.value.items.map(r=>r.id),['bruno-folder']);
result=await get(quality+'?format=kml&inspector=Ana');
assert.equal(result.status,200);
assert.equal(result.headers.get('X-Campo-Record-Count'),'1');
assert.equal(result.headers.get('X-Campo-Without-Coordinates'),'1');
assert.match(result.value,/<coordinates>-67\.829,-9\.965,0<\/coordinates>/);
assert.match(result.value,/Ipê &amp; &lt;Oiti&gt;/);
assert.doesNotMatch(result.value,/bruno-missing/);
const request={action:'dispatch',ids:['ana-missing','bruno-missing','drive-only'],operationId:'batch-1',note:'Confira a árvore no local.'};
assert.equal((await send(manage,request,tokenAna)).status,403);
assert.equal((await send(manage,{...request,ids:['ana-missing','missing-coords']})).status,409);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM campo_tree_corrections').get().n,0);
result=await send(manage,request);
assert.equal(result.status,200,JSON.stringify(result.value));
assert.equal(result.value.sent,3);
assert.equal((await send(manage,request)).value.sent,3);
assert.equal((await send(manage,{...request,operationId:'next-batch'})).value.alreadyPending,3);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM campo_tree_corrections').get().n,3);
const anaTasks=(await get(field,tokenAna)).value.items,brunoTasks=(await get(field,tokenBruno)).value.items;
assert.deepEqual(anaTasks.map(r=>r.treeId),['ana-missing']);
assert.deepEqual(brunoTasks.map(r=>r.treeId).sort(),['bruno-missing','drive-only']);
assert.equal(anaTasks[0].assignee,ana);
assert.equal(brunoTasks[0].assignee,bruno);
const driveTree=(await get('/api/shared/tree?id=drive-only',tokenBruno)).value.tree;
assert.equal(driveTree.createdAt,stamp);
assert.equal(driveTree.archivedPhotoEvidence,true);
assert.equal(driveTree.inspector,'Bruno');
assert.equal((await send(field+'/complete',{id:anaTasks[0].id},tokenBruno)).status,404);
assert.equal((await send(field+'/complete',{id:anaTasks[0].id},tokenAna)).status,409);
const photo='data:image/jpeg;base64,/9j/AA==',sha256=Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from('/9j/AA==','base64'))).toString('hex');
const update={record:{...items[0],pole:good.pole,span:good.span,btDistance:0,photos:[]},baseVersion:1,operationId:'no-photo-yet'};
assert.equal((await send('/api/shared/save',update,tokenAna)).status,200);
assert.match((await send(field+'/complete',{id:anaTasks[0].id},tokenAna)).value.error,/Sem fotos/);
result=await send('/api/shared/save',{...update,baseVersion:2,operationId:'with-photo',
 record:{...update.record,photos:[{id:'new',assetId:'new'}]},uploads:[{assetId:'new',image:photo,sha256}]},tokenAna);
assert.equal(result.status,200,JSON.stringify(result.value));
assert.equal((await send(field+'/complete',{id:anaTasks[0].id},tokenAna)).status,200);
assert.equal((await get(field,tokenAna)).value.items.length,0);
result=await get(quality+'?returnStatus=completed');
assert.equal(result.value.items[0].task.closedBy,'Ana');
assert.deepEqual(result.value.items[0].issues,[]);
assert.equal((await send(manage,{action:'cancel',id:brunoTasks.find(r=>r.treeId==='bruno-missing').id})).status,200);
assert.equal((await get(field,tokenBruno)).value.items.length,1);
assert.equal((await send(manage,{action:'dispatch',ids:['ana-good'],operationId:'manual',assignee:bruno,note:'Confirmar acesso e localização.'})).status,200);
assert((await get(field,tokenBruno)).value.items.some(r=>r.treeId==='ana-good'&&r.issues[0]==='field'));
const link=(await send('/api/admin/gerencial/link',{action:'rotate'})).value.fragment;
const key=new URLSearchParams(link).get('acesso');
const viewer=(await send('/api/gerencial/link-session',{token:key},'')).headers.get('Set-Cookie');
assert(viewer);
assert.equal((await get(quality,viewer)).status,401);
globalThis.fetch=fetchOriginal;
console.log('PASS quality filters, audit denominator and ranking, KML, scope, bulk dispatch, legacy preservation, account isolation, idempotency and verified completion.');
