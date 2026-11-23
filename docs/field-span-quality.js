'use strict';
const CampoFieldSpanQuality=(()=>{
 const Q=CampoSpanQuality,notice=$('spanQualityWarning');
 let selected=null,match=null,request=null,timer,serial=0,stored=null;
 function form(){
  return {span:$('span').value,feeder:$('feeder').value,lat:$('lat').value,lon:$('lon').value};
 }
 const matches=(candidate,record)=>candidate?.id===Q.key(record.span)&&(!candidate.feeder||candidate.feeder===Q.key(record.feeder));
 const network=()=>packageReady?packageConfig:networkData;
 function current(record=form()){
  const geometry=matches(selected,record)?selected.geometry:match?.id===Q.key(record.span)&&match.network===network()?Q.select(match.candidates,record.feeder)?.geometry:null;
  const measured=Q.measure(record.lat,record.lon,geometry);
  if(measured)return Q.reference(record,measured.nearest,measured.metres>Q.threshold?geometry:null);
  // A previous check is valid only for the same point, span and feeder.
  return Q.read({...record,spanReference:stored})?stored:null;
 }
 function paint(){
  const record=form(),check=Q.read({...record,spanReference:current(record)});
  notice.textContent=Q.alert(check);
  notice.hidden=!notice.textContent;
 }
 function lookup(){
  const record=form(),id=Q.key(record.span),source=network();
  if(!id||matches(selected,record)||match?.id===id&&match.network===source||request?.id===id&&request.network===source)return;
  if(packageReady&&packageWorker){
   const requestId=++serial;
   request?.finish();
   let finish;
   const done=new Promise(resolve=>{finish=resolve;});
   request={id,network:source,requestId,done,finish};
   packageWorker.postMessage({action:'inspection-span',id,requestId});
   return;
  }
  if(!packageConfig&&networkData){
   const candidates=networkData.features.filter(f=>Q.key(featureValue(f,'span'))===id)
    .map(f=>({geometry:f.geometry,feeder:featureValue(f,'feeder')}))
    .filter(f=>['LineString','MultiLineString'].includes(f.geometry?.type));
   match={id,network:source,candidates};
   paint();
  }
 }
 function refresh(){
  paint();
  clearTimeout(timer);
  timer=setTimeout(lookup,180);
 }
 function handle(message){
  if(message.action!=='inspection-span')return false;
  if(message.requestId!==request?.requestId)return true;
  match={id:request.id,network:request.network,candidates:message.candidates};
  request.finish();
  request=null;
  paint();
  return true;
 }
 async function prepare(record){
  lookup();
  if(!current(record)&&request?.id===Q.key(record.span)){
   let timeout;
   await Promise.race([request.done,new Promise(resolve=>{timeout=setTimeout(resolve,800);})]);
   clearTimeout(timeout);
  }
  return current(record);
 }
 function choose(feature){
  selected={id:Q.key(featureValue(feature,'span')),feeder:Q.key(featureValue(feature,'feeder')),geometry:feature.geometry};
  refresh();
 }
 function restore(reference){selected=null;stored=reference||null;refresh();}
 for(const field of ['span','feeder'])$(field).addEventListener('input',refresh);
 return {current,prepare,refresh,handle,choose,restore};
})();
