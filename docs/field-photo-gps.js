'use strict';
(() => {
 const $=id=>document.getElementById(id),controls=$('photoGpsControls'),toggle=$('photoGpsToggle'),open=$('photoGpsOpen'),status=$('photoGpsStatus');
 if(!controls||!toggle||!open||!status)return;
 let revision=0,reader=null,waitingToFrame=false,cache=new WeakMap(),groups=[],leafletPins=null,googlePins=[];
 const enabled=()=>adminPhotoGpsAllowed&&toggle.checked;
 function clearPins(){
  leafletPins?.remove();leafletPins=null;
  for(const pin of googlePins)pin.setMap(null);
  googlePins=[];
 }
 function reset(){
  revision++;waitingToFrame=false;groups=[];open.hidden=true;status.textContent='';clearPins();
 }
 function accessChanged(){
  controls.hidden=!adminPhotoGpsAllowed;
  toggle.disabled=!adminPhotoGpsAllowed;
  if(!adminPhotoGpsAllowed){toggle.checked=toggle.defaultChecked=false;cache=new WeakMap();reset();}
 }
 function loadReader(){
  if(window.CampoExifGps)return Promise.resolve(window.CampoExifGps);
  if(reader)return reader;
  reader=new Promise((resolve,reject)=>{
   const script=document.createElement('script');
   script.src='photo-exif-gps.js';
   script.onload=()=>window.CampoExifGps?resolve(window.CampoExifGps):reject(Error('Leitor indisponível.'));
   script.onerror=()=>{script.remove();reject(Error('Leitor indisponível.'));};
   document.head.append(script);
  }).catch(error=>{reader=null;throw error;});
  return reader;
 }
 function googleActive(){return typeof google!=='undefined'&&googleMap&&!$('googleMap').hidden;}
 function redraw(){
  if(!enabled()||!groups.length||!fieldMap)return;
  clearPins();
  if(googleActive()){
   googlePins=groups.map(({lat,lon,indices})=>new google.maps.Marker({map:googleMap,position:{lat,lng:lon},zIndex:950,
    title:indices.map(n=>'Foto '+n).join(', '),label:{text:String(indices[0]),color:'#fff',fontWeight:'bold'},
    icon:{path:google.maps.SymbolPath.CIRCLE,scale:11,strokeWeight:2,strokeColor:'#fff',fillColor:'#6043b2',fillOpacity:1}}));
   return;
  }
  leafletPins=L.layerGroup().addTo(fieldMap);
  groups.forEach(({lat,lon,indices})=>{
   const label=document.createElement('span');
   label.textContent=indices.map(n=>'Foto '+n).join(', ');
   L.marker([lat,lon],{icon:L.divIcon({className:'photo-gps-pin',html:String(indices[0]),iconSize:[25,25],iconAnchor:[12,12]}),title:label.textContent,zIndexOffset:1000,bubblingMouseEvents:false}).bindTooltip(label).addTo(leafletPins);
  });
 }
 function fit(){
  if(!enabled()||!groups.length||$('inspect').hidden)return;
  waitingToFrame=!fieldMap;
  if(waitingToFrame)return;
  if(typeof setGPSFollow==='function')setGPSFollow(false);
  setMapFullscreen(true);
  fieldMap.invalidateSize({pan:false});
  const first=groups[0];
  if(googleActive()){
   google.maps.event.trigger(googleMap,'resize');
   if(groups.length===1){googleMap.setCenter({lat:first.lat,lng:first.lon});googleMap.setZoom(18);}
   else{
    const bounds=new google.maps.LatLngBounds();
    for(const {lat,lon} of groups)bounds.extend({lat,lng:lon});
    googleMap.fitBounds(bounds,48);
    google.maps.event.addListenerOnce(googleMap,'idle',()=>{if(enabled()&&googleActive()&&googleMap.getZoom()>18)googleMap.setZoom(18);});
   }
  }else if(groups.length===1)fieldMap.setView([first.lat,first.lon],18,{animate:false});
  else fieldMap.fitBounds(groups.map(({lat,lon})=>[lat,lon]),{paddingTopLeft:[35,75],paddingBottomRight:[35,100],maxZoom:18,animate:false});
  requestNetworkView();
 }
 function refresh(frame=false){
  if(!enabled())return;
  const turn=++revision,items=[...photos];
  if(!items.length){reset();return;}
  void (async()=>{
   const exif=await loadReader();
   const positions=new Map();
   let found=0;
   for(const [index,photo] of items.entries()){
    if(turn!==revision||!enabled())return;
    if(!cache.has(photo)){
     if(index%4===0)await new Promise(resolve=>setTimeout(resolve,0));
     if(turn!==revision||!enabled())return;
     cache.set(photo,exif.read(photo.original));
    }
    const point=cache.get(photo);
    if(!point)continue;
    const key=point.lat.toFixed(6)+','+point.lon.toFixed(6);
    if(!positions.has(key))positions.set(key,{...point,indices:[]});
    positions.get(key).indices.push(index+1);found++;
   }
   if(turn!==revision||!enabled())return;
   groups=[...positions.values()];open.hidden=!groups.length;
   status.textContent=found?found+' de '+items.length+' foto(s) com GPS · '+groups.length+' ponto(s) no mapa.':'Nenhuma coordenada GPS encontrada nas fotos.';
   if(groups.length){redraw();if(frame)fit();}
   else {waitingToFrame=false;clearPins();}
  })().catch(()=>{
   if(turn!==revision||!enabled())return;
   reset();status.textContent='Não foi possível ler o GPS das fotos. Os anexos continuam disponíveis.';
  });
 }
 toggle.addEventListener('change',()=>{toggle.checked=toggle.defaultChecked=enabled();if(enabled())refresh(true);else reset();});
 open.addEventListener('click',fit);
 window.addEventListener('campo-photo-gps-access',accessChanged);
 const basemap=$('basemap'),previous=basemap.onchange;
 basemap.onchange=async function(...args){const value=await previous?.apply(this,args);if(enabled()){redraw();if(waitingToFrame)fit();}return value;};
 window.CampoPhotoGps={refresh};
 accessChanged();
})();
