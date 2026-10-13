'use strict';
let angleSamples=[],angleZero=0,angleCaptureQuality={},lastAngleAt=0;
function resetAngleSamples(){angleSamples=[];lastAngleAt=0;liveAngle=null;}
function median(values){const a=[...values].sort((x,y)=>x-y);return a.length?a[Math.floor(a.length/2)]:null;}
function angleWindowQuality(samples,now=performance.now()){
 const recent=samples.filter(s=>now-s.at<=1000);if(recent.length<8||now-recent[0].at<600||now-recent.at(-1).at>350)return null;
 const values=recent.map(s=>s.value),spread=Math.max(...values)-Math.min(...values);
 return spread<=.8?{angle:median(values),spread,samples:recent.length,at:now}:null;
}
function processAngleSample(e){
 if(!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
 const direction=screen.orientation?.angle??window.orientation??0;
 if(direction!==0||Math.abs(e.gamma)>10){resetAngleSamples();$('anglelive').textContent=direction!==0?'Mantenha o aparelho em pé':'Nivele lateralmente o aparelho';return;}
 const beta=e.beta*Math.PI/180,gamma=e.gamma*Math.PI/180,raw=Math.asin(Math.max(-1,Math.min(1,-Math.cos(beta)*Math.cos(gamma))))*180/Math.PI,now=performance.now();
 if(angleSamples.length&&now-angleSamples.at(-1).at<30)return;
 angleSamples.push({value:raw,at:now});angleSamples=angleSamples.filter(s=>now-s.at<=1000);lastAngleAt=now;
 const quality=angleWindowQuality(angleSamples,now);liveAngle=quality?quality.angle-angleZero:null;
 $('anglelive').textContent=(quality?liveAngle:raw-angleZero).toFixed(1)+'° · '+(quality?'estável · pode capturar':'segure imóvel por 1 s');
 $('sensorinfo').textContent=quality?'Mire exatamente na base ou no topo e capture. Mantenha a mesma posição.':'Estabilizando a inclinação; mantenha o aparelho imóvel e nivelado.';
}
function captureStableAngle(input,button){
 const quality=angleWindowQuality(angleSamples);if(!stream||!quality||liveAngle===null){$('sensorinfo').textContent='Captura bloqueada: ative a câmera e segure imóvel por 1 s. Ângulos manuais continuam disponíveis.';return;}
 if(input==='baseangle')invalidateGroundDistance();$(input).value=liveAngle.toFixed(2);angleCaptureQuality[input]={spread:quality.spread,samples:quality.samples,zeroOffset:angleZero,capturedAt:new Date().toISOString()};
 $(button).textContent=(input==='baseangle'?'Base: ':'Topo: ')+liveAngle.toFixed(1)+'° ✓';$('sensorinfo').textContent=(input==='baseangle'?'Base':'Topo')+' capturado. Continue sem mudar a posição do aparelho.';calc();
}
function groundDistance(cameraHeight,baseAngle){if(!Number.isFinite(cameraHeight)||cameraHeight<.3||cameraHeight>3||!Number.isFinite(baseAngle)||baseAngle> -5||baseAngle< -75)return null;return cameraHeight/Math.tan(-baseAngle*Math.PI/180);}
$('estimateGroundDistance').onclick=()=>{
 const h=$('cameraHeight').value===''?NaN:Number($('cameraHeight').value),b=$('baseangle').value===''?NaN:Number($('baseangle').value),d=groundDistance(h,b);
 if(d===null){$('groundDistanceStatus').textContent='Informe a altura da câmera e capture a base entre −5° e −75°. Perto do horizonte, a estimativa fica muito sensível ao ângulo.';return;}
 $('distance').value=d.toFixed(2);distanceMeasurement={method:'ground_angle_estimate',horizontalDistance:d,cameraHeight:h,baseAngle:b,assumptions:['level_ground','base_same_ground_level'],measuredAt:new Date().toISOString(),validated:false};$('distanceMethod').textContent='Distância estimada pelo ângulo da base e altura da câmera. Válida somente em terreno plano.';$('groundDistanceStatus').textContent=d.toFixed(2)+' m estimados. Confira a altura da câmera e refaça se mudou de posição.';calc();
};
function refreshMeasurementQuality(h){
 const b=Number($('baseangle').value),t=Number($('topangle').value);$('measurementQuality').textContent=h===null?'':Math.max(Math.abs(b),Math.abs(t))>65?'Ângulo elevado: pequenos erros de inclinação alteram bastante a altura. Afaste-se e repita.':distanceMeasurement?.method==='ground_angle_estimate'?'Estimativa depende da altura da câmera e de terreno plano. Confira antes de confirmar.':'Resultado estimado. Confira distância e visadas; estabilidade do sensor não garante exatidão.';
}
$('calibrateAngle').onclick=()=>{const q=angleWindowQuality(angleSamples);if(!stream||!q||Math.abs(q.angle)>15){$('angleCalibrationStatus').textContent='Ative a câmera, mire uma referência realmente horizontal e segure imóvel. Correção limitada a 15°.';return;}angleZero=q.angle;angleCaptureQuality={};resetHeightCaptures();resetAngleSamples();$('angleCalibrationStatus').textContent='Zero ajustado em '+angleZero.toFixed(2)+'°. Refaça base e topo.';};
$('resetAngleCalibration').onclick=()=>{angleZero=0;angleCaptureQuality={};resetHeightCaptures();resetAngleSamples();$('angleCalibrationStatus').textContent='Sem ajuste de zero nesta sessão.';};
$('repeatHeight').addEventListener('click',()=>{angleCaptureQuality={};});
for(const id of ['baseangle','topangle'])$(id).addEventListener('input',()=>{delete angleCaptureQuality[id];});

function invalidateGroundDistance(){if(typeof distanceMeasurement!=='undefined'&&distanceMeasurement.method==='ground_angle_estimate'){$('distance').value='';distanceMeasurement={method:'manual'};$('distanceMethod').textContent='Base alterada. Estime novamente ou informe a distância.';}}
$('cameraHeight').addEventListener('input',()=>{invalidateGroundDistance();calc();});
$('baseangle').addEventListener('input',()=>{invalidateGroundDistance();calc();});

function resetCaptureQuality(){angleCaptureQuality={};}
