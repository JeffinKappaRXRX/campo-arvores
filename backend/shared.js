// Private shared data stays in D1. Every route runs behind the access gateway.
const sharedId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sharedError=(message,status=400)=>Object.assign(new Error(message),{status});
function sharedCoordinate(v,max){return !(typeof v==='string'&&!v.trim())&&v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=max;}
function sharedView(row){return {...JSON.parse(row.data),id:row.tree_id||row.id,sharedVersion:row.version,sharedDeleted:Boolean(row.deleted),deletionRequest:row.pending||null,sharedUpdatedAt:row.updated_at,sharedActor:row.actor};}
async function sharedBody(request,limit=6500000){try{return JSON.parse(await(await limitedBody(request,limit)).text());}catch{throw sharedError('Solicitação inválida ou acima do tamanho permitido.',413);}}
async function sharedRead(db,id){return db.prepare('SELECT * FROM shared_trees WHERE id=?').bind(id).first();}
function sharedData(raw,actor,imported=false){
 if(!raw||!sharedId(raw.id)||!sharedCoordinate(raw.lat,90)||!sharedCoordinate(raw.lon,180))throw sharedError('ID, latitude e longitude válidos são obrigatórios.');
 const allowed=['externalId','inspector','feeder','height','dap','circ','position','pole','span','os','species','note','poda','projection','grouped','mt','bt','at','mtDistance','btDistance','atDistance','area','access','team','photoReference','address'];
 const out={id:raw.id,lat:Number(raw.lat),lon:Number(raw.lon),photos:[],createdAt:Number.isFinite(Date.parse(raw.createdAt))?raw.createdAt:new Date().toISOString(),updatedAt:Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:new Date().toISOString()};
 for(const key of allowed){if(typeof raw[key]==='boolean')out[key]=raw[key];else if(raw[key]!==undefined&&raw[key]!==null)out[key]=String(raw[key]).slice(0,key==='note'?5000:1000);}
 for(const key of ['height','dap','circ','mtDistance','btDistance','atDistance'])if(out[key]!==undefined&&out[key]!==''&&(!Number.isFinite(Number(out[key]))||Number(out[key])<0))throw sharedError('Medida inválida: '+key);
 for(const key of ['mt','bt','at'])out[key]=raw[key]===true||raw[key]==='sim';
 for(const key of ['inspectionTiming','plantIdentification','heightMeasurement','measurements','origin'])if(raw[key]&&typeof raw[key]==='object'){const serialized=JSON.stringify(raw[key]);if(serialized.length>16000)throw sharedError('Metadados acima do limite: '+key);out[key]=JSON.parse(serialized);}
 out.imported=imported||raw.imported===true;out.lastInspector=actor;
 return out;
}
async function sharedPhoto(photo){
 if(!sharedId(photo.assetId)||typeof photo.image!=='string'||photo.image.length>480000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo.image))throw sharedError('Foto compartilhada inválida ou grande demais.');
 const bytes=Uint8Array.from(atob(photo.image.split(',')[1]),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(photo.sha256!==hash)throw sharedError('Conteúdo da foto não confirmado.');return photo;
}
async function sharedSave(db,body,actor,imported=false){
 const data=sharedData(body.record,actor,imported),id=data.id,expected=body.baseVersion;
 if(!Number.isSafeInteger(expected)||expected<0||!sharedId(body.operationId))throw sharedError('Versão e identificador da operação obrigatórios.');
 const old=await sharedRead(db,id);
 if(old?.deleted)throw sharedError('Árvore excluída pelo administrador. O cadastro não será recriado.',410);
 if(old?.last_op===body.operationId)return sharedView(old);
 if((old?.version||0)!==expected)throw sharedError('Outra pessoa atualizou esta árvore. Reabra a versão mais recente antes de salvar suas alterações.',409);
 const uploads=body.uploads||[];if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie no máximo 12 fotos por cadastro.');
 const photos=body.record.photos||[];if(!Array.isArray(photos)||photos.length>12)throw sharedError('Limite de 12 fotos na base compartilhada.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);uploadMap.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Referência de foto inválida.');
  if(!uploadMap.has(p.assetId)&&!await db.prepare('SELECT asset_id FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,p.assetId).first())throw sharedError('Foto ainda não recebida. Tente sincronizar novamente.');
  data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'foto.jpg').slice(0,180),receivedAt:p.receivedAt||data.updatedAt,identify:p.identify===true,organ:String(p.organ||'auto').slice(0,20)});
 }
 const stamp=new Date().toISOString(),version=expected+1;
 const statement=old?db.prepare('UPDATE shared_trees SET data=?,version=?,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0').bind(JSON.stringify(data),version,stamp,body.operationId,actor,id,expected):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)').bind(id,JSON.stringify(data),stamp,body.operationId,actor);
 const statements=[statement];for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(id,p.assetId,p.image,id,body.operationId));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado por outra pessoa. Sua cópia local foi preservada.',409);
 return {...data,id,sharedVersion:version,sharedDeleted:false,deletionRequest:old?.pending||null,sharedUpdatedAt:stamp,sharedActor:actor};
}
async function sharedAddress(db,lat,lon){
 const key=Number(lat).toFixed(4)+','+Number(lon).toFixed(4),cached=await db.prepare('SELECT address FROM shared_geocodes WHERE key=?').bind(key).first();if(cached)return {address:cached.address,source:'OpenStreetMap/Nominatim',approximate:true};
 // One outbound lookup per second across the shared database; no bulk geocoding.
 await db.prepare("INSERT OR IGNORE INTO shared_geocodes(key,address,created_at) VALUES('__rate__','',0)").run();
 const now=Date.now(),permit=await db.prepare("UPDATE shared_geocodes SET created_at=? WHERE key='__rate__' AND created_at<?").bind(now,now-1100).run();if(!permit.meta.changes)return {address:'',pending:true};
 try{const u=new URL('https://nominatim.openstreetmap.org/reverse');u.search=new URLSearchParams({format:'jsonv2',lat:String(lat),lon:String(lon),'accept-language':'pt-BR',zoom:'18'}).toString();const r=await fetch(u,{headers:{'User-Agent':'CampoVegetacao/4.0 (https://jeffinkapparxrx.github.io/campo-arvores/)'},signal:AbortSignal.timeout(8000)});if(!r.ok)return {address:'',pending:true};const value=await r.json(),address=String(value.display_name||'').slice(0,1000);if(address)await db.prepare('INSERT OR REPLACE INTO shared_geocodes(key,address,created_at) VALUES(?,?,?)').bind(key,address,now).run();return {address,pending:!address,source:'OpenStreetMap/Nominatim',approximate:true};}catch{return {address:'',pending:true};}
}
async function sharedRequestDelete(db,body){
 if(!sharedId(body.id)||!sharedId(body.treeId)||!Number.isSafeInteger(body.baseVersion))throw sharedError('Pedido inválido.');
 const existing=await db.prepare('SELECT id,tree_id,status FROM shared_deletions WHERE id=?').bind(body.id).first();if(existing){if(existing.tree_id!==body.treeId)throw sharedError('Identificador de solicitação já utilizado.',409);return {id:existing.id,status:existing.status};}
 const tree=await sharedRead(db,body.treeId);if(!tree||tree.deleted)throw sharedError('Árvore não disponível.',410);if(tree.version!==body.baseVersion)throw sharedError('A árvore mudou. Atualize o mapa antes de solicitar exclusão.',409);if(tree.pending)throw sharedError('Esta árvore já tem solicitação pendente.',409);
 const e=body.evidence,actor=String(body.actor||'').trim().slice(0,120),reason=String(body.reason||'').trim().slice(0,2000);
 if(!actor||!reason||!e||!sharedCoordinate(e.lat,90)||!sharedCoordinate(e.lon,180)||!Number.isFinite(e.accuracy)||e.accuracy<0||!Number.isFinite(Date.parse(e.capturedAt)))throw sharedError('Foto, motivo, inspetor e GPS da evidência são obrigatórios.');
 if(!Number.isFinite(Date.parse(e.gpsTimestamp))||Math.abs(Date.parse(e.capturedAt)-Date.parse(e.gpsTimestamp))>120000)throw sharedError('Capture o GPS junto com a foto.');
 await sharedPhoto({assetId:body.id,image:e.original,sha256:e.sha256});if(typeof e.annotated!=='string'||e.annotated.length>650000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(e.annotated))throw sharedError('Foto georreferenciada obrigatória.');
 const now=new Date().toISOString(),evidence={original:e.original,annotated:e.annotated,sha256:e.sha256,lat:Number(e.lat),lon:Number(e.lon),accuracy:e.accuracy,capturedAt:e.capturedAt,gpsTimestamp:e.gpsTimestamp,address:String(e.address||'').slice(0,1000),addressPending:!e.address,treeLat:JSON.parse(tree.data).lat,treeLon:JSON.parse(tree.data).lon,receivedAt:now};
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET pending=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND pending IS NULL').bind(body.id,now,body.id,actor,tree.id,body.baseVersion),
 db.prepare("INSERT INTO shared_deletions(id,tree_id,tree_version,status,reason,actor,created_at,evidence) SELECT ?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)").bind(body.id,tree.id,tree.version+1,reason,actor,now,JSON.stringify(evidence),tree.id,body.id)]);
 if(!result[0].meta.changes)throw sharedError('Árvore alterada; atualize o mapa.',409);return {id:body.id,status:'pending',tree:sharedView(await sharedRead(db,tree.id))};
}
async function sharedArchiveCleanup(db,id,env){
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(id).first();if(!row||row.status!=='approved')throw sharedError('Aprovação necessária.',409);
 if(row.archive_status==='removed')return row.archive_status;
 let status='pending';try{
  if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)throw Error('Receiver unavailable');
  const tree=await sharedRead(db,row.tree_id),version=JSON.parse(tree.data).updatedAt;
  if(!Number.isFinite(Date.parse(version)))throw Error('Archive version missing');
  // The receiver rejects a newer archived version. Never delete unreviewed work.
  const r=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin_delete',records:[{id:row.tree_id,version}],token:env.GOOGLE_SCRIPT_TOKEN}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok||!data.ok||!data.deletedIds?.includes(row.tree_id))throw Error('Deletion not confirmed');status='removed';
 }catch{status='pending';}
 await db.prepare('UPDATE shared_deletions SET archive_status=? WHERE id=?').bind(status,id).run();return status;
}
async function sharedReview(db,body,env){
 if(!sharedId(body.id)||!['approve','reject'].includes(body.decision))throw sharedError('Decisão inválida.');
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(body.id).first();if(!row)throw sharedError('Solicitação não encontrada.',404);if(row.status!=='pending')return {status:row.status,id:row.id,archiveStatus:row.archive_status};
 const tree=await sharedRead(db,row.tree_id);if(!tree||tree.pending!==row.id)throw sharedError('Pedido não corresponde ao cadastro atual.',409);
 if(body.decision==='approve'&&tree.version!==row.tree_version)throw sharedError('A árvore foi editada após a evidência. Rejeite este pedido e solicite uma nova avaliação.',409);
 const now=new Date().toISOString(),approved=body.decision==='approve',operation=crypto.randomUUID();
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET deleted=?,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND pending=?').bind(approved?1:0,now,operation,'Administrador',tree.id,tree.version,row.id),
 db.prepare('UPDATE shared_deletions SET status=?,reviewed_at=?,reviewer_note=? WHERE id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(approved?'approved':'rejected',now,String(body.note||'').slice(0,2000),row.id,tree.id,operation)]);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a análise. Atualize e revise.',409);
 const archiveStatus=approved?await sharedArchiveCleanup(db,row.id,env):'not_requested';return {id:row.id,status:approved?'approved':'rejected',tree:sharedView(await sharedRead(db,tree.id)),archiveStatus};
}
async function sharedAPI(request,env){
 if(!env.SHARED_DB)return json({error:'Base compartilhada ainda não configurada.'},503);
 if(new URL(request.url).pathname==='/api/shared/generation'&&request.method==='GET')return json({id:env.PRODUCTION_DATA_EPOCH||null});
 const db=env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB,url=new URL(request.url),path=url.pathname;
 try{
  if(request.method==='GET'&&path==='/api/shared/changes'){const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)throw sharedError('Cursor inválido.');const r=await db.prepare('SELECT * FROM shared_changes WHERE seq>? ORDER BY seq LIMIT 201').bind(after).all(),rows=r.results.slice(0,200);return json({changes:rows.map(r=>({seq:r.seq,tree:sharedView(r)})),next:rows.at(-1)?.seq||after,hasMore:r.results.length>200});}
  if(request.method==='GET'&&path==='/api/shared/photo'){const id=url.searchParams.get('id'),asset=url.searchParams.get('asset');if(!sharedId(id)||!sharedId(asset))throw sharedError('Foto inválida.');const row=await sharedRead(db,id);if(!row||row.deleted)throw sharedError('Árvore não encontrada.',404);const data=JSON.parse(row.data);if(!(data.photos||[]).some(p=>p.assetId===asset))throw sharedError('Foto não pertence a este cadastro.',404);const photo=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,asset).first();if(!photo)throw sharedError('Foto ainda não recebida.',404);return json({image:photo.image});}
  if(request.method==='GET'&&path==='/api/shared/tree'){const id=url.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const r=await sharedRead(db,id);if(!r)throw sharedError('Árvore não encontrada.',404);const out=sharedView(r);if(!r.deleted){const refs=out.photos.map(p=>p.assetId);const photos=refs.length?await db.prepare('SELECT asset_id,image FROM shared_photos WHERE tree_id=? AND asset_id IN ('+refs.map(()=>'?').join(',')+')').bind(id,...refs).all():{results:[]};const assets=new Map(photos.results.map(p=>[p.asset_id,p.image]));out.photos=out.photos.map(p=>({...p,original:assets.get(p.assetId)||'',sharedDerivative:true}));}return json({tree:out});}
  if(request.method==='POST'&&path==='/api/shared/save'){const body=await sharedBody(request);if(env.PRODUCTION_DATA_EPOCH&&Date.parse(body.record?.updatedAt)<Date.parse(env.PRODUCTION_DATA_EPOCH))throw sharedError('Cadastro de homologação encerrado. Atualize o aplicativo.',410);const actor=String(body.actor||'').trim().slice(0,120);if(!actor)throw sharedError('Informe o nome do inspetor.');return json({tree:await sharedSave(db,body,actor)});}
  if(request.method==='POST'&&path==='/api/shared/address'){const b=await sharedBody(request,1024);if(!sharedCoordinate(b.lat,90)||!sharedCoordinate(b.lon,180))throw sharedError('Coordenadas inválidas.');return json(await sharedAddress(db,b.lat,b.lon));}
  if(request.method==='POST'&&path==='/api/shared/deletion-request')return json(await sharedRequestDelete(db,await sharedBody(request,1300000)));
  if(path.startsWith('/api/shared/admin/')){if(!isAdministrator(request,env))throw sharedError('Acesso restrito ao administrador.',403);
   if(path==='/api/shared/admin/import'&&request.method==='POST'){const b=await sharedBody(request,1500000);if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>20)throw sharedError('Importe de 1 a 20 linhas por lote.');const results=[];for(const item of b.rows){try{const tree=await sharedSave(db,item,'Administrador · importação',true);results.push({id:item.record?.id,ok:true,tree});}catch(e){results.push({id:item.record?.id,ok:false,error:e.message,status:e.status||500});}}return json({results});}
   if(path==='/api/shared/admin/deletions'&&request.method==='GET'){const r=await db.prepare('SELECT id,tree_id,tree_version,status,reason,actor,created_at,reviewed_at,reviewer_note,archive_status FROM shared_deletions ORDER BY created_at DESC LIMIT 200').all();return json({requests:r.results});}
   if(path==='/api/shared/admin/evidence'&&request.method==='GET'){const r=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(url.searchParams.get('id')||'').first();if(!r)throw sharedError('Evidência não encontrada.',404);const evidence=JSON.parse(r.evidence);if(!evidence.address){const a=await sharedAddress(db,evidence.lat,evidence.lon);if(a.address){evidence.address=a.address;evidence.addressPending=false;await db.prepare('UPDATE shared_deletions SET evidence=? WHERE id=?').bind(JSON.stringify(evidence),r.id).run();}}return json({request:{...r,evidence}});}
   if(path==='/api/shared/admin/archive-cleanup'&&request.method==='POST'){const b=await sharedBody(request,1000);return json({archiveStatus:await sharedArchiveCleanup(db,b.id,env)});}
   if(path==='/api/shared/admin/review'&&request.method==='POST')return json(await sharedReview(db,await sharedBody(request,5000),env));
  }
  return json({error:'Rota compartilhada não encontrada.'},404);
 }catch(e){console.warn(JSON.stringify({event:'shared_error',path,status:e.status||503,message:e.status?e.message:'database_unavailable'}));return json({error:e.status?e.message:'Base compartilhada ocupada ou indisponível. Sua cópia continua salva no aparelho.'},e.status||503);}
}
