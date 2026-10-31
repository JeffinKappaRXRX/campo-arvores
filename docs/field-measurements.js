'use strict';
let rulerReturnContext=null,heightCameraZoom=1;
const rulerUse=document.createElement('button');rulerUse.type='button';rulerUse.id='mapRulerUse';rulerUse.className='primary';rulerUse.textContent='Usar distância e voltar';rulerUse.hidden=true;rulerUse.disabled=true;
const rulerHelp=document.createElement('p');rulerHelp.id='mapRulerReturnHelp';rulerHelp.hidden=true;rulerHelp.textContent='A: posição de onde você mede. B: pé da árvore. Estimativa horizontal pelo mapa; confira os pontos.';
$('mapRulerPanel').append(rulerHelp,rulerUse);
function paintRulerReturn(distance){rulerUse.hidden=!rulerReturnContext;rulerHelp.hidden=!rulerReturnContext;rulerUse.disabled=!rulerReturnContext||!Number.isFinite(distance)||distance<=0;}
function openHeightRuler(){
 if(!fieldMap){$('sensorinfo').textContent='Aguarde o mapa preparar e tente novamente.';return;}
 rulerReturnContext={expanded:$('mapWorkspace').classList.contains('map-expanded'),camera:Boolean(stream),zoom:heightCameraZoom,scroll:document.querySelector('.height-review').scrollTop,pageY:window.scrollY,exitText:$('exitMap').textContent,coordinates:$('fullCoordinates').textContent,follow:typeof gpsFollow==='undefined'?false:gpsFollow};
 $('measurement').close();stopCamera();setMapFullscreen(true);$('mapWorkspace').classList.add('map-ruler-return');$('exitMap').textContent='Voltar à medição';$('fullCoordinates').textContent='Régua · distância horizontal';
 mapRulerState.points=[];rulerClearLayers();setMapRulerActive(true);$('mapRulerFinish').textContent='Voltar sem usar';paintRulerReturn(NaN);
}
function returnFromRuler(useDistance=false){
 const context=rulerReturnContext;if(!context)return false;
 const points=mapRulerState.points.map(p=>({...p})),distance=points.length===2?rulerDistanceMeters(...points):NaN;
 if(useDistance&&(!Number.isFinite(distance)||distance<=0))return true;
 rulerReturnContext=null;setMapRulerActive(false);$('mapWorkspace').classList.remove('map-ruler-return');setMapFullscreen(context.expanded);$('exitMap').textContent=context.exitText;$('fullCoordinates').textContent=context.coordinates;$('mapRulerFinish').textContent='Concluir';paintRulerReturn(NaN);
 if(useDistance){$('distance').value=distance.toFixed(2);$('distance').dispatchEvent(new Event('input',{bubbles:true}));distanceMeasurement={method:'map_ruler',horizontalDistance:distance,points,measuredAt:new Date().toISOString(),validated:false};$('distanceMethod').textContent='Distância horizontal estimada pela régua do mapa. Depende da posição de A e B; confira antes de confirmar a altura.';calc();}
 $('measurement').showModal();requestAnimationFrame(()=>{document.querySelector('.height-review').scrollTop=context.scroll;window.scrollTo({top:context.pageY,behavior:'auto'});});
 if(context.follow&&typeof setGPSFollow==='function')setGPSFollow(true);
 if(context.camera){Promise.resolve($('startcamera').onclick()).then(()=>{setHeightCameraZoom(context.zoom);});}
 return true;
}
$('distanceMapShortcut').onclick=openHeightRuler;rulerUse.onclick=()=>returnFromRuler(true);
async function rearHeightCamera(){
 const constraints={video:{facingMode:{exact:'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false};
 try{return await navigator.mediaDevices.getUserMedia(constraints);}catch(error){
  if(!['OverconstrainedError','ConstraintNotSatisfiedError','NotFoundError'].includes(error.name))throw error;
  const candidate=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  if(candidate.getVideoTracks()[0]?.getSettings?.().facingMode==='user'){candidate.getTracks().forEach(track=>track.stop());throw Error('O navegador selecionou a frontal. Use a câmera traseira para medir.');}return candidate;
 }
}
function setHeightCameraZoom(value){heightCameraZoom=Math.max(1,Math.min(4,Number(value)||1));$('video').style.transform='scale('+heightCameraZoom+')';$('video').style.transformOrigin='50% 50%';$('heightZoomValue').textContent=heightCameraZoom.toLocaleString('pt-BR')+'×';$('heightZoomOut').disabled=heightCameraZoom<=1;$('heightZoomIn').disabled=heightCameraZoom>=4;}
function resetHeightCameraZoom(){setHeightCameraZoom(1);}
$('heightZoomIn').onclick=()=>setHeightCameraZoom(heightCameraZoom+.5);$('heightZoomOut').onclick=()=>setHeightCameraZoom(heightCameraZoom-.5);
resetHeightCameraZoom();
