'use strict';
let centralNetworkBusy=false,centralNetworkManifest=null;
function centralStatus(text){$('centralNetworkStatus').textContent=text;}
async function checkCentralNetwork(update=false){
 if(centralNetworkBusy)return;if(!navigator.onLine){centralStatus('Sem internet. A rede já preparada neste aparelho continua disponível.');return;}
 $('updateCentralNetwork').disabled=true;
 try{const r=await fetch('/api/network/manifest',{cache:'no-store'}),m=await r.json();if(!r.ok)throw Error(m.error||'Origem indisponível');centralNetworkManifest=m;
 const saved=await req('meta','readonly',s=>s.get('gpkgConfig'));
 if(saved?.centralSource?.revision===m.revision){centralStatus('Rede central atualizada · '+m.name+' · disponível offline.');return;}
 if(saved&&!saved.centralSource&&!update){centralStatus('Origem central pronta · '+(m.size/1048576).toFixed(1)+' MB. Toque em Atualizar rede do Drive para substituir somente a base da rede.');return;}
 centralNetworkBusy=true;packageReady=false;ensurePackageWorker();centralStatus('Baixando rede central · '+(m.size/1048576).toFixed(1)+' MB. Mantenha o app aberto.');packageWorker.postMessage({action:'import-remote',manifest:{...m,apiBase:window.CAMPO_CONFIG.apiBase,accessToken:localStorage.getItem('campo-team-access')||''}});
 }catch(e){centralStatus(e.message+' A base local e os cadastros foram preservados.');}
 finally{if(!centralNetworkBusy)$('updateCentralNetwork').disabled=false;}
}
function handleCentralPackageMessage(m){
 if(!centralNetworkBusy)return false;
 if(m.action==='progress'){centralStatus(m.message);return false;}
 if(m.action==='inspect'&&m.centralSource){
 const unsupported=m.layers.filter(l=>!l.profile);if(unsupported.length){centralNetworkBusy=false;$('updateCentralNetwork').disabled=false;centralStatus('Arquivo baixado. Confira as referências das camadas antes de importar.');return false;}
 const layers=m.layers.map(l=>({...l,classification:l.profile.classification,mapping:l.profile.mapping}));packageWorker.postMessage({action:'configure',layers,mapping:{}});centralStatus('Preparando índice offline das camadas…');return true;
 }
 if(m.action==='configured'){centralNetworkBusy=false;$('updateCentralNetwork').disabled=false;centralStatus('Rede central preparada · '+m.config.count.toLocaleString('pt-BR')+' feições · disponível offline.');return false;}
 if(m.action==='error'||m.action==='busy'){centralNetworkBusy=false;$('updateCentralNetwork').disabled=false;centralStatus(m.message+' A configuração anterior foi mantida.');if(m.action==='error'&&packageConfig&&typeof resumePackageAccess==='function'){packageWorker?.terminate();packageWorker=null;packageAccessState='paused';resumePackageAccess();}}
 return false;
}
$('updateCentralNetwork').onclick=()=>checkCentralNetwork(true);
window.addEventListener('online',()=>checkCentralNetwork());
window.addEventListener('DOMContentLoaded',()=>setTimeout(()=>{if(db)checkCentralNetwork();},1500));
