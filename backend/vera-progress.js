const VERA_PROGRESS_HISTORY='arbora:vera-progress:history-v1';
const VERA_PROGRESS_SGM='arbora:vera-progress:sgm-v1';
const VERA_PROGRESS_LIMIT=8000000;
const progressTxt=(value,size)=>typeof value==='string'&&value.length<=size;
const progressDay=value=>progressTxt(value,10)&&/^20\d\d-\d\d-\d\d$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
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
 return Array.isArray(dataset.files)&&dataset.files.length===2&&dataset.files.every(file=>
  progressTxt(file?.name,100)&&progressTxt(file?.modified,30)&&Number.isFinite(Date.parse(file.modified)))&&
  progressTxt(dataset.catalog,100);
}
async function veraProgressWrite(request,env,history){
 const raw=await sharedBody(request,VERA_PROGRESS_LIMIT);
 if(!validVeraProgress(raw,history))throw sharedError('Formato inválido para o avanço VERA.');
 const store=env.LOGIN_GUARD,name=history?VERA_PROGRESS_HISTORY:VERA_PROGRESS_SGM;
 const previous=await store.getWithMetadata(name,'text');
 const text=JSON.stringify(raw);
 if(text===previous.value)return json({unchanged:true,updatedAt:previous.metadata?.updatedAt});
 if(!history&&previous.value){
  const before=JSON.parse(previous.value);
  for(const file of raw.files){
   const previousFile=before.files.find(old=>old.name===file.name);
   if(previousFile&&Date.parse(file.modified)<Date.parse(previousFile.modified))throw sharedError('O arquivo '+file.name+' é anterior ao último envio aceito.',409);
  }
 }
 const updatedAt=new Date().toISOString();
 await store.put(name,text,{metadata:{updatedAt}});
 return json({updatedAt,spans:raw.coverage.length,orders:raw.orders.length});
}
async function veraProgressAPI(request,env){
 try{
  if(!isAdministrator(request,env))throw sharedError('Acompanhamento VERA restrito ao administrador.',403);
  if(request.method==='POST')return await veraProgressWrite(request,env,true);
  if(request.method!=='GET')throw sharedError('Use GET ou POST.',405);
  const [history,sgm]=await Promise.all([env.LOGIN_GUARD.getWithMetadata(VERA_PROGRESS_HISTORY,'json'),env.LOGIN_GUARD.getWithMetadata(VERA_PROGRESS_SGM,'json')]);
  return json({history:history.value,historyUpdatedAt:history.metadata?.updatedAt||null,sgm:sgm.value,sgmUpdatedAt:sgm.metadata?.updatedAt||null});
 }catch(e){return json({error:e.status?e.message:'Avanço VERA temporariamente indisponível.'},e.status||503);}
}
async function veraProgressSync(request,env){
 try{
  if(request.method!=='POST')throw sharedError('Use POST.',405);
  if(!env.VERA_PROGRESS_SYNC_TOKEN||env.VERA_PROGRESS_SYNC_TOKEN.length<32)throw sharedError('Envio SGM ainda não configurado.',503);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!await equalSecret(token,env.VERA_PROGRESS_SYNC_TOKEN))throw sharedError('Token de envio inválido.',401);
  return await veraProgressWrite(request,env,false);
 }catch(e){return json({error:e.status?e.message:'Envio SGM temporariamente indisponível.'},e.status||503);}
}
