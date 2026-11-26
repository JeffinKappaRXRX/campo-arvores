// Administrative corrections reuse the central row and its immutable history.
const controlEditFields=['lat','lon','species','height','dap','circ','mt','bt','at','mtDistance','btDistance','atDistance','pole','span','spanNetwork','feeder','poda','projection','position','grouped','treeSite','noNetwork','os','address','note','area','access','team','municipality','perimeter','key','street'];
async function controlEditSnapshot(db,env,id){
 if(!sharedId(id))throw sharedError('ID inválido.');
 const row=await sharedRead(db,id);
 if(row||id.startsWith('vera-'))return historyRecord(db,id);
 // Legacy records are checked against Drive again before their first central edit.
 const inventory=await adminArchiveInventory(env),record=inventory.archive.find(r=>r.id===id);
 if(!record||inventory.deleted.has(id)||inventory.pending.some(r=>r.id===id))throw sharedError('Cadastro não está mais disponível para edição.',409);
 const token=await authHash(JSON.stringify(record));
 return {row:null,record,version:0,archive:true,baseline:{tree_id:id,data:JSON.stringify(record),recorded_at:new Date().toISOString(),actor:record.inspector||'Inventário Drive',generation:token}};
}
async function controlEditAPI(request,env,db,prepared=null){
 const id=new URL(request.url).searchParams.get('id');
 if(request.method==='GET'){
  const part=await controlEditSnapshot(db,env,id);
  if(part.row?.pending||await adminRecordLocked(db,id))throw sharedError('Há uma revisão de exclusão em andamento. Resolva antes de editar.',409);
  return json({record:part.record,version:part.version,baselineToken:part.baseline?.generation||null});
 }
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 const body=await sharedBody(request),actor=env.CAMPO_USER?.name||'Administrador';
 if(!sharedId(body.id)||!sharedId(body.operationId)||!Number.isSafeInteger(body.version)||body.version<0||!body.values||Array.isArray(body.values)||typeof body.values!=='object'||Object.keys(body.values).some(k=>!controlEditFields.includes(k)||!['string','number','boolean'].includes(typeof body.values[k])))throw sharedError('Edição inválida. Reabra o cadastro.');
 const existing=await sharedRead(db,body.id);
 if(existing?.last_op===body.operationId&&!existing.deleted)return json({tree:sharedView(existing),replayed:true});
 const part=prepared||await controlEditSnapshot(db,env,body.id);
 if(part.version!==body.version||!part.row&&part.baseline.generation!==body.baselineToken||part.row?.pending)throw sharedError('Cadastro alterado. Suas alterações foram mantidas na tela; reabra a versão atual antes de salvar.',409);
 const stamp=new Date().toISOString(),checked=sharedData({...part.record,...body.values,id:body.id},actor),data={...part.record};
 for(const k of Object.keys(body.values))data[k]=checked[k];
 const audit=CampoInspectionRules.poleAudit(data);
 if(audit){
  audit.absent=audit.expected.filter(key=>Object.hasOwn(body.values,key)?!data[key]:audit.absent.includes(key));
  data.poleAudit=audit;
 }else delete data.poleAudit;
 if(Object.hasOwn(body.values,'span')&&!Object.hasOwn(body.values,'spanNetwork'))delete data.spanNetwork;
 for(const k of ['sharedVersion','sharedDeleted','sharedUpdatedAt','sharedActor','deletionRequest','baselineToken','baseline'])delete data[k];
 data.updatedAt=stamp;data.lastInspector=actor;data.lastEditorUserId=env.CAMPO_USER?.id||null;data.lastEditorEmail=env.CAMPO_USER?.email||null;data.managementEdit={at:stamp,actor,fields:Object.keys(body.values)};
 if(Object.hasOwn(body.values,'height')&&Number(data.height)!==Number(part.record.height))data.heightMeasurement={method:'manual-management',confirmedAt:stamp,actor};
 // Original creation date, inspector, timing, measurements and other metadata stay intact.
 data.photos=[...(part.record.photos||[])];
 const uploads=body.uploads||[];
 if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie até 12 fotos.');
 const copies=[],seen=new Set(data.photos.map(p=>p.assetId));
 for(const p of uploads){
  await sharedPhoto(p);
  if(seen.has(p.assetId))continue;
  const old=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(body.id,p.assetId).first();
  if(old&&old.image!==p.image)throw sharedError('Identificador de foto já utilizado.',409);
  seen.add(p.assetId);copies.push(p);data.photos.push({id:p.assetId,assetId:p.assetId,name:String(p.name||'Foto anexada no PC').slice(0,180),receivedAt:stamp,phase:'current'});
 }
 if(data.photos.length>12&&data.photos.length>(part.record.photos||[]).length)throw sharedError('Limite de 12 fotos atuais por cadastro. As fotos existentes foram preservadas.');
 const errors=record=>CampoInspectionRules.formMissing({
  ...record,photos:[{original:'edição-administrativa'}]
 });
 const existingIssues=new Set(errors(part.record).map(issue=>issue.field+':'+issue.label));
 const introduced=errors(data).filter(issue=>!existingIssues.has(issue.field+':'+issue.label));
 if(introduced.length)throw sharedError('Complete: '+introduced.map(issue=>issue.label).join(', ')+'.');
 const condition=part.archive?{sql:'NOT EXISTS(SELECT 1 FROM shared_trees WHERE id=?)',args:[body.id]}:historyCondition(part,'editing');
 const guard=condition.sql+' AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=? AND expires_at>unixepoch()*1000)',args=[...condition.args,body.id];
 const first=part.row?db.prepare('UPDATE shared_trees SET data=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND '+guard).bind(JSON.stringify(data),stamp,body.operationId,actor,body.id,...args):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) SELECT ?,?,1,?,?,? WHERE '+guard).bind(body.id,JSON.stringify(data),stamp,body.operationId,actor,...args);
 const statements=[first,...historyBaselineStatements(db,part.baseline,body.operationId,body.id)];
 for(const p of copies)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(body.id,p.assetId,p.image,body.id,body.operationId));
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a edição. Nenhuma alteração foi aplicada; reabra a versão atual.',409);
 await realtimePublish(env,'management-edit');
 return json({tree:sharedView(await sharedRead(db,body.id)),preserved:true});
}

async function controlCreateAPI(request,env,db){
 if(request.method!=='POST')throw sharedError('Use POST.',405);
 const body=await sharedBody(request),record=body?.record;
 if(body?.baseVersion!==0||!sharedId(record?.id)||record.id.startsWith('vera-'))throw sharedError('Envie um novo cadastro de árvore.');
 if(!Array.isArray(record.photos)||record.photos.length>12||new Set(record.photos.map(photo=>photo?.assetId).filter(sharedId)).size<3)
  throw sharedError('Anexe pelo menos três fotos diferentes.');
 const actor=env.CAMPO_USER?.name||'Administrador (Gestão)';
 const old=await sharedRead(db,record.id);
 if(old&&old.last_op!==body.operationId)throw sharedError('Este ID já pertence a uma árvore.',409);
 const checked=sharedData({...record,inspector:actor},actor);
 const missing=CampoInspectionRules.savedMissing({...checked,photos:[{original:'validar-no-envio'}]});
 if(missing.length)throw sharedError('Complete: '+missing.map(field=>field.label).join(', ')+'.');
 const tree=await sharedSave(db,{...body,record:{...record,inspector:actor,imported:false}},actor,false,env.CAMPO_USER);
 await realtimePublish(env,'management-create');
 return json({tree});
}
