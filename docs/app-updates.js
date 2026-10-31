/* Updates are mandatory once fully cached; keep local work before activating/reloading. */
(function(){
 'use strict';
 if(!('serviceWorker' in navigator))return;
 let registration=null,pending=false,activating=false,reloading=false,hadController=Boolean(navigator.serviceWorker.controller),checking=false,lastCheck=0,retryTimer=null;
 const dialog=document.createElement('dialog');dialog.id='appUpdateDialog';dialog.className='app-update-dialog';dialog.setAttribute('aria-labelledby','appUpdateTitle');
 dialog.innerHTML='<h2 id="appUpdateTitle">Atualização disponível</h2><p>A nova versão está pronta. Atualize para continuar usando o aplicativo.</p><p id="appUpdateStatus" role="status">Seu formulário será preservado neste aparelho antes de recarregar.</p><button type="button" id="applyAppUpdate" class="primary">Atualizar agora</button>';
 document.body.append(dialog);const status=document.getElementById('appUpdateStatus'),button=document.getElementById('applyAppUpdate');
 dialog.addEventListener('cancel',event=>event.preventDefault());
 function busy(){return Boolean(
  typeof driveBusy!=='undefined'&&driveBusy||typeof syncBusy!=='undefined'&&syncBusy||
  typeof sharedBusy!=='undefined'&&sharedBusy||typeof zipBusy!=='undefined'&&zipBusy||
  typeof networkImportBusy!=='undefined'&&networkImportBusy||typeof centralNetworkBusy!=='undefined'&&centralNetworkBusy||
  typeof identificationBatchBusy!=='undefined'&&identificationBatchBusy||typeof plantBusy!=='undefined'&&plantBusy||
  typeof streetsBusy!=='undefined'&&streetsBusy||typeof gpsBusy!=='undefined'&&gpsBusy||
  typeof repositoryBusy!=='undefined'&&repositoryBusy||typeof sharedImportBusy!=='undefined'&&sharedImportBusy||
  document.querySelector('#form button[type="submit"]:disabled')||
  [...document.querySelectorAll('#photos,#photoFiles')].some(input=>input.files?.length)
 );}
 function anotherDialog(){return [...document.querySelectorAll('dialog[open]')].some(element=>element!==dialog);}
 function later(){clearTimeout(retryTimer);retryTimer=setTimeout(()=>{if(activating)void apply();else show();},1500);}
 function show(){
  if(!pending||reloading)return;
  if(document.hidden||anotherDialog()){later();return;}
  if(!dialog.open)dialog.showModal();
  const wait=busy();button.disabled=wait;status.textContent=wait?'Aguardando a operação em andamento terminar. Os dados continuam neste aparelho.':'Seu formulário será preservado neste aparelho antes de recarregar.';
  if(wait)later();
 }
 function available(){pending=true;show();}
 async function preserve(){
  if(typeof saveDraft!=='function'||typeof openFieldDatabase!=='function')throw Error('Armazenamento ainda não está pronto. Aguarde e tente novamente.');
  await openFieldDatabase();
  if(typeof pauseInspectionClock==='function')pauseInspectionClock();
  if(typeof draftTimer!=='undefined')clearTimeout(draftTimer);
  // Await the IndexedDB transaction, rather than a debounce or request success alone.
  await saveDraft();
 }
 async function apply(){
  if(reloading)return;
  if(busy()||anotherDialog()){activating=true;button.disabled=true;status.textContent='Aguardando a operação em andamento terminar…';later();return;}
  button.disabled=true;status.textContent='Preservando o formulário neste aparelho…';
  try{
   await preserve();
   if(busy()){activating=true;later();return;}
   if(registration?.waiting){activating=true;status.textContent='Ativando a nova versão…';registration.waiting.postMessage({type:'SKIP_WAITING'});return;}
   // Another tab may already have activated the same update.
   reloading=true;window.campoUpdateReloadSafe=true;window.location.reload();
  }catch(error){activating=false;button.disabled=false;status.textContent='Não foi possível preservar o formulário. A página não foi recarregada. '+error.message;}
 }
 button.onclick=()=>void apply();
 navigator.serviceWorker.addEventListener('controllerchange',()=>{
  if(!hadController){hadController=true;return;}
  pending=true;
  if(activating)void apply();else show();
 });
 function watchInstalling(worker){if(!worker)return;worker.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)available();});}
 async function check(){
  if(!registration||checking||!navigator.onLine||document.hidden||Date.now()-lastCheck<15000)return;
  lastCheck=Date.now();checking=true;try{await registration.update();if(registration.waiting)available();}catch{/* Remain usable with the existing offline version. */}finally{checking=false;}
 }
 navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'}).then(async value=>{
  registration=value;if(value.waiting)available();watchInstalling(value.installing);
  value.addEventListener('updatefound',()=>watchInstalling(value.installing));
  await navigator.serviceWorker.ready;document.getElementById('offline').textContent='Uso offline preparado';void check();
 }).catch(()=>{document.getElementById('offline').textContent='Cache offline indisponível neste navegador';});
 setInterval(()=>void check(),60000);
 window.addEventListener('online',()=>void check());window.addEventListener('focus',()=>void check());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){void check();if(pending)show();}});
})();
