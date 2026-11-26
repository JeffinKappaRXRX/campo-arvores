'use strict';
(()=>{
 const $=id=>document.getElementById(id),root=$('gestaoFotos');
 if(!root)return;
 const allowed=()=>window.CampoControl?.authorized(),collect=$('desktopCollect'),mapButton=$('desktopPhotosOnMap');
 const list=$('desktopPhotoRows'),feedback=$('desktopPhotoStatus'),filter=$('desktopPhotoFilter');
 const pageSize=25,batchSize=48;
 const usePhotoDate=$('desktopUsePhotoDate'),datePreference='arbora-gestao-use-photo-date';
 const dateFormat=new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Rio_Branco'});
 try{usePhotoDate.checked=localStorage.getItem(datePreference)==='1';}catch{/* The setting remains usable for this session. */}
 let map,layer,worker,scan=0,scanning=false,items=[],keys=new Set(),checked=new Set(),cluster=[],photo=null,page=0,bounds=null,plotted=0,processed=0;
 let previewUrl=null,frame=null,frameReady=false,queued=null,request=0,drawJob=0;
 const readyButtons=()=>{
  $('desktopMapPick').disabled=!frameReady;
  $('desktopFitPhotos').disabled=!bounds;
  $('desktopClearPhotos').disabled=!items.length;
  $('desktopPrimaryPhoto').disabled=!$('desktopCollect').checked||!frameReady||!photo?.point||Boolean(queued);
  $('desktopIdentifyPhoto').disabled=!$('desktopCollect').checked||!frameReady||!photo||Boolean(queued);
  $('desktopAttachPhotos').disabled=!$('desktopCollect').checked||!frameReady||!checked.size||Boolean(queued);
 };
 const photoName=item=>item.file.webkitRelativePath||item.file.name;
 const msg=()=>{feedback.textContent=items.length?items.length+' foto(s) · '+plotted+' no mapa · '+(processed-plotted)+' sem GPS'+
  (scanning?' · lendo '+processed+' de '+items.length+'…':'.'):'';};
 function render(){
  $('desktopPhotoWork').hidden=!items.length;
  filter.querySelector('option[value=map]').disabled=!cluster.length;
  const visible=filter.value==='map'?cluster:filter.value==='gps'?items.filter(item=>item.point):filter.value==='missing'?items.filter(item=>item.loaded&&!item.point):items;
  const pages=Math.max(1,Math.ceil(visible.length/pageSize));page=Math.min(page,pages-1);
  list.replaceChildren();
  for(const item of visible.slice(page*pageSize,(page+1)*pageSize)){
   const row=document.createElement('div'),check=document.createElement('input'),button=document.createElement('button');
   row.className='desktop-photo-row';
   check.type='checkbox';check.checked=checked.has(item);
   check.setAttribute('aria-label','Marcar '+photoName(item)+' para o cadastro');
   check.onchange=()=>{
    if(check.checked&&checked.size>=12){check.checked=false;feedback.textContent='Marque até 12 fotos por árvore.';return;}
    if(check.checked)checked.add(item);else checked.delete(item);
    render();
   };
   button.type='button';button.textContent=photoName(item);button.title=photoName(item);
   button.setAttribute('aria-pressed',String(item===photo));button.onclick=()=>preview(item);
   row.append(check,button);list.append(row);
  }
  $('desktopPhotoPage').textContent=visible.length+' foto(s) · '+(page+1)+'/'+pages+' · '+checked.size+' marcadas';
  $('desktopPhotoPrevious').disabled=page===0;$('desktopPhotoNext').disabled=page+1>=pages;
  readyButtons();
 }
 function releasePreview(){
  if(previewUrl)URL.revokeObjectURL(previewUrl);
  previewUrl=null;$('desktopPhotoImage').removeAttribute('src');
 }
 function paintPhotoDate(){
  $('desktopPhotoCapturedAt').textContent=photo?.capturedAt?'Tirada em '+dateFormat.format(new Date(photo.capturedAt)):
   photo?.loaded?'Data de captura ausente nos metadados.':'';
 }
 function preview(item){
  photo=item;paintPhotoDate();
  $('desktopPhotoPreview').hidden=false;
  $('desktopPhotoName').textContent=photoName(item);
  $('desktopPhotoLocation').textContent=item.point?item.point.lat.toFixed(7)+', '+item.point.lon.toFixed(7):item.loaded?'Sem GPS legível. Você pode anexar a foto e marcar o ponto manualmente.':'Aguardando leitura do GPS…';
  $('desktopLocatePhoto').disabled=!item.point;
  releasePreview();
  const img=$('desktopPhotoImage'),status=$('desktopPhotoPreviewStatus');
  status.textContent='';img.hidden=false;
  img.onerror=()=>{img.hidden=true;status.textContent='Este formato não abre neste navegador. Para visualizar e cadastrar, use uma cópia JPEG e preserve o arquivo original.';};
  previewUrl=URL.createObjectURL(item.file);img.src=previewUrl;
  render();
 }
 function draw(){
  if(!map||!layer||!allowed())return;
  layer.clearLayers();
  if(!collect.checked)return;
  const area=map.getBounds().pad(.08),cells=new Map();
  for(const item of items){
   const p=item.point;
   if(!p||p.lat<area.getSouth()||p.lat>area.getNorth()||p.lon<area.getWest()||p.lon>area.getEast())continue;
   const pixel=map.latLngToContainerPoint([p.lat,p.lon]),key=Math.floor(pixel.x/42)+':'+Math.floor(pixel.y/42);
   if(!cells.has(key))cells.set(key,[]);
   cells.get(key).push(item);
  }
  for(const group of cells.values()){
   const point=group[0].point,count=group.length;
   const icon=L.divIcon({className:'desktop-photo-marker',iconSize:[28,28],iconAnchor:[14,14],html:count>1?String(count):'▣'});
   L.marker([point.lat,point.lon],{pane:'controlPhotos',icon,bubblingMouseEvents:false,title:count>1?count+' fotos':photoName(group[0])})
    .on('click',()=>{
     cluster=group;filter.querySelector('option[value=map]').disabled=false;filter.value='map';page=0;preview(group[0]);
     const summary=document.createElement('div'),name=document.createElement('strong'),img=document.createElement('img'),open=document.createElement('button');
     name.textContent=count>1?count+' fotos nesta área · '+photoName(group[0]):photoName(group[0]);
     img.className='desktop-photo-popup-image';img.alt='Prévia da foto';img.src=previewUrl;img.onerror=()=>{img.hidden=true;};
     open.type='button';open.textContent=count>1?'Ver fotos deste grupo':'Abrir foto e ações';
     open.onclick=()=>{map.closePopup();$('desktopPhotoPreview').scrollIntoView({block:'center'});};
     summary.append(name,img,open);
     L.popup({maxWidth:300}).setLatLng([point.lat,point.lon]).setContent(summary).openOn(map);
    }).addTo(layer);
  }
 }
 function scheduleDraw(){
  if(drawJob)return;
  drawJob=requestAnimationFrame(()=>{drawJob=0;draw();});
 }
 function fit(){
  if(!bounds||!map)return;
  map.invalidateSize({pan:false});
  map.fitBounds([[bounds.south,bounds.west],[bounds.north,bounds.east]],{maxZoom:18,padding:[35,45],animate:false});
  $('mapFrame').scrollIntoView({block:'center'});
 }
 function include(point){
  if(!bounds){bounds={south:point.lat,north:point.lat,west:point.lon,east:point.lon};return;}
  bounds.south=Math.min(bounds.south,point.lat);bounds.north=Math.max(bounds.north,point.lat);
  bounds.west=Math.min(bounds.west,point.lon);bounds.east=Math.max(bounds.east,point.lon);
 }
 function processNext(){
  if(processed>=items.length){
   scanning=false;msg();render();scheduleDraw();
   if(photo?.loaded){
    paintPhotoDate();
    $('desktopLocatePhoto').disabled=!photo.point;
    $('desktopPhotoLocation').textContent=photo.point?photo.point.lat.toFixed(7)+', '+photo.point.lon.toFixed(7):'Sem GPS legível. Marque o ponto manualmente no formulário.';
   }
   if(bounds)fit();
   return;
  }
  worker.postMessage({files:items.slice(processed,processed+batchSize).map(item=>item.file),start:processed,scan});
 }
 function addFiles(fileList){
  if(!allowed())return;
  let added=0;
  for(const file of fileList){
   if(!file.size||!(/^image\/(?:jpeg|png|webp|heic|heif|avif|tiff)$/i.test(file.type)||/\.(?:jpe?g|png|webp|heic|heif|avif|tiff?)$/i.test(file.name)))continue;
   const key=[file.webkitRelativePath||file.name,file.size,file.lastModified].join('\n');
   if(keys.has(key))continue;
   keys.add(key);items.push({file,point:null,loaded:false});added++;
  }
  if(!added){if(!scanning)feedback.textContent='Nenhuma foto nova em formato reconhecido.';return;}
  if(items.length===added){page=0;filter.value='all';}
  if(!worker){
   worker=new Worker('gestao-foto-worker.js');
   worker.onerror=()=>{
    worker?.terminate();worker=null;scanning=false;
    feedback.textContent='A leitura de metadados falhou. As fotos continuam na lista para prévia e cadastro.';
   };
   worker.onmessage=event=>{
    const data=event.data;
    if(!allowed()||data.scan!==scan||data.start!==processed)return;
    for(let n=0;n<data.metadata.length;n++){
     const item=items[processed++];
     const metadata=data.metadata[n];
     item.point=metadata?.point||null;item.capturedAt=metadata?.capturedAt||null;item.loaded=true;
     if(item.point){plotted++;include(item.point);}
    }
    msg();paintPhotoDate();scheduleDraw();
    // Only repaint the file list when the import advances to the next visible page.
    if(processed<=pageSize||processed%240===0){render();if(photo?.point)$('desktopLocatePhoto').disabled=false;}
    processNext();
   };
  }
  msg();render();
  if(!scanning){scanning=true;msg();processNext();}
 }
 function clear(){
  scan++;worker?.terminate();worker=null;scanning=false;items=[];keys.clear();checked.clear();photo=null;cluster=[];bounds=null;plotted=processed=page=0;
  filter.value='all';layer?.clearLayers();releasePreview();$('desktopPhotoPreview').hidden=true;
  msg();render();
 }
 function loadForm(){
  if(!allowed()||!$('desktopCollect').checked)return;
  if(!frame){
   frame=document.createElement('iframe');
   frame.title='Formulário de inspeção de árvores na gestão';
   frame.allow='camera; geolocation';
   frame.src='/gestao-cadastro.html';
   $('desktopFormHost').append(frame);
   $('desktopFormStatus').textContent='Abrindo o formulário de inspeção…';
  }
  readyButtons();
 }
 function towardForm(){if(frame)$('desktopFormPanel').scrollIntoView({block:'start'});}
 function send(data){
  if(!allowed()||!frameReady||!collect.checked)return false;
  frame.contentWindow.postMessage({source:'arbora-gestao-fotos',...data},location.origin);
  return true;
 }
 function attach(items,point=null,identify=true){
  if(!items.length||queued)return;
  const id=++request;
  if(!send({type:'attach',files:items.map(item=>item.file),point,identify,request:id}))return;
  queued={id,items};readyButtons();
  $('desktopFormStatus').textContent='Anexando '+items.length+' foto(s)…';towardForm();
 }
 function addNetworkAction(feature,detail){
  if(!allowed()||!frameReady||!$('desktopCollect').checked)return;
  const p=feature.properties||{},className=String(p._class||p._layer||'').toUpperCase(),point=feature.geometry?.type==='Point';
  const properties=new Map(Object.entries(p).map(([name,value])=>[name.normalize('NFD').replace(/[^\p{Letter}\p{Number}]/gu,'').toLowerCase(),value]));
  const value=(...names)=>names.map(name=>properties.get(name)).find(entry=>entry!=null&&String(entry).trim());
  const pole=point&&className.includes('POSTE')?value('idposte','iddoposte','id','numoperativo'):null;
  const span=!point&&/\b(?:MT|BT|AT)\b|VAOS/.test(className)?value('idvao','id','span'):null;
  if(!pole&&!span)return;
  const button=document.createElement('button');button.type='button';button.textContent=pole?'Usar ID do poste no cadastro':'Usar ID do vão no cadastro';
  button.onclick=()=>{
   const coordinates=feature.geometry?.coordinates;
   const spanGeometry=span&&feature.geometry?.type==='LineString'?{geometry:{type:'LineString',coordinates},properties:{Id:String(span)}}:null;
   if(send({type:'network',pole,span,feeder:span?value('alimentador','codigoalimentador','feeder'):null,spanGeometry})){
    $('desktopFormStatus').textContent=pole?'Poste '+pole+' enviado ao formulário.':'Vão '+span+' enviado ao formulário.';
    towardForm();
   }
  };detail.append(button);
 }
 $('desktopPhotosOnMap').onclick=()=>root.scrollIntoView({block:'start'});
 $('desktopFolder').onclick=()=>$('desktopFolderInput').click();
 $('desktopFiles').onclick=()=>$('desktopFilesInput').click();
 for(const id of ['desktopFolderInput','desktopFilesInput'])$(id).onchange=()=>{const input=$(id);addFiles(input.files);input.value='';};
 $('desktopFitPhotos').onclick=fit;$('desktopClearPhotos').onclick=clear;
 function mode(){
  root.hidden=!collect.checked;
  $('managementMapWorkspace').classList.toggle('is-collecting',collect.checked);
  window.CampoGestaoCadastroMapa?.setEnabled(collect.checked);
  requestAnimationFrame(()=>window.CampoControlMap?.resize?.());
  mapButton.hidden=!collect.checked;
  if(!collect.checked)map?.closePopup();
  loadForm();
  configurePhotoDate();syncTheme();
  readyButtons();
  scheduleDraw();
 }
 collect.onchange=()=>{mode();if(collect.checked)$('mapa').scrollIntoView({block:'start'});};
 function syncTheme(){send({type:'management-theme',dark:document.documentElement.classList.contains('dark')});}
 new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 function configurePhotoDate(){send({type:'photo-date',enabled:usePhotoDate.checked});}
 usePhotoDate.onchange=()=>{
  try{localStorage.setItem(datePreference,usePhotoDate.checked?'1':'0');}catch{/* Applies to this session. */}
  configurePhotoDate();
 };
 filter.onchange=()=>{page=0;render();};
 $('desktopPhotoPrevious').onclick=()=>{page--;render();};$('desktopPhotoNext').onclick=()=>{page++;render();};
 $('desktopLocatePhoto').onclick=()=>{if(!map||!photo?.point)return;map.setView([photo.point.lat,photo.point.lon],18);$('mapFrame').scrollIntoView({block:'center'});};
 $('desktopPrimaryPhoto').onclick=()=>{if(photo?.point)attach([photo],photo.point);};
 $('desktopIdentifyPhoto').onclick=()=>{if(photo)attach([photo]);};
 $('desktopAttachPhotos').onclick=()=>attach([...checked]);
 window.addEventListener('message',event=>{
  if(!allowed()||event.origin!==location.origin||event.source!==frame?.contentWindow||event.data?.source!=='arbora-gestao-cadastro')return;
  const data=event.data;
  if(data.type==='ready'){frameReady=true;configurePhotoDate();syncTheme();$('desktopFormStatus').textContent='';readyButtons();}
  if(data.type==='form-height'&&Number.isFinite(data.height)&&data.height>=100){
   frame.style.height=Math.min(data.height,20000)+'px';
  }
  window.CampoGestaoCadastroMapa?.fromForm(data);
  if(data.type==='status')$('desktopFormStatus').textContent=data.message;
  if(data.type==='attached'&&data.request===queued?.id){
   $('desktopFormStatus').textContent=data.error||(data.count?data.count+' foto(s) anexada(s) ao formulário.':'As fotos já estavam anexadas.');
   if(!data.error)for(const item of queued.items)checked.delete(item);
   queued=null;render();
  }
  if(data.type==='published'){
   void window.CampoControl.load();void window.CampoControlMap?.refresh?.();void window.CampoQualityAdmin?.refresh();
  }
 });
 window.addEventListener('campo-control-logout',()=>{
  clear();frame?.remove();frame=null;frameReady=false;queued=null;
  collect.checked=false;mode();
 });
 function attachMap(instance){
  if(map===instance)return;
  map=instance;window.CampoGestaoCadastroMapa?.attachMap(map);layer=L.layerGroup().addTo(map);map.on('moveend resize',scheduleDraw);scheduleDraw();
 }
 async function prepareReload(){
  if(scanning||queued||frame&&!frameReady)throw Error('Aguarde o carregamento ou anexo das fotos.');
  if(items.length&&!confirm('A lista de fotos importadas no mapa será fechada. Atualizar a gestão?'))return false;
  if(frameReady)await frame.contentWindow.CampoDesktopDraft.prepareReload();
  return true;
 }
 window.CampoGestaoFotos={attachMap,addNetworkAction,prepareReload,sendToForm:send,formReady:()=>Boolean(frameReady&&collect.checked)};
 window.CampoControlMap?.onAvailable?.(attachMap);
})();
