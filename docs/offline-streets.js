'use strict';
let offlineStreets=null,streetsLayer=null,streetsTimer=null,streetsInitialized=false,streetsBusy=false;
function streetBounds(center,radius){const dy=radius/111.32,dx=radius/(111.32*Math.max(.1,Math.cos(center.lat*Math.PI/180)));return {south:Math.max(-85,center.lat-dy),north:Math.min(85,center.lat+dy),west:Math.max(-180,center.lng-dx),east:Math.min(180,center.lng+dx)};}
function streetsFromOSM(data,allowEmpty=false){
 if(data.remark)throw Error('Consulta incompleta. Reduza a área e tente novamente.');
 const features=[];for(const e of data.elements||[]){
 if(e.type==='way'&&e.tags?.highway&&e.geometry?.length>=2){const c=e.geometry.map(p=>[p.lon,p.lat]);if(c.every(p=>p.every(Number.isFinite)))features.push({type:'Feature',id:e.type+'/'+e.id,geometry:{type:'LineString',coordinates:c},properties:{name:e.tags.name||e.tags.ref||'',highway:e.tags.highway}});}
 else if(e.type==='node'&&e.tags?.place&&Number.isFinite(e.lon)&&Number.isFinite(e.lat))features.push({type:'Feature',id:e.type+'/'+e.id,geometry:{type:'Point',coordinates:[e.lon,e.lat]},properties:{name:e.tags.name||'',place:e.tags.place}});
 }if(!features.length&&!allowEmpty)throw Error('Nenhuma rua encontrada nessa área. Confira a região no mapa.');if(features.length>50000)throw Error('Área muito densa. Escolha um raio menor.');return {type:'FeatureCollection',features};
}
function streetCoverage(){if(!offlineStreets||!fieldMap)return false;const c=fieldMap.getCenter(),b=offlineStreets.bounds;return c.lat>=b.south&&c.lat<=b.north&&c.lng>=b.west&&c.lng<=b.east;}
function renderStreets(){
 if(!fieldMap)return;if(streetsLayer){fieldMap.removeLayer(streetsLayer);streetsLayer=null;}
 if($('basemap').value!=='streets')return;
 if(!offlineStreets){$('mapstatus').textContent='Sem ruas salvas. Baixe a área com internet; rede e árvores locais continuam disponíveis.';return;}
 const b=fieldMap.getBounds();let shown=0;const visible=offlineStreets.collection.features.filter(f=>{const c=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.coordinates;return c.some(p=>b.contains([p[1],p[0]]))||f.geometry.type==='LineString'&&L.latLngBounds(c.map(p=>[p[1],p[0]])).intersects(b);});
 streetsLayer=L.geoJSON(visible.slice(0,3000),{pane:'offlineStreets',style:f=>({color:['motorway','trunk','primary'].includes(f.properties.highway)?'#c68c42':'#8599a3',weight:['footway','path','track'].includes(f.properties.highway)?2:4,opacity:.85}),pointToLayer:(f,p)=>L.circleMarker(p,{radius:2,weight:0,fillOpacity:0}),onEachFeature:(f,l)=>{if(f.properties.name){l.bindTooltip(esc(f.properties.name),{permanent:fieldMap.getZoom()>=15&&shown++<150||Boolean(f.properties.place),direction:'center',className:'street-label',interactive:false});}}}).addTo(fieldMap);
 const covered=streetCoverage();$('mapstatus').textContent=(covered?'Ruas offline · área salva':'Fora da área salva · retorne à área ou baixe outra região')+' · © OpenStreetMap contributors'+(visible.length>3000?' · aproxime para detalhar':'');
}
async function initOfflineStreets(){
 offlineStreets=await req('meta','readonly',s=>s.get('offlineStreets'))||null;const interrupted=await req('meta','readonly',s=>s.get('streetDownloadJob'));$('resumeStreets').hidden=!interrupted;
 fieldMap.createPane('offlineStreets');fieldMap.getPane('offlineStreets').style.zIndex=210;
 fieldMap.attributionControl.addAttribution('Ruas: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>');
 fieldMap.on('moveend zoomend',()=>{clearTimeout(streetsTimer);streetsTimer=setTimeout(renderStreets,100);});
 if(offlineStreets)$('streetStatus').textContent=offlineStreets.collection.features.length+' vias/localidades salvas · '+new Date(offlineStreets.savedAt).toLocaleString('pt-BR')+' · raio '+offlineStreets.radius+' km. Novo download substitui essa área.';
 const preferred=await req('meta','readonly',s=>s.get('preferredBasemap'));streetsInitialized=true;if(offlineStreets&&!navigator.onLine){const b=offlineStreets.bounds;if(!$('lat').value&&!origin)fieldMap.fitBounds([[b.south,b.west],[b.north,b.east]]);$('basemap').value='streets';await $('basemap').onchange();}
}
const existingBasemapChange=$('basemap').onchange;
$('basemap').onchange=async()=>{if(db&&streetsInitialized)await req('meta','readwrite',s=>s.put($('basemap').value,'preferredBasemap'));if($('basemap').value==='streets'){
 if(xyzLayer){fieldMap.removeLayer(xyzLayer);xyzLayer=null;}$('map').hidden=false;$('googleMap').hidden=true;fieldMap.invalidateSize();renderStreets();requestNetworkView();
 }else{if(streetsLayer){fieldMap.removeLayer(streetsLayer);streetsLayer=null;}await existingBasemapChange();}syncFullMapTools();};
