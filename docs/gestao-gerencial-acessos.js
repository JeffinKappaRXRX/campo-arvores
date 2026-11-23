'use strict';
(()=>{
 const root=document.getElementById('acessosGerenciais');
 const form=document.getElementById('gerencialInspectorForm'),choices=document.getElementById('gerencialInspectorChoices'),notice=document.getElementById('gerencialInspectorStatus');
 const submit=form.querySelector('button');
 const teamForm=document.getElementById('gerencialTeamCreate'),teamLinks=document.getElementById('gerencialTeamLinks');
 const showNames=document.getElementById('gerencialShowNames'),teamStatus=document.getElementById('gerencialTeamStatus');
 const teamSubmit=teamForm.querySelector('button'),teamPath='/api/admin/gerencial/equipes';
 let activeAccounts=[],teamState=null,configGeneration=0;
 function renderTeams(){
  if(!teamState||!window.CampoControl.authorized())return;
  const assignments=new Map(teamState.members.map(row=>[row.userId,row.teamId]));
  teamLinks.replaceChildren();
  for(const account of activeAccounts){
   const row=teamLinks.insertRow(),select=document.createElement('select');
   row.insertCell().textContent=account.name;
   select.setAttribute('aria-label','Equipe de '+account.name);
   select.add(new Option('Sem equipe',''));
   for(const team of teamState.teams)select.add(new Option(team.name,team.id));
   select.value=assignments.get(account.id)||'';
   select.onchange=async()=>{
    const generation=configGeneration,previous=teamState.members.find(member=>member.userId===account.id)?.teamId||'';
    select.disabled=true;
    try{
     const link=await window.CampoControl.api(teamPath,{action:'assign',userId:account.id,teamId:select.value||null});
     if(generation!==configGeneration||!window.CampoControl.authorized())return;
     teamState.members=teamState.members.filter(member=>member.userId!==account.id);
     if(link.teamId)teamState.members.push(link);
     teamStatus.textContent=link.teamId?'Equipe vinculada.':'Vínculo removido.';
     window.dispatchEvent(new Event('campo-gerencial-equipes'));
    }catch(error){
     if(generation===configGeneration){select.value=previous;teamStatus.textContent=error.message;}
    }finally{select.disabled=false;}
   };
   row.insertCell().append(select);
  }
  showNames.checked=teamState.showInspectorNames;
  teamSubmit.disabled=showNames.disabled=false;
 }
 async function loadTeams(turn){
  try{
   const state=await window.CampoControl.api(teamPath);
   if(turn!==configGeneration||!window.CampoControl.authorized())return;
   teamState=state;renderTeams();
  }catch(error){if(turn===configGeneration)teamStatus.textContent=error.message;}
 }
 teamForm.onsubmit=async event=>{
  event.preventDefault();
  const turn=configGeneration;
  teamSubmit.disabled=true;
  try{
   const {team}=await window.CampoControl.api(teamPath,{action:'create',name:teamForm.elements.teamName.value});
   if(turn!==configGeneration||!window.CampoControl.authorized())return;
   teamForm.reset();
   teamStatus.textContent='Equipe '+team.name+' criada.';
   await loadTeams(turn);
   window.dispatchEvent(new Event('campo-gerencial-equipes'));
  }catch(error){if(turn===configGeneration)teamStatus.textContent=error.message;}
  finally{if(turn===configGeneration)teamSubmit.disabled=!window.CampoControl.authorized();}
 };
 showNames.onchange=async()=>{
  const turn=configGeneration,wanted=showNames.checked;
  showNames.disabled=true;
  try{
   const result=await window.CampoControl.api(teamPath,{action:'visibility',showInspectorNames:wanted});
   if(turn!==configGeneration||!window.CampoControl.authorized())return;
   teamState.showInspectorNames=result.showInspectorNames;
   teamStatus.textContent=wanted?'Nomes exibidos na visão gerencial.':'Visão gerencial atualizada com os nomes das equipes.';
  }catch(error){
   if(turn===configGeneration){showNames.checked=!wanted;teamStatus.textContent=error.message;}
  }finally{if(turn===configGeneration)showNames.disabled=!window.CampoControl.authorized();}
 };
 async function inspectors(){
  const turn=++configGeneration;
  try{
   const {accounts,enabled}=await window.CampoControl.api('/api/admin/gerencial/inspetores');
   if(turn!==configGeneration||!window.CampoControl.authorized())return;
   activeAccounts=accounts;
   void loadTeams(turn);
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
 const linkPath='/api/admin/gerencial/link';
 const generate=document.getElementById('gerencialLinkGenerate'),revoke=document.getElementById('gerencialLinkRevoke');
 const output=document.getElementById('gerencialLinkOutput'),linkValue=document.getElementById('gerencialLinkValue');
 const linkStatus=document.getElementById('gerencialLinkStatus');
 let linkEnabled=false,linkBusy=false;
 async function manageLink(action){
  if(linkBusy||!window.CampoControl?.authorized())return;
  if(action&&(action==='revoke'||linkEnabled)&&!confirm('O link atual e as sessões abertas por ele perderão acesso. Continuar?'))return;
  linkBusy=true;
  generate.disabled=revoke.disabled=true;
  try{
   const response=await window.CampoControl.api(linkPath,action?{action}:undefined);
   if(!window.CampoControl.authorized())return;
   linkEnabled=response.enabled;
   if(response.fragment){
    const url=new URL('/consulta-arbora.html',location.origin);
    url.hash=response.fragment;
    linkValue.value=url.href;
    output.hidden=false;
   }else if(!linkEnabled){linkValue.value='';output.hidden=true;}
   linkStatus.textContent=linkEnabled?'Link ativo. A administração vê o horário e um identificador da rede de cada acesso.':'Nenhum link ativo.';
  }catch(error){linkStatus.textContent=error.message;}
  finally{
   linkBusy=false;
   if(window.CampoControl.authorized()){generate.disabled=false;revoke.disabled=!linkEnabled;}
  }
 }
 generate.onclick=()=>void manageLink('rotate');
 revoke.onclick=()=>void manageLink('revoke');
 document.getElementById('gerencialLinkCopy').onclick=async()=>{
  try{await navigator.clipboard.writeText(linkValue.value);linkStatus.textContent='Link copiado.';}
  catch{linkValue.select();linkStatus.textContent='Copie o link selecionado.';}
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
    for(const value of ['#'+access.id+' · '+access.email,format.format(new Date(access.entrou_em)),access.saiu_em?format.format(new Date(access.saiu_em)):'—'])row.insertCell().textContent=value;
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
 root.addEventListener('toggle',()=>{if(root.open&&window.CampoControl?.authorized()){void load();void inspectors();void manageLink();}});
 refresh.onclick=()=>void load();
 more.onclick=()=>void load(true);
 window.addEventListener('campo-control-logout',()=>{
  generation++;configGeneration++;activeAccounts=[];teamState=null;
  teamLinks.replaceChildren();teamForm.reset();showNames.checked=false;showNames.disabled=teamSubmit.disabled=true;teamStatus.textContent='';
  list.replaceChildren();
  linkValue.value='';output.hidden=true;linkStatus.textContent='';generate.disabled=revoke.disabled=true;linkEnabled=false;
  choices.replaceChildren();submit.disabled=true;notice.textContent='';
  more.hidden=true;
  status.textContent='';
  root.open=false;
 });
})();
