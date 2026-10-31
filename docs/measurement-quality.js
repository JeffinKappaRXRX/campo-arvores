'use strict';
let angleSamples=[],angleZero=0,angleCaptureQuality={},lastAngleAt=0,pendingAngleCapture=null,angleCaptureTimer=null;
function cancelAngleCapture(){if(angleCaptureTimer!==null)clearTimeout(angleCaptureTimer);angleCaptureTimer=null;if(pendingAngleCapture){const b=$(pendingAngleCapture.button);b.disabled=false;b.textContent=pendingAngleCapture.label;}pendingAngleCapture=null;}
function resetAngleSamples(cancel=true){angleSamples=[];lastAngleAt=0;liveAngle=null;if(cancel)cancelAngleCapture();}
function median(values){return CampoClinometer.median(values);}
function angleWindowQuality(samples,now=performance.now()){return CampoClinometer.quality(samples,now);}
function commitAngleCapture(input,button,quality){
 const angle=quality.angle-angleZero;if(Math.abs(angle)>=85){cancelAngleCapture();$('sensorinfo').textContent='Inclinação excessiva. Afaste-se para reduzir o ângulo da visada.';return;}
 cancelAngleCapture();if(input==='baseangle')invalidateGroundDistance();$(input).value=angle.toFixed(2);angleCaptureQuality[input]={spread:quality.spread,samples:quality.samples,rejected:quality.rejected||0,zeroOffset:angleZero,capturedAt:new Date().toISOString()};
 $(button).textContent=(input==='baseangle'?'Base: ':'Topo: ')+angle.toFixed(2)+'° ✓';$('sensorinfo').textContent=(input==='baseangle'?'Base':'Topo')+' capturado. '+(input==='baseangle'?'Mire agora o topo.':'Confira o resultado.')+' Mantenha a mesma posição de medição.';resetAngleSamples();calc();
}
function processAngleSample(e){
 if(!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
 const direction=Number(screen.orientation?.angle??window.orientation??0),roll=CampoClinometer.screenRoll(e.beta,e.gamma,direction);
 if(roll===null||Math.abs(roll)>15){resetAngleSamples(false);$('anglelive').textContent='Nivele lateralmente a mira';return;}
 const raw=CampoClinometer.elevation(e.beta,e.gamma),now=performance.now();if(raw===null||angleSamples.length&&now-angleSamples.at(-1).at<35)return;
 angleSamples.push({value:raw,at:now});angleSamples=angleSamples.filter(s=>now-s.at<=1600);lastAngleAt=now;
 const quality=angleWindowQuality(angleSamples,now);liveAngle=quality?quality.angle-angleZero:null;
 $('anglelive').textContent=(quality?liveAngle:raw-angleZero).toFixed(2)+'° · '+(quality?'estável':'estabilizando a mira');
 $('sensorinfo').textContent=quality?'Mire na base ou no topo e capture. A ampliação ajuda a posicionar a mira.':'Segure a mira imóvel. Aceita aparelho em pé ou deitado, com a tela nivelada.';
 if(pendingAngleCapture){const pending=pendingAngleCapture,fresh=angleWindowQuality(angleSamples.filter(s=>s.at>=pending.started),now);$('sensorinfo').textContent='Capturando '+(pending.input==='baseangle'?'base':'topo')+'… mantenha a mira imóvel.';if(fresh)commitAngleCapture(pending.input,pending.button,fresh);}
}
function captureStableAngle(input,button){
 if(!stream){$('sensorinfo').textContent='Ative a câmera traseira para capturar a inclinação. Ângulos manuais continuam disponíveis.';return;}
 const quality=angleWindowQuality(angleSamples);if(quality){commitAngleCapture(input,button,quality);return;}
 cancelAngleCapture();pendingAngleCapture={input,button,label:$(button).textContent,started:performance.now()};$(button).disabled=true;$(button).textContent='Estabilizando…';$('sensorinfo').textContent='Mantenha a mira na '+(input==='baseangle'?'base':'copa')+'. A captura ocorrerá ao estabilizar.';
 angleCaptureTimer=setTimeout(()=>{cancelAngleCapture();$('sensorinfo').textContent='Não estabilizou a tempo. Apoie o aparelho, aproxime-se ou use ângulos manuais.';},5000);
}
function groundDistance(cameraHeight,baseAngle){if(!Number.isFinite(cameraHeight)||cameraHeight<.3||cameraHeight>3||!Number.isFinite(baseAngle)||baseAngle> -5||baseAngle< -75)return null;return cameraHeight/Math.tan(-baseAngle*Math.PI/180);}
$('estimateGroundDistance').onclick=()=>{
 const h=$('cameraHeight').value===''?NaN:Number($('cameraHeight').value),b=$('baseangle').value===''?NaN:Number($('baseangle').value),d=groundDistance(h,b);
 if(d===null){$('groundDistanceStatus').textContent='Informe a altura da câmera e capture a base entre −5° e −75°. Perto do horizonte, a estimativa fica muito sensível ao ângulo.';return;}
 $('distance').value=d.toFixed(2);distanceMeasurement={method:'ground_angle_estimate',horizontalDistance:d,cameraHeight:h,baseAngle:b,assumptions:['level_ground','base_same_ground_level'],measuredAt:new Date().toISOString(),validated:false};$('distanceMethod').textContent='Distância estimada pelo ângulo da base e altura da câmera. Válida somente em terreno plano.';$('groundDistanceStatus').textContent=d.toFixed(2)+' m estimados. Confira a altura da câmera e refaça se mudou de posição.';calc();
};
function refreshMeasurementQuality(h){
 const b=$('baseangle').value===''?NaN:Number($('baseangle').value),t=$('topangle').value===''?NaN:Number($('topangle').value),d=$('distance').value===''?NaN:Number($('distance').value);
 if(h===null){$('measurementQuality').textContent=Number.isFinite(b)&&Number.isFinite(t)&&Number.isFinite(d)&&d>0?'Confira as visadas: o topo precisa ficar acima da base. Para um alvo muito pequeno ou distante, aproxime-se e refaça.':'';return;}
 const change=CampoClinometer.sensitivity(d,b,t),sensitivity=Number.isFinite(change)?' Variação de ±0,5° nas duas visadas pode alterar a altura em cerca de '+change.toFixed(2)+' m.':'';
 $('measurementQuality').textContent=(t-b<1||change/h>.25?'Visadas pouco separadas: aproxime-se ou confira por outro método.':Math.max(Math.abs(b),Math.abs(t))>65?'Ângulo elevado: afaste-se e repita.':'Altura estimada; confira distância e visadas.')+sensitivity+' Isso é sensibilidade geométrica, não precisão certificada.';
}
$('calibrateAngle').onclick=()=>{const q=angleWindowQuality(angleSamples);if(!stream||!q||Math.abs(q.angle)>15){$('angleCalibrationStatus').textContent='Ative a câmera, mire uma referência realmente horizontal e segure imóvel. Correção limitada a 15°.';return;}angleZero=q.angle;angleCaptureQuality={};resetHeightCaptures();resetAngleSamples();$('angleCalibrationStatus').textContent='Zero ajustado em '+angleZero.toFixed(2)+'°. Refaça base e topo.';};
$('resetAngleCalibration').onclick=()=>{angleZero=0;angleCaptureQuality={};resetHeightCaptures();resetAngleSamples();$('angleCalibrationStatus').textContent='Sem ajuste de zero nesta sessão.';};
$('repeatHeight').addEventListener('click',()=>{angleCaptureQuality={};});
for(const id of ['baseangle','topangle'])$(id).addEventListener('input',()=>{delete angleCaptureQuality[id];if(pendingAngleCapture?.input===id)cancelAngleCapture();});

function invalidateGroundDistance(){if(typeof distanceMeasurement!=='undefined'&&distanceMeasurement.method==='ground_angle_estimate'){$('distance').value='';distanceMeasurement={method:'manual'};$('distanceMethod').textContent='Base alterada. Estime novamente ou informe a distância.';}}
$('cameraHeight').addEventListener('input',()=>{invalidateGroundDistance();calc();});
$('baseangle').addEventListener('input',()=>{invalidateGroundDistance();calc();});

function resetCaptureQuality(){cancelAngleCapture();angleCaptureQuality={};resetAngleSamples(false);}
