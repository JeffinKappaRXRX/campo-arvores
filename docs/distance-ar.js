// Optional WebXR measurement. The manual distance field is always available.
let distanceMeasurement={method:'manual'}, arSession=null, arHitSource=null, arLatest=null, arStarting=false, arStage='idle', arTrace=[];
function traceAR(stage,message=''){arStage=stage;arTrace.push(new Date().toISOString()+' · '+stage+(message?' · '+message:''));if(arTrace.length>18)arTrace.shift();$('arDiagnostic').textContent=arTrace.join('\n');}
function horizontalAR(camera,target){
  if(!camera||!target||![camera.x,camera.y,camera.z,target.x,target.y,target.z].every(Number.isFinite))return null;
  const d=Math.hypot(target.x-camera.x,target.z-camera.z);
  return d>0.1&&d<100?d:null;
}
function stableAR(samples){
  if(samples.length<15)return false;
  const values=samples.map(s=>s.distance),mean=values.reduce((a,b)=>a+b,0)/values.length;
  if(samples.some(s=>s.target)){const centers=['x','y','z'].map(k=>samples.reduce((v,s)=>v+(s.target?.[k]??0),0)/samples.length);if(samples.some(s=>s.target&&Math.hypot(s.target.x-centers[0],s.target.y-centers[1],s.target.z-centers[2])>Math.max(.08,mean*.01)))return false;}return Math.max(...values)-Math.min(...values)<=Math.max(.08,mean*.015);
}
function groundARHit(camera,transform){if(!camera||!transform)return false;const p=transform.position,q=transform.orientation;return p&&q&&camera.y-p.y>.15&&1-2*(q.x*q.x+q.z*q.z)>.85;}
function arNotice(message){$('arSupport').textContent=message;}
async function checkARSupport(){
  $('startAR').disabled=true;
  if(!window.isSecureContext||!navigator.xr){arNotice('Medição AR indisponível neste aparelho/navegador. Informe a distância manualmente.');return false;}
  try{if(!await navigator.xr.isSessionSupported('immersive-ar')){arNotice('Este aparelho/navegador não oferece AR. A distância manual continua disponível.');return false;}
    $('startAR').disabled=false;arNotice('AR disponível para tentativa. O acesso à câmera e à detecção de superfícies será verificado ao iniciar.');return true;
  }catch(e){arNotice('Não foi possível verificar AR. Use a distância manual.');return false;}
}
function restoreAR(){
  try{arHitSource?.cancel();}catch{}arHitSource=null;arSession=null;arLatest=null;arStarting=false;
  $('arOverlay').hidden=true;$('arOverlay').classList.remove('ar-tracked');$('arAccept').disabled=true;$('beginAR').hidden=false;
  if(!$('measurement').open)$('measurement').showModal();
  $('startAR').disabled=false;
}
$('startAR').onclick=()=>{
  if(arSession||arStarting)return;
  stopCamera();$('measurement').close();$('arOverlay').hidden=false;$('arOverlay').classList.add('ar-preparing');$('arAccept').hidden=true;$('arAccept').disabled=true;$('beginAR').hidden=false;$('beginAR').disabled=false;
  $('arLive').textContent='Câmera comum liberada. Toque em Iniciar AR para autorizar a câmera de realidade aumentada.';
  traceAR('preparação','Câmera comum desligada. '+navigator.userAgent);
};
$('beginAR').onclick=async()=>{
  if(arSession||arStarting)return;
  arStarting=true;let session=null;
  $('beginAR').disabled=true;$('arCancel').disabled=true;$('arLive').textContent='Abrindo AR… aceite a permissão de câmera se o navegador solicitar.';
  traceAR('solicitar sessão');
  try{
    if(!navigator.xr)throw Error('AR indisponível');
    // Request directly from this button gesture; feature support is enforced here.
    const request=navigator.xr.requestSession('immersive-ar',{requiredFeatures:['local','hit-test','dom-overlay'],domOverlay:{root:$('arOverlay')}});
    session=await request;arSession=session;traceAR('sessão aberta');
    session.addEventListener('end',restoreAR,{once:true});
    if(!session.domOverlayState)throw Error('Controles de AR indisponíveis');
    $('arOverlay').hidden=false;$('arOverlay').classList.remove('ar-preparing');$('beginAR').hidden=true;$('arAccept').hidden=false;$('arLive').textContent='Mova suavemente o aparelho para reconhecer o chão; depois mire a base da árvore.';
    traceAR('inicializar renderização');const canvas=document.createElement('canvas'),gl=canvas.getContext('webgl',{alpha:true,xrCompatible:true});
    if(!gl||typeof XRWebGLLayer==='undefined')throw Error('Renderização AR indisponível');
    await gl.makeXRCompatible();const layer=new XRWebGLLayer(session,gl);session.updateRenderState({baseLayer:layer});
    traceAR('inicializar rastreamento');const space=await session.requestReferenceSpace('local'),viewer=await session.requestReferenceSpace('viewer');
    arHitSource=await session.requestHitTestSource({space:viewer});
    traceAR('buscar superfície');let samples=[],lastTime=0,lastTarget=null,firstHit=false;const searchStart=performance.now();
    function frame(time,xrFrame){
      if(arSession!==session)return;
      try{
      gl.bindFramebuffer(gl.FRAMEBUFFER,layer.framebuffer);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      const pose=xrFrame.getViewerPose(space),hit=xrFrame.getHitTestResults(arHitSource)[0],point=hit?.getPose(space);
      const ground=pose&&point&&groundARHit(pose.transform.position,point.transform);const d=pose&&!pose.emulatedPosition&&ground?horizontalAR(pose.transform.position,point.transform.position):null;
      if(d===null||session.visibilityState!=='visible'){
        samples=[];lastTarget=null;arLatest=null;$('arAccept').disabled=true;$('arOverlay').classList.remove('ar-tracked');$('arLive').textContent=performance.now()-searchStart>15000?'Nenhuma superfície detectada. Melhore a iluminação, mova suavemente o aparelho e mire o chão próximo. Você pode voltar ao manual.':point&&!ground?'Ponto detectado fora de uma superfície horizontal abaixo da câmera. Mire o chão, evitando cadeiras, paredes e objetos.':'1. Mire o chão perto dos seus pés. 2. Mova o celular devagar para os lados. 3. Aponte a base da árvore.';
      }else if(time-lastTime>80){
        if(!firstHit){firstHit=true;traceAR('superfície detectada');}lastTime=time;const target=point.transform.position;
        if(lastTarget&&Math.hypot(target.x-lastTarget.x,target.y-lastTarget.y,target.z-lastTarget.z)>.2)samples=[];
        lastTarget={x:target.x,y:target.y,z:target.z};samples.push({distance:d,target:{x:target.x,y:target.y,z:target.z}});if(samples.length>20)samples.shift();
        const stable=stableAR(samples);const mean=samples.reduce((v,s)=>v+s.distance,0)/samples.length;arLatest=stable?{distance:mean,spread:Math.max(...samples.map(s=>s.distance))-Math.min(...samples.map(s=>s.distance)),samples:samples.length,at:performance.now()}:null;$('arOverlay').classList.toggle('ar-tracked',stable);$('arAccept').disabled=!stable;
        $('arLive').textContent=(stable?mean:d).toFixed(2)+' m horizontal · '+(stable?'estável · confira o chão junto ao tronco':Math.min(samples.length,15)+'/15 · mantenha a mira no mesmo ponto');
      }
      session.requestAnimationFrame(frame);
      }catch(e){arLatest=null;$('arAccept').disabled=true;traceAR('erro no quadro',e.name+': '+e.message);$('arLive').textContent='Falha no rastreamento. Volte ao manual; o diagnóstico foi registrado.';arNotice('Falha no rastreamento: '+e.message+'. Use manual ou tente novamente.');}
    }
    session.requestAnimationFrame(frame);
  }catch(e){
    const failedStage=arStage;traceAR('falha',failedStage+' · '+e.name+': '+e.message);const reason=e.name==='NotAllowedError'?'Permissão recusada':e.name==='NotSupportedError'?'Aparelho/navegador sem os recursos necessários':e.message;
    if(session){try{await session.end();}catch{}if(arSession)restoreAR();}else restoreAR();
    arNotice(reason+' · etapa: '+failedStage+'. Use a distância manual. No Android, tente no Chrome e confira o Google Play Services for AR.');
  }finally{arStarting=false;$('arCancel').disabled=false;}
};
$('arAccept').onclick=async()=>{
  if(!arLatest||performance.now()-arLatest.at>500){$('arLive').textContent='Leitura perdida. Mire a base novamente.';return;}
  const value=arLatest.distance,quality={spread:arLatest.spread,samples:arLatest.samples};
  $('distance').value=value.toFixed(2);if(typeof resetHeightCaptures==='function')resetHeightCaptures();distanceMeasurement={method:'webxr_hit_test',horizontalDistance:value,stability:quality,measuredAt:new Date().toISOString(),validated:false};calc();
  $('distanceMethod').textContent='Distância estimada por AR. Mantenha a mesma posição para capturar base e topo. Confirme o ponto escolhido e valide com uma medida conhecida.';
  traceAR('distância aceita',value.toFixed(2)+' m');if(arSession)await arSession.end();
};
$('arCancel').onclick=async()=>{traceAR('voltar ao manual');if(arSession)await arSession.end();else restoreAR();};
$('arOverlay').addEventListener('beforexrselect',e=>e.preventDefault());
$('distance').addEventListener('input',()=>{distanceMeasurement={method:'manual'};$('distanceMethod').textContent='Distância informada manualmente.';});
$('measure').addEventListener('click',checkARSupport);
