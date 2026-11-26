'use strict';
(()=>{
 const build=document.querySelector('meta[name="campo-management-build"]')?.content;
 const button=document.getElementById('managementUpdate');
 if(!build||!button)return;
 let checking=false,lastCheck=0;
 async function check(){
  if(checking||document.hidden||!navigator.onLine||Date.now()-lastCheck<10000)return;
  checking=true;
  lastCheck=Date.now();
  try{
   const response=await fetch('/gestao-release.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
   if(!response.ok)return;
   const release=await response.json();
   if(/^[a-f0-9]{20}$/.test(release.build)&&release.build!==build)button.hidden=false;
  }catch{/* The panel stays usable during a connection failure. */}
  finally{checking=false;}
 }
 button.onclick=async()=>{
  if(button.disabled)return;
  button.disabled=true;
  try{
   if(window.CampoControl?.updateBusy()||window.CampoRoutePlanner?.updateBusy()||document.querySelector('dialog[open]'))throw Error('Conclua a ação em andamento antes de atualizar.');
   if(await window.CampoGestaoFotos?.prepareReload()===false)return;
   location.reload();
  }catch(error){window.alert(error.message);}
  finally{button.disabled=false;}
 };
 setInterval(()=>void check(),60000);
 window.addEventListener('online',check);
 window.addEventListener('focus',check);
 document.addEventListener('visibilitychange',check);
 void check();
})();
