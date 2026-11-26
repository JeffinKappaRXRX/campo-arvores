'use strict';
(()=>{
 const $=id=>document.getElementById(id),escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let map=null,background=null,trees=null,network=null,selection=null,locationPin=null,worker=null,config=null,ready=false,paused=false,importing=false,requestId=0,searchId=0,timer=null,lastData=null,treeSignature='',fitted=false,layerVisibility={},queryController=null,lastNetworkQuery='',lastTreeData=null,treeController=null,treeRequest=0,treeQuery='',visibleNetwork=[],routeLayer=null,routePreview=null,routePreviewFeatures=[],contextLayer=null,filterPair=null,attribute=null,restoring=false,centralWorker=null,centralLayer=null,centralSignature="",centralEpoch=0;
 let outletPicker=null,locationTreeLayer=null,routeDrawnFeatures=[],centralFeatures=[];
 let cycleActive=false,unifiedRequest=0;const unifiedPending=new Map(),centralPending=new Map(),readyWaiters=new Set();
 const status=text=>$('networkStatus').textContent=text;
 const api=(path,body,signal)=>window.CampoControl.api(path,body,signal);
 const allowed=()=>window.CampoControl?.authorized();
 function start(){void window.CampoParque?.load();window.CampoRoutePlanner?.open();if(map){window.CampoCycle?.attach(map);setTimeout(()=>{map.invalidateSize();if(!$('controlBasemapStatus').textContent)setTiles();},0);if(!ready&&!importing)void reuse();return;}map=L.map('controlMap',{zoomControl:false,preferCanvas:true}).setView([-9.97,-67.81],11);for(const [name,z]of [['centralRouteContext',405],['controlNetwork',410],['controlContext',420],['controlTrees',640],['controlLabels',430],['controlSelection',450],['controlRoute',475],['controlPhotos',665]])map.createPane(name).style.zIndex=String(z);L.control.zoom({position:'bottomright'}).addTo(map);L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);trees=L.layerGroup();syncTreeVisibility();network=L.layerGroup().addTo(map);setTiles();window.CampoParque?.attach(map);window.CampoCycle?.attach(map);cycleMode(Boolean(window.CampoCycle?.active()));map.on('moveend',()=>{clearTimeout(timer);timer=setTimeout(()=>{networkView();if(allowed())void refreshTrees();},250);});setTimeout(()=>{map.invalidateSize();void refreshTrees(true);},0);map.on('click',handleNetworkClick);window.CampoGestaoFotos?.attachMap(map);window.CampoGestaoLocalizar?.attachMap(map);void reuse();}
 function hitNetwork(features,point){
  return typeof CampoNetworkHit==='undefined'?null:CampoNetworkHit.closest(features,point,c=>map.latLngToContainerPoint([c[1],c[0]]));
 }
 function handleNetworkClick(event,direct=null){
  if(!event.latlng)return;
  const at=event.originalEvent?map.mouseEventToLatLng(event.originalEvent):event.latlng;
  const point=[at.lng,at.lat],cycle=window.CampoCycle?.active();
  if(window.CampoCycle?.drawing())return;
  const picking=!cycle&&window.CampoRoutePlanner?.picking();
  const routeHit=!cycle&&hitNetwork(routeDrawnFeatures,point);
  const filteredHit=!cycle&&(outletPicker||picking||!direct)&&hitNetwork(routePreviewFeatures,point);
  const isLine=feature=>feature?.geometry?.type==='LineString'||feature?.geometry?.type==='MultiLineString';
  const fallback=()=>hitNetwork(picking?[...visibleNetwork,...centralFeatures].filter(isLine):[...visibleNetwork,...centralFeatures],point);
  const feature=routeHit||filteredHit||(picking&&!isLine(direct)?null:direct)||fallback()||direct;
  if(outletPicker&&!cycle){
   if(outletPicker(point,feature)!==false){
    outletPicker=null;map.getContainer().style.cursor='';
   }
   return;
  }
  if(feature)showFeature(feature,at);
  else if(selection){map.removeLayer(selection);selection=null;}
 }
 function setTiles(){
  if(!map)return;
  if(!background)background=CampoGestaoFundo.controller(map,{
   layer:(url,options)=>L.tileLayer(url,options),choice:()=>$('basemap').value,online:()=>navigator.onLine,
   status:message=>{$('controlBasemapStatus').textContent=message;}
  });
  background.select(true);
 }
 window.addEventListener('online',()=>{if(allowed())setTiles();});
 window.addEventListener('offline',()=>{if(allowed())setTiles();});
 function appendParams(p){if(!map)return;const b=map.getBounds().pad(.05);p.set('bbox',[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()].join(','));p.set('zoom',String(map.getZoom()));}
 function fit(bounds){if(!map||!bounds)return;map.fitBounds([[bounds[1],bounds[0]],[bounds[3],bounds[2]]],{padding:[35,55],maxZoom:18});}
 async function refreshTrees(force=false,focus=false){if(!map||!allowed()||!navigator.onLine)return;const p=window.CampoControl.mapParams?.()||new URLSearchParams();appendParams(p);p.set('archive','1');p.delete('page');const query=p.toString();if(!force&&query===treeQuery)return;treeQuery=query;const serial=++treeRequest;treeController?.abort();treeController=new AbortController();try{const data=await api('/api/control/map?'+p,undefined,treeController.signal);if(serial!==treeRequest||!allowed())return;lastTreeData=data;paintTrees(data.map);window.CampoParque?.refreshCount();$('mapCount').textContent=data.map.count+' nesta área · '+data.total+' no filtro · '+data.available+' ativos'+(data.filtered?' · filtros aplicados':'');if((focus||$('showTrees').checked&&!fitted&&!routePreview&&!routeLayer?.getLayers().length)&&data.bounds){fitted=true;fit(data.bounds);}}catch(e){if(e.name!=='AbortError'&&serial===treeRequest){treeQuery='';$('mapCount').textContent='Árvores: atualização pendente · '+e.message;}}}
 function paintTrees(data){const sig=JSON.stringify(data)+(window.CampoParque?.liveSignature?.()||'');if(sig===treeSignature)return;treeSignature=sig;trees.clearLayers();const icon=L.divIcon({className:'control-tree-pin',html:'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L5 11h3l-4 6h6v5h4v-5h6l-4-6h3Z" fill="currentColor"/></svg>',iconSize:[21,21],iconAnchor:[10,10]});for(const p of data.points){if(!p.count&&window.CampoParque?.liveVisible?.(p.id)===false)continue;const color=p.count?null:window.CampoParque?.liveColor?.(p.id),pin=color?L.divIcon({className:'control-tree-pin',html:'<span class="risk-pin" style="background:'+color+'"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2L5 11h3l-4 6h6v5h4v-5h6l-4-6h3Z" fill="currentColor"/></svg></span>',iconSize:[21,21],iconAnchor:[10,10]}):icon;const marker=p.count?L.marker([p.lat,p.lon],{pane:'controlTrees',bubblingMouseEvents:false,icon:L.divIcon({className:'control-cluster',html:String(p.count),iconSize:[28,28],iconAnchor:[14,14]})}):L.marker([p.lat,p.lon],{pane:'controlTrees',bubblingMouseEvents:false,icon:pin,keyboard:true,title:(p.species||'Árvore')+' · '+(p.pole||p.id)});if(p.count)marker.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent||e);fit(p.bounds);});else{marker.bindTooltip(escape(p.species||'Árvore')+' · '+escape(p.pole||p.id),{className:'control-tree-tooltip'});marker.on('click',e=>{L.DomEvent.stopPropagation(e.originalEvent||e);void window.CampoControl.openRecord(p.id);});}marker.addTo(trees);}if(!$('showTrees').checked)map.removeLayer(trees);}
 function paint(data){if(!map)return;lastData=data;networkView();}

 function syncTreeVisibility(){
  const master=$('showAllTrees'),field=$('showTrees').checked,vera=$('showVera').checked;
  master.checked=field&&vera;
  master.indeterminate=field!==vera;
  if(!map||cycleActive)return;
  if(field)trees.addTo(map);else trees.remove();
  if(locationPin){
   if(!locationTreeLayer||$(locationTreeLayer).checked)locationPin.addTo(map);else locationPin.remove();
  }
 }
 function locate(r,treeLayer=r.id?'showTrees':null){
  if(!map||!Number.isFinite(Number(r.lat))||!Number.isFinite(Number(r.lon)))return;
  locationPin?.remove();
  locationTreeLayer=treeLayer;
  locationPin=L.circleMarker([Number(r.lat),Number(r.lon)],{pane:'controlSelection',radius:7,color:'#f7cb37',weight:2,fillOpacity:.1})
   .bindTooltip(escape(r.species||'Localização'));
  if(!cycleActive&&(!treeLayer||$(treeLayer).checked))locationPin.addTo(map);
  map.setView([Number(r.lat),Number(r.lon)],18);
 }
 // Read the existing GPKG configuration only; never load inspection records or photos.
 function meta(value){return new Promise((resolve,reject)=>{const request=indexedDB.open('campo-vegetacao',1);request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('records'))db.createObjectStore('records',{keyPath:'id'});if(!db.objectStoreNames.contains('meta'))db.createObjectStore('meta');};request.onerror=()=>reject(request.error);request.onblocked=()=>reject(Error('Armazenamento ocupado por outra aba.'));request.onsuccess=()=>{const db=request.result;let result;const tx=db.transaction('meta',value?'readwrite':'readonly'),s=tx.objectStore('meta'),op=value?s.put(value,'gpkgConfig'):s.get('gpkgConfig');op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(tx.error||Error('Leitura da configuração interrompida.'));};};});}
 function ensureWorker(){if(worker)return;worker=new Worker('package-worker.js');worker.onerror=()=>{status('O leitor da rede não pôde iniciar. Tente novamente.');release();};worker.onmessage=async event=>{const m=event.data;if(!allowed())return;if(['view','route-network','route-reference','route-network-error','inspection-pole'].includes(m.action)&&unifiedPending.has(m.requestId)){const wait=unifiedPending.get(m.requestId);unifiedPending.delete(m.requestId);clearTimeout(wait.timer);if(m.action==='route-network-error')wait.reject(Error(m.message));else wait.resolve(m);return;}if(m.action==='progress'){status(m.message);return;}if(m.action==='paused'){ready=false;restoring=false;paused=true;if(!document.hidden)void reuse();return;}if(m.action==='busy'){status(m.message);release(m.message);return;}if(m.action==='error'){status(m.message+' A configuração anterior foi preservada.');release(m.message);return;}
 try{if(m.action==='inspect'){const layers=await window.CampoGestaoLayers.choose(m.layers.map(l=>window.CampoGestaoLayers.prepare(l)));if(!layers){status('Importação cancelada. A rede anterior foi preservada.');release();return;}worker.postMessage({action:'configure',layers,mapping:{}});status('Preparando índice da rede para consulta por área…');}
 else if(m.action==='zip-list'&&!importing){status('Selecione um ZIP com somente um GPKG para importar neste painel.');release();}
 else if(m.action==='configured'){config=m.config;await meta(config);ready=true;restoring=false;paused=false;lastNetworkQuery='';importing=false;buttons(false);paintLayers();status(config.count.toLocaleString('pt-BR')+' feições · rede preparada neste PC.');networkView();networkReady();window.dispatchEvent(new Event('campo-unified-data'));}
 else if(m.action==='restored'){ready=true;restoring=false;paused=false;lastNetworkQuery='';paintLayers();status(config.count.toLocaleString('pt-BR')+' feições · rede local disponível.');networkView();networkReady();window.dispatchEvent(new Event('campo-unified-data'));}
 else if(m.action==='view'&&filterPair&&(m.requestId===filterPair.base||m.requestId===filterPair.filter)){filterPair[m.requestId===filterPair.base?'baseData':'filterData']=m;if(filterPair.baseData&&filterPair.filterData){const found=filterPair.filterData.collection.features.length;drawNetwork(filterPair.baseData.collection);drawContext(filterPair.filterData.collection);status(found.toLocaleString('pt-BR')+' feição(ões) no filtro nesta área.'+(filterPair.baseData.capped||filterPair.filterData.capped?' Aproxime o mapa para ver todos.':''));}}else if(m.action==='view'&&m.requestId===requestId){drawContext(null);drawNetwork(m.collection);if(m.capped)status('Aproxime o mapa para ver todos os detalhes da rede.');}
 else if(m.action==='search-results'&&m.requestId===searchId){const list=$('mapResults');list.innerHTML=m.features.map((f,i)=>'<button type="button" data-network-result="'+i+'">'+escape(f.properties._layer)+' · '+escape(Object.entries(f.properties).filter(([k])=>!k.startsWith('_')).map(([,v])=>v).slice(0,3).join(' · '))+'</button>').join('');list.querySelectorAll('[data-network-result]').forEach(b=>b.onclick=()=>{const f=m.features[Number(b.dataset.networkResult)],bounds=CampoMapSearch.bounds(f.geometry);if(bounds)fit([bounds.west,bounds.south,bounds.east,bounds.north]);showFeature(f);$('mapSearch').hidden=true;$('mapSearchToggle').setAttribute('aria-expanded','false');});$('mapSearchStatus').textContent=m.features.length+' resultado(s) na rede'+(m.more?' · refine a busca':'');}
 }catch(e){status(e.message);buttons(false);importing=false;}};}
 function buttons(busy){for(const id of ['downloadNetwork','reuseNetwork','networkFile'])$(id).disabled=busy;}
 function networkReady(error){for(const notify of readyWaiters)notify(error);readyWaiters.clear();}
 function release(message){networkReady(typeof message==='string'?message:'A rede local foi fechada.');lastNetworkQuery='';ready=false;restoring=false;paused=false;importing=false;worker?.terminate();worker=null;for(const wait of unifiedPending.values()){clearTimeout(wait.timer);wait.reject(Error('A rede foi fechada. Reabra a base para consultar.'));}unifiedPending.clear();buttons(false);}
 async function reuse(){if(!allowed()||document.hidden||importing||restoring)return;restoring=true;try{config=await meta();if(!config){restoring=false;status('Instale o GPKG para mostrar postes, chaves e BT. Os vãos MT podem vir da base central.');networkView();return;}ensureWorker();ready=false;status('Abrindo rede já instalada…');worker.postMessage({action:'restore',config});}catch(e){restoring=false;status(e.message);networkReady(e.message);}}
 async function download(){if(!allowed()||importing)return;importing=true;buttons(true);try{const manifest=await api('/api/network/manifest');if(config?.centralSource?.revision===manifest.revision){status('A rede instalada já está atualizada.');importing=false;buttons(false);await reuse();return;}ensureWorker();worker.postMessage({action:'import-remote',manifest:{...manifest,apiBase:location.origin,adminSession:sessionStorage.getItem('campo-admin-session')||''}});status('Baixando e integrando a rede. Acompanhe o progresso nesta tela.');}catch(e){status(e.message);importing=false;buttons(false);}}
 function saveVisibility(){try{localStorage.setItem('campo-gestao-camadas',JSON.stringify(layerVisibility));}catch{}}
 function paintLayers(){const layers=config?.layers||[];try{layerVisibility={...JSON.parse(localStorage.getItem('campo-gestao-camadas')||'{}'),...layerVisibility};}catch{}for(const l of layers)if(layerVisibility[l.table_name]===undefined)layerVisibility[l.table_name]=window.CampoGestaoLayers.defaultVisible(l.table_name);window.CampoGestaoLayers.render($('networkLayers'),layers,layerVisibility,()=>{saveVisibility();networkView();});const names=layers.map(l=>'<option value="'+escape(l.table_name)+'">'+escape(l.table_name)+'</option>').join('');$('attrLayer').innerHTML='<option value="">Escolha a camada</option>'+names;attrColumns();if(typeof GestaoMulti!=='undefined')GestaoMulti.mount($('networkFeeder'),'Alimentador da rede').set(GestaoMulti.pairs(config?.feeders||[]));else $('networkFeeder').innerHTML='<option value="">Todos</option>'+(config?.feeders||[]).map(f=>'<option value="'+escape(f)+'">'+escape(f)+'</option>').join('');$('searchLayer').innerHTML='<option value="">Todas as camadas</option>'+layers.map(l=>'<option value="'+escape(l.table_name)+'">'+escape(l.table_name)+'</option>').join('');searchColumns();window.CampoRoutePlanner?.feeders(config?.feeders||[]);}
 function searchColumns(){const name=$('searchLayer').value,columns=[...new Set((config?.layers||[]).filter(l=>!name||l.table_name===name).flatMap(l=>l.columns||[]))];$('searchColumn').innerHTML='<option value="">Todas as colunas</option>'+columns.map(c=>'<option value="'+escape(c)+'">'+escape(c)+'</option>').join('');}
 function attrColumns(){const layer=(config?.layers||[]).find(l=>l.table_name===$('attrLayer').value);$('attrColumn').innerHTML='<option value="">Todas as colunas</option>'+(layer?.columns||[]).map(c=>'<option value="'+escape(c)+'">'+escape(c)+'</option>').join('');}
 function networkView(){
  if(!map||!allowed()||!map.getContainer().offsetWidth)return;
  const b=map.getBounds().pad(.15),zoom=map.getZoom(),scale=$('networkScale').checked,feedSelection=typeof GestaoMulti==='undefined'?[$('networkFeeder').value].filter(Boolean):GestaoMulti.selected($('networkFeeder'));
  if(ready&&cycleActive&&centralLayer){centralLayer.remove();centralLayer=null;centralSignature='';centralEpoch++;}
  if(!ready||centralLayer&&!cycleActive)void centralContext(b,zoom);
  if(!ready||!worker)return;
  const feeders=cycleActive?[]:feedSelection.length?feedSelection:window.CampoControl.filters().feeders||[];
  const visibleLayers=Object.keys(layerVisibility).filter(k=>layerVisibility[k]&&(!scale||window.CampoGestaoLayers.inScale(k,zoom))&&(!centralLayer||config?.layers.find(layer=>layer.table_name===k)?.classification!=='MT'));
  const query={action:'view',bounds:{west:b.getWest(),south:b.getSouth(),east:b.getEast(),north:b.getNorth()},visibleLayers};
  const signature=JSON.stringify([query,feeders,attribute]);if(signature===lastNetworkQuery)return;
  lastNetworkQuery=signature;filterPair=null;
  if((!attribute||cycleActive)&&!feeders.length){worker.postMessage({...query,requestId:++requestId});return;}
  const base=++requestId,filter=++requestId;
  filterPair={base,filter,baseData:null,filterData:null};
  worker.postMessage({...query,requestId:base});
  worker.postMessage({...query,feeders,strictFeeders:true,requestId:filter,...(attribute?{visibleLayers:[attribute.layer],search:{text:attribute.text,column:attribute.column,layer:attribute.layer}}:{})});
 }
 function drawContext(collection){
  contextLayer?.remove();contextLayer=null;
  if(!collection?.features.length)return;
  const pane='controlContext';
  contextLayer=L.geoJSON(collection,{pane,interactive:false,style:{color:'#ffc64d',weight:4,opacity:.9},pointToLayer:(_f,p)=>L.circleMarker(p,{pane,interactive:false,radius:5,color:'#ffc64d',weight:2,fillOpacity:.2})}).addTo(map);
 }

 function profile(f){return config?.layers.find(l=>l.table_name===f.properties?._layer)?.profile;}
 function style(f){const p=profile(f),original=p?{...p.style,...p.categories?.[String(f.properties[p.categoryField]??'NULL')]}:{color:f.properties?._class==='BT'?'#01ff51':'#33d4c1',weight:2.5};return {...original,radius:Math.max(2.5,Math.min(3.8,(original.radius||6)*.5)),weight:Math.max(1,Math.min(1.6,(original.weight||2.5)*.65))};}

 function drawNetwork(collection){visibleNetwork=collection.features||[];network.clearLayers();const occupied=[],mode=$('mapLabels').value;let labels=0;L.geoJSON(collection,{pane:'controlNetwork',style,pointToLayer:(f,p)=>{const s=style(f);if(profile(f)?.shape==='square')return L.marker(p,{pane:'controlNetwork',icon:L.divIcon({className:'network-square',html:'<span style="display:block;width:7px;height:7px;background:'+escape(s.fillColor||'#ffb54b')+';border:1px solid #5b3300"></span>',iconSize:[7,7],iconAnchor:[3,3]})});return L.circleMarker(p,{pane:'controlNetwork',...s});},onEachFeature:(f,l)=>{const p=profile(f),full=p?.labels?.map(k=>f.properties[k]).filter(v=>v!==undefined&&v!=='').join(' · '),short=String(full||'').split(' · ')[0].slice(0,22);let permanent=false;if(short&&mode==='auto'&&map.getZoom()>=18&&labels<60){const b=CampoMapSearch.bounds(f.geometry);if(b){const point=map.latLngToContainerPoint([(b.south+b.north)/2,(b.west+b.east)/2]),box={x:point.x+8,y:point.y-7,w:short.length*6+10,h:17};if(point.x>=0&&point.y>=0&&point.x<=map.getSize().x&&point.y<=map.getSize().y&&!occupied.some(a=>box.x<a.x+a.w&&box.x+box.w>a.x&&box.y<a.y+a.h&&box.y+box.h>a.y)){occupied.push(box);permanent=true;labels++;}}}if(short&&mode!=='none')l.bindTooltip(escape(short),{pane:'controlLabels',permanent,direction:'right',className:'network-label',offset:[5,0],opacity:1});l.options.bubblingMouseEvents=false;l.on('click',e=>handleNetworkClick(e,f));}}).addTo(network);}

 function showFeature(f,at){if(!window.CampoCycle?.active()&&window.CampoRoutePlanner?.select(f))return;if(selection)map.removeLayer(selection);selection=L.geoJSON(f,{pane:'controlSelection',interactive:false,style:{color:'#ffda30',weight:3,opacity:.95},pointToLayer:(_f,p)=>L.circleMarker(p,{pane:'controlSelection',interactive:false,radius:6,color:'#ffda30',weight:2,fillOpacity:.1})}).addTo(map);const html='<strong>'+escape(f.properties?._layer||'Rede')+'</strong><div class="network-attributes"><table>'+Object.entries(f.properties||{}).filter(([k])=>!k.startsWith('_')).map(([k,v])=>'<tr><th>'+escape(k)+'</th><td>'+escape(v)+'</td></tr>').join('')+'</table></div>';const b=selection.getBounds();if(b.isValid()){
  let content=html;
  if(window.CampoGestaoFotos){
   content=document.createElement('div');content.innerHTML=html;
   window.CampoGestaoFotos.addNetworkAction(f,content);
  }
  L.popup({maxWidth:340}).setLatLng(at||b.getCenter()).setContent(content).openOn(map);
 }}
 async function search(event){event.preventDefault();const text=$('mapQuery').value.trim();if(!text)return;queryController?.abort();queryController=new AbortController();$('mapResults').textContent='';try{const parsed=CampoMapSearch.convert(CampoMapSearch.parse(text),proj4);if(parsed?.kind==='coordinate'){locate({...parsed,species:'Coordenada pesquisada'});$('mapSearch').hidden=true;return;}if(parsed?.lat!==undefined&&parsed?.lon!==undefined){locate({...parsed,species:'Coordenada pesquisada'});$('mapSearch').hidden=true;return;}const ps=new URLSearchParams({q:text,page:'0'});const data=await api('/api/control/data?'+ps,undefined,queryController.signal);if(!allowed())return;$('mapResults').innerHTML=data.records.slice(0,15).map(r=>'<button type="button" data-tree-result="'+escape(r.id)+'">'+escape(r.species||'Árvore')+' · '+escape(r.pole||r.id)+' · '+escape(r.feeder)+'</button>').join('');$('mapResults').querySelectorAll('[data-tree-result]').forEach(b=>b.onclick=()=>{const r=data.records.find(r=>r.id===b.dataset.treeResult);locate(r);void window.CampoControl.openRecord(r.id);});$('mapSearchStatus').textContent=data.total+' cadastro(s) encontrado(s).';if(ready&&worker)worker.postMessage({action:'search',text,layer:$('searchLayer').value,column:$('searchColumn').value,requestId:++searchId});else if(!data.total){const addresses=await api('/api/map/search',{query:text},queryController.signal);if(!allowed())return;for(const place of addresses.results||[]){const b=document.createElement('button');b.type='button';b.textContent=place.title+' · '+place.detail;b.onclick=()=>{locate({...place,species:place.title});$('mapSearch').hidden=true;};$('mapResults').append(b);}$('mapSearchStatus').textContent=(addresses.results?.length||0)+' endereço(s) encontrado(s).';}}catch(e){if(e.name!=='AbortError')$('mapSearchStatus').textContent=e.message;}}
 $('basemap').onchange=setTiles;$('retryControlBasemap').onclick=setTiles;$('mapFit').onclick=()=>{if(lastTreeData?.bounds)fit(lastTreeData.bounds);else void refreshTrees(true,true);};$('allTrees').onclick=()=>{window.CampoParque?.clearFilters?.();window.CampoControl.clearFilters();};$('mapNetworkFit').onclick=()=>{const b=config?.bounds;if(b)fit([b.west,b.south,b.east,b.north]);else status('Abra ou baixe a rede para enquadrar suas camadas.');};$('showTrees').onchange=syncTreeVisibility;
 $('showVera').addEventListener('change',syncTreeVisibility);
 $('showAllTrees').onchange=()=>{
  $('showTrees').checked=$('showVera').checked=$('showAllTrees').checked;
  $('showVera').dispatchEvent(new Event('change'));
 };
 $('mapLabels').onchange=()=>{if(visibleNetwork.length)drawNetwork({type:'FeatureCollection',features:visibleNetwork});};$('mapGPS').onclick=()=>{if(!navigator.geolocation){status('GPS indisponível neste navegador.');return;}navigator.geolocation.getCurrentPosition(p=>locate({lat:p.coords.latitude,lon:p.coords.longitude,species:'Minha posição · ±'+Math.round(p.coords.accuracy)+' m'}),e=>status(e.message),{enableHighAccuracy:true,timeout:20000,maximumAge:0});};
 const popovers=[['mapMenuToggle','mapMenu'],['parqueToggle','parqueMenu'],['mapSearchToggle','mapSearch']];for(const [button,panel]of popovers)$(button).onclick=()=>{const open=$(panel).hidden;for(const [b,p]of popovers){$(p).hidden=true;$(b).setAttribute('aria-expanded','false');}$(panel).hidden=!open;$(button).setAttribute('aria-expanded',String(open));if(panel==='mapSearch'&&open)$('mapQuery').focus();};$('attrLayer').onchange=attrColumns;$('networkFeeder').onchange=networkView;$('networkScale').onchange=networkView;$('attrApply').onclick=()=>{const layer=$('attrLayer').value,text=$('attrValue').value.trim();if(!layer||!text){status('Escolha a camada e o valor do filtro.');return;}attribute={layer,column:$('attrColumn').value,text};layerVisibility[layer]=true;paintLayers();networkView();};$('attrClear').onclick=()=>{attribute=null;$('attrValue').value='';networkView();};
 const workspace=$('managementMapWorkspace');
 let fullscreenPending=false;
 const isFullscreen=()=>document.fullscreenElement===workspace||workspace.classList.contains('map-fullscreen');
 function paintFullscreen(){
  const active=isFullscreen();
  $('mapExit').hidden=!active;
  $('mapExpand').textContent=active?'Sair da tela inteira':'⛶ Tela inteira';
  $('mapExpand').setAttribute('aria-pressed',String(active));
  setTimeout(()=>map?.invalidateSize(),0);
 }
 async function fullscreen(on){
  if(fullscreenPending)return;
  fullscreenPending=true;
  try{
   if(on){
    if(typeof workspace.requestFullscreen==='function'){
     try{await workspace.requestFullscreen();return;}catch{/* Use the viewport if fullscreen is blocked. */}
    }
    workspace.classList.add('map-fullscreen');
    document.documentElement.classList.add('management-fullscreen-fallback');
   }else{
    workspace.classList.remove('map-fullscreen');
    document.documentElement.classList.remove('management-fullscreen-fallback');
    if(document.fullscreenElement===workspace)await document.exitFullscreen();
   }
  }finally{fullscreenPending=false;paintFullscreen();}
 }
 $('mapExpand').onclick=()=>void fullscreen(!isFullscreen());
 $('mapExit').onclick=()=>void fullscreen(false);
 document.addEventListener('fullscreenchange',paintFullscreen);
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&workspace.classList.contains('map-fullscreen')&&!document.querySelector('dialog[open]')&&!window.CampoGestaoCadastroMapa?.active())void fullscreen(false);});
 $('reuseNetwork').onclick=()=>void reuse();$('downloadNetwork').onclick=()=>void download();$('networkFile').onchange=async e=>{const file=e.target.files?.[0];if(!file||!allowed()||importing)return;ensureWorker();importing=true;buttons(true);const bytes=new Uint8Array(await file.slice(0,16).arrayBuffer());if(bytes[0]===80&&bytes[1]===75){worker.postMessage({action:'zip-list',file});const prior=worker.onmessage;worker.onmessage=event=>{if(event.data.action==='zip-list'){worker.onmessage=prior;if(event.data.entries.length!==1){status('Este ZIP contém várias bases. Selecione o GPKG desejado diretamente.');release();return;}worker.postMessage({action:'open-zip',index:0});}else void prior(event);};}else worker.postMessage({action:'inspect-file',file});e.target.value='';};$('searchLayer').onchange=searchColumns;$('mapSearchForm').onsubmit=search;
 window.addEventListener('resize',()=>{if(map&&allowed())setTimeout(()=>{map.invalidateSize();networkView();},100);});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&worker&&ready){ready=false;worker.postMessage({action:'pause'});}else if(!document.hidden&&paused&&allowed())void reuse();});window.addEventListener('pagehide',release);
 function cycleMode(on){
  if(!map||cycleActive===on)return;
  cycleActive=on;
  if(on){outletPicker=null;map.getContainer().style.cursor='';}
  map.closePopup();
  for(const layer of [trees,routeLayer,routePreview,contextLayer,locationPin])if(layer){
   if(on)layer.remove();else layer.addTo(map);
  }
  window.CampoParque?.cycleMode(on);
  if(!on)syncTreeVisibility();
  lastNetworkQuery='';centralSignature='';setTimeout(()=>{map.invalidateSize();networkView();},0);
 }
 function stop(){if(isFullscreen())void fullscreen(false);outletPicker=null;routeDrawnFeatures=[];routePreviewFeatures=[];if(map)map.getContainer().style.cursor='';window.CampoCycle?.stop();stopCentral();window.CampoRoutePlanner?.stop();window.CampoParque?.stop();treeController?.abort();treeRequest++;treeQuery='';lastTreeData=null;release();trees?.clearLayers();network?.clearLayers();drawContext(null);lastData=null;treeSignature='';if(selection){map?.removeLayer(selection);selection=null;}if(locationPin){map?.removeLayer(locationPin);locationPin=null;}queryController?.abort();}
 function unifiedNetwork(bounds,zoom,feeders){
  if(!allowed()||!ready||!worker)return Promise.reject(Error('Rede local ainda não disponível. Use a opção de instalar ou atualizar a rede.'));
  const visibleLayers=Object.keys(layerVisibility).filter(k=>layerVisibility[k]&&(!$("networkScale").checked||window.CampoGestaoLayers.inScale(k,zoom)));
  const requestId=--unifiedRequest;
  return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{unifiedPending.delete(requestId);reject(Error("A consulta da rede demorou. Mova ou aproxime o mapa para tentar de novo."));},12000);unifiedPending.set(requestId,{resolve,timer});worker.postMessage({action:"view",bounds,feeders,visibleLayers,requestId,strictFeeders:true});});
 }
 function stopCentral(){
  centralWorker?.terminate();centralWorker=null;centralEpoch++;centralSignature='';
  for(const request of centralPending.values()){clearTimeout(request.timer);request.reject(Error('A sessão da gestão foi encerrada.'));}centralPending.clear();
  centralLayer?.remove();centralLayer=null;centralFeatures=[];
 }
 function centralQuery(action,query={}){
  if(!centralWorker){
   centralWorker=new Worker('route-network-worker.js');
   centralWorker.onmessage=({data:result})=>{
    const waiting=centralPending.get(result.id);if(!waiting)return;
    centralPending.delete(result.id);clearTimeout(waiting.timer);
    if(result.error)waiting.reject(Error(result.error));else waiting.resolve(result.data);
   };
   centralWorker.onerror=()=>stopCentral();
  }
  const id=++unifiedRequest;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{centralPending.delete(id);reject(Error('A base MT central excedeu o tempo de resposta.'));},95000);
   centralPending.set(id,{resolve,reject,timer});centralWorker.postMessage({id,action,...query,adminSession:sessionStorage.getItem('campo-admin-session')||''});
  });
 }
 async function centralContext(b,zoom){
  const bounds={west:b.getWest(),south:b.getSouth(),east:b.getEast(),north:b.getNorth()},signature=JSON.stringify([bounds,zoom]);
  if(signature===centralSignature)return;
  centralSignature=signature;const serial=++centralEpoch;
  try{
   const result=await centralQuery('filter',{context:true,bounds,zoom});
   if(!allowed()||serial!==centralEpoch||cycleActive&&ready)return;
   const pane='centralRouteContext',first=!centralLayer;
   centralLayer?.remove();
   centralFeatures=result.features;
   centralLayer=L.geoJSON({type:'FeatureCollection',features:result.features},{pane,style:{color:'#45cfcb',weight:1.6,opacity:.78},onEachFeature:(feature,line)=>{
    line.options.bubblingMouseEvents=false;
    line.on('click',event=>handleNetworkClick(event,feature));
   }}).addTo(map);
   if(first){status('Rede MT central disponível.');networkView();}
  }catch{if(serial===centralEpoch)centralSignature='';}
 }
 async function localRouteNetwork(filters,action){
  if(!ready&&!importing)await reuse();
  if(!ready&&(restoring||importing))await new Promise((resolve,reject)=>{
   const done=message=>{clearTimeout(wait);readyWaiters.delete(done);if(message)reject(Error(message));else resolve();};
   const wait=setTimeout(()=>done('A rede local continua em preparação.'),90000);
   readyWaiters.add(done);
  });
  if(!ready||!worker)throw Error('O GPKG local não está aberto.');
  const id='route-'+(++unifiedRequest);
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{unifiedPending.delete(id);reject(Error('A consulta à rede local demorou.'));},60000);
   unifiedPending.set(id,{resolve,reject,timer});worker.postMessage({action,requestId:id,...filters});
  });
 }
 function inspectionPole(pole,point){
  if(!ready||!worker||!allowed())return Promise.resolve(null);
  return new Promise(resolve=>{
   const requestId='inspection-pole-'+(++unifiedRequest);
   const timer=setTimeout(()=>{unifiedPending.delete(requestId);resolve(null);},1500);
   unifiedPending.set(requestId,{resolve:result=>resolve(result.links),reject:()=>resolve(null),timer});
   worker.postMessage({action:'inspection-pole',requestId,pole,point});
  });
 }
 async function routeNetwork(filters,action='route-network'){
  if(!allowed())throw Error('Entre na gestão para consultar a rede.');
  if(action!=='route-network')return localRouteNetwork(filters,action);
  const featureId=filters.featureId;
  if(featureId&&!featureId.startsWith('route-mt:'))return localRouteNetwork(filters,action);
  try{
   const result=await centralQuery('filter',filters);
   if(map&&map.getContainer().offsetWidth)void centralContext(map.getBounds().pad(.15),map.getZoom());
   return result;
  }catch(error){
   if(!ready)throw error;
   const result=await localRouteNetwork(filters,action);
   return {...result,referenceError:'Rede central indisponível. Recorte calculado com o GPKG local.'};
  }
 }
 function setRouteFilter(features,focus=false,scroll=false,extent=null){
  if(!map||cycleActive)return;
  if(routePreview){routePreview.remove();routePreview=null;}
  routePreviewFeatures=features||[];
  if(!routePreviewFeatures.length)return;
  const paths=routePreviewFeatures.map(f=>f.geometry.coordinates.map(([lon,lat])=>[lat,lon]));
  const style={pane:'controlRoute',interactive:false};
  routePreview=L.featureGroup([
   L.polyline(paths,{...style,color:CampoRoutes.haloColor,weight:12,opacity:.65}),
   L.polyline(paths,{...style,color:CampoRoutes.pendingColor,weight:6})
  ]).addTo(map);
  if(focus){
   map.invalidateSize();
   if(extent)fit([extent.west,extent.south,extent.east,extent.north]);
   else if(routePreview.getBounds().isValid())map.fitBounds(routePreview.getBounds(),{padding:[35,45],maxZoom:18});
  }
  if(scroll)$('controlMap').scrollIntoView({block:'center',behavior:'smooth'});
 }
 function routeOverlayGroups(groups,focus){
  if(!map||cycleActive)return;
  routeLayer?.remove();
  routeDrawnFeatures=groups.flatMap(({spans})=>spans.map(span=>({
   type:'Feature',id:'route-mt:'+span.id,geometry:{type:'LineString',coordinates:span.line},
   properties:{_layer:'Vão MT da rota',_class:'MT',_plannedSpan:span,Id:span.id,Alimentador:span.feeder,NAME_BLOCO:span.block,Trecho:span.section?'T'+span.section:'',Zona:span.zone,'Extensão (m)':span.metres}
  })));
  routeLayer=L.featureGroup().addTo(map);
  const M=CampoRoutes,style={pane:'controlRoute',interactive:false,bubblingMouseEvents:false};
  for(const group of groups){
   const {spans,covered,buffer,label,accent}=group,lines=M.mapLines(spans,covered);
   if(buffer&&spans.length)L.polygon(M.bufferRings(spans,buffer).map(ring=>[ring.map(([lon,lat])=>[lat,lon])]),{...style,stroke:false,fillColor:accent||'#167da3',fillOpacity:.18,fillRule:'nonzero'}).addTo(routeLayer);
   for(const [kind,color] of [['pending',covered?M.pendingColor:'#7150cf'],['confirmed',M.confirmedColor]]){
    const paths=lines[kind].map(line=>line.map(([x,y])=>[y,x]));
    if(!paths.length)continue;
    L.polyline(paths,{...style,color:accent||M.haloColor,weight:15,opacity:.8}).addTo(routeLayer);
    const line=L.polyline(paths,{...style,color,weight:7,interactive:Boolean(label)}).addTo(routeLayer);
    if(label)line.bindTooltip(escape(label));
    line.on('click',handleNetworkClick);
   }
   if(!spans.length)continue;
   const points=group.outlet?[['Saída da subestação',group.outlet]]:[['Início',M.first(spans[0])],['Fim',M.last(spans.at(-1))]];
   for(const [name,p] of points)L.circleMarker([p[1],p[0]],{...style,interactive:Boolean(label),radius:6,color:accent||'#123a28',fillColor:'#fff',fillOpacity:1})
    .addTo(routeLayer).bindTooltip(escape(label?name+' · '+label:name),{permanent:!label}).on('click',handleNetworkClick);
  }
  if(focus&&routeLayer.getBounds().isValid()){
   map.invalidateSize();
   map.fitBounds(routeLayer.getBounds(),{padding:[24,24],maxZoom:19});
   $('controlMap').scrollIntoView({block:'center'});
  }
 }
 function routeOverlay(spans,covered,focus,buffer=0,outlet=null){
  routeOverlayGroups([{spans,covered,buffer,outlet}],focus);
 }
 window.CampoControlMap={inspectionPole,resize:()=>map?.invalidateSize(),onAvailable(callback){if(map)callback(map);},canPlacePoint:()=>!outletPicker&&!window.CampoRoutePlanner?.picking()&&!window.CampoCycle?.drawing(),pickOutlet(callback){if(!map)return false;outletPicker=callback;map.getContainer().style.cursor=callback?'crosshair':'';if(callback)$('mapFrame').scrollIntoView({block:'center'});return true;},routeCatalogue:()=>api('/api/routes/geometry?catalog=1'),routeBounds(){const b=map?.getBounds();return b?{west:b.getWest(),south:b.getSouth(),east:b.getEast(),north:b.getNorth()}:null;},routeNetwork,importRouteReference:file=>routeNetwork({file},'route-reference'),refreshNetwork:networkView,setRouteFilter,routeOverlay,routeOverlayGroups,unifiedNetwork,cycleMode,start,paint,refresh:focus=>refreshTrees(true,Boolean(focus)),appendParams,locate,stop,liveTotal:()=>lastTreeData?lastTreeData.available:null,repaintTrees:()=>{if(lastTreeData)paintTrees(lastTreeData.map);}};
})();
