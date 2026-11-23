'use strict';
(()=>{
 const root=document.getElementById('acessosGerenciais');
 const form=document.getElementById('gerencialInspectorForm'),choices=document.getElementById('gerencialInspectorChoices'),notice=document.getElementById('gerencialInspectorStatus');
 const submit=form.querySelector('button');
 async function inspectors(){
  try{
   const {accounts,enabled}=await window.CampoControl.api('/api/admin/gerencial/inspetores');
   if(!window.CampoControl.authorized())return;
   const selected=new Set(enabled.map(account=>account.id));
   choices.replaceChildren(...accounts.map(account=>{
    const label=document.createElement('label'),input=document.createElement('input');
    input.type='checkbox';input.value=account.id;input.checked=selected.has(account.id);
    label.append(input,' '+account.name);return label;
   }));
   submit.disabled=false;notice.textContent='';
  }catch(error){notice.textContent=error.message;}
 }
 form.onsubmit=async event=>{
  event.preventDefault();submit.disabled=true;
  try{
   const ids=[...choices.querySelectorAll('input:checked')].map(input=>input.value);
   await window.CampoControl.api('/api/admin/gerencial/inspetores',{ids});
   if(window.CampoControl.authorized())notice.textContent='Seleção aplicada à consulta gerencial.';
  }catch(error){notice.textContent=error.message;}
  finally{submit.disabled=!window.CampoControl.authorized();}
 };
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
 root.addEventListener('toggle',()=>{if(root.open&&window.CampoControl?.authorized()){void load();void inspectors();}});
 refresh.onclick=()=>void load();
 more.onclick=()=>void load(true);
 window.addEventListener('campo-control-logout',()=>{
  generation++;
  list.replaceChildren();
  choices.replaceChildren();submit.disabled=true;notice.textContent='';
  more.hidden=true;
  status.textContent='';
  root.open=false;
 });
})();
