'use strict';
(()=>{
 const M=CampoRoutes,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=(...args)=>window.CampoControl.api(...args);
 const km=m=>(m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 const panel=document.createElement('article');panel.className='panel route-card';panel.id='routePlanner';
 panel.innerHTML=`<div class="panel-head"><h3>Rotas de vistoria</h3><button type="button" id="routeRefresh">Atualizar</button></div>
 <details id="routePlan"><summary>Planejar e atribuir rota</summary>
 <form id="routeNetworkForm">
 <div class="route-grid">
 <fieldset class="route-sections"><legend>Trechos da rede</legend>
 <label><input name="sections" type="checkbox" value="1"> T1</label>
 <label><input name="sections" type="checkbox" value="2"> T2</label>
 <label><input name="sections" type="checkbox" value="3"> T3</label></fieldset>
 <label>Alimentador <input name="feeder" list="routeFeeders" placeholder="Todos" autocomplete="off"><datalist id="routeFeeders"></datalist></label>
 <label>Zona <select name="zone"><option value="">Todas</option><option value="URBANO">Urbano</option><option value="RURAL">Rural</option></select></label>
 <label class="route-keys">Chaves <textarea name="blocks" rows="3" placeholder="RBR554&#10;RBR444" aria-describedby="routeKeyHelp"></textarea><small id="routeKeyHelp">Separe por vírgula, espaço ou quebra de linha.</small></label></div>
 <div class="route-buttons"><button type="submit" class="primary">Filtrar rede</button><button type="button" id="routeClearNetwork">Limpar filtro</button><button type="button" id="routeFilterMap" hidden>Ver no mapa</button></div>
 </form>
 <p id="routeMapLegend" class="route-legend-mark" hidden>Vermelho com halo: rede filtrada para vistoria. A rede de referência continua visível.</p>
 <p id="routeNetworkStatus" role="status">Deixe os trechos em branco para incluir todos.</p>
 <div id="routeMatches" hidden>
 <div class="route-buttons"><button type="button" id="routeAddAll">Atribuir rota filtrada</button></div>
 <ul id="routeCandidates" class="route-list"></ul></div>
 <form id="routePlanForm">
 <div class="route-buttons"><button type="button" id="routePick" aria-pressed="false">Selecionar vãos no mapa</button><label>Importar GeoJSON <input id="routeImport" type="file" accept=".json,.geojson,application/geo+json"></label></div>
 <ol id="routeDraftList" class="route-list"></ol><p id="routePlanned"></p>
 <div class="route-grid"><label>Nome da rota<input name="name" maxlength="100" required></label><label>Inspetor<select name="assignee" required></select></label></div>
 <div id="routeMissingData" class="route-grid" hidden>
 <label hidden>Localidade ausente na rede<input name="locality"></label>
 <label hidden>Alimentador ausente na rede<input name="feeder" list="routeFeeders"></label>
 <label hidden>Zona ausente na rede<select name="zone"><option value="">Selecione</option><option value="URBANO">Urbano</option><option value="RURAL">Rural</option></select></label>
 <label hidden>Trecho ausente na rede<select name="section"><option value="">Selecione</option><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option></select></label></div>
 <button type="submit" class="primary" id="routeAssign">Atribuir rota</button><p id="routePlannerStatus" role="status"></p></form></details>
 <details id="routeHistory"><summary>Rotas atribuídas e cobertura</summary>

 <div class="route-grid"><label>Dia da vistoria<input id="routeDay" type="date"></label><label>Mês da vistoria<input id="routeMonth" type="month"></label>
 <label>Inspetor<select id="routeOperator"><option value="">Todos</option></select></label><label>Recorte<input id="routeFilter" type="search" placeholder="Localidade, alimentador ou rota"></label>
 <label>OS_VERA para conciliação<input id="routeSgm" type="file" accept=".csv,.txt,text/csv"></label></div><p id="routeSgmStatus" role="status">Importe o CSV da OS_VERA para comparar por chave e data de término.</p>
 <p id="routeTotals" aria-live="polite"></p><div id="routePublished"></div></details>`;
 $('mapFrame').before(panel);
 const form=$('routePlanForm'),search=$('routeNetworkForm'),status=$('routePlannerStatus'),searchStatus=$('routeNetworkStatus');
 let draft=[],candidates=[],filterKeys=[],previewComplete=false,filterRequest=0,draftId=null,filteredDraft=false,job=null,publishing=false,selecting=false,snapshot={routes:[],visits:[]},sgm=null;
 const planned=routes=>[...new Map(routes.flatMap(r=>r.spans).map(s=>[s.id,s])).values()];
 function paintCandidates(){
  const selected=new Set(draft.map(s=>s.id));
  $('routeMapLegend').hidden=!candidates.length;
  $('routeMatches').hidden=!candidates.length;
  $('routeFilterMap').hidden=!candidates.length;
  $('routeCandidates').innerHTML=candidates.slice(0,250).map(({span:s})=>`<li><div><strong>${esc(s.id)}</strong><small>${esc([s.block,s.feeder,s.section?'T'+s.section:'',s.zone].filter(Boolean).join(' · '))}</small><small>${km(s.metres)}${s.estimated?' · pela geometria':''}</small></div><button type="button" data-add="${esc(s.id)}" ${selected.has(s.id)?'disabled':''}>${selected.has(s.id)?'Na rota':'Adicionar'}</button></li>`).join('');
  $('routeAddAll').disabled=!previewComplete||!candidates.length||Boolean(job);
  $('routeAddAll').textContent='Atribuir rota filtrada · '+km(M.metres(candidates.map(x=>x.span)));
 }
 function clearNetwork(){
  filterRequest++;previewComplete=false;candidates=[];filterKeys=[];
  window.CampoControlMap?.setRouteFilter(null);
  search.querySelector('[type=submit]').disabled=false;
  paintCandidates();
  window.CampoControlMap?.routeOverlay?.(draft,null,false);
 }
 function editedFilters(){
  clearNetwork();
  searchStatus.textContent='Filtros alterados. Clique em Filtrar rede.';
 }
 search.addEventListener('input',editedFilters);
 $('routeClearNetwork').onclick=()=>{search.reset();clearNetwork();searchStatus.textContent='Filtro limpo.';};
 $('routeFilterMap').onclick=()=>window.CampoControlMap?.setRouteFilter(candidates.map(x=>x.feature),true,true);
 search.onsubmit=async e=>{
  e.preventDefault();
  if(job)return;
  const fields=new FormData(search),blocks=M.codes(fields.get('blocks')),sections=M.sections(fields.getAll('sections')),feeders=M.codes(fields.get('feeder')),zone=M.key(fields.get('zone'));
  clearNetwork();
  if(blocks.length>500||feeders.length>30||[...blocks,...feeders].some(code=>!M.identifier(code))){searchStatus.textContent='Confira os códigos. Use até 500 chaves e 30 alimentadores.';return;}
  if(!blocks.length&&!sections.length&&!feeders.length&&!zone){searchStatus.textContent='Escolha ao menos um trecho, alimentador, zona ou chave.';return;}
  const serial=filterRequest,button=search.querySelector('[type=submit]');
  button.disabled=true;searchStatus.textContent='Buscando vãos MT na base instalada…';
  try{
   const result=await window.CampoControlMap.routeNetwork({blocks,feeders,sections,zone});
   if(serial!==filterRequest)return;
   const unique=new Map();let invalid=0;
   for(const feature of result.features){
    try{const span=M.feature(feature);if(!unique.has(span.id))unique.set(span.id,{span,feature});}catch{invalid++;}
   }
   const order=new Map(blocks.map((key,i)=>[key,i]));
   candidates=[...unique.values()].sort((a,b)=>(order.get(a.span.block)??blocks.length)-(order.get(b.span.block)??blocks.length));
   filterKeys=blocks;previewComplete=!result.capped&&!result.missingColumns&&!invalid&&result.features.length===result.total;
   const count=candidates.length.toLocaleString('pt-BR'),info=[count+' vão(s) · '+km(M.metres(candidates.map(x=>x.span)))+' de rede no recorte.'];
   if(candidates.length>250)info.push('A lista exibe os primeiros 250; a atribuição usa o recorte inteiro.');
   if(result.capped)info.push(result.total.toLocaleString('pt-BR')+' registros no recorte. Refine os filtros para visualizar todos e liberar a inclusão em lote.');
   if(result.missing.length)info.push('Chaves sem vãos no recorte: '+result.missing.join(', ')+'.');
   if(result.missingColumns)info.push('Há camadas MT sem os campos do filtro. Confira a versão da rede.');
   if(invalid||result.features.length<Math.min(result.total,10000))info.push('Alguns registros estão sem ID, geometria ou extensão utilizável.');
   searchStatus.textContent=info.join(' ');
   window.CampoControlMap.setRouteFilter(candidates.map(x=>x.feature),Boolean(candidates.length));
   paintDraft();
  }catch(error){if(serial===filterRequest)searchStatus.textContent=error.message;}
  finally{if(serial===filterRequest)button.disabled=false;}
 };
 function addCandidates(spans){try{add(M.order(spans,filterKeys,draft.length?M.last(draft.at(-1)):null),true);}catch(error){status.textContent=error.message;}}
 $('routeAddAll').onclick=()=>{
  if(!previewComplete||!candidates.length||job)return;
  if(draft.length&&!filteredDraft&&!confirm('Usar todos os vãos do filtro no lugar da seleção manual?'))return;
  draft=M.order(candidates.map(x=>x.span),filterKeys);
  filteredDraft=true;draftId=null;paintDraft();
  status.textContent='Recorte pronto. Informe o nome da rota e selecione o inspetor para publicar.';
  form.elements.name.focus();
 };
 $('routeCandidates').onclick=e=>{
  const candidate=candidates.find(x=>x.span.id===e.target.dataset.add);
  if(candidate)addCandidates([candidate.span]);
 };
 function paintDraft(){
  $('routePlanned').textContent=draft.length?km(M.metres(draft))+' de rede a vistoriar · '+draft.length+' vão(s) · início '+draft[0].id+' · fim '+draft.at(-1).id:'Adicione pelo menos um vão.';
  $('routeDraftList').innerHTML=draft.slice(0,250).map((s,i)=>`<li><b>${esc(s.id)}</b> · ${km(s.metres)}${s.estimated?' (geometria)':''} · ${esc([s.block,s.feeder,s.section?'T'+s.section:''].filter(Boolean).join(' · '))} <button type="button" data-up="${i}" ${i===0?'disabled':''}>Subir</button> <button type="button" data-reverse="${i}">Inverter sentido</button> <button type="button" data-remove="${i}">Remover</button></li>`).join('');
  let missing=false;
  for(const field of ['locality','feeder','zone','section']){
   const input=form.elements[field];
   const required=draft.some(span=>!span[field]);
   input.closest('label').hidden=!required;input.required=required;input.disabled=!required;missing||=required;
  }
  $('routeMissingData').hidden=!missing;
  $('routeAssign').textContent=job?'Retomar atribuição':filteredDraft?'Publicar rota filtrada':'Atribuir rota';
  $('routeDraftList').hidden=draft.length>250;
  paintCandidates();
  window.CampoControlMap?.routeOverlay?.(draft,null,false);
 }
 function add(spans,ordered=false){
  if(!spans.length||job)return;
  const unique=new Map(draft.map(s=>[s.id,s]));
  let previous=draft.at(-1);
  for(const span of spans){
   if(unique.has(span.id))continue;
   const reverse=!ordered&&previous&&M.distance(M.last(previous),M.last(span))<M.distance(M.last(previous),M.first(span));
   previous=reverse?{...span,reverse:!span.reverse}:span;
   unique.set(span.id,previous);
  }
  if(unique.size>250)throw Error('Divida o planejamento em rotas de até 250 vãos.');
  draft=[...unique.values()];draftId=null;filteredDraft=false;paintDraft();
  status.textContent=draft.length+' vão(s) no plano.';
 }
 $('routePick').onclick=()=>{
  selecting=!selecting;$('routePick').setAttribute('aria-pressed',selecting);$('routePick').textContent=selecting?'Encerrar seleção':'Selecionar vãos no mapa';
  status.textContent=selecting?'Clique nos vãos da rede MT abaixo. A ordem dos cliques define a rota.':'Seleção encerrada.';
 };
 $('routeImport').onchange=async e=>{
  try{const f=e.target.files[0];if(!f)return;if(f.size>3000000)throw Error('Importe somente o recorte da rota.');
   const geo=JSON.parse(await f.text());
   if(geo.type!=='FeatureCollection'||!Array.isArray(geo.features))throw Error('Use uma coleção GeoJSON em WGS 84.');
   add(geo.features.map(M.feature));
  }catch(error){status.textContent=error.message;}finally{e.target.value='';}
 };
 $('routeDraftList').onclick=e=>{
  if(job)return;
  const {up,reverse,remove}=e.target.dataset;
  if(remove!==undefined)draft.splice(Number(remove),1);
  else if(reverse!==undefined)draft[Number(reverse)].reverse=!draft[Number(reverse)].reverse;
  else if(up!==undefined){const i=Number(up);if(!i)return;[draft[i-1],draft[i]]=[draft[i],draft[i-1]];}
  else return;
  draftId=null;filteredDraft=false;paintDraft();
 };
 panel.addEventListener('input',e=>{if(e.target.form===form&&e.target.name)draftId=null;});
 form.onsubmit=async e=>{
  e.preventDefault();
  if(publishing)return;
  if(!draft.length&&!job){status.textContent='Selecione pelo menos um vão.';return;}
  if(!job){
   const gaps=draft.slice(1).filter((s,i)=>M.distance(M.last(draft[i]),M.first(s))>25);
   const parts=M.routeParts(draft);
   const notices=[];
   if(parts.length>1)notices.push('O recorte será entregue em '+parts.length+' partes numeradas no app.');
   if(gaps.length)notices.push('Há '+gaps.length+' intervalo(s) sem continuidade entre vãos. Use as ruas para se deslocar entre eles.');
   if(notices.length&&!confirm(notices.join(' ')+' Publicar?'))return;
   draftId??=crypto.randomUUID();
   const fields=Object.fromEntries(new FormData(form));
   job={index:0,parts:parts.map((spans,i)=>{
    const suffix=' ('+(i+1)+'/'+parts.length+')';
    return {...fields,name:parts.length===1?fields.name:fields.name.slice(0,100-suffix.length)+suffix,
     id:parts.length===1?draftId:draftId+'-'+(i+1),fromNetwork:true,spans};
   })};
  }
  const batch=job;
  publishing=true;$('routeAssign').disabled=true;paintCandidates();
  const locked=[...form.elements].filter(control=>control!==$('routeAssign')&&!control.disabled);
  for(const control of locked)control.disabled=true;
  try{
   for(;batch.index<batch.parts.length;batch.index++){
    status.textContent='Publicando parte '+(batch.index+1)+' de '+batch.parts.length+'…';
    await api('/api/routes',batch.parts[batch.index]);
    if(job!==batch)return;
   }
   draft=[];job=null;draftId=null;filteredDraft=false;form.reset();paintDraft();
   status.textContent=batch.parts.length+' '+(batch.parts.length===1?'rota disponível':'partes disponíveis')+' para baixar em Minhas rotas.';
   try{await refresh();}catch{status.textContent+=' Use Atualizar para recarregar a lista de rotas.';}
  }catch(error){
   if(job!==batch)return;
   status.textContent=error.message+' · '+batch.index+'/'+batch.parts.length+' parte(s) confirmada(s). Retome nesta tela para evitar duplicação.';
   if(batch.index===0&&error.status>=400&&error.status<500){job=null;}
  }finally{
   publishing=false;$('routeAssign').disabled=false;
   for(const control of locked)control.disabled=false;
   paintDraft();
  }
 };
 function parseSgm(source){
  source=source.replace(/^\uFEFF/,'');
  const header=source.split(/\r?\n/,1)[0];
  const separator=header.includes(';')?';':header.includes('\t')?'\t':',',rows=[];
  let line=[],cell='',quoted=false;
  for(let i=0;i<source.length;i++){
   const c=source[i];
   if(c==='"'){if(quoted&&source[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
   else if(c===separator&&!quoted){line.push(cell);cell='';}
   else if(c==='\n'&&!quoted){line.push(cell.replace(/\r$/,''));rows.push(line);line=[];cell='';}
   else cell+=c;
  }
  if(quoted)throw Error('CSV incompleto.');
  if(line.length||cell)rows.push([...line,cell]);
  const keys=(rows.shift()||[]).map(M.key),op=keys.indexOf('NUM_OPERATIVO'),end=keys.indexOf('DATA_TERMINO'),st=keys.indexOf('STATUS_GERAL_OS'),alt=keys.indexOf('STATUS_OS');
  if(op<0||end<0||Math.max(st,alt)<0)throw Error('O CSV deve conter NUM_OPERATIVO, DATA_TERMINO e o status da OS.');
  const index=new Map();
  for(const row of rows){
   const key=M.key(row[op]);if(!key)continue;
   const text=String(row[end]||'').trim(),br=/^(\d{2})\/(\d{2})\/(\d{4})/.exec(text);
   const day=br?br[3]+'-'+br[2]+'-'+br[1]:/^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):'';
   const state=M.key(row[st]||row[alt]);
   if(!index.has(key))index.set(key,{executed:new Set(),pending:false});
   if(state==='EXECUTADA'&&day)index.get(key).executed.add(day);
   else if(!['INATIVA','CANCELADA','CANCELADO','EXECUTADA',''].includes(state))index.get(key).pending=true;
  }
  return index;
 }
 $('routeSgm').onchange=async e=>{
  try{const f=e.target.files[0];if(!f)return;if(f.size>12000000)throw Error('Use o CSV filtrado da tabela OS_VERA.');
   const bytes=await f.arrayBuffer(),utf=new TextDecoder('utf-8',{fatal:true});
   let source;try{source=utf.decode(bytes);}catch{source=new TextDecoder('windows-1252').decode(bytes);}
   sgm=parseSgm(source);$('routeSgmStatus').textContent=sgm.size+' chaves na referência SGM desta sessão.';paint();
  }catch(error){$('routeSgmStatus').textContent=error.message;}finally{e.target.value='';}
 };
 function paint(){
  const day=$('routeDay').value,month=$('routeMonth').value,operator=$('routeOperator').value,q=M.key($('routeFilter').value);
  const inPeriod=value=>day?value===day:month?value.startsWith(month):true;
  const routes=snapshot.routes.filter(r=>(!operator||r.assignee===operator)&&(!q||M.key([r.name,r.feeder,r.locality].join(' ')).includes(q))).sort((a,b)=>a.phase-b.phase);
  const ids=new Set(routes.map(r=>r.id)),visits=snapshot.visits.filter(v=>ids.has(v.routeId)),spans=planned(routes);
  const track=visits.filter(v=>inPeriod(v.day)).reduce((n,v)=>n+(v.trackMetres||0),0);
  const total=spans.reduce((n,s)=>n+s.metres,0),all=M.coverage(spans,visits).metres,period=M.coverage(spans,visits,v=>inPeriod(v.day)).metres;
  let reconciliation='';
  if(sgm){
   const totals={executed:0,pending:0,none:0,unclassified:0,noDate:0};
   for(const s of spans){const row=sgm.get(s.block);
    if(!s.block)totals.unclassified+=s.metres;
    else if(!row)totals.none+=s.metres;
    else if([...row.executed].some(inPeriod))totals.executed+=s.metres;
    else if(row.pending)totals.pending+=s.metres;
    else totals.noDate+=s.metres;
   }
   reconciliation=' · SGM executada no período '+km(totals.executed)+' · pendente na referência '+km(totals.pending)+' · sem OS VERA '+km(totals.none)+' · sem chave '+km(totals.unclassified)+' · demais '+km(totals.noDate);
  }
  $('routeTotals').textContent='Planejado '+km(total)+' · confirmado no período '+km(period)+' · GPS registrado '+km(track)+' · falta na campanha '+km(Math.max(0,total-all))+reconciliation;
  $('routePublished').innerHTML=routes.map(r=>{
   const related=visits.filter(v=>v.routeId===r.id),done=M.coverage(r.spans,related),last=related.at(-1),miss=r.spans.filter(s=>M.remaining(done.bySpan.get(s.id)).length);
   return `<div class="route-result"><strong>${esc(r.name)}</strong><small>${esc(r.locality)} · ${esc(r.feeder)} · ${esc(M.sectionLabel(r))} ${esc(r.zone)} · ${esc(r.operator)}</small><p><strong>${km(M.metres(r.spans))} de rede planejada</strong> · ${km(done.metres)} confirmados · ${miss.length} vão(s) com pendência${last?' · última em '+esc(last.day):''}</p><button type="button" data-route-map="${esc(r.id)}">${miss.length?'Ver de onde retomar':'Ver cobertura'}</button></div>`;
  }).join('')||'<p>Nenhuma rota neste filtro.</p>';
 }
 $('routePublished').onclick=e=>{
  const route=snapshot.routes.find(r=>r.id===e.target.dataset.routeMap);if(!route)return;
  const cover=M.coverage(route.spans,snapshot.visits.filter(v=>v.routeId===route.id));
  clearNetwork();
  window.CampoControlMap?.routeOverlay?.(route.spans,cover.bySpan,true);
 };
 async function refresh(){
  if(!window.CampoControl?.authorized())return;
  const [state,accounts]=await Promise.all([api('/api/routes'),api('/api/admin/users')]);if(!window.CampoControl?.authorized())return;snapshot=state;
  const users=(accounts.users||[]).filter(u=>!u.blocked&&!u.deleted_at&&u.passwordConfigured);
  for(const select of [form.elements.assignee,$('routeOperator')]){
   const old=select.value;select.replaceChildren(new Option(select===form.elements.assignee?'Selecione':'Todos',''));
   for(const u of users)select.add(new Option(u.name,u.id));select.value=old;
  }
  paint();
 }
 const load=()=>void refresh().catch(e=>{status.textContent=e.message;});
 $('routeRefresh').onclick=load;for(const section of panel.querySelectorAll('details'))section.addEventListener('toggle',e=>{if(e.target.open)load();});
 for(const id of ['routeDay','routeMonth','routeOperator','routeFilter'])$(id).addEventListener('input',()=>{
  if(id==='routeDay'&&$(id).value)$('routeMonth').value='';
  if(id==='routeMonth'&&$(id).value)$('routeDay').value='';
  paint();
 });
 paintDraft();
 window.CampoRoutePlanner={
  select(f){if(!$('routePlan').open||!selecting||job)return false;try{add([M.feature(f)]);}catch(e){status.textContent=e.message;}return true;},
  feeders(values){$('routeFeeders').replaceChildren(...values.map(f=>new Option(f,f)));},
  open:load,
  stop(){selecting=false;job=null;filteredDraft=false;draft=[];draftId=null;snapshot={routes:[],visits:[]};sgm=null;form.reset();search.reset();clearNetwork();paintDraft();paint();$('routePick').setAttribute('aria-pressed','false');$('routePick').textContent='Selecionar vãos no mapa';}
 };
})();
