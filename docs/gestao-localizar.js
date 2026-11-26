'use strict';
(()=>{
 const $=id=>document.getElementById(id),pin=$('controlDropPin'),street=$('controlStreetView');
 if(!pin||!street)return;
 const feedback=$('controlLocationStatus');
 const icons={
  pin:'<svg viewBox="0 0 24 32" aria-hidden="true"><path d="M12 1a10 10 0 0 0-10 10c0 7 10 19 10 19s10-12 10-19A10 10 0 0 0 12 1Z"/><circle cx="12" cy="11" r="3.5"/></svg>',
  street:'<svg viewBox="0 0 24 32" aria-hidden="true"><circle cx="12" cy="5" r="4"/><path d="M7 11h10l3 9-3 1-2-6v15h-4V20h-1v10H6V15l-2 6-3-1 4-9z"/></svg>'
 };
 const ghost=document.createElement('span');ghost.className='control-location-ghost';ghost.hidden=true;$('mapFrame').append(ghost);
 let map,mode=null,drag=null,marker=null,viewpoint=null;
 const streetTitle='Ver rua no Google Maps',pinTitle='Abrir ponto no Google Maps';
 function allowed(){return map&&window.CampoControl?.authorized()&&window.CampoControlMap?.canPlacePoint();}
 function notify(text){feedback.textContent=text;}
 function setMode(next){
  mode=next;
  pin.setAttribute('aria-pressed',String(mode==='pin'));street.setAttribute('aria-pressed',String(mode==='street'));
  $('mapFrame').classList.toggle('control-place-point',Boolean(mode));
 }
 function makeLink(url,label){
  const link=document.createElement('a');
  link.href=url;link.textContent=label;link.target='_blank';link.rel='noopener noreferrer';
  return link;
 }
 function coordinateText(point){return point.lat.toFixed(7)+', '+point.lng.toFixed(7);}
 function pointUrl(point){
  const url=new URL('https://www.google.com/maps/search/');
  url.searchParams.set('api','1');url.searchParams.set('query',coordinateText(point));return url.href;
 }
 function popupContent(point,type,onRemove){
  const panel=document.createElement('div'),title=document.createElement('strong'),coordinates=document.createElement('p'),actions=document.createElement('div'),remove=document.createElement('button');
  title.textContent=type==='pin'?'Ponto marcado':'Ponto do Street View';coordinates.textContent=coordinateText(point);
  actions.className='control-location-actions';
  remove.type='button';remove.textContent='Remover';remove.onclick=onRemove;
  const link=type==='pin'?makeLink(pointUrl(point),pinTitle):makeLink(CampoStreetView.url(point),streetTitle);
  actions.append(link,remove);panel.append(title,coordinates,actions);return {panel,link};
 }
 function renderMarker(point,type,openStreet=false){
  const isPin=type==='pin',active=isPin?marker:viewpoint;
  const icon=L.divIcon({className:'control-location-marker '+type,html:icons[type],iconSize:[26,35],iconAnchor:[13,34],popupAnchor:[0,-34]});
  const mark=active||L.marker(point,{icon,draggable:true,pane:'controlPhotos',title:isPin?'Alfinete arrastável':'Boneco do Street View',zIndexOffset:950,bubblingMouseEvents:false}).addTo(map);
  if(isPin)marker=mark;else viewpoint=mark;
  mark.setLatLng(point);
  const remove=()=>{mark.remove();if(isPin)marker=null;else viewpoint=null;};
  const {panel,link}=popupContent(point,type,remove);
  if(active)mark.setPopupContent(panel);else{
   mark.bindPopup(panel);
   let beforeDrag=point;
   mark.on('dragstart',()=>{beforeDrag=mark.getLatLng();});
   mark.on('dragend',()=>{
    if(allowed())place(type,mark.getLatLng());
    else mark.setLatLng(beforeDrag);
   });
  }
  mark.openPopup();
  if(openStreet&&navigator.onLine)link.click();
 }
 function place(type,position){
  if(!allowed()){setMode(null);notify('Conclua a seleção em andamento no mapa antes de marcar um ponto.');return;}
  const point=CampoStreetView.coordinate(position);
  if(!point)return;
  setMode(null);
  renderMarker(point,type,type==='street');
  if(type==='street')notify(navigator.onLine?'Use o link no ponto se o Google Maps não abrir.':'Conecte-se e use o link no ponto para ver a rua.');
  else notify('');
 }
 function wire(button,type,label){
  button.innerHTML=icons[type]+'<span>'+label+'</span>';
  button.disabled=true;
  button.onclick=()=>{
   if(!allowed()){notify('Conclua a seleção em andamento no mapa antes de usar esta ferramenta.');return;}
   setMode(mode===type?null:type);
   notify(!mode?'':type==='pin'?'Clique no mapa ou arraste o alfinete até o ponto.':'Arraste o boneco até a rua ou clique no local desejado.');
  };
  button.addEventListener('pointerdown',event=>{
   if(event.button!==0||!allowed())return;
   drag={button,type,id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
   button.setPointerCapture?.(event.pointerId);
  });
  button.addEventListener('pointermove',event=>{
   if(drag?.button!==button||drag.id!==event.pointerId)return;
   if(!drag.moved&&Math.hypot(event.clientX-drag.x,event.clientY-drag.y)<8)return;
   if(!drag.moved)ghost.innerHTML=icons[type];
   drag.moved=true;ghost.hidden=false;ghost.style.left=event.clientX+'px';ghost.style.top=event.clientY+'px';
  });
  button.addEventListener('pointerup',event=>{
   if(drag?.button!==button||drag.id!==event.pointerId)return;
   const moved=drag.moved;drag=null;ghost.hidden=true;
   if(!moved)return;
   // Suppress the synthetic button click after dropping, while preserving keyboard activation.
   button.addEventListener('click',e=>{if(e.detail>0)e.stopImmediatePropagation();},{capture:true,once:true,signal:AbortSignal.timeout(400)});
   const rect=map.getContainer().getBoundingClientRect();
   if(!CampoStreetView.inside(event.clientX,event.clientY,rect)){notify('Solte a ferramenta dentro do mapa.');return;}
   place(type,map.mouseEventToLatLng(event));
  });
  const cancelDrag=()=>{if(drag?.button===button){drag=null;ghost.hidden=true;}};
  button.addEventListener('pointercancel',cancelDrag);
  button.addEventListener('lostpointercapture',cancelDrag);
 }
 wire(pin,'pin','Alfinete');wire(street,'street','Ver rua');
 function attachMap(instance){
  if(map===instance)return;
  map=instance;pin.disabled=street.disabled=false;
  map.getContainer().addEventListener('click',event=>{
   if(!mode||event.target.closest?.('.leaflet-control, .leaflet-popup')||map.dragging?.moved?.())return;
   if(!allowed()){setMode(null);notify('Conclua a seleção em andamento no mapa.');return;}
   event.stopImmediatePropagation();event.preventDefault();
   place(mode,map.mouseEventToLatLng(event));
  },true);
 }
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||(!mode&&!drag))return;
  const control=(mode||drag.type)==='pin'?pin:street;
  drag=null;ghost.hidden=true;setMode(null);notify('');control.focus();
 });
 window.addEventListener('campo-control-logout',()=>{
  setMode(null);notify('');drag=null;ghost.hidden=true;marker?.remove();viewpoint?.remove();marker=viewpoint=null;
 });
 window.CampoGestaoLocalizar={attachMap};
 window.CampoControlMap?.onAvailable?.(attachMap);
})();
