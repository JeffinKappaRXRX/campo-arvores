'use strict';
let centralNetworkBusy=false,centralNetworkManifest=null;
function centralStatus(text){for(const id of ['centralNetworkStatus','quickCentralNetworkStatus'])if($(id))$(id).textContent=text;}
function centralButtons(busy=false){for(const id of ['updateCentralNetwork','downloadNetworkOnMap'])if($(id)){$(id).disabled=busy;$(id).textContent=busy?'Baixando / preparando rede…':packageConfig?.centralSource?'Atualizar rede do Drive':'Baixar rede do Drive';}}
function requestNetworkAccess(){centralStatus('Informe o código de acesso da equipe para baixar a rede do diretório configurado. Não é necessário entrar no Google Drive.');const panel=$('teamAccessCode')?.closest('details');if(panel){panel.open=true;panel.scrollIntoView?.({block:'center',behavior:'smooth'});$('teamAccessCode').focus();}}
async function checkCentralNetwork(update=false){
 if(centralNetworkBusy)return;if(!navigator.onLine){centralStatus('Sem internet. Conecte para baixar; a rede já preparada neste aparelho continua disponível offline.');return;}
 if(!localStorage.getItem('campo-team-access')){if(update)requestNetworkAccess();else centralStatus('Rede do diretório pronta para baixar após informar o código de acesso da equipe.');return;}
 if(!db){centralStatus('Preparando armazenamento do aparelho. Tente novamente em alguns instantes.');return;}
 centralNetworkBusy=true;centralButtons(true);centralStatus('Conectando ao diretório da rede no Drive…');let workerStarted=false;
 try{const r=await fetch('/api/network/manifest',{cache:'no-store',signal:AbortSignal.timeout(90000)}),m=await r.json();if(!r.ok){if(r.status===403){requestNetworkAccess();return;}throw Error(m.error||'Origem indisponível');}centralNetworkManifest=m;
 const saved=await req('meta','readonly',s=>s.get('gpkgConfig'));
 if(saved?.centralSource?.revision===m.revision){centralStatus('Rede do Drive atualizada · '+m.name+' · disponível offline.');return;}
 if(saved&&!saved.centralSource&&!update){centralStatus('Rede disponível no Drive · '+(m.size/1048576).toFixed(1)+' MB. Toque em Baixar rede do Drive para preparar neste aparelho.');return;}
 packageReady=false;ensurePackageWorker();centralStatus('Baixando '+m.name+' · '+(m.size/1048576).toFixed(1)+' MB. Mantenha o aplicativo aberto. A preparação offline é automática.');packageWorker.postMessage({action:'import-remote',manifest:{...m,apiBase:window.CAMPO_CONFIG.apiBase,accessToken:localStorage.getItem('campo-team-access')||''}});workerStarted=true;
 }catch(e){centralStatus((e.name==='TimeoutError'?'A conexão com o Drive demorou demais. Toque novamente para tentar.':e.message)+' A base local e os cadastros foram preservados.');}
 finally{if(!workerStarted){centralNetworkBusy=false;centralButtons();}}
}
function handleCentralPackageMessage(m){
 if(!centralNetworkBusy)return false;
 if(m.action==='progress'){centralStatus(m.message);return false;}
 if(m.action==='inspect'&&m.centralSource){
 const unsupported=m.layers.filter(l=>!l.profile);if(unsupported.length){centralNetworkBusy=false;centralButtons();centralStatus('Arquivo baixado. Em Base e tema, confira as referências das camadas para concluir a importação.');return false;}
 const layers=m.layers.map(l=>({...l,classification:l.profile.classification,mapping:l.profile.mapping}));packageWorker.postMessage({action:'configure',layers,mapping:{}});centralStatus('Preparando índice offline das camadas…');return true;
 }
 if(m.action==='configured'){centralNetworkBusy=false;centralButtons();centralStatus('Rede do Drive preparada · '+m.config.count.toLocaleString('pt-BR')+' feições · disponível offline.');return false;}
 if(m.action==='error'||m.action==='busy'){centralNetworkBusy=false;centralButtons();centralStatus(m.message+' A configuração anterior foi mantida.');if(m.action==='error'&&packageConfig&&typeof resumePackageAccess==='function'){packageWorker?.terminate();packageWorker=null;packageAccessState='paused';resumePackageAccess();}}
 return false;
}
$('updateCentralNetwork').onclick=()=>checkCentralNetwork(true);
window.addEventListener('online',()=>checkCentralNetwork());
window.addEventListener('DOMContentLoaded',()=>{const quick=document.createElement('section');quick.className='central-network';quick.innerHTML='<button type="button" id="downloadNetworkOnMap" class="primary">Baixar rede do Drive</button><p id="quickCentralNetworkStatus" class="hint" role="status">Baixe a rede do diretório configurado para usar neste aparelho, inclusive offline.</p>';if($('mapMenu'))$('mapMenu').append(quick);$('downloadNetworkOnMap').onclick=()=>checkCentralNetwork(true);centralButtons();setTimeout(()=>{if(db)checkCentralNetwork();},1500);});
