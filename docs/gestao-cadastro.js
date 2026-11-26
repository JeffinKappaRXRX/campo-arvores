'use strict';
(()=>{
 const send=(type,extra={})=>parent.postMessage({source:'arbora-gestao-cadastro',type,...extra},location.origin);
 let authorized=false,publishing=false,attaching=false,archiving=false,usePhotoDate=false;
 const dateFormat=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Rio_Branco'});
 const dateCache=new WeakMap(),dateHint=document.createElement('p');
 dateHint.className='hint';dateHint.setAttribute('role','status');$('photoMinimum').after(dateHint);
 function capturePhoto(){
  for(const photo of photos){
   if(!dateCache.has(photo))dateCache.set(photo,CampoExifGps.readMetadata(photo.original)?.capturedAt||null);
   const date=dateCache.get(photo);
   if(date&&Date.parse(date)<=Date.now()+300000)return {date,name:photo.name};
  }
  return null;
 }
 function showMappingDate(){
  dateHint.hidden=!usePhotoDate||Boolean(editing);
  if(dateHint.hidden)return;
  const selected=capturePhoto();
  dateHint.textContent=selected?'Data do mapeamento: '+dateFormat.format(new Date(selected.date))+' · '+selected.name:
   'Anexe uma foto com data de captura válida. Para registrar com a data de hoje, desative a opção na Gestão.';
 }
 const coordinates=$('desktopCoordinatesStatus');
 coordinates.after($('gpsStatus'));
 const locationHead=$('gps').parentElement;
 locationHead.classList.add('desktop-location');
 const locationActions=document.createElement('div');locationActions.className='desktop-location-actions';
 const pick=document.createElement('button');pick.type='button';pick.className='secondary';pick.textContent='Marcar no mapa';
 locationActions.append(pick,$('gps'));locationHead.append(locationActions);
 pick.onclick=()=>send('pick-position');
 $('gps').textContent='Usar GPS do aparelho';
 $('gps').onclick=async()=>{const previous=origin;await refreshGPS(true);if(origin&&origin!==previous)send('focus-position',{point:origin});};
 updateMapPosition=function(){
  const lat=$('lat').valueAsNumber,lon=$('lon').valueAsNumber;
  const valid=Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180;
  send('draft-position',{point:valid?{lat,lon}:null});
 };
 let reopenMeasurement=false;
 $('distanceMapShortcut').onclick=()=>{
  reopenMeasurement=Boolean(stream);
  $('measurement').close();stopCamera();send('measure-on-map');
 };
 function returnMeasurement(data){
  if(Number.isFinite(data.metres)&&data.metres>0){
   $('distance').value=data.metres.toFixed(2);
   $('distance').dispatchEvent(new Event('input',{bubbles:true}));
   distanceMeasurement={method:'map_ruler',horizontalDistance:data.metres,points:data.points,measuredAt:new Date().toISOString(),validated:false};
   $('distanceMethod').textContent='Distância horizontal estimada no mapa entre A e B.';calc();
  }
  if(!$('measurement').open)$('measurement').showModal();
  if(reopenMeasurement)void $('startcamera').onclick();
  reopenMeasurement=false;
 }
 const renderExistingPhotos=renderPhotos;
 renderPhotos=function(...args){renderExistingPhotos(...args);showMappingDate();};
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
    send('focus-position',{point:data.point});
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
  if(data.type==='photo-date'){usePhotoDate=data.enabled===true;showMappingDate();}
  if(data.type==='management-theme')document.documentElement.dataset.theme=data.dark?'dark':'light';
  if(data.type==='map-position'&&!formSaveBusy&&!attaching){
   const {lat,lon}=data.point||{};
   if(Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180){
    setTreeLocation(lat,lon);coordinates.textContent='Coordenadas atualizadas pelo mapa.';
   }
  }
  if(data.type==='map-distance')returnMeasurement(data);
  if(data.type==='map-feedback')coordinates.textContent=data.message;
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
  // Spatial selection is handled by the parent management map.
  renderPlantResult();
  void checkPlantServer();
  renderCompletion();
  const form=$('form'),submit=form.onsubmit;
  form.onsubmit=event=>{
   event.preventDefault();
   if(!authorized||attaching||publishing||pending().length){publishStatus('Aguarde ou sincronize o cadastro anterior.');return;}
   const problems=completionProblems(read()).filter(problem=>problem.field!=='photos');
   if(problems.length){publishStatus('Complete os campos obrigatórios: '+problems.map(problem=>problem.label).join(', ')+'.');return;}
   if(!editing){
    const selected=usePhotoDate?capturePhoto():null;
    if(usePhotoDate&&!selected){publishStatus('A data da foto está ausente ou inválida. Anexe uma foto com data válida ou desative a opção na Gestão.');return;}
    if(selected)sharedContext.createdAt=selected.date;
    else delete sharedContext.createdAt;
   }
   return submit(event);
  };
  authorized=true;
  retry.hidden=!pending().length;
  window.CampoDesktopDraft={async prepareReload(){
   if(formSaveBusy||attaching||publishing||archiving||plantBusy||document.querySelector('dialog[open]'))throw Error('Conclua a operação no formulário de cadastro.');
   clearTimeout(draftTimer);
   await checkpointDraft();
  }};
  send('ready');
  drawPin();
  const main=document.querySelector('main');
  function fitFrame(){send('form-height',{height:Math.ceil(main.getBoundingClientRect().height)+8});}
  if(typeof ResizeObserver==='function')new ResizeObserver(fitFrame).observe(main);
  window.addEventListener('resize',fitFrame);fitFrame();
  function fitDialog(){
   if(!document.querySelector('dialog[open]')||!window.frameElement)return;
   const rect=window.frameElement.getBoundingClientRect(),height=parent.innerHeight;
   const top=Math.max(0,-rect.top),visible=Math.max(0,Math.min(rect.height-top,height-Math.max(0,rect.top)));
   document.documentElement.style.setProperty('--desktop-dialog-top',(top+12)+'px');
   document.documentElement.style.setProperty('--desktop-dialog-height',Math.max(220,visible-24)+'px');
  }
  const dialogObserver=new MutationObserver(()=>{
   if(!document.querySelector('dialog[open]'))return;
   window.frameElement?.scrollIntoView({block:'start',behavior:'instant'});
   fitDialog();
  });
  for(const dialog of document.querySelectorAll('dialog'))dialogObserver.observe(dialog,{attributes:true,attributeFilter:['open']});
  parent.addEventListener('scroll',fitDialog,{capture:true,passive:true});
  parent.addEventListener('resize',fitDialog);
  window.addEventListener('pagehide',()=>{parent.removeEventListener('scroll',fitDialog,true);parent.removeEventListener('resize',fitDialog);});
  void publish();
  archiveInBackground();
 }
 void start().catch(error=>send('status',{message:error.message}));
})();
