// Admin-only review of active inspections, Drive records and the current VERA inventory.
const suggestionPageSize=50,suggestionBatchSize=5;
const suggestionYes=record=>!record.archiveCleanupPending&&!record.deletionRequest&&record.adminClassification!=='homologacao';
function suggestionDate(record){
 const raw=String(record.sourceDate||'').trim(),br=raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
 return controlDay(record.createdAt)||(br?br[3]+'-'+br[2]+'-'+br[1]:controlDay(raw));
}
const suggestionCoord=record=>correctionHasCoordinates(record)&&(Number(record.lat)!==0||Number(record.lon)!==0);
const suggestionKind=record=>record.id.startsWith('vera-')?'vera':'campo';
const suggestionVersion=record=>Number(record.sharedVersion)||0;
const suggestionFields=['dap','circ','treeSite','area','species','grouped','btDistance','mtDistance','atDistance','bt','mt','at','noNetwork'];
function suggestionToken(record,generation=''){
 return JSON.stringify([generation,...suggestionFields.map(key=>String(record[key]??'')),record.updatedAt||'',...['bt','mt','at'].map(network=>CampoSuggestionRules.networkDistance(record,network))]);
}
async function suggestionVera(db,ids=null){
 if(ids&&!ids.length)return {records:[],available:true};
 try{
  const where="WHERE generation=(SELECT value FROM vera_meta WHERE key='generation')";
  const query=db.prepare('SELECT id,data,generation FROM vera_trees '+where+(ids?' AND id IN (SELECT value FROM json_each(?))':''));
  const [rows,photos]=await Promise.all([(ids?query.bind(JSON.stringify(ids)):query).all(),db.prepare('SELECT id FROM vera_thumbs').all()]);
  const present=new Set(photos.results.map(row=>row.id));
  return {available:true,records:rows.results.filter(row=>sharedId('vera-'+row.id)).map(row=>{
   const data=historyBaseData(JSON.parse(row.data),'vera-'+row.id);
   return {...data,suggestionGeneration:row.generation,archivedPhotoEvidence:present.has(veraPhotoId(row.id))};
  })};
 }catch(error){if(veraMissingTable(error)||/no such table.*vera_thumbs/i.test(error.message))return {available:false,records:[]};throw error;}
}
async function suggestionUniverse(env,db,ids=null){
 const [data,vera]=await Promise.all([controlUniverse(env),suggestionVera(db,ids?.filter(id=>id.startsWith('vera-')).map(id=>id.slice(5)))]);
 const seen=new Set([...(data.deletedIds||[]),...data.records.map(record=>record.id)]);
 return {...data,veraAvailable:vera.available,records:[...data.records,...vera.records.filter(record=>!seen.has(record.id))]};
}
function suggestionDuplicates(records){
 const groups=new Map(),dupes=new Set(),normalize=CampoSuggestionRules.normalize;
 for(const record of records){
  const species=normalize(record.species);
  if(!suggestionCoord(record)||!species||CampoInspectionRules.unknownSpecies(record))continue;
  const key=[Number(record.lat).toFixed(5),Number(record.lon).toFixed(5),normalize(record.feeder),species].join('|');
  const first=groups.get(key);
  if(first){dupes.add(first);dupes.add(record.id);}else groups.set(key,record.id);
 }
 return dupes;
}
function suggestionPhotoPaths(record){
 const paths=controlPhotos(record).filter(photo=>sharedId(photo.assetId)).slice(0,3).map(photo=>
  '/api/shared/photo?id='+encodeURIComponent(record.id)+'&asset='+encodeURIComponent(photo.assetId));
 if(record.suggestionGeneration&&record.archivedPhotoEvidence&&sharedId(record.externalId))
  paths.push('/api/vera/photo?id='+encodeURIComponent(record.externalId));
 return paths;
}
async function suggestionList(request,env,db){
 const p=new URL(request.url).searchParams,filters=controlFilters(p),S=CampoSuggestionRules,issue=p.getAll('issue'),status=p.get('status')||'any',source=p.get('source')||'',from=p.get('from')||'',to=p.get('to')||'',page=Number(p.get('page')||0);
 if(!['any','review','apply','clean','photos','returned','distances'].includes(status)||!['','vera','campo'].includes(source)||
  issue.some(key=>!Object.hasOwn(S.labels,key))||[from,to].some(day=>day&&!/^\d{4}-\d{2}-\d{2}$/.test(day))||
  (from&&to&&from>to)||!Number.isSafeInteger(page)||page<0)throw sharedError('Filtro de sugestões inválido.');
 const [data,tasks,operators]=await Promise.all([suggestionUniverse(env,db),correctionStatuses(db),correctionOperators(db)]);
 const responsible=correctionOperatorIndex(operators),records=data.records.filter(suggestionYes);
 const duplicates=suggestionDuplicates(records);
 const counts={review:0,apply:0,clean:0,photos:0,returned:0,distances:0};
 const names=new Set(),feeders=new Set(),result=[];
 for(const record of records){
  const name=controlInspector(record),day=suggestionDate(record),origin=suggestionKind(record);
  if(name)names.add(name);
  if(record.feeder)feeders.add(record.feeder);
  if((source&&origin!==source)||(from&&day<from)||(to&&(!day||day>to))||!controlMatches(record,filters))continue;
  const detected=S.inspect(record,duplicates.has(record.id));
  const issues=status==='distances'?detected.filter(a=>a.distance):detected;
  const photos=suggestionPhotoPaths(record),coordinates=suggestionCoord(record)?[Number(record.lat),Number(record.lon)]:null;
  const task=tasks.get(record.id),pending=task?.status==='pending',editable=Boolean(coordinates&&!pending);
  const scopes={review:issues.some(a=>!a.change),apply:editable&&issues.some(a=>a.change),clean:!issues.length,photos:photos.length>0,returned:pending,distances:issues.some(a=>a.distance)};
  if(issue.length&&!issues.some(a=>issue.includes(a.key)))continue;
  for(const key of Object.keys(counts))if(scopes[key])counts[key]++;
  if(status!=='any'&&!scopes[status])continue;
  const base={id:record.id,version:suggestionVersion(record),token:suggestionToken(record,record.suggestionGeneration),assignee:responsible(record)?.id||null,
   canDispatch:Boolean(coordinates&&!pending),editable,canApply:scopes.apply,distanceAdjustable:editable&&issues.some(issue=>issue.distance&&issue.change),hasPhoto:scopes.photos,hasIssues:Boolean(issues.length),species:record.species||''};
  result.push({base,record,day,origin,issues,photos,coordinates,task});
 }
 const total=result.length,pages=Math.max(1,Math.ceil(total/suggestionPageSize)),current=Math.min(pages-1,page);
 const response={total,pages,page:current,counts,archive:data.archive.available,vera:data.veraAvailable};
 if(p.get('format')==='selection')return json({...response,items:result.map(a=>({...a.base,photos:a.photos,flags:a.issues.map(issue=>issue.key)}))});
 const items=result.slice(current*suggestionPageSize,(current+1)*suggestionPageSize).map(({base,record,day,origin,issues,photos,coordinates,task})=>({
  ...base,origin,day,issues,photos,coordinates,task:task?{status:task.status,operator:task.operator}:null,
  inspector:controlInspector(record),feeder:record.feeder||'',pole:record.pole||'',span:record.span||'',dap:record.dap??'',circ:record.circ??'',treeSite:record.treeSite||''
 }));
 return json({...response,items,operators:operators.map(({id,name})=>({id,name})),options:{inspectors:[...names].sort(),feeders:[...feeders].sort()}});
}
async function suggestionApply(request,env,db){
 const {items,distancesOnly=false}=await sharedBody(request,48000);
 if(typeof distancesOnly!=='boolean'||!Array.isArray(items)||!items.length||items.length>suggestionBatchSize||new Set(items.map(item=>item?.id)).size!==items.length||
  items.some(item=>!sharedId(item?.id)||!sharedId(item.operationId)||!Number.isSafeInteger(item.version)||item.version<0||
   typeof item.token!=='string'||item.token.length>6500||item.species!==undefined&&(typeof item.species!=='string'||!item.species.trim()||item.species.length>160)))
  throw sharedError('Envie até cinco sugestões válidas por lote.');
 const results=[];
 for(const item of items){
  try{
   const current=await sharedRead(db,item.id);
   if(current?.last_op===item.operationId&&!current.deleted){results.push({id:item.id,status:'applied'});continue;}
   const blocked=await db.prepare("SELECT 1 AS locked FROM campo_record_labels WHERE tree_id=? AND classification='homologacao' UNION ALL SELECT 1 FROM campo_tree_corrections WHERE tree_id=? AND status='pending' LIMIT 1").bind(item.id,item.id).first();
   if(blocked)throw sharedError('Cadastro em homologação ou já despachado ao campo.',409);
   const part=await controlEditSnapshot(db,env,item.id),record=part.record;
   const generation=part.baseline&&!part.archive?part.baseline.generation:'';
   if(part.version!==item.version||suggestionToken(record,generation)!==item.token)
    throw sharedError('O cadastro ou a evidência de origem mudou. Atualize e confira a sugestão.',409);
   const issues=CampoSuggestionRules.inspect(record);
   const values=CampoSuggestionRules.patch(distancesOnly?issues.filter(issue=>issue.distance):issues);
   if(!distancesOnly&&item.species!==undefined)values.species=item.species.trim();
   if(!Object.keys(values).length){results.push({id:item.id,status:'unchanged'});continue;}
   // The regular administrative editor still verifies version, preserves photos and writes the history.
   const body={id:item.id,operationId:item.operationId,version:part.version,baselineToken:part.baseline?.generation||null,values};
   const edit=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
   await controlEditAPI(edit,env,db,part);
   results.push({id:item.id,status:'applied'});
  }catch(error){results.push({id:item.id,status:'failed',message:error.status?error.message:'Não foi possível aplicar o ajuste. Tente novamente.'});}
 }
 return json({results});
}
async function controlSuggestions(request,env,db){
 if(request.method==='GET')return suggestionList(request,env,db);
 if(request.method==='POST')return suggestionApply(request,env,db);
 throw sharedError('Use GET ou POST.',405);
}