window.addEventListener('offline',()=>{if(offlineStreets){$('basemap').value='streets';$('basemap').onchange();tell('Sem internet: ruas da área salva, rede e árvores continuam no mapa.');}});
$('fitStreets').onclick=()=>{if(!offlineStreets){$('streetStatus').textContent='Baixe uma área primeiro.';return;}const b=offlineStreets.bounds;$('basemap').value='streets';$('basemap').onchange();fieldMap.fitBounds([[b.south,b.west],[b.north,b.east]]);};
function streetParts(center,radius){
 const n=Math.ceil(radius/10);if(n===1)return [{center,radius}];const b=streetBounds(center,radius),parts=[];
 for(let y=0;y<n;y++)for(let x=0;x<n;x++)parts.push({center:{lat:b.south+(y+.5)*(b.north-b.south)/n,lng:b.west+(x+.5)*(b.east-b.west)/n},radius:11});return parts;
}
async function fetchStreetPart(part){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),90000);
 try{const bounds=streetBounds(part.center,part.radius),box=[bounds.south,bounds.west,bounds.north,bounds.east].join(','),query='[out:json][timeout:25][maxsize:134217728];(way["highway"]('+box+');node["place"]('+box+'););out geom;';
 let response;try{response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({data:query}),signal:controller.signal});}catch(e){if(controller.signal.aborted)throw e;}
 if(!response?.ok)response=await fetch('/api/streets/area',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lat:part.center.lat,lon:part.center.lng,radius:part.radius}),signal:controller.signal});
 if(!response.ok){let error;try{error=await response.json();}catch{}throw Error(error?.error||'Serviço de ruas indisponível. Tente retomar mais tarde.');}
 const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16*1024*1024){await reader.cancel();throw Error('Uma parte excedeu 16 MB. Escolha um raio menor.');}chunks.push(value);}
 return streetsFromOSM(JSON.parse(await new Blob(chunks).text()),true);
 }finally{clearTimeout(timer);}
}
async function downloadStreetArea(resume=false){
 if(streetsBusy)return;if(!navigator.onLine){$('streetStatus').textContent='Conecte à internet para baixar. A área já salva permanece disponível.';return;}
 const button=$('downloadStreets');streetsBusy=true;button.disabled=true;$('resumeStreets').disabled=true;
 try{let job=resume?await req('meta','readonly',s=>s.get('streetDownloadJob')):null;
 if(!job){const p=fieldMap.getCenter(),center={lat:p.lat,lng:p.lng},radius=Number($('streetRadius').value);if(![1,2,5,10,20,30].includes(radius))throw Error('Escolha um raio disponível, até 30 km.');job={center,radius,bounds:streetBounds(center,radius),parts:streetParts(center,radius),next:0,features:[]};await req('meta','readwrite',s=>s.put(job,'streetDownloadJob'));}
 const merged=new Map(job.features.map(f=>[f.id,f]));
 for(let i=job.next;i<job.parts.length;i++){
 $('streetStatus').textContent='Baixando área de '+job.radius+' km · parte '+(i+1)+'/'+job.parts.length+' · '+merged.size+' vias/localidades. Mantenha o app aberto.';
 const collection=await fetchStreetPart(job.parts[i]);for(const f of collection.features)merged.set(f.id,f);
 if(merged.size>150000)throw Error('Área excede 150 mil vias/localidades. Escolha um raio menor.');
 job.features=Array.from(merged.values());job.next=i+1;await req('meta','readwrite',s=>s.put(job,'streetDownloadJob'));
 }
 if(!merged.size)throw Error('Nenhuma rua encontrada nessa área. Confira a posição no mapa.');
 const collection={type:'FeatureCollection',features:Array.from(merged.values())},saved={collection,bounds:job.bounds,radius:job.radius,savedAt:new Date().toISOString()};
 await req('meta','readwrite',s=>s.put(saved,'offlineStreets'));offlineStreets=saved;await req('meta','readwrite',s=>s.delete('streetDownloadJob'));
 $('resumeStreets').hidden=true;$('streetStatus').textContent=collection.features.length+' vias/localidades salvas neste aparelho · raio '+job.radius+' km. Pode usar sem internet. Novo download substitui essa área.';
 if(!navigator.onLine)$('basemap').value='streets';await $('basemap').onchange();await storage();
 }catch(e){$('streetStatus').textContent='Download interrompido: '+(e.name==='AbortError'?'tempo excedido.':e.message)+' A área anterior foi preservada. Use Retomar para continuar pelas partes restantes.';$('resumeStreets').hidden=false;}
 finally{streetsBusy=false;button.disabled=false;$('resumeStreets').disabled=false;}
}
$('downloadStreets').onclick=()=>downloadStreetArea(false);
$('resumeStreets').onclick=()=>downloadStreetArea(true);

window.addEventListener('online',()=>{if(['streets','local'].includes($('basemap').value)){$('basemap').value='xyz';$('basemap').onchange();}});
