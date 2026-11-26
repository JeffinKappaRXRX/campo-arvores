'use strict';
(()=>{
 const send=(type,extra={})=>parent.postMessage({source:'arbora-gestao-cadastro',type,...extra},location.origin);
 let authorized=false,publishing=false,attaching=false,archiving=false;
 const status=document.createElement('p');
 status.id='desktopPublishStatus';status.setAttribute('role','status');$('formSaveStatus').after(status);
 const retry=document.createElement('button');
 retry.type='button';retry.className='secondary';retry.textContent='Sincronizar cadastro pendente';retry.hidden=true;
 status.after(retry);
 const archiveStatus=document.createElement('p'),archiveRetry=document.createElement('button');
 archiveStatus.setAttribute('role','status');
 archiveRetry.type='button';archiveRetry.className='secondary';archiveRetry.textContent='Tentar envio de originais ao Drive';archiveRetry.hidden=true;
 retry.after(archiveStatus,archiveRetry);
 const pending=()=>records.filter(record=>record.sharedLocalVersion!==record.updatedAt);
 function publishStatus(message){status.textContent=message;send('status',{message});}
 function pendingArchives(){return records.filter(record=>record.sharedLocalVersion===record.updatedAt&&!receiptValid(record));}
 async function archive(){
  if(!authorized||archiving||!navigator.onLine||!pendingArchives().length)return;
  archiving=true;archiveRetry.hidden=true;
  archiveStatus.textContent='Enviando os arquivos originais ao Drive em segundo plano…';
  try{for(const record of pendingArchives())await syncGooglePending(record.id);}
  finally{
   archiving=false;
   const left=pendingArchives().length;
   archiveRetry.hidden=!left;
   archiveStatus.textContent=left?left+' cadastro(s) com arquivos originais pendentes no Drive. O mapa central já foi atualizado.':'Arquivos originais confirmados no Drive.';
  }
 }
 function archiveInBackground(){void archive().catch(error=>{archiveStatus.textContent=error.message;archiveRetry.hidden=false;});}
 archiveRetry.onclick=archiveInBackground;
 async function publish(){
  if(!authorized||publishing||!pending().length)return;
  if(!navigator.onLine){retry.hidden=false;publishStatus('Salvo neste PC. Aguardando conexão para publicar.');return;}
  publishing=true;retry.disabled=true;
  try{
   for(const snapshot of pending()){
    const record=await readLocalSnapshot(snapshot);
    if(!record)continue;
    if(!record.sharedOperationId){record.sharedOperationId=crypto.randomUUID();await sharedMarkOperation(record);}
    const recordBody=await sharedPayload(record);
    publishStatus('Sincronizando cadastro e fotos com a gestão…');
    const response=await fetch('/api/control/create',{method:'POST',credentials:'same-origin',cache:'no-store',
     headers:{'Content-Type':'application/json'},body:JSON.stringify(recordBody),signal:AbortSignal.timeout(90000)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||'A base central não confirmou o cadastro.');
    await sharedMarkLocal(record,result.tree,null);
    sharedTrees.set(result.tree.id,result.tree);
    renderRecords();
    send('published',{id:result.tree.id});
    publishStatus('Árvore e fotos confirmadas na base central.');
   }
  }catch(error){publishStatus(error.message+' O cadastro está salvo neste PC para tentar novamente.');}
  finally{publishing=false;retry.disabled=false;retry.hidden=!pending().length;archiveInBackground();}
 }
 sharedCycle=publish;
 retry.onclick=()=>void publish();
 window.addEventListener('online',()=>{void publish();archiveInBackground();});
 function setField(id,value){
  if(value==null)return;
  $(id).value=String(value);
  $(id).dispatchEvent(new Event('input',{bubbles:true}));
 }
 async function attach(data){
  if(attaching||formSaveBusy){send('attached',{request:data.request,error:'Aguarde a ação em andamento no formulário.'});return;}
  if(!Array.isArray(data.files)||data.files.some(file=>!(file instanceof File))||photos.length+data.files.length>12){
   send('attached',{request:data.request,error:'O cadastro aceita até 12 fotos.'});return;
  }
  if(data.files.some(file=>file.size>20*1024*1024)){send('attached',{request:data.request,error:'Use fotos de até 20 MB cada.'});return;}
  attaching=true;
  try{
   const additions=[];
   let identified=photos.filter(photo=>photo.identify).length;
   for(const file of data.files){
    const original=await dataurl(file);
    if([...photos,...additions].some(photo=>photo.original===original))continue;
    const identify=data.identify===true&&identified<5;
    if(identify)identified++;
    additions.push({id:crypto.randomUUID(),name:file.name,mime:file.type,original,receivedAt:new Date().toISOString(),identify,organ:'auto'});
   }
   if(data.point&&Number.isFinite(data.point.lat)&&Number.isFinite(data.point.lon)){
    setTreeLocation(data.point.lat,data.point.lon);
    if(fieldMap)fieldMap.setView([data.point.lat,data.point.lon],18,{animate:false});
   }
   photos.push(...additions);
   plantIdentification=null;
   renderPhotos();renderPlantResult();
   await checkpointDraft();
   send('attached',{request:data.request,count:additions.length});
   const target=data.identify?$('identifyPlant'):$('gallery');
   target.scrollIntoView({block:'center'});
   if(data.identify)target.focus({preventScroll:true});
  }catch(error){send('attached',{request:data.request,error:error.message});}
  finally{attaching=false;}
 }
 window.addEventListener('message',event=>{
  if(!authorized||event.origin!==location.origin||event.source!==parent||event.data?.source!=='arbora-gestao-fotos')return;
  const data=event.data;
  if(data.type==='attach')void attach(data);
  if(data.type==='network'&&!formSaveBusy&&!attaching){
   for(const key of ['pole','span','feeder'])setField(key,data[key]);
   if(data.spanGeometry&&typeof CampoFieldSpanQuality!=='undefined')CampoFieldSpanQuality.choose(data.spanGeometry);
   scheduleDraft();renderCompletion();
  }
 });
 async function start(){
  if(parent===window)return;
  const response=await fetch('/api/auth/status',{credentials:'same-origin',cache:'no-store'});
  const identity=await response.json();
  if(!response.ok||!identity.admin)throw Error('Entre como administrador para cadastrar pela gestão.');
  await openFieldDatabase();
  records=await loadLocalRecordIndex();
  const draft=await req('meta','readonly',store=>store.get('draft'));
  if(draft)restore(draft);
  $('inspector').value=identity.user?.name||'Administrador (Gestão)';
  $('inspector').readOnly=true;
  syncAutomatic=false;
  $('form').querySelector('button[type=submit]').textContent='Salvar e sincronizar';
  $('form').querySelectorAll('[data-after-save]').forEach(button=>button.hidden=true);
  document.documentElement.classList.remove('account-locked');
  await initGeo();
  renderPlantResult();
  void checkPlantServer();
  renderCompletion();
  const form=$('form'),submit=form.onsubmit;
  form.onsubmit=event=>{
   event.preventDefault();
   if(!authorized||attaching||publishing||pending().length){publishStatus('Aguarde ou sincronize o cadastro anterior.');return;}
   const problems=completionProblems(read()).filter(problem=>problem.field!=='photos');
   if(problems.length){publishStatus('Complete os campos obrigatórios: '+problems.map(problem=>problem.label).join(', ')+'.');return;}
   return submit(event);
  };
  authorized=true;
  retry.hidden=!pending().length;
  send('ready');
  void publish();
  archiveInBackground();
 }
 void start().catch(error=>send('status',{message:error.message}));
})();
