'use strict';
(()=>{
 const build=document.querySelector('meta[name="arbora-release"]')?.content;
 if(!build)return;
 const button=document.getElementById('managementUpdate'),status=document.getElementById('managementUpdateStatus');
 let lastCheck=0,checking=false,applying=false,nextBuild='';
 function message(text){status.textContent=text;status.hidden=!text;}
 async function check(){
  if(checking||applying||document.hidden||!navigator.onLine||Date.now()-lastCheck<15000)return;
  checking=true;
  lastCheck=Date.now();
  try{
   const response=await fetch('./release-gestao.json',{cache:'no-store'});
   if(!response.ok)return;
   const release=await response.json();
   if(!/^[a-f0-9]{20}$/.test(release.build))return;
   const latest=release.build===build?'':release.build;
   if(nextBuild===latest)return;
   nextBuild=latest;
   button.hidden=!nextBuild;
   message(nextBuild?'Atualização disponível. Selecione Atualizar agora para aplicar.':'');
  }catch{/* The current release remains usable. */}
  finally{checking=false;}
 }
 button.onclick=async()=>{
  if(applying||!nextBuild)return;
  applying=true;
  button.disabled=true;
  try{
   if(document.querySelector('dialog[open]')||window.CampoControl?.updateBusy()||window.CampoRoutePlanner?.updateBusy())throw Error('Finalize a operação em andamento antes de atualizar.');
   await window.CampoGestaoFotos?.prepareUpdate();
   const url=new URL(location.href);
   url.searchParams.set('versao',nextBuild);
   location.replace(url);
  }catch(error){
   applying=false;
   button.disabled=false;
   message(error.message);
  }
 };
 setInterval(check,60000);
 window.addEventListener('online',check);
 window.addEventListener('focus',check);
 document.addEventListener('visibilitychange',check);
 void check();
})();
