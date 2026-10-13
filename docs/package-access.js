'use strict';
let packageAccessState='idle';
function handlePackageBusy(message){packageReady=false;packageAccessState='blocked';clearTimeout(queryTimer);if(packageWorker){packageWorker.terminate();packageWorker=null;}$('retryNetworkAccess').hidden=false;$('networkImportStatus').textContent=message;$('mapstatus').textContent=message;tell(message);}
function suspendPackageAccess(){if(!packageWorker||!packageReady||packageAccessState==='pausing')return;packageReady=false;packageAccessState='pausing';clearTimeout(queryTimer);packageWorker.postMessage({action:'pause'});}
function handlePackagePaused(){packageReady=false;packageAccessState='paused';if(document.visibilityState!=='hidden')resumePackageAccess();}
function markPackageAccessReady(){packageAccessState='ready';$('retryNetworkAccess').hidden=true;if(document.visibilityState==='hidden')suspendPackageAccess();}
async function resumePackageAccess(){
 if(document.visibilityState==='hidden'||['opening','pausing'].includes(packageAccessState))return;
 packageAccessState='opening';$('retryNetworkAccess').disabled=true;
 try{const latest=await req('meta','readonly',s=>s.get('gpkgConfig'));if(!latest){packageAccessState='idle';$('networkImportStatus').textContent='Selecione o GPKG ou ZIP para preparar a base neste aparelho.';return;}packageConfig=latest;networkMapping=latest.mapping;packageReady=false;ensurePackageWorker();$('networkImportStatus').textContent='Retomando a base local…';packageWorker.postMessage({action:'restore',config:latest});}
 catch(e){packageAccessState='blocked';$('networkImportStatus').textContent='Não foi possível retomar: '+e.message;$('retryNetworkAccess').hidden=false;}
 finally{$('retryNetworkAccess').disabled=false;}
}
$('retryNetworkAccess').onclick=resumePackageAccess;
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')suspendPackageAccess();else if(['paused','blocked'].includes(packageAccessState))resumePackageAccess();});
window.addEventListener('pagehide',()=>{if(packageWorker){packageWorker.terminate();packageWorker=null;}packageReady=false;packageAccessState='paused';});
window.addEventListener('pageshow',e=>{if(e.persisted&&packageConfig)resumePackageAccess();});
