import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {DatabaseSync}from 'node:sqlite';
const sql=new DatabaseSync(':memory:');for(const f of ['shared-schema.sql','admin-schema.sql','homologacao-schema.sql','user-auth-schema.sql','vera-schema.sql'])sql.exec(await fs.readFile(new URL(f,import.meta.url),'utf8'));
class Query{constructor(text,args=[]){this.text=text;this.args=args;}bind(...args){return new Query(this.text,args);}async first(){return sql.prepare(this.text).get(...this.args)||null;}async all(){return {results:sql.prepare(this.text).all(...this.args)};}async run(){return {meta:{changes:Number(sql.prepare(this.text).run(...this.args).changes)}};}}
let race=null;const DB={prepare:s=>new Query(s),withSession(){return this;},async batch(qs){if(race){const f=race;race=null;f();}sql.exec('BEGIN');try{const r=[];for(const q of qs)r.push(await q.run());sql.exec('COMMIT');return r;}catch(e){sql.exec('ROLLBACK');throw e;}}};
const {default:app}=await import('data:text/javascript;base64,'+Buffer.from(await fs.readFile(new URL('worker.js',import.meta.url),'utf8')).toString('base64'));
const env={APP_ORIGIN:'https://team.example',ADMIN_PASSWORD:'private-bootstrap-password',ADMIN_SESSION_SECRET:'s'.repeat(40),LOGIN_GUARD:{get:async()=>0,put:async()=>{}},SHARED_DB:DB,GOOGLE_SCRIPT_URL:'https://example.invalid/archive',GOOGLE_SCRIPT_TOKEN:'test-only'};
const original={id:'tree1',lat:-9.9,lon:-67.8,species:'Oiti',height:10,mt:true,mtDistance:1.2,inspector:'Inspetor original',createdBy:'Inspetor original',createdAt:'2026-10-31T12:00:00Z',updatedAt:'2026-10-31T12:00:00Z',inspectionTiming:{collectionSeconds:120},plantIdentification:{score:77},extraMetadata:{keep:true},photos:[{id:'p0',assetId:'p0',name:'original.jpg'}]};
const image='data:image/jpeg;base64,/9j/AA==',upload={assetId:'photo-new',image,sha256:Buffer.from(await crypto.subtle.digest('SHA-256',Buffer.from(image.split(',')[1],'base64'))).toString('hex'),name:'PC.jpg'};
let archive={...original,id:'legacy'};const nativeFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({ok:true,records:[archive],deletedIds:[],nextOffset:null,revision:'one'});
let cookie='';async function call(path,body,auth=cookie){const response=await app.fetch(new Request('https://api.test'+path,{method:body===undefined?'GET':'POST',headers:{Origin:env.APP_ORIGIN,'Content-Type':'application/json',Cookie:auth},body:body===undefined?undefined:JSON.stringify(body)}),env);return {status:response.status,data:await response.clone().json(),response};}
assert.equal((await call('/api/control/edit?id=tree1')).status,401);
const login=await call('/api/admin/login',{password:env.ADMIN_PASSWORD});cookie=login.response.headers.getSetCookie().find(v=>v.startsWith('__Host-campo-admin-recovery=')).split(';')[0];
sql.prepare('INSERT INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)').run('tree1',JSON.stringify(original),original.updatedAt,'initial','Inspetor original');sql.prepare('INSERT INTO shared_photos VALUES(?,?,?)').run('tree1','p0',image);
const count=()=>sql.prepare('SELECT COUNT(*) n FROM shared_changes').get().n,read=()=>JSON.parse(sql.prepare('SELECT data FROM shared_trees WHERE id=?').get('tree1').data);
let snap=await call('/api/control/edit?id=tree1');assert.equal(snap.status,200);assert.equal(snap.data.version,1);assert.equal(count(),1,'opening editor is read only');
const body={id:'tree1',version:1,operationId:'edit-1',values:{treeSite:'privado',height:12,mtDistance:1.25},uploads:[upload]};
assert.equal((await call('/api/control/edit',{...body,version:0})).status,409);
assert.equal((await call('/api/control/edit',{...body,values:{createdAt:'2026-11-16'}})).status,400,'creation date cannot be forged');
assert.equal((await call('/api/control/edit',{...body,values:{height:-1}})).status,400);
assert.equal((await call('/api/control/edit',{...body,uploads:[{...upload,sha256:'bad'}]})).status,400);
sql.prepare('INSERT INTO campo_admin_locks VALUES(?,?,?)').run('tree1','lock',Date.now()+60000);assert.equal((await call('/api/control/edit',body)).status,409);assert.equal(count(),1);sql.exec('DELETE FROM campo_admin_locks');
let result=await call('/api/control/edit',body);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.tree.sharedVersion,2);assert.equal(read().treeSite,'privado');assert.equal(read().height,'12');assert.equal(read().mtDistance,'1.25');
for(const k of ['createdAt','inspector','createdBy','inspectionTiming','plantIdentification','extraMetadata'])assert.deepEqual(read()[k],original[k],k+' preserved');assert.equal(read().photos.length,2);assert.equal(count(),2);
assert.equal(sql.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').get('tree1','p0').image,image);assert.equal(sql.prepare('SELECT data FROM shared_changes WHERE tree_id=? AND version=1').get('tree1').data,JSON.stringify(original));
assert.equal((await call('/api/control/edit',body)).data.replayed,true);assert.equal(count(),2,'retry adds no version or photo');
assert.equal((await call('/api/control/edit',{...body,operationId:'stale'})).status,409);
const before=count();race=()=>sql.prepare('INSERT INTO campo_admin_locks VALUES(?,?,?)').run('tree1','raced-lock',Date.now()+60000);assert.equal((await call('/api/control/edit',{...body,version:2,operationId:'race'})).status,409);assert.equal(count(),before,'lock acquired during request prevents all changes');sql.exec('DELETE FROM campo_admin_locks');
sql.prepare('UPDATE shared_trees SET pending=? WHERE id=?').run('request','tree1');assert.equal((await call('/api/control/edit',{...body,version:2,operationId:'pending'})).status,409);sql.prepare('UPDATE shared_trees SET pending=NULL WHERE id=?').run('tree1');
sql.prepare('INSERT INTO vera_meta VALUES(?,?)').run('generation','g1');sql.prepare('INSERT INTO vera_trees VALUES(?,?,?)').run('g1','99',JSON.stringify({id:'99',lat:-9.9,lon:-67.8,altura:18,especies:'Mangueira'}));sql.prepare('INSERT INTO vera_thumbs VALUES(?,?)').run('99',image);
snap=(await call('/api/control/edit?id=vera-99')).data;assert.equal(snap.version,0);assert.equal(snap.record.photos.length,1);
const veraBody={id:'vera-99',version:0,baselineToken:snap.baselineToken,operationId:'vera-edit',values:{height:16},uploads:[upload]};
assert.equal((await call('/api/control/edit',{...veraBody,baselineToken:'old'})).status,409);
result=await call('/api/control/edit',veraBody);assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.tree.createdAt,null,'administrative VERA correction is not a new survey today');assert.equal(result.data.tree.photos.length,2);assert.equal(JSON.parse(sql.prepare('SELECT data FROM shared_baselines WHERE tree_id=?').get('vera-99').data).height,18);assert.equal(sql.prepare('SELECT COUNT(*) n FROM shared_photos WHERE tree_id=?').get('vera-99').n,2);
snap=(await call('/api/control/edit?id=legacy')).data;archive={...archive,note:'concurrent Drive change'};
const legacyBody={id:'legacy',version:0,baselineToken:snap.baselineToken,operationId:'legacy-edit',values:{species:'Ipê'}};assert.equal((await call('/api/control/edit',legacyBody)).status,409);
snap=(await call('/api/control/edit?id=legacy')).data;result=await call('/api/control/edit',{...legacyBody,baselineToken:snap.baselineToken});assert.equal(result.status,200,JSON.stringify(result.data));assert.equal(result.data.tree.photos[0].assetId,'p0');assert.equal(JSON.parse(sql.prepare('SELECT data FROM shared_baselines WHERE tree_id=?').get('legacy').data).note,archive.note);
await call('/api/admin/users',{name:'Inspector',email:'inspector@example.test',username:'inspector',password:'Inspector-password-123',role:'inspector',blocked:false});const inspector=await call('/api/auth/login',{username:'inspector',password:'Inspector-password-123'}),inspectorCookie=inspector.response.headers.getSetCookie().find(v=>v.startsWith('__Host-campo-session=')).split(';')[0];assert.equal((await call('/api/control/edit?id=tree1',undefined,inspectorCookie)).status,403);assert.equal((await call('/api/control/edit',body,inspectorCookie)).status,403);
const desktopPhotos=await Promise.all([1,2,3].map(async n=>{
 const buffer=Buffer.from([255,216,255,n]),assetId='desktop-photo-'+n;
 const sha256=Buffer.from(await crypto.subtle.digest('SHA-256',buffer)).toString('hex');
 return {id:assetId,assetId,image:'data:image/jpeg;base64,'+buffer.toString('base64'),sha256,name:'Foto '+n};
}));
const desktop={record:{...original,id:'desktop-new',feeder:'TAN-01C1',pole:'10',span:'11',photos:desktopPhotos.map(({id,assetId,name})=>({id,assetId,name}))},
 baseVersion:0,operationId:'desktop-op',uploads:desktopPhotos};
