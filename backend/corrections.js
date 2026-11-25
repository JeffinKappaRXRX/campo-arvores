const correctionName=record=>String(record.collectionInspector||record.createdBy||record.inspector||'').trim();
const correctionEligible=record=>gerencialActiveField(record)&&!(record.id.startsWith('vera-')&&(record.baseline||!record.sharedVersion));
const correctionHasCoordinates=r=>['number','string'].includes(typeof r.lat)&&['number','string'].includes(typeof r.lon)&&sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180);
const correctionIssueLabel=key=>CampoRegistrationQuality.labels[key];
const correctionStatus=new Set(['pending','completed','cancelled','unassigned']);
const correctionLimit=50;

async function correctionOperators(db){
 const {results}=await db.prepare("SELECT id,name,email FROM campo_users u WHERE role='inspector' AND blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle l WHERE l.user_id=u.id) ORDER BY name,id").all();
 return results;
}
function correctionOperatorIndex(operators){
 const ids=new Map(),names=new Map(),emails=new Map();
 for(const operator of operators){
  const name=gerencialName(operator.name);
  ids.set(operator.id,operator);
  names.set(name,names.has(name)?null:operator);
  emails.set(operator.email.toLowerCase(),operator);
 }
 return record=>{
  if(record.createdByUserId)return ids.get(record.createdByUserId);
  return emails.get(String(record.createdByEmail||'').trim().toLowerCase())||names.get(gerencialName(correctionName(record)));
 };
}
function correctionView(row){
 return {...JSON.parse(row.data),id:row.id,treeId:row.tree_id,assignee:row.assignee,status:row.status,
  dispatchedAt:row.dispatched_at,closedAt:row.closed_at,closedBy:row.closed_by};
}
async function correctionStatuses(db){
 const {results}=await db.prepare(`SELECT c.* FROM campo_tree_corrections c WHERE c.id=(
  SELECT t.id FROM campo_tree_corrections t WHERE t.tree_id=c.tree_id ORDER BY t.dispatched_at DESC,t.rowid DESC LIMIT 1
 )`).all();
 return new Map(results.map(row=>[row.tree_id,correctionView(row)]));
}
function correctionRanking(rows){
 const groups=new Map();
 for(const {record,mask} of rows){
  const inspector=correctionName(record)||'Inspetor não identificado';
  const key=record.createdByUserId||gerencialName(inspector);
  if(!groups.has(key))groups.set(key,{inspector,masks:[]});
  groups.get(key).masks.push(mask);
 }
 return [...groups.values()].map(({inspector,masks})=>({inspector,...CampoRegistrationQuality.summary(masks)}))
  .sort((a,b)=>b.rate-a.rate||b.counts.photos-a.counts.photos||a.inspector.localeCompare(b.inspector,'pt-BR'));
}
const correctionXml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
function correctionKml(rows){
 const located=rows.filter(({record})=>correctionHasCoordinates(record));
 const points=located.map(({record:r})=>{
  const attributes=[['ID',r.id],['Inspetor',correctionName(r)],['Alimentador',r.feeder],['Poste',r.pole],['Vão MT',r.span]];
  return '<Placemark><name>'+correctionXml(r.species||r.id)+'</name><ExtendedData>'+
   attributes.map(([key,value])=>'<Data name="'+key+'"><value>'+correctionXml(value)+'</value></Data>').join('')+
   '</ExtendedData><Point><coordinates>'+Number(r.lon)+','+Number(r.lat)+',0</coordinates></Point></Placemark>';
 }).join('');
 return new Response('<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>ARBORA · árvores sem fotos</name>'+points+'</Document></kml>',{
  headers:{'Content-Type':'application/vnd.google-earth.kml+xml; charset=utf-8','Content-Disposition':'attachment; filename="arbora-arvores-sem-fotos.kml"',
   'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Campo-Record-Count':String(located.length),'X-Campo-Without-Coordinates':String(rows.length-located.length)}
 });
}
function correctionItem(r,mask,task,responsible){
 return {
  id:r.id,species:r.species||'',inspector:correctionName(r),assignee:responsible(r)?.id||null,
  feeder:r.feeder||'',span:r.span||'',pole:r.pole||'',address:r.address||r.street||'',day:controlDay(r.createdAt),
  coordinates:correctionHasCoordinates(r)?[Number(r.lat),Number(r.lon)]:null,issues:CampoRegistrationQuality.issues(mask),task
 };
}
async function controlQuality(request,env,db){
 const params=new URL(request.url).searchParams,F=CampoRegistrationQuality,filters=controlFilters(params);
 const issue=params.get('issue')||'',status=params.get('returnStatus')||'',page=Number(params.get('page')||0);
 if(issue&&issue!=='any'&&!F.keys.includes(issue)||status&&!correctionStatus.has(status)||!Number.isSafeInteger(page)||page<0)throw sharedError('Filtro de qualidade inválido.');
 const [data,tasks,operators]=await Promise.all([controlUniverse(env,params.get('refresh')==='1'),correctionStatuses(db),correctionOperators(db)]);
 const responsible=correctionOperatorIndex(operators);
 const rows=data.records.filter(record=>correctionEligible(record)&&controlMatches(record,filters)).map(record=>({
  record,mask:F.mask(record),task:tasks.get(record.id)||null
 }));
 const scoped=status?rows.filter(row=>(row.task?.status||'unassigned')===status):rows;
 if(params.get('format')==='kml')return correctionKml(scoped.filter(row=>F.has(row.mask,'photos')));
 const filtered=scoped.filter(row=>issue==='any'?row.mask!==0:issue?F.has(row.mask,issue):row.mask!==0||row.task);
 const pages=Math.max(1,Math.ceil(filtered.length/correctionLimit)),current=Math.min(page,pages-1);
 return json({
  summary:F.summary(scoped.map(row=>row.mask)),ranking:correctionRanking(scoped),total:filtered.length,page:current,pages,archive:data.archive,
  dispatches:rows.reduce((counts,row)=>{if(row.task)counts[row.task.status]++;return counts;},{pending:0,completed:0,cancelled:0}),
  operators:operators.map(({id,name})=>({id,name})),
  items:filtered.slice(current*correctionLimit,(current+1)*correctionLimit).map(({record,mask,task})=>correctionItem(record,mask,task,responsible))
 });
}
async function correctionDispatch(env,db,input){
 const {ids,assignee,operationId,fallbackOnly}=input,note=String(input.note||'').trim();
 if(!Array.isArray(ids)||!ids.length||ids.length>correctionLimit||new Set(ids).size!==ids.length||ids.some(id=>!sharedId(id))||
    !sharedId(operationId)||assignee&&!sharedId(assignee)||note.length>1000)throw sharedError('Selecione até 50 árvores e uma conta ativa.');
 const [data,operators,current,existing]=await Promise.all([
  controlUniverse(env),correctionOperators(db),
  db.prepare('SELECT id,version,deleted,pending FROM shared_trees WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify(ids)).all(),
  db.prepare("SELECT id,tree_id FROM campo_tree_corrections WHERE status='pending' AND tree_id IN (SELECT value FROM json_each(?))").bind(JSON.stringify(ids)).all()
 ]);
 const active=new Map(current.results.map(row=>[row.id,row]));
 const pending=new Map(existing.results.map(row=>[row.tree_id,row.id]));
 const lookup=new Map(data.records.filter(correctionEligible).map(record=>[record.id,record]));
 const responsible=correctionOperatorIndex(operators),override=operators.find(user=>user.id===assignee);
 if(assignee&&!override)throw sharedError('O inspetor informado não está disponível.',409);
 const stamp=new Date().toISOString(),actor=env.CAMPO_USER?.name||'Administrador',statements=[],requested=new Map(),skipped=[];
 for(const id of ids){
  const taskId=await authHash(operationId+':'+id);
  if(pending.has(id)){
   if(pending.get(id)===taskId)requested.set(id,taskId);else skipped.push(id);
   continue;
  }
  const record=lookup.get(id),row=active.get(id);
  if(!record||row?.deleted||row?.pending||record.deletionRequest)throw sharedError('O cadastro '+id+' saiu da base ativa ou aguarda revisão de exclusão.',409);
  if(row&&record.sharedVersion!==row.version)throw sharedError('O cadastro '+id+' mudou. Atualize antes de despachar.',409);
  if(!correctionHasCoordinates(record))throw sharedError('Corrija as coordenadas de '+id+' antes de enviar este ponto ao campo.',409);
  const original=responsible(record);
  const operator=fallbackOnly?original||override:override||original;
  if(!operator)throw sharedError('Selecione um inspetor para '+id+'. A autoria original não tem uma conta ativa como referência.',409);
  const issues=CampoRegistrationQuality.issues(CampoRegistrationQuality.mask(record));
  if(!issues.length&&!note)throw sharedError('Informe o que deve ser conferido no cadastro '+id+'.',409);
  if(!issues.length)issues.push('field');
  const task={species:record.species||'',inspector:correctionName(record),operator:operator.name,
   lat:Number(record.lat),lon:Number(record.lon),feeder:record.feeder||'',pole:record.pole||'',span:record.span||'',
   address:record.address||record.street||'',issues,note,actor};
  // Make a Drive-only record editable in the field under its original ID.
  if(!row){
   const source={...record,photos:[]};
   for(const key of ['repositorySources','archiveVersion','adminClassification','adminLabelRevision','adminLabelUpdatedAt','sharedVersion'])delete source[key];
   source.createdBy=correctionName(record)||undefined;
   source.inspector=source.createdBy;
   source.archivedPhotoEvidence=({present:true,unknown:'unknown'})[CampoRegistrationQuality.photos(record)]||false;
   statements.push(db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)').bind(id,JSON.stringify(source),stamp,taskId,actor));
  }
  statements.push(db.prepare(`INSERT OR IGNORE INTO campo_tree_corrections(id,tree_id,assignee,base_version,data,dispatched_at)
   SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND version=? AND deleted=0 AND pending IS NULL AND (? OR last_op=?))`)
   .bind(taskId,id,operator.id,row?.version||1,JSON.stringify(task),stamp,id,row?.version||1,Number(Boolean(row)),taskId));
  requested.set(id,taskId);
 }
 if(statements.length)await db.batch(statements);
 const {results}=await db.prepare('SELECT tree_id FROM campo_tree_corrections WHERE id IN (SELECT value FROM json_each(?))').bind(JSON.stringify([...requested.values()])).all();
 const saved=new Set(results.map(row=>row.tree_id));
 if(!saved.size&&!skipped.length)throw sharedError('Os cadastros mudaram antes do despacho. Atualize a auditoria.',409);
 if(saved.size)await realtimePublish(env,'tree-corrections');
 return json({sent:saved.size,alreadyPending:skipped.length,conflicts:[...requested.keys()].filter(id=>!saved.has(id))});
}
async function correctionComplete(env,db,task,actor){
 if(task.status==='completed')return json({ok:true});
 if(task.status!=='pending')throw sharedError('Este retorno foi cancelado pela gestão.',409);
 const row=await sharedRead(db,task.tree_id),details=JSON.parse(task.data);
 if(!row||row.deleted||row.pending)throw sharedError('Cadastro indisponível. Consulte a gestão.',409);
 if(row.version<=task.base_version)throw sharedError('Salve e sincronize a correção no cadastro original antes de concluir.',409);
 const record=sharedView(row),current=CampoRegistrationQuality.mask(record);
 const remaining=details.issues.filter(key=>key==='photoReview'?CampoRegistrationQuality.photos(record)!=='present':CampoRegistrationQuality.has(current,key));
 if(remaining.length)throw sharedError('Ainda precisa corrigir: '+remaining.map(correctionIssueLabel).join(', ')+'.',409);
 const change=await db.prepare(`UPDATE campo_tree_corrections SET status='completed',closed_at=?,closed_by=?,closed_version=?
  WHERE id=? AND assignee=? AND status='pending' AND EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND version=? AND deleted=0 AND pending IS NULL)`)
  .bind(new Date().toISOString(),actor.name,row.version,task.id,actor.id,task.tree_id,row.version).run();
 if(!change.meta.changes)throw sharedError('O cadastro ou o retorno mudou. Atualize a lista.',409);
 await realtimePublish(env,'tree-corrections');
 return json({ok:true});
}
async function correctionAPI(request,env){
 try{
  const path=new URL(request.url).pathname,admin=isAdministrator(request,env),actor=env.CAMPO_USER;
  const management=path==='/api/control/corrections';
  if(management?!admin:actor?.role!=='inspector')throw sharedError('Acesso restrito.',403);
  const db=await adminDb(env);
  if(request.method==='GET'&&management){
   const id=new URL(request.url).searchParams.get('id');
   if(!sharedId(id))throw sharedError('Cadastro inválido.');
   const [data,operators,task]=await Promise.all([
    controlUniverse(env),correctionOperators(db),
    db.prepare('SELECT * FROM campo_tree_corrections WHERE tree_id=? ORDER BY dispatched_at DESC,rowid DESC LIMIT 1').bind(id).first()
   ]);
   const record=data.records.find(r=>r.id===id&&correctionEligible(r));
   if(!record)throw sharedError('Cadastro fora do escopo da auditoria de campo.',404);
   return json({item:correctionItem(record,CampoRegistrationQuality.mask(record),task?correctionView(task):null,correctionOperatorIndex(operators)),
    operators:operators.map(({id,name})=>({id,name}))});
  }
  if(request.method==='GET'&&!management&&path==='/api/corrections'){
   const {results}=await db.prepare(`SELECT c.* FROM campo_tree_corrections c JOIN shared_trees t ON t.id=c.tree_id
    WHERE c.assignee=? AND c.status='pending' AND t.deleted=0 ORDER BY c.dispatched_at DESC,c.id`).bind(actor.id).all();
   return json({items:results.map(correctionView)});
  }
  if(request.method!=='POST')throw sharedError('Método não permitido.',405);
  const input=await sharedBody(request,10000);
  if(management&&input.action==='dispatch')return await correctionDispatch(env,db,input);
  if(!sharedId(input.id))throw sharedError('Retorno inválido.');
  if(management&&input.action==='cancel'){
   const result=await db.prepare("UPDATE campo_tree_corrections SET status='cancelled',closed_at=?,closed_by=? WHERE id=? AND status='pending'")
    .bind(new Date().toISOString(),actor?.name||'Administrador',input.id).run();
   if(!result.meta.changes)throw sharedError('Retorno já concluído ou cancelado.',409);
   await realtimePublish(env,'tree-corrections');
   return json({ok:true});
  }
  if(!management&&path==='/api/corrections/complete'){
   const task=await db.prepare('SELECT * FROM campo_tree_corrections WHERE id=? AND assignee=?').bind(input.id,actor.id).first();
   if(!task)throw sharedError('Retorno não atribuído à sua conta.',404);
   return await correctionComplete(env,db,task,actor);
  }
  throw sharedError('Ação de correção inválida.');
 }catch(error){
  return json({error:error.status?error.message:'Retornos de campo temporariamente indisponíveis.'},error.status||503);
 }
}
