'use strict';
// One resumable area per device. Default preparation is 30 km around the work region.
let streetAutomationReady=false,streetAutoEnabled=true,streetAutoTimer=null,streetAutoRunning=false;
let streetConnectionOnline=null,streetConnectivityBusy=false,streetConnectionTimer=null,streetModeSerial=0,streetModeQueue=Promise.resolve(),streetManualMode=false,streetHybridFailedAt=0,streetHybridErrorCount=0,streetLastGpsCheck=0;
function streetWorkCenter(){
 const lat=$('lat').value===''?NaN:Number($('lat').value),lng=$('lon').value===''?NaN:Number($('lon').value);
 if(Number.isFinite(lat)&&Number.isFinite(lng)&&Math.abs(lat)<=85&&Math.abs(lng)<=180)return {lat,lng};
 const gps=typeof liveGPSPosition==='function'?liveGPSPosition():origin;if(gps&&Number.isFinite(gps.lat)&&Number.isFinite(gps.lon)&&Math.abs(gps.lat)<=85&&Math.abs(gps.lon)<=180)return {lat:gps.lat,lng:gps.lon};
 const b=packageConfig?.bounds;if(b&&b.north-b.south<.6&&b.east-b.west<.6)return {lat:(b.north+b.south)/2,lng:(b.east+b.west)/2};
 if(b&&(b.north-b.south>=.6||b.east-b.west>=.6)&&fieldMap?.getZoom()<10)return null;
 const p=fieldMap?.getCenter();return p&&Math.abs(p.lat)<=85?{lat:p.lat,lng:((p.lng+180)%360+360)%360-180}:null;
}
function streetAreaReady(center){
 if(!center||!offlineStreets||offlineStreets.partial||offlineStreets.radius<30)return false;
 const b=offlineStreets.bounds,margin=.015;if(!b)return false;
 return streetContains({south:b.south+margin,north:b.north-margin,west:b.west+margin,east:b.east-margin},center);
}
function paintStreetPreparation(){
 const state=$('streetPreparedState');if(!state)return;
 state.textContent=streetsBusy?'Preparando…':offlineStreets?.partial?'Parcial':offlineStreets?.radius>=30?'30 km salvos':offlineStreets?offlineStreets.radius+' km salvos':'30 km automáticos';
}
function queueStreetPreparation(reason='',delay=5000){
 if(!streetAutomationReady||!streetAutoEnabled)return;
 clearTimeout(streetAutoTimer);streetAutoTimer=setTimeout(()=>void prepareAutomaticStreets().catch(error=>{$('streetStatus').textContent='Preparação aguardando nova tentativa: '+error.message;queueStreetPreparation('falha local',60000);}),delay);
}
async function prepareAutomaticStreets(){
 if(streetAutoRunning||!streetAutoEnabled||!streetAutomationReady||document.hidden||!navigator.onLine)return;
 if(!packageConfig&&!networkData?.features?.length)return;
 if(streetsBusy||streetDownloadPromise||networkImportBusy||centralNetworkBusy||document.getElementById('appUpdateDialog')?.open){queueStreetPreparation('aguardando operação',10000);return;}
 if(!streetJobPending&&streetAreaReady(streetWorkCenter()))return;
 streetAutoRunning=true;
 try{
  // A peer tab may have completed the area while this tab was waiting.
  const saved=await req('meta','readonly',s=>s.get('offlineStreets'));if(saved&&saved.savedAt!==offlineStreets?.savedAt)offlineStreets=saved;
  const job=await req('meta','readonly',s=>s.get('streetDownloadJob')),center=streetWorkCenter();
  streetJobPending=Boolean(job);paintStreetPreparation();
  if(job){
   if(job.blocked)return;
   if(job.retryAt>Date.now()){queueStreetPreparation('aguardando tentativa',job.retryAt-Date.now());return;}
   await downloadStreetArea(true,{automatic:true});return;
  }
  if(streetAreaReady(center))return;
  if(!center){$('streetStatus').textContent='Aguardando a região de trabalho: use o GPS ou aproxime o mapa. As ruas de 30 km começam a baixar automaticamente.';return;}
  $('streetRadius').value='30';await downloadStreetArea(false,{automatic:true,center,radius:30});
 }finally{streetAutoRunning=false;paintStreetPreparation();}
}
function streetWorkPositionChanged(){
 if(Date.now()-streetLastGpsCheck<60000)return;streetLastGpsCheck=Date.now();
 if(!streetAreaReady(streetWorkCenter()))queueStreetPreparation('região do GPS',10000);
}
function streetBasemapChanged(automatic){if(!automatic)streetManualMode=true;}
function applyMapConnectivity(){
 if(!streetsInitialized||!fieldMap)return Promise.resolve();
 const serial=++streetModeSerial;
 streetModeQueue=streetModeQueue.catch(()=>{}).then(async()=>{
  if(serial!==streetModeSerial)return;
  const online=streetConnectionOnline===null?navigator.onLine:streetConnectionOnline;
  if(online&&streetManualMode)return;
  const target=online?'xyz':offlineStreets?'streets':'local';
  if($('basemap').value!==target){$('basemap').value=target;await $('basemap').onchange({automatic:true});}
  else if(target==='streets')renderStreets();
 });return streetModeQueue;
}
async function setStreetConnection(online){
 const changed=streetConnectionOnline!==online;streetConnectionOnline=online;
 if(changed)streetManualMode=false;
 await applyMapConnectivity();
 if(changed&&!online)$('streetStatus').textContent=(offlineStreets?offlineStreets.partial?'Sem internet · usando as partes de ruas já salvas.':'Sem internet · ruas salvas disponíveis no mapa.':'Sem internet · ruas ainda não preparadas; rede e árvores locais permanecem disponíveis.')+' A preparação retoma automaticamente ao conectar.';
 if(online)queueStreetPreparation('conexão disponível');
}
function reportHybridTileFailure(){
 if(++streetHybridErrorCount<3||streetHybridFailedAt&&Date.now()-streetHybridFailedAt<30000)return;
 streetHybridFailedAt=Date.now();void setStreetConnection(false);
}
function reportHybridTileSuccess(){streetHybridErrorCount=0;}
async function probeHybridAccess(){
 if(!streetHybridFailedAt)return true;
 if(Date.now()-streetHybridFailedAt<60000)return false;
 const center=fieldMap.getCenter(),z=Math.min(18,Math.max(1,fieldMap.getZoom())),n=2**z,lat=Math.max(-85,Math.min(85,center.lat))*Math.PI/180;
 const x=Math.floor((center.lng+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat))/Math.PI)/2*n);
 const url=($('xyzUrl').value.trim()||DEFAULT_XYZ).replace('{z}',z).replace('{x}',x).replace('{y}',y);
 return new Promise(resolve=>{const image=new Image(),finish=ok=>{clearTimeout(timer);image.onload=image.onerror=null;if(ok)streetHybridFailedAt=0;else streetHybridFailedAt=Date.now();resolve(ok);},timer=setTimeout(()=>finish(false),8000);image.onload=()=>finish(true);image.onerror=()=>finish(false);image.src=url;});
}
async function checkStreetConnectivity(){
 if(!streetAutomationReady||document.hidden||streetConnectivityBusy)return;
 if(!navigator.onLine){await setStreetConnection(false);return;}
 streetConnectivityBusy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
 try{
  // Network-only route: a cached app shell does not prove internet access.
  const response=await fetch('/config.js?campo_connection='+Date.now(),{cache:'no-store',redirect:'error',signal:controller.signal});
  const ok=response.ok&&(await response.text()).includes('window.CAMPO_CONFIG');
  await setStreetConnection(ok&&await probeHybridAccess());
 }catch{await setStreetConnection(false);}finally{clearTimeout(timer);streetConnectivityBusy=false;}
}
async function initStreetAutomation(){
 if(streetAutomationReady)return;
 streetAutoEnabled=(await req('meta','readonly',s=>s.get('autoStreetPreparation')))!==false;
 const control=$('autoStreetPreparation');if(control){control.checked=streetAutoEnabled;control.onchange=async()=>{streetAutoEnabled=control.checked;await req('meta','readwrite',s=>s.put(streetAutoEnabled,'autoStreetPreparation'));if(streetAutoEnabled)queueStreetPreparation('ativado',0);else clearTimeout(streetAutoTimer);};}
 streetAutomationReady=true;paintStreetPreparation();fieldMap.on('moveend',()=>{if(!streetAreaReady(streetWorkCenter()))queueStreetPreparation('região no mapa',8000);});
 // Online always starts with hybrid; offline starts with saved streets, without moving the tree.
 streetManualMode=false;await setStreetConnection(navigator.onLine);void checkStreetConnectivity();queueStreetPreparation('abrir aplicativo',12000);
 streetConnectionTimer=setInterval(()=>{void checkStreetConnectivity();queueStreetPreparation('verificação',12000);},20000);
}
window.addEventListener('offline',()=>{streetHybridFailedAt=0;void setStreetConnection(false);});
window.addEventListener('online',()=>{streetHybridFailedAt=0;void checkStreetConnectivity();queueStreetPreparation('reconexão');});
window.addEventListener('focus',()=>{void checkStreetConnectivity();queueStreetPreparation('voltar ao aplicativo');});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){void checkStreetConnectivity();queueStreetPreparation('retomar aplicativo');}});
