'use strict';
(()=>{
 const M=CampoRoutes,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=(...args)=>window.CampoControl.api(...args);
 const isTest=route=>route.homologation||['homologacao','gestao_homologacao'].includes(route.returned?.reasonCode);
 const km=m=>(m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 let outlet=null;
 const panel=document.createElement('article');panel.className='panel route-card';panel.id='routePlanner';
 panel.innerHTML=`<div class="panel-head"><h3>Rotas de vistoria</h3><button type="button" id="routeRefresh">Atualizar</button></div>
 <details id="routePlan"><summary>Planejar e atribuir rota</summary>
 <form id="routeNetworkForm">
 <div class="route-grid">
 <fieldset class="route-sections"><legend>Trechos da rede</legend>
 <label><input name="sections" type="checkbox" value="1"> T1</label>
 <label><input name="sections" type="checkbox" value="2"> T2</label>
 <label><input name="sections" type="checkbox" value="3"> T3</label></fieldset>
 <label>Alimentador<input name="feeder" id="routeFeeder" type="search" list="routeFeederSuggestions" maxlength="600" placeholder="Ex.: AAL-01C9" autocomplete="off"><datalist id="routeFeederSuggestions"></datalist><small>Digite o código. Para mais de um, separe por vírgula.</small></label>
 <label>Zona <select name="zone"><option value="">Todas</option><option value="URBANO">Urbano</option><option value="RURAL">Rural</option></select></label>
 <label class="route-scope"><span><input type="checkbox" name="mapArea"> Limitar à área visível do mapa</span></label>
 <label class="route-keys">Chaves <textarea name="blocks" rows="3" placeholder="RBR554&#10;RBR444" aria-describedby="routeKeyHelp"></textarea><small id="routeKeyHelp">Separe por vírgula, espaço ou quebra de linha.</small></label></div>
 <div class="route-buttons"><button type="submit" class="primary">Aplicar filtros</button><button type="button" id="routeClearNetwork">Limpar filtro</button><button type="button" id="routeFilterMap" hidden>Ver no mapa</button></div>
 </form>
 <div id="routeBlockSelection">
 <label><input id="routeSelectByBlock" type="checkbox"> Selecionar por chave inteira</label>
 <p id="routeBlockStatus" role="status"></p>
 <ul id="routeBlockChoices" class="route-list"></ul>
 </div>
 <p id="routeMapLegend" class="route-legend-mark" hidden>Vermelho: recorte filtrado. Roxo: vãos incluídos no plano.</p>
 <details><summary>Complemento cadastral local</summary><label>Catálogo VERA (.json.gz)<input type="file" id="routeReference" accept=".gz,application/gzip"></label><p id="routeReferenceStatus" role="status"></p></details>
 <p id="routeNetworkStatus" role="status">Deixe os trechos em branco para incluir todos.</p>
 <div id="routeMatches" hidden>
 <div class="route-buttons"><button type="button" id="routeAddAll">Usar todos os vãos no plano</button></div>
 <ul id="routeCandidates" class="route-list"></ul></div>
 <form id="routePlanForm">
 <div class="route-buttons"><button type="button" id="routePick" aria-pressed="false">Selecionar vãos no mapa</button><label>Importar GeoJSON <input id="routeImport" type="file" accept=".json,.geojson,application/geo+json"></label></div>
 <div class="route-buttons"><button type="button" id="routeOutlet">Marcar saída da subestação no mapa</button><span id="routeOutletStatus">Saída ainda não vinculada</span></div>
 <label><span><input type="checkbox" name="homologation"> Rota de homologação</span></label>
 <ol id="routeDraftList" class="route-list"></ol><p id="routePlanned"></p><div id="routeRoad" class="route-buttons" hidden><a id="routeNavigateNext" target="_blank" rel="noopener noreferrer">Google Maps · ir ao primeiro ponto</a><a id="routeRoadTrip" target="_blank" rel="noopener noreferrer">Google Maps · trajeto por ruas</a><small>A rede destacada é o serviço. O Google Maps calcula o deslocamento viário em separado.</small></div>
 <div class="route-grid"><label>Nome da rota<input name="name" maxlength="100" required></label><label>Inspetor<select name="assignee" required></select></label><label>Buffer por lado (m)<input name="buffer" type="number" min="5" max="200" value="30" required></label><label>Início previsto<input type="date" name="planStart"></label><label>Capacidade diária de rede (km)<input type="number" name="planCapacity" min="0.1" max="250" step="0.001"></label></div><p id="routeDeadline" role="status"></p>
 <div id="routeMissingData" class="route-grid" hidden>
 <label hidden>Localidade ausente na rede<input name="locality"></label>
 <label hidden>Alimentador ausente na rede<input name="feeder"></label>
 <label hidden>Zona ausente na rede<select name="zone"><option value="">Selecione</option><option value="URBANO">Urbano</option><option value="RURAL">Rural</option></select></label>
 <label hidden>Trecho ausente na rede<select name="section"><option value="">Selecione</option><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option></select></label></div>
 <button type="submit" class="primary" id="routeAssign">Atribuir rota</button><p id="routePlannerStatus" role="status"></p></form></details>
 <details id="routeHistory"><summary>Rotas atribuídas e cobertura</summary>

 <div class="route-grid"><label>Dia da vistoria<input id="routeDay" type="date"></label><label>Mês da vistoria<input id="routeMonth" type="month"></label>
 <label>Inspetor<select id="routeOperator"><option value="">Todos</option></select></label><label>Recorte<input id="routeFilter" type="search" placeholder="Localidade, alimentador ou rota"></label>
 <label><span><input id="routeShowTests" type="checkbox"> Mostrar homologação</span></label><label>OS_VERA para conciliação<input id="routeSgm" type="file" accept=".csv,.txt,text/csv"></label></div><p id="routeSgmStatus" role="status">Importe o CSV da OS_VERA para comparar por chave e data de término.</p>
 <p id="routeTotals" aria-live="polite"></p><div class="route-buttons"><button type="button" id="routeShowSelected" disabled>Ver selecionadas</button><button type="button" id="routeShowAll" disabled>Ver todas as rotas</button><button type="button" id="routeClearPublished" disabled>Limpar mapa</button></div><p id="routeHistoryStatus" role="status"></p><div id="routePublished"></div></details>`;
 $('mapFrame').before(panel);
 const withdrawDialog=document.createElement('dialog');withdrawDialog.id='routeWithdrawDialog';withdrawDialog.className='route-return-dialog';
 withdrawDialog.innerHTML=`<form id="routeWithdrawForm"><div class="sectionhead"><div><span class="eyebrow">CONTROLE DA GESTÃO</span><h2>Retirar rota do inspetor</h2></div><button type="button" id="routeWithdrawClose" class="secondary">Fechar</button></div><p id="routeWithdrawSummary"></p><p><strong>Atenção:</strong> a rota sairá da carteira do inspetor na próxima sincronização. O histórico já recebido será preservado, mas uma saída ainda não sincronizada no aparelho poderá não ser aceita.</p><label>Motivo<select id="routeWithdrawReason" required><option value="">Selecione</option><option value="gestao_reatribuicao">Reatribuição ou ajuste da equipe</option><option value="gestao_correcao">Correção da rota</option><option value="gestao_homologacao">Homologação ou teste</option><option value="gestao_solicitacao">Solicitação do inspetor</option><option value="gestao_outro">Outro</option></select></label><label>Observação<textarea id="routeWithdrawNote" maxlength="480" rows="3" placeholder="Detalhe quando necessário"></textarea></label><p id="routeWithdrawFeedback" role="status"></p><button type="submit" class="primary" id="routeWithdrawConfirm">Retirar rota do inspetor</button></form>`;
 document.body.append(withdrawDialog);
 const kpis=document.createElement('article');kpis.className='panel route-card';kpis.id='routeKpis';
 kpis.innerHTML=`<div class="panel-head"><h3>KPI de rotas por equipe e inspetor</h3></div><div class="route-grid">
 <label>De<input id="routeKpiStart" type="date"></label><label>Até<input id="routeKpiEnd" type="date"></label><label>Inspetor<select id="routeKpiOperator"><option value="">Todos</option></select></label>
 </div><div id="routeKpiTable" class="route-kpi-scroll" aria-live="polite"></div>`;
 $('mapFrame').after(kpis);
 const form=$('routePlanForm'),search=$('routeNetworkForm'),status=$('routePlannerStatus'),searchStatus=$('routeNetworkStatus');
 let draft=[],candidates=[],filterKeys=[],previewComplete=false,extent=null,filterTimer,filterRequest=0,feedersList=new Set(),historyCapacity=false,draftId=null,filteredDraft=false,job=null,publishing=false,selecting=false,snapshot={routes:[],visits:[]},sgm=null,withdrawRoute=null,withdrawing=false;
 let teamByAccount=new Map(),publishedGroups=[],selectedPublished=new Set(),shownPublished=[];
 const blockMode=$('routeSelectByBlock'),blockChoices=$('routeBlockChoices'),blockStatus=$('routeBlockStatus');
 const chosenBlocks=new Map(),pendingBlocks=new Map();
 function paintBlocks(){
  const codes=[...new Set([...filterKeys,...candidates.map(({span})=>span.block).filter(Boolean),...chosenBlocks.keys(),...pendingBlocks.keys()])];
  blockChoices.hidden=!blockMode.checked;
  const selected=blockChoices.querySelector(':focus')?.dataset.block;
  blockChoices.innerHTML=blockMode.checked?codes.map(code=>{
   const spans=chosenBlocks.get(code),pending=pendingBlocks.has(code);
   return `<li><label><input type="checkbox" data-block="${esc(code)}" ${spans||pending?'checked':''} ${job?'disabled':''}> <strong>${esc(code)}</strong>${pending?' · carregando':spans?' · '+spans.length+' vão(s) · '+km(M.metres(spans)):''}</label></li>`;
  }).join(''):'';
  if(selected)for(const input of blockChoices.querySelectorAll('input'))if(input.dataset.block===selected){input.focus({preventScroll:true});break;}
 }
 function resetBlocks(){
  pendingBlocks.clear();chosenBlocks.clear();blockStatus.textContent='';
 }
 function rebuildBlocks(){
  const previous=new Map(draft.map(span=>[span.id,span]));
  const spans=[...new Map([...chosenBlocks.values()].flat().map(span=>[span.id,span])).values()];
  draft=M.order(spans.map(span=>previous.get(span.id)||span),[...chosenBlocks.keys()]);
  if(outlet&&!M.keySections(draft,outlet).length){
   outlet=null;
   $('routeOutletStatus').textContent='Saída ainda não vinculada';
  }
  draftId=null;filteredDraft=false;paintDraft();
 }
 async function selectBlock(code,wanted){
  if(!blockMode.checked||job||!M.identifier(code))return;
  if(!wanted){
   pendingBlocks.delete(code);chosenBlocks.delete(code);
   rebuildBlocks();
   blockStatus.textContent=code+' removida da rota.';
   return;
  }
  if(chosenBlocks.has(code)||pendingBlocks.has(code))return;
  const ticket={};pendingBlocks.set(code,ticket);paintDraft();
  const active=()=>blockMode.checked&&!job&&pendingBlocks.get(code)===ticket;
  try{
   const result=await window.CampoControlMap.routeNetwork({blocks:[code]});
   if(!active())return;
   const spans=[...new Map(result.features.map(feature=>{
    const span=M.feature(feature);
    return [span.id,span];
   })).values()];
   if(result.capped||result.missingColumns||spans.length!==result.total||spans.some(span=>span.block!==code))throw Error('A consulta não retornou o bloco inteiro.');
   if(!spans.length)throw Error('Chave sem vãos MT na base.');
   const unique=new Set([...draft,...spans].map(span=>span.id));
   if(unique.size>10000)throw Error('O plano pode ter até 10.000 vãos.');
   pendingBlocks.delete(code);chosenBlocks.set(code,spans);rebuildBlocks();
   window.CampoControlMap?.routeOverlay?.(draft,null,true,M.bufferMetres(form.elements.buffer.value));
   blockStatus.textContent=code+' incluída com '+spans.length+' vão(s) · '+km(M.metres(spans))+'.';
  }catch(error){
   if(!active())return;
   pendingBlocks.delete(code);paintDraft();
   blockStatus.textContent=code+' · '+error.message;
  }
 }
 blockMode.onchange=()=>{
  if(job){blockMode.checked=!blockMode.checked;return;}
  if(draft.length&&!confirm('Limpar o plano atual e trocar o modo de seleção?')){blockMode.checked=!blockMode.checked;return;}
  resetBlocks();draft=[];draftId=null;filteredDraft=false;outlet=null;
  if(blockMode.checked)blockStatus.textContent='Filtre a rede ou selecione uma chave no mapa.';
  $('routeOutletStatus').textContent='Saída ainda não vinculada';
  window.CampoControlMap?.setRouteFilter(blockMode.checked?null:candidates.map(x=>x.feature));
  paintDraft();
 };
 blockChoices.onchange=event=>{
  const code=event.target.dataset.block;
  if(code)void selectBlock(code,event.target.checked);
 };
 const teamLabel=(id,name)=>teamByAccount.has(id)?teamByAccount.get(id)+' · '+name:name;
 const today=()=>M.day(Date.now());
 $('routeKpiStart').value=today().slice(0,7)+'-01';$('routeKpiEnd').value=today();form.elements.planStart.value=today();
 const planned=routes=>[...new Map(routes.flatMap(r=>r.spans).map(s=>[s.id,s])).values()];
 const jobKey="campo-route-assignment";
 function checkpoint(){try{if(job)sessionStorage.setItem(jobKey,JSON.stringify(job));else sessionStorage.removeItem(jobKey);}catch{}}
 function paintCandidates(){
  const selected=new Set(draft.map(s=>s.id));
  paintBlocks();
  blockMode.disabled=Boolean(job);
  $('routeMapLegend').hidden=blockMode.checked?!draft.length:!candidates.length;
  $('routeMapLegend').textContent=blockMode.checked?'Roxo: blocos inteiros incluídos na rota.':'Vermelho: recorte filtrado. Roxo: vãos incluídos no plano.';
  $('routeMatches').hidden=blockMode.checked||!candidates.length;
  $('routeFilterMap').hidden=blockMode.checked?!draft.length:!candidates.length;
  $('routeCandidates').innerHTML=candidates.slice(0,250).map(({span:s})=>`<li><div><strong>${esc(s.id)}</strong><small>${esc([s.block,s.feeder,s.section?'T'+s.section:'',s.zone].filter(Boolean).join(' · '))}</small><small>${km(s.metres)}${s.estimated?' · pela geometria':''}${s.poles?.length?' · postes '+esc(s.poles.join(' / ')):''}</small></div><div class="route-buttons"><button type="button" data-focus="${esc(s.id)}">Enquadrar</button><button type="button" data-add="${esc(s.id)}" ${selected.has(s.id)?'disabled':''}>${selected.has(s.id)?'Na rota':'Adicionar'}</button></div></li>`).join('');
  $('routeAddAll').disabled=!previewComplete||!candidates.length||Boolean(job);
  $('routeAddAll').textContent='Usar todos os vãos no plano · '+km(M.metres(candidates.map(x=>x.span)));
 }
 function clearNetwork(){
  filterRequest++;previewComplete=false;candidates=[];filterKeys=[];extent=null;
  window.CampoControlMap?.setRouteFilter(null);
  search.querySelector('[type=submit]').disabled=false;
  paintCandidates();
  window.CampoControlMap?.routeOverlay?.(draft,null,false);
 }
 function editedFilters(){
  filterRequest++;clearTimeout(filterTimer);
  if(filteredDraft&&!job){draft=[];draftId=null;paintDraft();}
  searchStatus.textContent='Atualizando o recorte…';
  filterTimer=setTimeout(()=>void runFilter(false),350);
 }
 search.addEventListener('input',editedFilters);
 $('routeClearNetwork').onclick=()=>{clearTimeout(filterTimer);search.reset();if(filteredDraft&&!job){draft=[];draftId=null;filteredDraft=false;}clearNetwork();paintDraft();searchStatus.textContent='Filtro limpo.';};
 $('routeFilterMap').onclick=()=>{
  if(blockMode.checked)window.CampoControlMap?.routeOverlay?.(draft,null,true,M.bufferMetres(form.elements.buffer.value));
  else window.CampoControlMap?.setRouteFilter(candidates.map(x=>x.feature),true,true,extent);
 };
 $('routeReference').onchange=async e=>{
  const file=e.target.files[0];if(!file)return;
  const note=$('routeReferenceStatus'),input=e.target;input.disabled=true;
  note.textContent='Importando cadastro de vãos neste navegador…';
  try{
   const result=await window.CampoControlMap.importRouteReference(file);
   note.textContent=result.count.toLocaleString('pt-BR')+' IDs cadastrados. A referência ficará neste navegador.';
   search.requestSubmit();
  }catch(error){note.textContent=error.message;}
  finally{input.value='';input.disabled=false;}
 };
 search.onsubmit=e=>{e.preventDefault();clearTimeout(filterTimer);return runFilter(true);};
 async function runFilter(scroll){
  if(job)return;
  const fields=new FormData(search),blocks=M.codes(fields.get('blocks')),sections=M.sections(fields.getAll('sections')),feeders=M.codes(fields.get('feeder')),zone=M.key(fields.get('zone'));
  filterRequest++;if(filteredDraft){draft=[];draftId=null;paintDraft();}
  if(blocks.length>500||blocks.some(code=>!M.identifier(code))){searchStatus.textContent='Confira os códigos. Use até 500 chaves.';return;}
  const bounds=fields.has('mapArea')?window.CampoControlMap.routeBounds?.():null;
  if(!blocks.length&&!sections.length&&!feeders.length&&!zone&&!bounds&&!scroll){clearNetwork();searchStatus.textContent='Selecione alimentadores, trechos ou zona para formar a rota.';return;}
  const serial=filterRequest,button=search.querySelector('[type=submit]');
  button.disabled=true;searchStatus.textContent='Buscando vãos, extensões e postes na rede MT…';
  try{
   const result=await window.CampoControlMap.routeNetwork({blocks,feeders,sections,zone,...(bounds?{bounds}:{})});
   if(serial!==filterRequest)return;
   const unique=new Map();let invalid=0;
   for(const feature of result.features){
    try{const span=M.feature(feature);if(!unique.has(span.id))unique.set(span.id,{span,feature:{...feature,geometry:{type:'LineString',coordinates:span.line}}});}catch{invalid++;}
   }
   const order=new Map(blocks.map((key,i)=>[key,i]));
   candidates=[...unique.values()].sort((a,b)=>(order.get(a.span.block)??blocks.length)-(order.get(b.span.block)??blocks.length));
   filterKeys=blocks;extent=result.extent||null;previewComplete=!result.capped&&!result.missingColumns&&!invalid&&result.features.length===result.total;
   const count=candidates.length.toLocaleString('pt-BR'),info=[count+' vão(s) · '+km(M.metres(candidates.map(x=>x.span)))+' de rede vinculada ao mapa.'];
   const estimated=M.metres(candidates.filter(x=>x.span.estimated).map(x=>x.span));
   if(estimated)info.push(km(estimated)+' estimados pela geometria.');
   if(result.reference)info.push('Cadastro VERA no recorte: '+result.reference.count.toLocaleString('pt-BR')+' vãos · '+km(result.reference.metres||0)+' registrados'+(result.reference.measured<result.reference.count?' em '+result.reference.measured.toLocaleString('pt-BR')+' vãos com extensão':'')+'.');
   if(result.referenceError)info.push(result.referenceError);
   if(candidates.length>250)info.push('A lista exibe os primeiros 250; a atribuição usa o recorte inteiro.');
   if(result.capped)info.push(result.total.toLocaleString('pt-BR')+' vãos no recorte. A prévia é limitada a 10.000. Refine por alimentador, chave ou área para atribuir todo o recorte.');
   if(result.missing.length)info.push('Chaves sem vãos no recorte: '+result.missing.join(', ')+'.');
   if(result.missingColumns)info.push('A consulta está incompleta: faltam campos no GPKG e a referência por ID não está disponível. Importe o complemento cadastral por ID nesta tela.');
   if(!candidates.length&&!result.missingColumns)info.push(bounds?'Nenhum vão na área atual. Desmarque Limitar à área visível para consultar todo o alimentador.':'O recorte não contém vãos com essa combinação de filtros.');
   if(invalid||result.features.length<Math.min(result.total,10000))info.push('Alguns registros estão sem ID, geometria ou extensão utilizável.');
   if(blockMode.checked)info.push('Marque as chaves abaixo. Cada chave carrega o bloco inteiro, inclusive fora deste recorte.');
   searchStatus.textContent=info.join(' ');
   if(!blockMode.checked&&previewComplete&&candidates.length&&(!draft.length||filteredDraft)){
    draft=M.order(candidates.map(x=>x.span),filterKeys);filteredDraft=true;draftId=null;
    if(!form.elements.name.value&&feeders.length===1)form.elements.name.value=('Vistoria '+feeders[0]+(sections.length?' '+sections.map(section=>'T'+section).join('+'):'' )).slice(0,100);
   }
   window.CampoControlMap.setRouteFilter(blockMode.checked?null:candidates.map(x=>x.feature),Boolean(candidates.length),scroll&&Boolean(candidates.length),extent);
   paintDraft();
  }catch(error){if(serial===filterRequest){searchStatus.textContent=error.message;previewComplete=false;paintCandidates();}}
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
  const {add,focus}=e.target.dataset,candidate=candidates.find(x=>x.span.id===(add||focus));
  if(focus&&candidate)window.CampoControlMap?.routeOverlay?.([candidate.span],null,true,M.bufferMetres(form.elements.buffer.value));
  if(add&&candidate)addCandidates([candidate.span]);
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
  paintDeadline();
  $('routeAssign').textContent=job?'Retomar atribuição':filteredDraft?'Publicar rota filtrada':'Atribuir rota';
  $('routeDraftList').hidden=blockMode.checked||draft.length>250;
  $('routeImport').disabled=blockMode.checked;
  $('routeAssign').disabled=publishing||pendingBlocks.size>0;
  if(!selecting)$('routePick').textContent=blockMode.checked?'Selecionar chaves no mapa':'Selecionar vãos no mapa';
  const paths=M.pendingPaths(draft,new Map()),stops=M.roadStops(paths),road=$('routeRoad');
  road.hidden=!stops.length;
  if(stops.length){
   $('routeNavigateNext').href=M.streetDirections(stops[0]);
   const leg=stops.slice(0,5);
   $('routeRoadTrip').href=leg.length>1?M.streetDirections(leg.at(-1),leg[0],leg.slice(1,-1)):M.streetDirections(leg[0]);
   $('routeRoadTrip').textContent='Google Maps · trajeto por ruas'+(stops.length>5?' · 1ª etapa de '+Math.ceil((stops.length-1)/4):'');
  }
  paintCandidates();
  window.CampoControlMap?.routeOverlay?.(draft,null,false,M.bufferMetres(form.elements.buffer.value));
 }
 function selectedPlan(){return M.routePlan({start:form.elements.planStart.value,metresPerDay:Number(form.elements.planCapacity.value)*1000,source:historyCapacity?'history':'manual'});}
 function paintDeadline(){
  const output=$('routeDeadline'),plan=selectedPlan();
  if(!draft.length){output.textContent='';return;}
  const history=M.capacity(snapshot.routes,snapshot.visits,form.elements.assignee.value),schedule=M.schedule(plan,M.metres(draft));
  const plannedIds=new Set(draft.map(span=>span.id));
  const others=new Map(draft.flatMap(span=>span.parallel||[]).filter(peer=>!plannedIds.has(peer.id)).map(peer=>[peer.id,peer]));
  const shared=others.size?' · '+km(M.metres([...others.values()]))+' em '+others.size+' vão(s) de outros alimentadores no mesmo percurso':'';
  if(!schedule.length){output.textContent=(history.days?(history.days+' dia(s) de histórico disponíveis. '):'')+'Informe a data e a capacidade diária para calcular o prazo da rota.'+shared;return;}
  output.textContent='Meta de '+km(plan.metresPerDay)+'/dia · '+schedule.length+' dia(s) útil(eis) · concluir até '+schedule.at(-1).day.split('-').reverse().join('/')+' · '+(historyCapacity?'mediana de '+history.days+' dias do inspetor':'capacidade definida no plano')+shared;
 }
 form.elements.assignee.addEventListener('change',()=>{
  const history=M.capacity(snapshot.routes,snapshot.visits,form.elements.assignee.value);
  form.elements.planCapacity.value=history.metres?history.metres/1000:'';historyCapacity=Boolean(history.metres);paintDeadline();
 });
 form.elements.planStart.addEventListener('input',paintDeadline);
 form.elements.planCapacity.addEventListener('input',()=>{historyCapacity=false;paintDeadline();});
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
  if(unique.size>10000)throw Error('Planeje até 10.000 vãos por rota.');
  draft=[...unique.values()];draftId=null;filteredDraft=false;paintDraft();
  status.textContent=draft.length+' vão(s) no plano.';
 }
 $('routePick').onclick=()=>{
  selecting=!selecting;$('routePick').setAttribute('aria-pressed',selecting);$('routePick').textContent=selecting?'Encerrar seleção':blockMode.checked?'Selecionar chaves no mapa':'Selecionar vãos no mapa';
  status.textContent=selecting?(blockMode.checked?'Clique em um vão da rede MT para marcar ou desmarcar a chave inteira.':'Clique nos vãos da rede MT abaixo. A ordem dos cliques define a rota.'):'Seleção encerrada.';
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
 panel.addEventListener('input',e=>{if(e.target.form===form&&e.target.name)draftId=null;if(e.target===form.elements.buffer)paintDraft();});
 $('routeOutlet').onclick=()=>{
  if(!draft.length){status.textContent='Inclua no plano o alimentador desde a saída da subestação até as pontas.';return;}
  status.textContent='Clique no ponto de saída da subestação no mapa.';
  window.CampoControlMap?.pickOutlet?.(point=>{
   const keys=M.keySections(draft,point);
   if(!keys.length){status.textContent='Saída sem conexão inequívoca a uma ponta T1 do recorte. Confira a saída e a continuidade da rede.';return;}
   outlet=point;draftId=null;draft=M.outletOrder(draft,outlet);paintDraft();
   $('routeOutletStatus').textContent='Saída vinculada · '+keys.length+' chave(s)';
   status.textContent='Saída vinculada à primeira ponta T1.';
  });
 };
 form.onsubmit=async e=>{
  e.preventDefault();
  if(publishing||pendingBlocks.size)return;
  if(!draft.length&&!job){status.textContent='Selecione pelo menos um vão.';return;}
  if(!job){
   const keyGroups=M.keySections(draft,outlet);
   if(!blockMode.checked&&draft.some(span=>span.block)&&!keyGroups.length){
    status.textContent='Marque a saída da subestação com a rede T1 conectada para habilitar a vistoria por chave.';return;
   }
   const known=new Set(keyGroups.flatMap(key=>key.segments.flatMap(segment=>segment.ids)));
   const plan=selectedPlan();
   if(!plan){status.textContent='Informe a data inicial e a capacidade diária em km para atribuir a rota.';return;}
   const ordered=M.outletOrder(draft,outlet);
   const gaps=ordered.slice(1).filter((s,i)=>M.distance(M.last(ordered[i]),M.first(s))>25);
   const parts=M.routeParts(ordered);
   const notices=[];
   if(blockMode.checked&&!keyGroups.length)notices.push('Sem saída T1 vinculada, o inspetor acompanha esta rota por GPS e vão.');
   if(keyGroups.length&&draft.some(span=>span.block&&!known.has(span.id)))notices.push('Parte da rede não tem continuidade comprovada com a saída escolhida e ficará disponível para GPS/vão.');
   if(parts.length>160){status.textContent='O recorte excedeu o tamanho de uma rota. Refine os filtros e tente novamente.';return;}
   if(parts.length>1)notices.push('O inspetor verá a rota inteira no mapa e poderá seguir '+parts.length+' partes numeradas.');
   if(gaps.length)notices.push('Há '+gaps.length+' intervalo(s) sem continuidade entre vãos. Use as ruas para se deslocar entre eles.');
   if(notices.length&&!confirm(notices.join(' ')+' Publicar?'))return;
   draftId??=crypto.randomUUID();
   const fields=Object.fromEntries(new FormData(form));delete fields.planStart;delete fields.planCapacity;
   job={index:0,parts:parts.map((spans,i)=>{
    const suffix=' ('+(i+1)+'/'+parts.length+')';
    return {...fields,homologation:fields.homologation==='on',...(outlet?{outlet}:{}),plan,name:parts.length===1?fields.name:fields.name.slice(0,100-suffix.length)+suffix,
     id:parts.length===1?draftId:draftId+'-'+(i+1),fromNetwork:true,spans,...(parts.length>1?{campaign:{id:draftId,index:i+1,total:parts.length,name:fields.name}}:{})};
   })};
   checkpoint();
  }
  const batch=job;
  publishing=true;$('routeAssign').disabled=true;paintCandidates();
  const locked=[...form.elements].filter(control=>control!==$('routeAssign')&&!control.disabled);
  for(const control of locked)control.disabled=true;
  try{
   for(;batch.index<batch.parts.length;){
    status.textContent='Publicando parte '+(batch.index+1)+' de '+batch.parts.length+'…';
    await api('/api/routes',batch.parts[batch.index]);
    if(job!==batch)return;
    batch.index++;checkpoint();
   }
   resetBlocks();draft=[];outlet=null;$('routeOutletStatus').textContent='Saída ainda não vinculada';job=null;checkpoint();draftId=null;filteredDraft=false;form.reset();form.elements.planStart.value=today();historyCapacity=false;paintDraft();
   status.textContent='Rota disponível para o inspetor em Minhas rotas.';
   try{await refresh();}catch{status.textContent+=' Use Atualizar para recarregar a lista de rotas.';}
  }catch(error){
   if(job!==batch)return;
   status.textContent=error.message+' · '+batch.index+'/'+batch.parts.length+' parte(s) confirmada(s). Retome nesta tela para evitar duplicação.';
   if(batch.index===0&&error.status>=400&&error.status<500){job=null;checkpoint();}
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
  const routes=snapshot.routes.filter(r=>($('routeShowTests').checked||!isTest(r))&&(!operator||r.assignee===operator)&&(!q||M.key([r.name,r.feeder,r.locality].join(' ')).includes(q))).sort((a,b)=>a.phase-b.phase),activeRoutes=routes.filter(r=>!r.returned&&!isTest(r));
  const ids=new Set(activeRoutes.map(r=>r.id)),visits=snapshot.visits.filter(v=>ids.has(v.routeId)),spans=planned(activeRoutes);
  const track=visits.filter(v=>inPeriod(v.day)).reduce((n,v)=>n+(v.trackMetres||0),0);
  const total=spans.reduce((n,s)=>n+s.metres,0),allCoverage=M.coverage(spans,visits),periodCoverage=M.coverage(spans,visits,v=>inPeriod(v.day)),all=allCoverage.metres,period=periodCoverage.metres;
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
  $('routeTotals').textContent='Planejado '+km(total)+' · confirmado no período '+km(period)+' · crédito paralelo '+km(periodCoverage.sharedMetres)+' · total creditado '+km(period+periodCoverage.sharedMetres)+' · GPS registrado '+km(track)+' · falta na campanha '+km(Math.max(0,total-all))+reconciliation;
  publishedGroups=M.campaignParts(routes);
  $('routePublished').innerHTML=publishedGroups.map(parts=>{
   const r=parts[0],routeSpans=parts.flatMap(part=>part.spans),routeIds=new Set(parts.map(part=>part.id));
   const related=snapshot.visits.filter(v=>routeIds.has(v.routeId)),done=M.coverage(routeSpans,related),last=related.at(-1),returned=r.returned;
   const total=M.metres(routeSpans),remaining=Math.max(0,total-done.metres),credited=done.metres+done.sharedMetres,targets=M.schedule(r.plan,total);
   const extras=[...done.shared.values()].filter(peer=>peer.covered>=peer.metres-.001),codes=[...new Set(extras.map(peer=>peer.feeder))];
   const shared=done.sharedMetres?' · '+km(done.sharedMetres)+' de outros alimentadores · '+extras.length+' vãos concluídos'+(codes.length?' ('+codes.join(', ')+')':''):'';
   const inFilter=M.coverage(routeSpans,related,v=>inPeriod(v.day)).metres;
   const returnedText=returned?`<p><strong>DEVOLVIDA · ${esc(returned.reason)}</strong> · por ${esc(returned.actorName)} em ${esc(new Date(returned.createdAt).toLocaleString('pt-BR'))}${returned.note?' · '+esc(returned.note):''}${returned.authorizedBy?' · autorizada por '+esc(returned.authorizedBy.name):''}</p>`:'';
   return `<div class="route-result"><strong>${esc(r.campaign?.name||r.name)}${isTest(r)?' · Homologação':''}</strong><small>${esc(r.locality)} · ${esc(r.feeder)} · ${esc(M.sectionLabel(r))} ${esc(r.zone)} · ${esc(teamLabel(r.assignee,r.operator))}</small>${returnedText}<p><strong>${km(total)} planejados</strong> · ${km(done.metres)} confirmados na rota · ${km(credited)} creditados no total · ${km(remaining)} pendentes${day||month?' · '+km(inFilter)+' vistoriados no período':''}${last?' · última em '+esc(last.day):''}${esc(shared)}${targets.length?' · prazo '+esc(targets.at(-1).day.split('-').reverse().join('/')):''}</p><div class="route-buttons"><label class="map-check"><input type="checkbox" data-route-choice="${esc(r.id)}"${selectedPublished.has(r.id)?' checked':''}> Selecionar para o mapa</label><button type="button" data-route-map="${esc(r.id)}">Ver rota</button>${returned?'':`<button type="button" class="secondary" data-route-withdraw="${esc(r.id)}">Retirar do inspetor</button>`}${!r.outlet&&!returned?`<button type="button" class="secondary" data-route-outlet="${esc(r.id)}">Vincular saída da subestação</button>`:''}${isTest(r)?`<button type="button" class="secondary" data-route-test-delete="${esc(r.id)}">Excluir homologação</button>`:`<button type="button" class="secondary" data-route-test-mark="${esc(r.id)}">Marcar como homologação</button>`}</div></div>`;
  }).join('')||'<p>Nenhuma rota neste filtro.</p>';
  paintRouteMapButtons();
  paintKpis();
 }
 function paintRouteMapButtons(){
  $('routeShowSelected').disabled=!publishedGroups.some(group=>selectedPublished.has(group[0].id));
  $('routeShowAll').disabled=!publishedGroups.length;
  $('routeClearPublished').disabled=!shownPublished.length;
 }
 function showPublished(groups,focus=true){
  if(focus)clearNetwork();
  const colors=['#78b8ff','#c3a5ff','#ffae77','#f0d65c','#7ee5c0','#ff99b2'];
  const overlays=groups.map((parts,index)=>{
   const route=parts[0],spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
   const cover=M.coverage(spans,snapshot.visits.filter(visit=>ids.has(visit.routeId)));
   return {spans,covered:cover.bySpan,buffer:M.bufferMetres(route.buffer),outlet:route.outlet,
    label:teamLabel(route.assignee,route.operator)+' · '+(route.campaign?.name||route.name),accent:colors[index%colors.length]};
  });
  shownPublished=groups.map(group=>group[0].id);
  if(window.CampoControlMap?.routeOverlayGroups)window.CampoControlMap.routeOverlayGroups(overlays,focus);
  else if(overlays.length===1)window.CampoControlMap?.routeOverlay?.(overlays[0].spans,overlays[0].covered,focus,overlays[0].buffer);
  $('routeHistoryStatus').textContent=groups.length?groups.length+' rota(s) no mapa. Verde indica trechos vistoriados e vermelho indica pendências.':'';
  paintRouteMapButtons();
 }
 $('routePublished').onchange=e=>{
  const id=e.target.dataset.routeChoice;
  if(!id)return;
  if(e.target.checked)selectedPublished.add(id);else selectedPublished.delete(id);
  paintRouteMapButtons();
 };
 $('routeShowSelected').onclick=()=>showPublished(publishedGroups.filter(group=>selectedPublished.has(group[0].id)));
 $('routeShowAll').onclick=()=>showPublished(publishedGroups);
 $('routeClearPublished').onclick=()=>{
  showPublished([],false);
  selectedPublished.clear();paint();
 };
 $('routePublished').onclick=async e=>{
   const {routeOutlet:legacyOutlet,routeTestDelete:remove,routeTestMark:mark}=e.target.dataset;
   const historyStatus=$('routeHistoryStatus');
   if(legacyOutlet){
    const group=M.campaignParts(snapshot.routes).find(parts=>parts[0].id===legacyOutlet);
    if(group)window.CampoControlMap?.routeOverlay?.(group.flatMap(part=>part.spans),new Map(),true,M.bufferMetres(group[0].buffer));
    historyStatus.textContent='Clique na saída da subestação no mapa.';
    window.CampoControlMap?.pickOutlet?.(async point=>{
     try{
      await api('/api/routes/saida',{routeId:legacyOutlet,outlet:point});
      historyStatus.textContent='Saída vinculada. As chaves estarão disponíveis ao sincronizar a rota.';
      await refresh();
     }catch(error){historyStatus.textContent=error.message;}
    });
    return;
   }
   if(remove||mark){
    if(!confirm(remove?'Excluir esta rota de homologação das telas de campo e gestão?':'Classificar esta rota como homologação e retirar dos indicadores?'))return;
    e.target.disabled=true;
    try{await api('/api/routes/homologacao',{routeId:remove||mark,action:remove?'delete':'classify'});await refresh();}
    catch(error){historyStatus.textContent=error.message;e.target.disabled=false;}
    return;
   }
   if(e.target.dataset.routeWithdraw){
    const parts=M.campaignParts(snapshot.routes).find(group=>group[0].id===e.target.dataset.routeWithdraw);if(!parts||parts[0].returned||withdrawing)return;
    withdrawRoute=parts[0];$('routeWithdrawForm').reset();$('routeWithdrawFeedback').textContent='';$('routeWithdrawSummary').textContent=(withdrawRoute.campaign?.name||withdrawRoute.name)+' · '+withdrawRoute.operator+' · '+withdrawRoute.feeder;
    if(typeof withdrawDialog.showModal==='function')withdrawDialog.showModal();else withdrawDialog.setAttribute('open','');return;
   }
   const group=publishedGroups.find(parts=>parts[0].id===e.target.dataset.routeMap);
   if(group)showPublished([group]);
 };
 const closeWithdraw=()=>{if(withdrawing)return;withdrawRoute=null;if(typeof withdrawDialog.close==='function')withdrawDialog.close();else withdrawDialog.removeAttribute('open');};
 $('routeWithdrawClose').onclick=closeWithdraw;
 $('routeWithdrawForm').onsubmit=async e=>{
   e.preventDefault();if(!withdrawRoute||withdrawing)return;
   const reasonCode=$('routeWithdrawReason').value,note=$('routeWithdrawNote').value.trim(),feedback=$('routeWithdrawFeedback');
   if(reasonCode==='gestao_outro'&&!note){feedback.textContent='Descreva o motivo da retirada.';return;}
   withdrawing=true;$('routeWithdrawConfirm').disabled=true;feedback.textContent='Retirando a rota…';
   try{
    await api('/api/routes/return',{id:crypto.randomUUID(),routeId:withdrawRoute.id,reasonCode,note});
    const name=withdrawRoute.campaign?.name||withdrawRoute.name;withdrawRoute=null;if(typeof withdrawDialog.close==='function')withdrawDialog.close();else withdrawDialog.removeAttribute('open');
    status.textContent='Rota “'+name+'” retirada do inspetor. O histórico recebido foi preservado.';await refresh();
   }catch(error){feedback.textContent=error.message;}finally{withdrawing=false;$('routeWithdrawConfirm').disabled=false;}
 };

 function paintKpis(){
  const from=$('routeKpiStart').value,through=$('routeKpiEnd').value,assignee=$('routeKpiOperator').value,table=$('routeKpiTable');
  if(from&&through&&from>through){table.textContent='Confira o intervalo de datas.';return;}
  const inPeriod=day=>(!from||day>=from)&&(!through||day<=through),asOf=through&&through<today()?through:today();
  const rows=new Map();
  for(const parts of M.campaignParts(snapshot.routes.filter(route=>!route.returned&&!isTest(route)&&(!assignee||route.assignee===assignee)))){
   const route=parts[0],spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
   const daily=M.dailyCoverage(spans,snapshot.visits.filter(visit=>ids.has(visit.routeId))),targets=M.schedule(route.plan,M.metres(spans));
   const work=daily.filter(entry=>inPeriod(entry.day)),due=targets.filter(entry=>inPeriod(entry.day)).reduce((sum,entry)=>sum+entry.metres,0);
   if(!work.length&&!due)continue;
    const done=work.reduce((sum,entry)=>sum+entry.metres+entry.sharedMetres,0);
   const expected=targets.filter(entry=>entry.day<=asOf).reduce((sum,entry)=>sum+entry.metres,0);
    const achieved=daily.filter(entry=>entry.day<=asOf).reduce((sum,entry)=>sum+entry.metres+entry.sharedMetres,0);
   if(!rows.has(route.assignee))rows.set(route.assignee,{name:route.operator,due:0,done:0,credited:0,shared:0,track:0,days:new Set(),lag:0,expected:0});
   const row=rows.get(route.assignee);
   row.due+=due;row.done+=done;row.credited+=Math.min(done,due);row.expected+=expected;
   row.shared+=work.reduce((sum,entry)=>sum+entry.sharedMetres,0);row.track+=work.reduce((sum,entry)=>sum+entry.track,0);
   if(expected>achieved+.01)row.lag++;
   for(const entry of work)row.days.add(entry.day);
  }
  if(!rows.size){table.textContent='Nenhuma rota com meta ou vistoria no período.';return;}
  const pct=f=>f.toLocaleString('pt-BR',{style:'percent',maximumFractionDigits:1});
   table.innerHTML='<table><thead><tr><th>Equipe / inspetor</th><th>Meta</th><th>Rede vistoriada creditada</th><th>Cumprimento</th><th>Desse total, rede paralela</th><th>GPS</th><th>Dias de saída</th><th>Situação até a data</th><th>Ver rota</th></tr></thead><tbody>'+[...rows.entries()].map(([id,row])=>'<tr><td>'+esc(teamLabel(id,row.name))+'</td><td>'+km(row.due)+'</td><td>'+km(row.done)+'</td><td>'+(row.due?pct(row.credited/row.due):'Sem meta')+'</td><td>'+km(row.shared)+'</td><td>'+km(row.track)+'</td><td>'+row.days.size+'</td><td>'+(row.lag?row.lag+' rota(s) abaixo da meta acumulada':row.expected?'Em dia com o plano':row.due?'Meta futura':'Sem meta registrada')+'</td><td><button type="button" data-kpi-map="'+esc(id)+'">Ver rotas</button></td></tr>').join('')+'</tbody></table>';
 }
 $('routeKpiTable').onclick=e=>{
  const id=e.target.dataset.kpiMap;
  if(id)showPublished(M.campaignParts(snapshot.routes.filter(route=>route.assignee===id&&!route.returned&&!isTest(route))));
 };
 for(const id of ['routeKpiStart','routeKpiEnd','routeKpiOperator'])$(id).addEventListener('input',paintKpis);
 async function refresh(){
  if(!window.CampoControl?.authorized())return;
  const [state,accounts,teams]=await Promise.all([api('/api/routes'),api('/api/admin/users'),api('/api/admin/gerencial/equipes').catch(()=>({}))]);
  if(!window.CampoControl?.authorized())return;
  snapshot=state;
  const names=new Map((teams.teams||[]).map(team=>[team.id,team.name]));
  teamByAccount=new Map((teams.members||[]).filter(member=>names.has(member.teamId)).map(member=>[member.userId,names.get(member.teamId)]));
  const users=(accounts.users||[]).filter(u=>!u.blocked&&!u.deleted_at&&u.passwordConfigured);
  for(const select of [form.elements.assignee,$('routeOperator'),$('routeKpiOperator')]){
   const old=select.value;select.replaceChildren(new Option(select===form.elements.assignee?'Selecione':'Todos',''));
   for(const u of users)select.add(new Option(teamLabel(u.id,u.name),u.id));select.value=old;
  }
  paint();
  if(shownPublished.length){
   const shown=new Set(shownPublished);
   showPublished(M.campaignParts(snapshot.routes).filter(group=>shown.has(group[0].id)),false);
  }
 }
 const load=()=>void refresh().catch(e=>{status.textContent=e.message;});
 window.addEventListener('campo-gerencial-equipes',load);
 $('routeRefresh').onclick=load;for(const section of panel.querySelectorAll('details'))section.addEventListener('toggle',e=>{if(e.target.open)load();});
 for(const id of ['routeDay','routeMonth','routeOperator','routeFilter','routeShowTests'])$(id).addEventListener('input',()=>{
  if(id==='routeDay'&&$(id).value)$('routeMonth').value='';
  if(id==='routeMonth'&&$(id).value)$('routeDay').value='';
  paint();
 });
 paintDraft();
 window.CampoRoutePlanner={
  refresh:load,
  picking:()=>selecting&&!job,
  select(f){
   if(!$('routePlan').open||!selecting||job)return false;
   const layer=String(f.properties?._layer||'').normalize('NFD').toUpperCase().replace(/[^A-Z0-9]/g,'');
   if(!f.geometry?.type?.endsWith('LineString')||(f.properties?._class&&f.properties._class!=='MT'&&!/VAO.*(?:MT|PRIMARIA)|REDE.*(?:MT|PRIMARIA)/.test(layer)))return false;
   const candidate=candidates.find(x=>x.feature.id===f.id);
   if(blockMode.checked){
    const toggle=span=>{
     if(!span.block){blockStatus.textContent='Vão sem chave cadastrada.';return;}
     void selectBlock(span.block,!chosenBlocks.has(span.block)&&!pendingBlocks.has(span.block));
    };
    if(candidate){toggle(candidate.span);return true;}
    try{const span=M.feature(f);if(span.block||!f.id){toggle(span);return true;}}catch{}
    const serial=filterRequest;
    void window.CampoControlMap.routeNetwork({featureId:f.id}).then(result=>{
     if(!selecting||!blockMode.checked||serial!==filterRequest||job)return;
     if(!result.features.length)throw Error('Vão MT indisponível na base instalada.');
     toggle(M.feature(result.features[0]));
    }).catch(error=>{if(selecting&&blockMode.checked&&serial===filterRequest)blockStatus.textContent=error.message;});
    return true;
   }
   if(candidate){add([candidate.span]);return true;}
   if(!f.id){try{add([M.feature(f)]);}catch(e){status.textContent=e.message;}return true;}
   const serial=filterRequest;
   void window.CampoControlMap.routeNetwork({featureId:f.id}).then(result=>{
    if(!selecting||serial!==filterRequest||job)return;
    if(!result.features.length)throw Error('Vão MT indisponível na base instalada.');
    add([M.feature(result.features[0])]);
   }).catch(e=>{status.textContent=e.message;});
   return true;
  },
  feeders(values){
   for(const value of values)if(value)feedersList.add(value);
   $('routeFeederSuggestions').replaceChildren(...[...feedersList].sort().map(f=>new Option(f,f)));
  },
  open(){
   if(location.hash==='#routePlanner')$('routePlan').open=true;
   void window.CampoControlMap?.routeCatalogue?.()?.then(data=>window.CampoRoutePlanner.feeders(data.feeders)).catch(e=>{if(!feedersList.size)searchStatus.textContent=e.message;});
   if(!job)try{
    const saved=JSON.parse(sessionStorage.getItem(jobKey)||'null');
    if(saved?.parts?.length&&saved.index<saved.parts.length){job=saved;draft=saved.parts.flatMap(part=>part.spans);$('routePlan').open=true;status.textContent='Rota com publicação interrompida. Use Retomar atribuição.';paintDraft();}
   }catch{}
   load();
  },
  stop(){selecting=false;clearTimeout(filterTimer);job=null;checkpoint();filteredDraft=false;draft=[];draftId=null;snapshot={routes:[],visits:[]};shownPublished=[];selectedPublished.clear();teamByAccount.clear();sgm=null;form.reset();form.elements.planStart.value=today();historyCapacity=false;blockMode.checked=false;resetBlocks();search.reset();clearNetwork();paintDraft();paint();$('routePick').setAttribute('aria-pressed','false');$('routePick').textContent='Selecionar vãos no mapa';}
 };
})();