assert.equal((await call('/api/control/create',desktop,inspectorCookie)).status,403);
assert.equal((await call('/api/control/create',{...desktop,record:{...desktop.record,photos:desktop.record.photos.slice(0,2)}})).status,400);
assert.equal((await call('/api/control/create',{...desktop,record:{...desktop.record,height:''}})).status,400);
const published=await call('/api/control/create',desktop);
assert.equal(published.status,200,JSON.stringify(published.data));
assert.equal(published.data.tree.inspector,'Administrador (Gestão)');
assert.equal(published.data.tree.photos.length,3);
assert.equal((await call('/api/control/create',desktop)).data.tree.sharedVersion,1);
assert.equal((await call('/api/control/create',{...desktop,operationId:'different-op'})).status,409);
assert.equal(sql.prepare('SELECT COUNT(*) n FROM shared_photos WHERE tree_id=?').get('desktop-new').n,3);
const bySpan={...desktop,operationId:'desktop-by-span',record:{...desktop.record,id:'desktop-by-span',
 formValidation:1,mt:false,bt:true,btDistance:0,pole:'',span:'BT-234',position:'Lateral',projection:'nao',
 species:'Não identificada',treeSite:'publico',poda:'nao',grouped:'nao',circ:28}};
const blockedDistance=await call('/api/control/create',{...bySpan,record:{...bySpan.record,mt:true,mtDistance:''}});
assert.equal(blockedDistance.status,400);
assert.match(blockedDistance.data.error,/Distância copa → MT/);
const missingReference=await call('/api/control/create',{...bySpan,record:{...bySpan.record,span:''}});
assert.equal(missingReference.status,400);
assert.match(missingReference.data.error,/ID do poste ou do vão/);
const bySpanResult=await call('/api/control/create',bySpan);
assert.equal(bySpanResult.status,200,JSON.stringify(bySpanResult.data));
assert.equal(bySpanResult.data.tree.span,'BT-234');
assert.equal(bySpanResult.data.tree.btDistance,'0');
const invalidate=await call('/api/control/edit',{id:'desktop-by-span',version:1,operationId:'clear-ref',values:{span:''}});
assert.equal(invalidate.status,400);assert.match(invalidate.data.error,/ID do poste ou do vão/);
const offlinePlot={...bySpan,operationId:'desktop-no-network',record:{...bySpan.record,id:'desktop-no-network',noNetwork:true,
 bt:false,span:'',btDistance:'',projection:'',position:'',grouped:'sim',circ:''}};
