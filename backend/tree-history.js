// Version metadata is already immutable in shared_changes. Images are fetched only on demand.
async function historyRoot(db,id){
 if(!sharedId(id))throw sharedError('Árvore inválida.');
 for(let depth=0;depth<32;depth++){const link=await db.prepare('SELECT target_id FROM shared_merges WHERE source_id=?').bind(id).first();if(!link)return id;id=link.target_id;}
 throw sharedError('Vínculo histórico inválido.',409);
}
async function historyFamily(db,id){
 const root=await historyRoot(db,id),row=await sharedRead(db,root);
 if(row?.deleted)throw sharedError('Árvore removida da base ativa.',410);
 const links=await db.prepare('SELECT source_id FROM shared_merges WHERE target_id=? ORDER BY created_at').bind(root).all();
 return {root,ids:[root,...links.results.map(r=>r.source_id)],row};
}
function historyBaseData(t,id){
 const present=v=>v!==null&&v!==undefined&&v!=='',network=v=>present(v)&&Number(v)>=0,dap=Number(t.dap)>0?t.dap:'';
 const data={id,externalId:t.id,lat:Number(t.lat),lon:Number(t.lon),species:t.especieConf?'':t.especies||'',suggestedSpecies:t.especieConf?t.especies:'',speciesConfidence:t.especieConf||'',height:t.altura??'',dap,circ:dap?(Number(dap)*Math.PI).toFixed(1):'',pole:t.poste||'',span:t.vao||'',feeder:t.alimentador||'',note:t.observacao||'',poda:/^s/i.test(t.poda||'')?'sim':/^n/i.test(t.poda||'')?'nao':'',position:t.projecao==='SIM'?'Projeção':'',projection:t.projecao==='SIM'?'sim':t.projecao==='NÃO'?'nao':'',address:t.logradouro||'',photos:[],sourceLabel:t.fonte||'Levantamento VERA',sourceYear:t.ano||'',sourceDate:t.data||'',inspector:t.inspetor||'Levantamento original',updatedAt:null,createdAt:null,baseline:true};
 for(const k of ['mt','bt','at']){const v=t['dist'+k.toUpperCase()];data[k]=network(v);data[k+'Distance']=network(v)?v:'';}
 return data;
}
async function historyBaseline(db,id){
 const stored=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id=?').bind(id).first();if(stored)return {...stored,stored:true};
 if(!id.startsWith('vera-'))return null;
 const row=await db.prepare("SELECT t.data,t.generation FROM vera_trees t WHERE t.id=? AND t.generation=(SELECT value FROM vera_meta WHERE key='generation')").bind(id.slice(5)).first();if(!row)return null;
 const source=JSON.parse(row.data),data=historyBaseData(source,id),photo=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(source.id)).first();
 let image=null;if(photo&&photo.image.length<=480000&&VERA_IMAGE.test(photo.image)){image=photo.image;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image))),b=>b.toString(16).padStart(2,'0')).join('');data.photos=[{id:'base-photo',assetId:'base_'+hash,name:'Foto do levantamento original',phase:'before',receivedAt:null}];}
 return {tree_id:id,data:JSON.stringify(data),recorded_at:new Date().toISOString(),actor:data.sourceLabel,image,generation:row.generation,sourceData:row.data};
}
function historyBaselineStatements(db,baseline,operationId,gateId){
 if(!baseline||baseline.stored)return [];
 const gate='EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)';
 const queries=[db.prepare('INSERT OR IGNORE INTO shared_baselines(tree_id,data,recorded_at,actor) SELECT ?,?,?,? WHERE '+gate).bind(baseline.tree_id,baseline.data,baseline.recorded_at,baseline.actor,gateId,operationId)];
 if(baseline.image)queries.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(baseline.tree_id,JSON.parse(baseline.data).photos[0].assetId,baseline.image,gateId,operationId));
 return queries;
}
async function historyRecord(db,id){
 if(!sharedId(id))throw sharedError('ID inválido.');const row=await sharedRead(db,id);
 if(row){if(row.deleted)throw sharedError('Esta árvore já foi removida ou mesclada. Atualize o mapa.',409);return {row,record:sharedView(row),version:row.version};}
 const baseline=await historyBaseline(db,id);if(!baseline)throw sharedError('Sincronize esta árvore antes de mesclar.',409);
 return {row:null,baseline,record:{...JSON.parse(baseline.data),sharedVersion:0,baselineToken:baseline.generation},version:0};
}
async function historyList(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0)throw sharedError('Página inválida.');
 const marks='SELECT value FROM json_each(?)',ids=JSON.stringify(family.ids),rows=await db.prepare("SELECT 's:'||seq key,tree_id,data,version,deleted,updated_at,actor,'inspection' kind FROM shared_changes WHERE tree_id IN ("+marks+") UNION ALL SELECT 'l:'||seq,tree_id,data,NULL,0,local_version,actor,'local' FROM shared_local_history WHERE tree_id IN ("+marks+") ORDER BY updated_at DESC,key DESC LIMIT 21 OFFSET ?").bind(ids,ids,offset).all();
 const snapshots=rows.results.slice(0,20).map(r=>({key:r.key,sourceId:r.tree_id,version:r.version,at:r.updated_at,actor:r.actor,kind:r.deleted?'merged':r.kind,record:JSON.parse(r.data)}));
 if(rows.results.length<=20){const baselines=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id IN ('+marks+')').bind(ids).all();for(const b of baselines.results)snapshots.push({key:'b:'+b.tree_id,sourceId:b.tree_id,version:0,at:null,recordedAt:b.recorded_at,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});
  // Existing VERA inspections can still compare against their current imported original.
  for(const id of family.ids.filter(id=>id.startsWith('vera-')&&!baselines.results.some(b=>b.tree_id===id))){const b=await historyBaseline(db,id);if(b)snapshots.push({key:'v:'+id,sourceId:id,version:0,at:null,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});}
 }
 const current=await historyRecord(db,family.root);
 return {id:family.root,current:current.record,snapshots,nextOffset:rows.results.length>20?offset+20:null,linkedIds:family.ids};
}
async function historyPhoto(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),source=url.searchParams.get('tree'),key=url.searchParams.get('key'),asset=url.searchParams.get('asset');
 if(!family.ids.includes(source)||!sharedId(asset))throw sharedError('Foto não pertence ao histórico.',404);
 let snapshot;if(/^[sl]:\d+$/.test(key||'')){const table=key[0]==='s'?'shared_changes':'shared_local_history',row=await db.prepare('SELECT data FROM '+table+' WHERE tree_id=? AND seq=?').bind(source,Number(key.slice(2))).first();if(row)snapshot=JSON.parse(row.data);}
 else if(key==='b:'+source||key==='v:'+source){const baseline=await historyBaseline(db,source);if(baseline){snapshot=JSON.parse(baseline.data);if(baseline.image&&snapshot.photos.some(p=>p.assetId===asset))return {image:baseline.image};}}
 if(!snapshot?.photos?.some(p=>p.assetId===asset))throw sharedError('Foto não pertence a esta versão.',404);
 const row=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(source,asset).first();if(!row)throw sharedError('Foto histórica não recebida. Consulte a pasta original.',404);return {image:row.image};
}
async function historyImport(db,body,actor){
 const raw=body.record,data=sharedData(raw,actor);if(!Number.isFinite(Date.parse(raw.updatedAt)))throw sharedError('Versão local inválida.');
 const family=await historyFamily(db,data.id);if(!family.row)throw sharedError('Envie a versão atual antes do histórico local.',409);
 const previous=await db.prepare('SELECT seq FROM shared_local_history WHERE tree_id=? AND local_version=?').bind(data.id,data.updatedAt).first();
 const central=await db.prepare("SELECT seq FROM shared_changes WHERE tree_id=? AND json_extract(data,'$.updatedAt')=? LIMIT 1").bind(data.id,data.updatedAt).first();if(previous||central)return {preserved:true,alreadyStored:true};
 const uploads=body.uploads||[],photos=raw.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(photos)||photos.length>12)throw sharedError('Histórico com fotos acima do limite.');
 const map=new Map();for(const p of uploads){await sharedPhoto(p);map.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Foto histórica inválida.');const existing=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(data.id,p.assetId).first();if(!existing&&!map.has(p.assetId))throw sharedError('Foto histórica ainda não recebida.');if(existing&&map.has(p.assetId)&&existing.image!==map.get(p.assetId).image)throw sharedError('Identificador de foto já utilizado.',409);data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'Foto anterior').slice(0,180),receivedAt:p.receivedAt||null,phase:['before','after','current'].includes(p.phase)?p.phase:'current'});}
 const statements=[db.prepare('INSERT OR IGNORE INTO shared_local_history(tree_id,local_version,data,received_at,actor) VALUES(?,?,?,?,?)').bind(data.id,data.updatedAt,JSON.stringify(data),new Date().toISOString(),actor)];
 for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) VALUES(?,?,?)').bind(data.id,p.assetId,p.image));await db.batch(statements);return {preserved:true};
}
function historyCondition(part,alias){
 return part.row?{sql:'EXISTS(SELECT 1 FROM shared_trees '+alias+' WHERE '+alias+'.id=? AND '+alias+'.version=? AND '+alias+'.deleted=0 AND '+alias+'.pending IS NULL)',args:[part.record.id,part.version]}:{sql:"NOT EXISTS(SELECT 1 FROM shared_trees WHERE id=?) AND EXISTS(SELECT 1 FROM vera_trees v WHERE v.id=? AND v.generation=? AND v.data=? AND v.generation=(SELECT value FROM vera_meta WHERE key='generation'))",args:[part.record.id,part.record.id.slice(5),part.baseline.generation,part.baseline.sourceData]};
}
async function historyMerge(db,body,actor,identity){
 if(!sharedId(body.operationId)||body.confirm!==true||!sharedId(body.targetId)||!sharedId(body.sourceId)||body.targetId===body.sourceId)throw sharedError('Escolha dois cadastros distintos e confirme que são a mesma árvore.');
 const retried=await db.prepare('SELECT * FROM shared_merges WHERE operation_id=?').bind(body.operationId).first();
 if(retried){if(retried.source_id!==body.sourceId||retried.target_id!==await historyRoot(db,body.targetId))throw sharedError('Operação já usada para outra mesclagem.',409);return {tree:sharedView(await sharedRead(db,retried.target_id)),source:sharedView(await sharedRead(db,body.sourceId)),replayed:true};}
 const target=await historyRecord(db,body.targetId),source=await historyRecord(db,body.sourceId);
 for(const [part,version,token]of [[target,body.targetVersion,body.targetBaseline],[source,body.sourceVersion,body.sourceBaseline]]){if(!Number.isSafeInteger(version)||version!==part.version||!part.row&&token!==part.baseline.generation)throw sharedError('Uma árvore mudou. Reabra a comparação antes de confirmar.',409);if(part.row?.pending)throw sharedError('Resolva o pedido de exclusão antes de mesclar.',409);}
 const family=await historyFamily(db,target.record.id),other=await historyFamily(db,source.record.id);if(family.ids.length+other.ids.length>200)throw sharedError('Limite de vínculos históricos atingido. Solicite revisão administrativa.');
 const stamp=new Date().toISOString(),raw={...target.record,...body.values,id:target.record.id,lat:body.values?.lat??target.record.lat,lon:body.values?.lon??target.record.lon,updatedAt:stamp,createdAt:target.record.createdAt||stamp},data=sharedData(raw,actor);
 for(const k of ['createdBy','createdByUserId','createdByEmail','inspector'])if(target.record[k]!==undefined)data[k]=target.record[k];data.lastEditorUserId=identity?.id||null;data.lastEditorEmail=identity?.email||null;data.mergeOperation=body.operationId;if(Number(data.height)!==Number(target.record.height))data.heightMeasurement={method:'manual-merge',confirmedAt:stamp,actor};data.measurements={source:'reviewed-merge',sources:[target.record.id,source.record.id],confirmedAt:stamp};
 const uploads=body.uploads||[],refs=body.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(refs)||refs.length>12)throw sharedError('Use até 12 fotos atuais. As demais continuam no histórico.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);if(uploadMap.has(p.assetId))throw sharedError('Foto repetida.');uploadMap.set(p.assetId,p);}
 const copies=[],seen=new Set();data.photos=[];
 for(const ref of refs){if(!sharedId(ref.assetId)||!['before','after','current'].includes(ref.phase||'current'))throw sharedError('Foto inválida.');if(seen.has(ref.assetId))continue;seen.add(ref.assetId);
  let photo;if(ref.treeId){const part=[target,source].find(p=>p.record.id===ref.treeId),p=part?.record.photos?.find(p=>p.assetId===ref.assetId);if(!p)throw sharedError('Foto fora dos cadastros comparados.');photo={...p};if(ref.treeId!==target.record.id||!part.row){if(part.baseline?.image)copies.push({assetId:ref.assetId,image:part.baseline.image});else{const image=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(ref.treeId,ref.assetId).first();if(!image)throw sharedError('Foto não recebida. Sincronize antes de mesclar.');copies.push({assetId:ref.assetId,image:image.image});}}}
  else {const p=uploadMap.get(ref.assetId);if(!p)throw sharedError('Foto nova não recebida.');photo={id:ref.assetId,assetId:ref.assetId,name:String(ref.name||'Foto da atualização').slice(0,180),receivedAt:stamp};copies.push(p);}
  data.photos.push({...photo,id:ref.assetId,phase:ref.phase||'current'});
 }
 const a=historyCondition(target,'a'),b=historyCondition(source,'b'),guard=a.sql+' AND '+b.sql+' AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id IN (?,?) AND expires_at>unixepoch()*1000)',args=[...a.args,...b.args,target.record.id,source.record.id];
 const statements=[db.prepare('INSERT INTO shared_merges(source_id,target_id,operation_id,source_version,target_version,created_at,actor) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(source.record.id,target.record.id,body.operationId,source.version,target.version,stamp,actor,...args)];
 const gate='EXISTS(SELECT 1 FROM shared_merges WHERE operation_id=?)',gone={...source.record,mergedInto:target.record.id};delete gone.sharedVersion;
 for(const [part,value,deleted]of [[target,data,0],[source,gone,1]]){
  if(part.row)statements.push(db.prepare('UPDATE shared_trees SET data=?,version=version+1,deleted=?,updated_at=?,last_op=?,actor=? WHERE id=? AND '+gate).bind(JSON.stringify(value),deleted,stamp,body.operationId,actor,part.record.id,body.operationId));
  else statements.push(db.prepare('INSERT INTO shared_trees(id,data,version,deleted,updated_at,last_op,actor) SELECT ?,?,1,?,?,?,? WHERE '+gate).bind(part.record.id,JSON.stringify(value),deleted,stamp,body.operationId,actor,body.operationId));
 }
 for(const part of [target,source]){const baseline=part.baseline||await historyBaseline(db,part.record.id);statements.push(...historyBaselineStatements(db,baseline,body.operationId,target.record.id));}
 for(const p of copies)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(target.record.id,p.assetId,p.image,body.operationId));
 statements.push(db.prepare('UPDATE shared_merges SET target_id=? WHERE target_id=? AND operation_id<>? AND '+gate).bind(target.record.id,source.record.id,body.operationId,body.operationId));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a comparação. Nenhuma mesclagem foi aplicada; reabra os dados.',409);
 return {tree:sharedView(await sharedRead(db,target.record.id)),source:sharedView(await sharedRead(db,source.record.id)),preserved:true};
}
