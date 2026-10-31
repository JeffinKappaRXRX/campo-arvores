'use strict';
let offlineStreets=null,streetsLayer=null,streetsTimer=null,streetsInitialized=false,streetsBusy=false,streetDownloadPromise=null,streetJobPending=false;
function streetBounds(center,radius){const dy=radius/111.32,dx=radius/(111.32*Math.max(.1,Math.cos(center.lat*Math.PI/180)));return {south:Math.max(-85,center.lat-dy),north:Math.min(85,center.lat+dy),west:Math.max(-180,center.lng-dx),east:Math.min(180,center.lng+dx)};}
function streetsFromOSM(data,allowEmpty=false){
 if(data.remark)throw Object.assign(Error('O serviço devolveu uma consulta incompleta. Aguardando para retomar.'),{retryable:true});
 const features=[];for(const e of data.elements||[]){
 if(e.type==='way'&&e.tags?.highway&&e.geometry?.length>=2){const c=e.geometry.map(p=>[p.lon,p.lat]);if(c.every(p=>p.every(Number.isFinite)))features.push({type:'Feature',id:e.type+'/'+e.id,geometry:{type:'LineString',coordinates:c},properties:{name:e.tags.name||e.tags.ref||'',highway:e.tags.highway}});}
 else if(e.type==='node'&&e.tags?.place&&Number.isFinite(e.lon)&&Number.isFinite(e.lat))features.push({type:'Feature',id:e.type+'/'+e.id,geometry:{type:'Point',coordinates:[e.lon,e.lat]},properties:{name:e.tags.name||'',place:e.tags.place}});
 }if(!features.length&&!allowEmpty)throw Error('Nenhuma rua encontrada nessa área. Confira a região no mapa.');if(features.length>50000)throw Error('Área muito densa. Escolha um raio menor.');return {type:'FeatureCollection',features};
}
function streetContains(bounds,point){return Boolean(bounds&&point&&point.lat>=bounds.south&&point.lat<=bounds.north&&point.lng>=bounds.west&&point.lng<=bounds.east);}
function streetCoverage(){if(!offlineStreets||!fieldMap)return false;const c=fieldMap.getCenter();return offlineStreets.partial?(offlineStreets.partBounds||[]).some(b=>streetContains(b,c)):streetContains(offlineStreets.bounds,c);}
function streetPartial(job){if(!job?.features?.length||!job.next)return null;return {collection:{type:'FeatureCollection',features:job.features},bounds:job.bounds,center:job.center,radius:job.radius,partial:true,completed:job.next,total:job.parts.length,partBounds:job.parts.slice(0,job.next).map(p=>streetBounds(p.center,p.radius)),savedAt:job.savedAt||new Date().toISOString()};}
function renderStreets(){
 if(!fieldMap)return;if(streetsLayer){fieldMap.removeLayer(streetsLayer);streetsLayer=null;}
 if($('basemap').value!=='streets')return;
 if(!offlineStreets){$('mapstatus').textContent='Sem ruas salvas. Baixe a área com internet; rede e árvores locais continuam disponíveis.';return;}
 const b=fieldMap.getBounds();let shown=0;const visible=offlineStreets.collection.features.filter(f=>{const c=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.coordinates;return c.some(p=>b.contains([p[1],p[0]]))||f.geometry.type==='LineString'&&L.latLngBounds(c.map(p=>[p[1],p[0]])).intersects(b);});
 streetsLayer=L.geoJSON(visible.slice(0,3000),{pane:'offlineStreets',interactive:false,style:f=>({color:['motorway','trunk','primary'].includes(f.properties.highway)?'#c68c42':'#8599a3',weight:['footway','path','track'].includes(f.properties.highway)?2:4,opacity:.85}),pointToLayer:(f,p)=>L.circleMarker(p,{pane:'offlineStreets',interactive:false,radius:2,weight:0,fillOpacity:0}),onEachFeature:(f,l)=>{if(f.properties.name){l.bindTooltip(esc(f.properties.name),{permanent:fieldMap.getZoom()>=15&&shown++<150||Boolean(f.properties.place),direction:'center',className:'street-label',interactive:false});}}}).addTo(fieldMap);
 const covered=streetCoverage();$('mapstatus').textContent=(covered?(offlineStreets.partial?'Ruas offline · download parcial':'Ruas offline · área salva'):'Fora da área salva · retorne à área ou baixe outra região')+' · © OpenStreetMap contributors'+(visible.length>3000?' · aproxime para detalhar':'');
}
async function initOfflineStreets(){
 offlineStreets=await req('meta','readonly',s=>s.get('offlineStreets'))||null;const interrupted=await req('meta','readonly',s=>s.get('streetDownloadJob'));streetJobPending=Boolean(interrupted);if(!offlineStreets)offlineStreets=streetPartial(interrupted);$('resumeStreets').hidden=!interrupted;
 fieldMap.createPane('offlineStreets');fieldMap.getPane('offlineStreets').style.zIndex=210;fieldMap.getPane('offlineStreets').style.pointerEvents='none';
 fieldMap.attributionControl.addAttribution('Ruas: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>');
 fieldMap.on('moveend zoomend',()=>{clearTimeout(streetsTimer);streetsTimer=setTimeout(renderStreets,100);});
 if(offlineStreets)$('streetStatus').textContent=(offlineStreets.partial?'Download parcial · '+offlineStreets.completed+'/'+offlineStreets.total+' partes · ':'')+offlineStreets.collection.features.length+' vias/localidades salvas · '+new Date(offlineStreets.savedAt).toLocaleString('pt-BR')+' · raio '+offlineStreets.radius+' km. Novo download substitui essa área.';
 streetsInitialized=true;if(typeof initStreetAutomation==='function')await initStreetAutomation();
}
const existingBasemapChange=$('basemap').onchange;
$('basemap').onchange=async(options={})=>{if($('basemap').value!=='google'&&!$('googleMap').hidden&&googleMap){const c=googleMap.getCenter();fieldMap.setView([c.lat(),c.lng()],googleMap.getZoom(),{animate:false});}if(db&&streetsInitialized&&!options.automatic)await req('meta','readwrite',s=>s.put($('basemap').value,'preferredBasemap'));if($('basemap').value==='streets'){
 if(xyzLayer){fieldMap.removeLayer(xyzLayer);xyzLayer=null;}$('map').hidden=false;$('googleMap').hidden=true;fieldMap.invalidateSize();renderStreets();requestNetworkView();
 }else{if(streetsLayer){fieldMap.removeLayer(streetsLayer);streetsLayer=null;}await existingBasemapChange();}syncFullMapTools();if(typeof streetBasemapChanged==='function')streetBasemapChanged(options.automatic===true);};
