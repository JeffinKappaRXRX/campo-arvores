'use strict';
(()=>{
 const $=id=>document.getElementById(id);
 const startButton=$('desktopMapPick'),tools=$('desktopMapTools'),prompt=$('desktopMapPrompt');
 if(!startButton||!tools)return;
 const measure=$('desktopMapMeasure'),distance=$('desktopMapDistance'),use=$('desktopMapUse');
 const frame=$('mapFrame'),mapPanel=$('mapa');
 let map,enabled=false,mode=null,point=null,pin=null,ruler=null,points=[];
 const form=()=>window.CampoGestaoFotos;
 const send=data=>form()?.sendToForm(data);
 const permitted=()=>enabled&&map&&window.CampoControlMap?.canPlacePoint();
 const coordinate=value=>{
  const lat=value?.lat,lon=value?.lon??value?.lng;
  return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
 };
 function paintPin(){
  if(!enabled||!map||!point){pin?.remove();pin=null;return;}
  if(pin){pin.setLatLng([point.lat,point.lon]);return;}
  const icon=L.divIcon({className:'desktop-draft-marker',html:'＋',iconSize:[25,25],iconAnchor:[12,12]});
  pin=L.marker([point.lat,point.lon],{pane:'controlPhotos',icon,draggable:true,title:'Posição da árvore em cadastro',bubblingMouseEvents:false}).addTo(map);
  pin.on('dragend',()=>{
   const next=coordinate(pin.getLatLng());
   if(permitted()&&next&&send({type:'map-position',point:next}))point=next;
   paintPin();
  });
 }
 function paintMeasure(){
  measure.hidden=mode!=='distance';
  const metres=points.length===2?map.distance(points[0],points[1]):0;
  distance.textContent=metres>0?metres.toLocaleString('pt-BR',{maximumFractionDigits:2})+' m':'';
  use.disabled=!(metres>0);
  return metres;
 }
 function setMode(next){
  mode=next;
  tools.hidden=!next;
  startButton.setAttribute('aria-pressed',String(next==='position'));
  frame.classList.toggle('desktop-capture-active',Boolean(next));
  paintMeasure();
 }
 function resetMeasure(){
  points=[];ruler?.remove();ruler=null;paintMeasure();
  prompt.textContent='Clique no ponto A, de onde você mede.';
 }
 function cancel(){
  if(mode==='distance')send({type:'map-distance'});
  resetMeasure();setMode(null);
 }
 function begin(next){
  if(!permitted()||!form()?.formReady()){
   const message='Aguarde o formulário ou conclua a outra seleção no mapa.';
   send({type:'map-feedback',message});
   if(next==='distance')send({type:'map-distance'});
   return;
  }
  if(mode)cancel();
  window.CampoGestaoLocalizar?.cancelPicking();
  setMode(next);
  if(next==='position')prompt.textContent='Clique no mapa para marcar a árvore. Arraste o marcador para ajustar.';
  else resetMeasure();
  mapPanel.scrollIntoView({block:'start'});
 }
 function click(event){
  if(!mode||event.target.closest?.('.leaflet-control,.leaflet-popup')||map.dragging?.moved?.())return;
  if(!permitted()){cancel();return;}
  const chosen=coordinate(map.mouseEventToLatLng(event));
  if(!chosen)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(mode==='position'){
   if(send({type:'map-position',point:chosen})){point=chosen;paintPin();}
   setMode(null);return;
  }
  if(points.length===2)return;
  points.push({lat:chosen.lat,lng:chosen.lon});
  if(!ruler)ruler=L.layerGroup().addTo(map);
  L.circleMarker(points.at(-1),{pane:'controlPhotos',radius:6,color:'#ffc64d',weight:3,interactive:false})
   .bindTooltip(points.length===1?'A':'B',{permanent:true,direction:'top'}).addTo(ruler);
  if(points.length===2)L.polyline(points,{pane:'controlPhotos',color:'#ffc64d',weight:3,dashArray:'7 5',interactive:false}).addTo(ruler);
  prompt.textContent=points.length===1?'Agora clique no ponto B, na base da árvore.':'Confira a distância ou refaça a medida.';
  paintMeasure();
 }
 startButton.onclick=()=>mode==='position'?cancel():begin('position');
 $('desktopMapCancel').onclick=cancel;
 $('desktopMapReset').onclick=resetMeasure;
 use.onclick=()=>{
  const metres=paintMeasure();
  if(metres>0&&send({type:'map-distance',metres,points})) {resetMeasure();setMode(null);}
 };
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&mode)cancel();});
 window.CampoGestaoCadastroMapa={
  attachMap(instance){if(map===instance)return;map=instance;map.getContainer().addEventListener('click',click,true);paintPin();},
  active:()=>Boolean(mode),cancel,
  setEnabled(value){
   enabled=value;startButton.hidden=!value;
   if(!value){resetMeasure();setMode(null);}
   paintPin();
  },
  fromForm(data){
   if(data.type==='draft-position'){point=coordinate(data.point);paintPin();}
   if(data.type==='focus-position'&&enabled&&map){
    const focus=coordinate(data.point);
    if(focus)map.setView([focus.lat,focus.lon],Math.max(map.getZoom(),18),{animate:false});
   }
   if(data.type==='pick-position')begin('position');
   if(data.type==='measure-on-map')begin('distance');
  }
 };
 window.addEventListener('campo-control-logout',()=>{point=null;paintPin();});
})();
