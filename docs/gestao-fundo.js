'use strict';
(function(root){
 const sources={
  hybrid:['https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',19,'© Google'],
  satellite:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',18,'Imagens © Esri e parceiros'],
  streets:['https://tile.openstreetmap.org/{z}/{x}/{y}.png',19,'© OpenStreetMap contributors']
 };
 function controller(map,{layer,choice,online,status}){
  let front=null,pending=null,deadline=null,attempt=0;
  function cancel(){
   clearTimeout(deadline);
   pending?.remove();pending=null;
  }
  function start(original,key,tried){
   cancel();
   const token=++attempt,[url,native,attribution]=sources[key];
   const candidate=layer(url,{maxZoom:22,maxNativeZoom:native,keepBuffer:1,updateWhenIdle:true,
    updateWhenZooming:false,attribution,zIndex:2});
   pending=candidate;
   let ok=0,failed=0;
   const watching=()=>token===attempt&&(pending===candidate||front===candidate);
   function accepted(){
    if(!watching()||pending!==candidate)return;
    clearTimeout(deadline);
    if(front&&front!==candidate)front.remove();
    front=candidate;pending=null;candidate.setZIndex(1);
    status(key===original?'':key==='satellite'?'Híbrido instável. Imagem de satélite de reserva ativa.':'Imagem indisponível. Usando ruas de reserva.');
   }
   function unavailable(){
    if(!watching())return;
    clearTimeout(deadline);
    // Try only once per provider and keep any previously working layer until replacement draws.
    const next=['satellite','streets'].find(name=>!tried.includes(name)&&name!==key);
    if(next&&online()&&choice()===original){start(original,next,[...tried,key]);return;}
    cancel();
    status(front?'O provedor está indisponível nesta área. Mantendo o último fundo disponível.':'Fundo online indisponível. Rede e pontos continuam visíveis.');
   }
   candidate.on('loading',()=>{ok=failed=0;});
   candidate.on('tileload',()=>{if(!watching())return;ok++;});
   candidate.on('tileerror',()=>{if(watching())failed++;});
   candidate.on('load',()=>{
    if(!watching())return;
    if(ok&&ok>=failed)accepted();
    // Leaflet still accesses the candidate map after emitting load.
    else if(failed)queueMicrotask(unavailable);
   });
   deadline=setTimeout(()=>{if(ok)accepted();else unavailable();},8500);
   candidate.addTo(map);
  }
  function select(force=false){
   const selected=choice();
   if(selected==='local'){
    attempt++;cancel();front?.remove();front=null;
    status('Rede local ativa.');
    return;
   }
   if(!online()){
    attempt++;cancel();
    status('Sem internet. Rede e pontos continuam visíveis.');
    return;
   }
   if(!sources[selected]||pending&&!force)return;
   start(selected,selected,[]);
  }
  return {select,stop(){attempt++;cancel();front?.remove();front=null;}};
 }
 root.CampoGestaoFundo={controller};
 if(typeof module!=='undefined')module.exports={controller};
})(globalThis);