$('fitStreets').onclick=()=>{if(!offlineStreets){$('streetStatus').textContent='Baixe uma área primeiro.';return;}const b=offlineStreets.bounds;$('basemap').value='streets';$('basemap').onchange();fieldMap.fitBounds([[b.south,b.west],[b.north,b.east]]);};
function streetParts(center,radius){
 const n=Math.ceil(radius/10);if(n===1)return [{center,radius}];const b=streetBounds(center,radius),parts=[];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)parts.push({center:{lat:b.south+(y+.5)*(b.north-b.south)/n,lng:b.west+(x+.5)*(b.east-b.west)/n},radius:11});return parts.sort((a,b)=>(a.center.lat-center.lat)**2+(a.center.lng-center.lng)**2-(b.center.lat-center.lat)**2-(b.center.lng-center.lng)**2);
}
async function fetchStreetPart(part){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{const bounds=streetBounds(part.center,part.radius),box=[bounds.south,bounds.west,bounds.north,bounds.east].join(','),query='[out:json][timeout:25][maxsize:134217728];(way["highway"]('+box+');node["place"]('+box+'););out geom;';
 let response;try{response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:controller.signal});}catch(e){if(controller.signal.aborted)throw e;}
 if(!response?.ok)response=await fetch('/api/streets/area',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:part.center.lat,lon:part.center.lng,radius:part.radius}),signal:controller.signal});
 if(!response.ok){let data;try{data=await response.json();}catch{}const error=Error(data?.error||'Serviço de ruas indisponível.');error.status=response.status;error.retryable=[408,429,500,502,503,504].includes(response.status);const after=Number(response.headers.get('Retry-After'));error.retryAfter=Number.isFinite(after)?Math.min(60000,after*1000):0;throw error;}
 const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024){await reader.cancel();throw Error('Uma parte excedeu 16 MB. Escolha um raio menor.');}chunks.push(value);}
 return streetsFromOSM(JSON.parse(await new Blob(chunks).text()),true);
 }finally{clearTimeout(timer);}
}
function streetWait(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function fetchStreetPartWithRetry(part,progress){
 for(let attempt=0;;attempt++){
  if(!navigator.onLine)throw Object.assign(Error('Sem conexão. O download será retomado quando a internet voltar.'),{retryable:true});
  try{return await fetchStreetPart(part);}catch(error){
   const retryable=error.retryable===true||['AbortError','TimeoutError','TypeError'].includes(error.name);
   error.retryable=retryable;
   if(!retryable||attempt>=3)throw error;
   const delay=Math.max(error.retryAfter||0,Math.min(30000,2000*2**attempt))+Math.round(Math.random()*1000);
   $('streetStatus').textContent=progress+' · serviço ocupado ou conexão instável; nova tentativa automática em '+Math.ceil(delay/1000)+' s.';
   await streetWait(delay);
  }
 }
}
async function runStreetDownload(resume=false,options={}){
 const button=$('downloadStreets');streetsBusy=true;button.disabled=true;$('resumeStreets').disabled=true;let job=null;
 try{
  job=resume?await req('meta','readonly',s=>s.get('streetDownloadJob')):null;
  if(!job){const p=options.center||fieldMap.getCenter(),center={lat:p.lat,lng:p.lng},radius=options.radius||Number($('streetRadius').value);if(![1,2,5,10,20,30].includes(radius))throw Error('Escolha um raio disponível, até 30 km.');job={center,radius,bounds:streetBounds(center,radius),parts:streetParts(center,radius),next:0,features:[],automatic:options.automatic===true,startedAt:new Date().toISOString()};await req('meta','readwrite',s=>s.put(job,'streetDownloadJob'));}
  streetJobPending=true;const merged=new Map(job.features.map(f=>[f.id,f]));
  for(let i=job.next;i<job.parts.length;i++){
   if(document.hidden||document.getElementById('appUpdateDialog')?.open)throw Object.assign(Error('Preparação pausada; será retomada com o app aberto.'),{retryable:true,paused:true});
   const progress='Preparando ruas · '+job.radius+' km · parte '+(i+1)+'/'+job.parts.length+' · '+merged.size+' vias/localidades';
   $('streetStatus').textContent=progress+'. Pode continuar usando o app.';
   const collection=await fetchStreetPartWithRetry(job.parts[i],progress);for(const f of collection.features)merged.set(f.id,f);
   if(merged.size>150000)throw Error('Área excede 150 mil vias/localidades. Escolha um raio menor.');
   job.features=Array.from(merged.values());job.next=i+1;job.savedAt=new Date().toISOString();delete job.retryAt;delete job.lastError;await req('meta','readwrite',s=>s.put(job,'streetDownloadJob'));
   if(!offlineStreets||offlineStreets.partial){offlineStreets=streetPartial(job);if($('basemap').value==='streets')renderStreets();}
   if(typeof paintStreetPreparation==='function')paintStreetPreparation();
  }
  if(!merged.size)throw Error('Nenhuma rua encontrada nessa área. Confira a posição no mapa.');
  const collection={type:'FeatureCollection',features:Array.from(merged.values())},saved={collection,bounds:job.bounds,center:job.center,radius:job.radius,savedAt:new Date().toISOString()};
  // Commit the completed replacement and remove its checkpoint in the same transaction.
  await req('meta','readwrite',s=>{s.put(saved,'offlineStreets');return s.delete('streetDownloadJob');});offlineStreets=saved;streetJobPending=false;
  $('resumeStreets').hidden=true;$('streetStatus').textContent=collection.features.length+' vias/localidades salvas · '+job.radius+' km · disponíveis offline. Não é necessário baixar novamente ao abrir.';
  if(typeof applyMapConnectivity==='function')await applyMapConnectivity();else if($('basemap').value==='streets')renderStreets();
  await storage();return {ok:true};
 }catch(error){
  const retryable=error.retryable===true||['AbortError','TimeoutError','TypeError'].includes(error.name);
  if(job){streetJobPending=true;job.failures=(job.failures||0)+1;job.retryAt=Date.now()+(error.paused?10000:Math.min(300000,15000*2**Math.min(job.failures-1,5)));job.blocked=!retryable;job.lastError=error.message;try{await req('meta','readwrite',s=>s.put(job,'streetDownloadJob'));}catch{}if(!offlineStreets)offlineStreets=streetPartial(job);}
  $('streetStatus').textContent=(retryable?'Preparação pendente: ':'Não foi possível concluir: ')+(error.name==='AbortError'?'tempo de resposta excedido.':error.message)+' '+(offlineStreets?.partial?'As partes concluídas já podem ser usadas.':'A área anterior foi preservada.')+(retryable?' O app tentará retomar automaticamente.':' Escolha uma área menor ou use Retomar.');$('resumeStreets').hidden=!job;
  return {ok:false,retryable,retryAt:job?.retryAt||Date.now()+15000};
 }finally{streetsBusy=false;button.disabled=false;$('resumeStreets').disabled=false;if(typeof paintStreetPreparation==='function')paintStreetPreparation();}
}
function downloadStreetArea(resume=false,options={}){
 if(streetDownloadPromise)return streetDownloadPromise;
 if(!navigator.onLine){$('streetStatus').textContent='Sem internet. Ruas já salvas continuam disponíveis; a preparação retoma ao conectar.';return Promise.resolve({ok:false,retryable:true});}
 const start=async()=>{if(options.automatic&&typeof streetAreaReady==='function'){const latest=await req('meta','readonly',s=>s.get('offlineStreets')),job=await req('meta','readonly',s=>s.get('streetDownloadJob'));if(latest)offlineStreets=latest;if(!job&&streetAreaReady(options.center||streetWorkCenter())){streetJobPending=false;return {ok:true,existing:true};}}return runStreetDownload(resume,options);};
 streetDownloadPromise=(async()=>{
  if(navigator.locks)return navigator.locks.request('campo-street-download',{ifAvailable:true},lock=>{
   if(lock)return start();$('streetStatus').textContent='Outra aba está preparando as ruas. Aguardando para retomar automaticamente.';return {ok:false,retryable:true,busy:true};
  });return start();
 })().finally(()=>{streetDownloadPromise=null;if(typeof queueStreetPreparation==='function')queueStreetPreparation('download finalizado',15000);});return streetDownloadPromise;
}
$('downloadStreets').onclick=()=>downloadStreetArea(false);
$('resumeStreets').onclick=()=>downloadStreetArea(true);
