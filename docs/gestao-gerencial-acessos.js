'use strict';
(()=>{
 const root=document.getElementById('acessosGerenciais');
 const list=document.getElementById('gerencialAccessRows');
 const status=document.getElementById('gerencialAccessStatus');
 const refresh=document.getElementById('gerencialAccessRefresh');
 const more=document.getElementById('gerencialAccessMore');
 const format=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Rio_Branco',dateStyle:'short',timeStyle:'medium'});
 let next=null,generation=0;

 async function load(append=false){
  if(!window.CampoControl?.authorized())return;
  const request=++generation;
  refresh.disabled=more.disabled=true;
  status.textContent='Consultando acessos…';
  try{
   const query=append&&next?'?before='+encodeURIComponent(next):'';
   const page=await window.CampoControl.api('/api/admin/gerencial/acessos'+query);
   if(request!==generation||!window.CampoControl.authorized())return;
   if(!append)list.replaceChildren();
   for(const access of page.items){
    const row=list.insertRow();
    for(const value of [access.email,format.format(new Date(access.entrou_em)),access.saiu_em?format.format(new Date(access.saiu_em)):'—'])row.insertCell().textContent=value;
   }
   next=page.next;
   more.hidden=!next;
   status.textContent=list.rows.length?'':'Nenhum acesso gerencial registrado.';
  }catch(error){
   if(request===generation)status.textContent=error.message;
  }finally{
   if(request===generation)refresh.disabled=more.disabled=false;
  }
 }
 root.addEventListener('toggle',()=>{if(root.open)void load();});
 refresh.onclick=()=>void load();
 more.onclick=()=>void load(true);
 window.addEventListener('campo-control-logout',()=>{
  generation++;
  list.replaceChildren();
  more.hidden=true;
  status.textContent='';
  root.open=false;
 });
})();
