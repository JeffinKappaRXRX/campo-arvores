const VERA_PROGRESS_HISTORY='arbora:vera-progress:history-v1';
const VERA_PROGRESS_SGM='arbora:vera-progress:sgm-v1';
const VERA_PROGRESS_PARK='arbora:vera-progress:park-v1';
const VERA_PROGRESS_DEC='arbora:vera-progress:dec-v1';
const VERA_PROGRESS_LIMIT=8000000;
const progressTxt=(value,size)=>typeof value==='string'&&value.length<=size;
const progressDay=value=>progressTxt(value,10)&&/^20\d\d-\d\d-\d\d$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const progressFile=file=>progressTxt(file?.name,100)&&Boolean(file.name)&&
 progressTxt(file.modified,30)&&Number.isFinite(Date.parse(file.modified));
function validVeraPark(value){
 const {ids,metres,groupIds,groups,file}=value||{};
 if(value?.version!==1||!progressFile(file)||!Array.isArray(groups)||!groups.length||groups.length>10000||
  !groups.every(group=>Array.isArray(group)&&group.length===2&&progressTxt(group[0],100)&&['','1','2','3'].includes(group[1]))||
  !Array.isArray(ids)||!ids.length||ids.length>400000||!Array.isArray(metres)||!Array.isArray(groupIds)||
  ids.length!==metres.length||ids.length!==groupIds.length)return false;
 return ids.every((id,i)=>typeof id==='string'&&/^\d{1,20}$/.test(id)&&(!i||ids[i-1]<id)&&
  Number.isFinite(metres[i])&&metres[i]>0&&metres[i]<=50000&&Number.isInteger(groupIds[i])&&groupIds[i]>=0&&groupIds[i]<groups.length);
}
function validVeraOccurrences(value){
 return value?.version===1&&Array.isArray(value.files)&&value.files.length>0&&value.files.length<=100&&
  value.files.every(progressFile)&&new Set(value.files.map(file=>file.name)).size===value.files.length&&
  progressDay(value.lastDay)&&Array.isArray(value.counts)&&value.counts.length<=120000&&
  value.counts.every(row=>Array.isArray(row)&&row.length===3&&progressDay(row[0])&&row[0]<=value.lastDay&&
   progressTxt(row[1],100)&&Number.isSafeInteger(row[2])&&row[2]>0);
}
function validVeraProgress(dataset,history){
 if(dataset?.version!==1||!Array.isArray(dataset.coverage)||dataset.coverage.length>100000||
  !Array.isArray(dataset.orders)||dataset.orders.length>20000)return false;
 if(!dataset.coverage.every(row=>Array.isArray(row)&&row.length===8&&progressDay(row[0])&&
  /^\d{1,20}$/.test(row[1])&&Number.isFinite(row[2])&&row[2]>0&&row[2]<=50000&&
  row.slice(3).every(value=>progressTxt(value,100))))return false;
 if(!dataset.orders.every(order=>order&&['id','number','feeder','block','team','inspector','link'].every(k=>progressTxt(order[k],100))&&
  order.id&&['executada','pendente','cancelada'].includes(order.status)&&(!order.day||progressDay(order.day))))return false;
 if(history)return Array.isArray(dataset.trees)&&dataset.trees.length<=100000&&dataset.trees.every(row=>
  Array.isArray(row)&&row.length===5&&progressDay(row[0])&&row.slice(1,4).every(value=>progressTxt(value,100))&&Number.isSafeInteger(row[4])&&row[4]>0);
 return Array.isArray(dataset.files)&&dataset.files.length===2&&dataset.files.every(progressFile)&&
  progressTxt(dataset.catalog,100);
}
async function veraProgressWrite(request,env,dataset){
 const raw=await sharedBody(request,VERA_PROGRESS_LIMIT);
 const valid=dataset===VERA_PROGRESS_PARK?validVeraPark(raw):dataset===VERA_PROGRESS_DEC?validVeraOccurrences(raw):
  validVeraProgress(raw,dataset===VERA_PROGRESS_HISTORY);
 if(!valid)throw sharedError('Formato inválido para o avanço VERA.');
 const store=env.LOGIN_GUARD,name=dataset;
 const previous=await store.getWithMetadata(name,'text');
 const text=JSON.stringify(raw);
 if(text===previous.value)return json({unchanged:true,updatedAt:previous.metadata?.updatedAt});
 if((dataset===VERA_PROGRESS_SGM||dataset===VERA_PROGRESS_DEC)&&previous.value){
  const before=JSON.parse(previous.value);
  if(dataset===VERA_PROGRESS_DEC&&raw.lastDay<before.lastDay)throw sharedError('O DEC/FEC termina antes da última carga aceita.',409);
  for(const file of raw.files){
   const previousFile=before.files.find(old=>old.name===file.name);
   if(previousFile&&Date.parse(file.modified)<Date.parse(previousFile.modified))throw sharedError('O arquivo '+file.name+' é anterior ao último envio aceito.',409);
  }
 }
 const updatedAt=new Date().toISOString();
 await store.put(name,text,{metadata:{updatedAt}});
 if(dataset===VERA_PROGRESS_PARK)return json({updatedAt,spans:raw.ids.length});
 if(dataset===VERA_PROGRESS_DEC)return json({updatedAt,days:raw.counts.length});
 return json({updatedAt,spans:raw.coverage.length,orders:raw.orders.length});
}
async function veraProgressAPI(request,env){
 try{
  if(!isAdministrator(request,env))throw sharedError('Acompanhamento VERA restrito ao administrador.',403);
  const scope=new URL(request.url).searchParams.get('dataset');
  if(scope&&scope!=='park')throw sharedError('Base desconhecida.');
  if(request.method==='POST')return await veraProgressWrite(request,env,scope==='park'?VERA_PROGRESS_PARK:VERA_PROGRESS_HISTORY);
  if(request.method!=='GET')throw sharedError('Use GET ou POST.',405);
  const store=env.LOGIN_GUARD;
  if(scope==='park'){
   const park=await store.getWithMetadata(VERA_PROGRESS_PARK,'text');
   if(!park.value)throw sharedError('Cadastro de vãos ainda não disponível.',404);
   return new Response(park.value,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'}});
  }
  const [history,sgm,dec,park]=await Promise.all([
   store.getWithMetadata(VERA_PROGRESS_HISTORY,'json'),store.getWithMetadata(VERA_PROGRESS_SGM,'json'),
   store.getWithMetadata(VERA_PROGRESS_DEC,'json'),store.getWithMetadata(VERA_PROGRESS_PARK,'stream')
  ]);
  if(park.value)await park.value.cancel().catch(()=>{});
  return json({history:history.value,historyUpdatedAt:history.metadata?.updatedAt||null,sgm:sgm.value,sgmUpdatedAt:sgm.metadata?.updatedAt||null,
   dec:dec.value,decUpdatedAt:dec.metadata?.updatedAt||null,parkUpdatedAt:park.metadata?.updatedAt||null});
 }catch(e){return json({error:e.status?e.message:'Avanço VERA temporariamente indisponível.'},e.status||503);}
}
async function veraProgressSync(request,env){
 try{
  if(request.method!=='POST')throw sharedError('Use POST.',405);
  if(!env.VERA_PROGRESS_SYNC_TOKEN||env.VERA_PROGRESS_SYNC_TOKEN.length<32)throw sharedError('Envio SGM ainda não configurado.',503);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!await equalSecret(token,env.VERA_PROGRESS_SYNC_TOKEN))throw sharedError('Token de envio inválido.',401);
  const scope=new URL(request.url).searchParams.get('dataset');
  if(scope&&scope!=='dec-fec')throw sharedError('Base desconhecida.');
  return await veraProgressWrite(request,env,scope==='dec-fec'?VERA_PROGRESS_DEC:VERA_PROGRESS_SGM);
 }catch(e){return json({error:e.status?e.message:'Envio SGM temporariamente indisponível.'},e.status||503);}
}
