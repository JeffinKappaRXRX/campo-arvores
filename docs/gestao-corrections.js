'use strict';
(()=>{
 const $=id=>document.getElementById(id),panel=$('qualityAudit'),Q=window.CampoRegistrationQuality;
 if(!panel)return;
 const limit=50,selection=new Map(),rows=$('auditQualityRows'),pct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
 const statusLabels={pending:'Despachado',completed:'Concluído',cancelled:'Cancelado'};
 let page=0,data=null,controller=null,dispatchRows=[],sending=false,operationId=null;
 for(const key of Q.keys)$('auditIssue').add(new Option(Q.labels[key],key));
 const dialog=document.createElement('dialog');
 dialog.className='tree-history-dialog';
 dialog.innerHTML='<form id="auditDispatchForm"><h2>Voltar a campo</h2><p id="auditDispatchScope"></p><label>Inspetor responsável<select id="auditDispatchTo"></select></label><label>Orientação para o campo<textarea id="auditDispatchNote" maxlength="1000" rows="3"></textarea></label><p id="auditDispatchStatus" role="status"></p><div class="registration-toolbar"><button type="button" id="auditDispatchClose">Voltar</button><button type="submit" id="auditDispatchSend">Confirmar despacho</button></div></form>';
 document.body.append(dialog);
 function button(label,run){
  const el=document.createElement('button');el.type='button';el.textContent=label;el.onclick=run;return el;
 }
 function detail(parent,value){
  const el=document.createElement('small');el.className='registration-detail';el.textContent=value;parent.append(el);
 }
 function textCell(row,text){const cell=row.insertCell();cell.textContent=text;return cell;}
 function filterParams(){
  const params=window.CampoControl.mapParams();
  for(const key of ['bbox','zoom','page'])params.delete(key);
  if($('auditIssue').value)params.set('issue',$('auditIssue').value);
  if($('auditReturn').value)params.set('returnStatus',$('auditReturn').value);
  return params;
 }
 const canDispatch=item=>Boolean(item.coordinates&&item.task?.status!=='pending');
 function paintSelection(){
  for(const input of rows.querySelectorAll('input[type="checkbox"]'))input.checked=selection.has(input.value);
  $('auditDispatch').disabled=!selection.size;
  $('auditClear').disabled=!selection.size;
  $('auditSelection').textContent=selection.size?selection.size+' selecionados para despacho · até '+limit+' por lote.':'';
 }
 function paintRanking(ranking){
  const table=document.createElement('table'),head=table.createTHead().insertRow(),body=table.createTBody();
  for(const name of ['Inspetor','Cadastros','Sem fotos','Índice sem fotos','Fotos a confirmar','Com pendências']){
   const th=document.createElement('th');th.scope='col';th.textContent=name;head.append(th);
  }
  for(const item of ranking.slice(0,100)){
   const row=body.insertRow();
   for(const value of [item.inspector,item.total,item.counts.photos,pct.format(item.rate),item.counts.photoReview,item.flagged])textCell(row,value);
  }
  $('auditRanking').replaceChildren(table);
 }
 function paint(){
  rows.replaceChildren();
  if(!data)return;
  const {summary,dispatches,ranking}=data,leader=ranking[0];
  $('auditSummary').textContent=summary.total+' avaliados · '+summary.flagged+' com pendências · '+summary.counts.photos+' sem fotos · '+summary.counts.photoReview+' fotos a confirmar. '+
   dispatches.pending+' despachados · '+dispatches.completed+' concluídos.'+
   (leader?.counts.photos?' Maior índice sem fotos: '+leader.inspector+' · '+pct.format(leader.rate)+'.':'')+
   (!data.archive.available?' Inventário do Drive indisponível.':'');
  paintRanking(ranking);
  for(const item of data.items){
   const row=rows.insertRow(),check=textCell(row,''),input=document.createElement('input');
   input.type='checkbox';input.value=item.id;input.disabled=!canDispatch(item);
   input.setAttribute('aria-label','Selecionar árvore '+item.id);
   input.onchange=()=>{
    if(input.checked&&selection.size>=limit){input.checked=false;return;}
    if(input.checked)selection.set(item.id,item);else selection.delete(item.id);
    paintSelection();
   };
   check.append(input);
   if(!canDispatch(item))selection.delete(item.id);
   const point=textCell(row,item.species||'Árvore sem identificação');
   detail(point,[item.id,item.feeder,item.pole&&'Poste '+item.pole,item.span&&'Vão '+item.span].filter(Boolean).join(' · '));
   if(item.address)detail(point,item.address);
   detail(point,item.coordinates?item.coordinates.map(value=>value.toFixed(6)).join(', '):'Sem coordenadas válidas');
   const inspector=textCell(row,item.inspector||'Não identificado');
   if(item.day)detail(inspector,item.day.split('-').reverse().join('/'));
   const issues=textCell(row,item.issues.map(key=>Q.labels[key]).join(' · ')||'Sem pendências detectadas');
   if(item.task?.note)detail(issues,'Orientação: '+item.task.note);
   const task=textCell(row,statusLabels[item.task?.status]||'Sem despacho');
   if(item.task?.operator)detail(task,item.task.operator);
   if(item.task?.dispatchedAt)detail(task,new Date(item.task.dispatchedAt).toLocaleString('pt-BR',{timeZone:'America/Rio_Branco'}));
   if(item.task?.closedBy)detail(task,'Encerrado por '+item.task.closedBy);
   const actions=row.insertCell();
   actions.append(
    button('Abrir ficha',()=>void window.CampoControl.openRecord(item.id)),
    button('Corrigir cadastro',()=>void window.CampoManagementEdit.open(item.id,item.issues))
   );
   if(item.coordinates)actions.append(button('Localizar',()=>locate(item)));
   if(canDispatch(item))actions.append(button('Voltar a campo',()=>openDispatch([item])));
   if(item.task?.status==='pending')actions.append(button('Cancelar retorno',()=>void cancel(item)));
  }
  if(!data.items.length){const cell=textCell(rows.insertRow(),'Nenhuma árvore corresponde aos filtros.');cell.colSpan=6;}
  $('auditQualityPage').textContent='Página '+(page+1)+' de '+data.pages+' · '+data.total+' cadastros';
  $('auditQualityPrevious').disabled=page===0;
  $('auditQualityNext').disabled=page+1>=data.pages;
  $('auditPageSelect').disabled=!data.items.some(canDispatch);
  $('auditKml').disabled=!summary.counts.photos;
  paintSelection();
 }
 async function refresh(){
  if(!panel.open||!window.CampoControl?.authorized())return;
  controller?.abort();
  const active=new AbortController(),params=filterParams();
  controller=active;params.set('page',String(page));$('auditSummary').textContent='Conferindo cadastros e despachos…';
  try{
   const result=await window.CampoControl.api('/api/control/quality?'+params,undefined,active.signal);
   if(active.signal.aborted)return;
   data=result;page=result.page;paint();
  }catch(error){if(!active.signal.aborted)$('auditSummary').textContent=error.message;}
 }
 function reset(){
  page=0;selection.clear();rows.replaceChildren();paintSelection();void refresh();
 }
 function locate(item){
  const [lat,lon]=item.coordinates;
  location.hash='mapa';
  $('mapFrame').scrollIntoView({block:'center'});
  window.CampoControlMap?.locate({id:item.id,species:item.species,lat,lon},null);
 }
 function openDispatch(items,operators=data?.operators){
  if(sending)return;
  if(!operators?.length){$('auditActionStatus').textContent='Nenhuma conta de inspetor ativa para receber o despacho.';return;}
  dispatchRows=items;operationId=crypto.randomUUID();
  const missing=items.filter(item=>!item.assignee).length,select=$('auditDispatchTo');
  select.replaceChildren(new Option(missing?'Selecione o inspetor responsável':'Manter o inspetor original de cada ponto',''));
  for(const operator of operators)select.add(new Option(operator.name,operator.id));
  select.required=Boolean(missing);
  $('auditDispatchNote').value='';
  $('auditDispatchNote').required=items.some(item=>!item.issues.length);
  $('auditDispatchScope').textContent=items.length===1?'Árvore '+items[0].id+' · '+(items[0].issues.map(key=>Q.labels[key]).join(' · ')||'Revisão em campo'):items.length+' pontos selecionados. Cada inspetor receberá os campos a corrigir em cada árvore.';
  $('auditDispatchStatus').textContent=missing?missing+' ponto(s) sem conta ativa identificada. A conta escolhida receberá esses pontos.':'';
  dialog.showModal();
 }
 async function dispatch(event){
  event.preventDefault();
  if(sending||!window.CampoControl.authorized())return;
  sending=true;$('auditDispatchSend').disabled=true;
  try{
   const result=await window.CampoControl.api('/api/control/corrections',{
    action:'dispatch',ids:dispatchRows.map(item=>item.id),operationId,assignee:$('auditDispatchTo').value,fallbackOnly:dispatchRows.some(item=>!item.assignee),note:$('auditDispatchNote').value
   });
   const conflicts=result.conflicts||[];
   for(const item of dispatchRows)if(!conflicts.includes(item.id))selection.delete(item.id);
   dialog.close();
   $('auditActionStatus').textContent=result.sent+' retorno(s) confirmado(s)'+(result.alreadyPending?' · '+result.alreadyPending+' já despachado(s)':'')+
    (conflicts.length?' · '+conflicts.length+' cadastro(s) mudaram antes do despacho. Confira e tente novamente.':'.');
   await refresh();
  }catch(error){$('auditDispatchStatus').textContent=error.message;}
  finally{sending=false;$('auditDispatchSend').disabled=false;}
 }
 async function cancel(item){
  if(!confirm('Cancelar o retorno da árvore '+item.id+' para '+item.task.operator+'?'))return;
  try{
   await window.CampoControl.api('/api/control/corrections',{action:'cancel',id:item.task.id});
   $('auditActionStatus').textContent='Retorno cancelado.';
   await refresh();
  }catch(error){$('auditActionStatus').textContent=error.message;}
 }
 async function exportKml(){
  const button=$('auditKml'),params=filterParams();
  params.set('format','kml');
  button.disabled=true;
  try{
   const response=await fetch('/api/control/quality?'+params,{credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(90000)});
   if(!response.ok)throw Error((await response.json()).error||'Falha ao gerar o KML.');
   const omitted=Number(response.headers.get('X-Campo-Without-Coordinates')),count=Number(response.headers.get('X-Campo-Record-Count'));
   if(count){
    const url=URL.createObjectURL(await response.blob()),link=document.createElement('a');
    link.href=url;link.download='arbora-arvores-sem-fotos.kml';link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
   }
   $('auditActionStatus').textContent=(count?count+' ponto(s) no KML.':'Nenhum ponto sem fotos possui coordenadas válidas.')+(omitted?' '+omitted+' cadastro(s) sem coordenadas ficaram fora do arquivo.':'');
  }catch(error){$('auditActionStatus').textContent=error.message;}
  finally{button.disabled=false;}
 }
 $('auditDispatchForm').onsubmit=dispatch;
 $('auditDispatchClose').onclick=()=>{if(!sending)dialog.close();};
 dialog.addEventListener('cancel',event=>{if(sending)event.preventDefault();});
 $('auditDispatch').onclick=()=>openDispatch([...selection.values()]);
 $('auditPageSelect').onclick=()=>{
  for(const item of data?.items||[])if(canDispatch(item)&&selection.size<limit)selection.set(item.id,item);
  paintSelection();
 };
 $('auditClear').onclick=()=>{selection.clear();paintSelection();};
 $('auditReload').onclick=()=>void refresh();
 $('auditIssue').onchange=$('auditReturn').onchange=reset;
 $('auditKml').onclick=()=>void exportKml();
 $('auditQualityPrevious').onclick=()=>{page--;void refresh();};
 $('auditQualityNext').onclick=()=>{page++;void refresh();};
 panel.addEventListener('toggle',()=>{if(panel.open)void refresh();else controller?.abort();});
 window.addEventListener('campo-control-logout',()=>{controller?.abort();panel.open=false;data=null;selection.clear();reset();if(dialog.open)dialog.close();});
 window.CampoQualityAdmin={reset,refresh,async openRecord(id){
  if(!window.CampoControl?.authorized()||sending)return;
  panel.open=true;
  try{
   const {item,operators}=await window.CampoControl.api('/api/control/corrections?id='+encodeURIComponent(id));
   if(!window.CampoControl.authorized())return;
   if(!item.coordinates)throw Error('Corrija as coordenadas antes de despachar o ponto.');
   if(item.task?.status==='pending')throw Error('Este ponto já está despachado para '+item.task.operator+'.');
   openDispatch([item],operators);
  }catch(error){$('auditActionStatus').textContent=error.message;}
 }};
})();