const noNetwork=await call('/api/control/create',offlinePlot);
assert.equal(noNetwork.status,200,JSON.stringify(noNetwork.data));
assert.equal(noNetwork.data.tree.noNetwork,true);
const both={...bySpan,operationId:'dual-net',record:{...bySpan.record,id:'dual-net',pole:'P-004',mt:true,mtDistance:1.2,
 span:'BT-234',spanNetwork:'bt',poleAudit:{pole:'P-004',expected:['mt','bt'],absent:[]}}};
let dualNet=await call('/api/control/create',both);
assert.equal(dualNet.status,400);assert.match(dualNet.data.error,/vão da rede MT/);
dualNet=await call('/api/control/create',{...both,record:{...both.record,bt:false,spanNetwork:'mt',span:'MT-101'}});
assert.equal(dualNet.status,400);assert.match(dualNet.data.error,/Poste com BT no cadastro/);
dualNet=await call('/api/control/create',{...both,record:{...both.record,bt:false,spanNetwork:'mt',span:'MT-101',
 poleAudit:{...both.record.poleAudit,absent:['bt']}}});
assert.equal(dualNet.status,200,JSON.stringify(dualNet.data));
assert.deepEqual(dualNet.data.tree.poleAudit.absent,['bt']);
const fieldBt=await call('/api/control/edit',{id:'dual-net',version:1,operationId:'mt-removed',values:{
 mt:false,bt:true,btDistance:0,span:'BT-234',spanNetwork:'bt'}});
assert.equal(fieldBt.status,200,JSON.stringify(fieldBt.data));
assert.deepEqual(fieldBt.data.tree.poleAudit.absent,['mt']);
assert.equal(fieldBt.data.tree.spanNetwork,'bt');
globalThis.fetch=nativeFetch;console.log('PASS management editing: permissions, conflicts and atomic locks, immutable history/photos, metadata and timing preserved, idempotent retry, VERA baseline and legacy Drive version checks. Isolated fixtures only.');
