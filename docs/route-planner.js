'use strict';
(()=>{
 const M=CampoRoutes,$=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const api=(...args)=>window.CampoControl.api(...args);
 const km=m=>(m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 const panel=document.createElement('article');panel.className='panel route-card';panel.id='routePlanner';
 panel.innerHTML=`<div class="panel-head"><h3>Rotas de vistoria</h3><button type="button" id="routeRefresh">Atualizar</button></div>
 <details><summary>Planejar e atribuir</summary><form id="routePlanForm">
 <div class="route-grid"><label>Nome da rota<input name="name" maxlength="100" required></label><label>Inspetor<select name="assignee" required></select></label>
 <label>Localidade<input name="locality" required></label><label>Alimentador<input name="feeder" required></label>
 <label>Zona<select name="zone"><option>Urbano</option><option>Rural</option></select></label>
 <label>Trecho<select name="section"><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option></select></label></div>
 <p>Adicione os vãos MT na ordem da vistoria. Use a rede do mapa ou importe um GeoJSON da rota.</p>
 <div class="route-buttons"><button type="button" id="routePick">Selecionar vãos no mapa</button><label>Importar GeoJSON <input id="routeImport" type="file" accept=".json,.geojson,application/geo+json"></label></div>
 <ol id="routeDraftList" class="route-list"></ol><p id="routePlanned"></p>
 <button type="submit" class="primary">Atribuir rota</button></form></details>
 <p id="routePlannerStatus" role="status"></p>
 <div class="route-grid"><label>Dia da vistoria<input id="routeDay" type="date"></label><label>Mês da vistoria<input id="routeMonth" type="month"></label>
 <label>Inspetor<select id="routeOperator"><option value="">Todos</option></select></label><label>Recorte<input id="routeFilter" type="search" placeholder="Localidade, alimentador ou rota"></label>
 <label>OS_VERA para conciliação<input id="routeSgm" type="file" accept=".csv,.txt,text/csv"></label></div><p id="routeSgmStatus" role="status">Importe o CSV da OS_VERA para comparar por chave e data de término.</p>
 <p id="routeTotals" aria-live="polite"></p><div id="routePublished"></div>`;
 $('controlMap').before(panel);
 const form=$('routePlanForm'),status=$('routePlannerStatus');
 let draft=[],draftId=null,selecting=false,snapshot={routes:[],visits:[]},sgm=null;
 const planned=routes=>[...new Map(routes.flatMap(r=>r.spans).map(s=>[s.id,s])).values()];
 function paintDraft(){
  $('routePlanned').textContent=draft.length?km(draft.reduce((n,s)=>n+s.metres,0))+' · início '+draft[0].id+' · fim '+draft.at(-1).id:'Adicione pelo menos um vão.';
  $('routeDraftList').innerHTML=draft.map((s,i)=>`<li><b>${esc(s.id)}</b> · ${km(s.metres)} · ${esc(s.block)} <button type="button" data-up="${i}" ${i===0?'disabled':''}>Subir</button> <button type="button" data-reverse="${i}">Inverter sentido</button> <button type="button" data-remove="${i}">Remover</button></li>`).join('');
  window.CampoControlMap?.routeOverlay?.(draft,null,false);
 }
 function add(spans){
  if(!spans.length)return;
  const first=spans[0],f=form.elements;
  if(!f.locality.value)f.locality.value=first.locality;
  if(!f.feeder.value)f.feeder.value=first.feeder;
  if(!draft.length&&M.phase(first.zone,first.section)){f.zone.value=first.zone==='RURAL'?'Rural':'Urbano';f.section.value=first.section;}
  const unique=new Map(draft.map(s=>[s.id,s]));
  for(const span of spans){
   if(unique.has(span.id))continue;
   const previous=[...unique.values()].at(-1);
   if(previous&&M.distance(M.last(previous),M.last(span))<M.distance(M.last(previous),M.first(span)))span.reverse=!span.reverse;
   unique.set(span.id,span);
  }
  if(unique.size>250)throw Error('Divida o planejamento em rotas de até 250 vãos.');
  draft=[...unique.values()];draftId=null;paintDraft();
  status.textContent=draft.length+' vão(s) no plano.';
 }
 $('routePick').onclick=()=>{
  selecting=!selecting;$('routePick').textContent=selecting?'Encerrar seleção':'Selecionar vãos no mapa';
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
  const {up,reverse,remove}=e.target.dataset;
  if(remove!==undefined)draft.splice(Number(remove),1);
  else if(reverse!==undefined)draft[Number(reverse)].reverse=!draft[Number(reverse)].reverse;
  else if(up!==undefined){const i=Number(up);if(!i)return;[draft[i-1],draft[i]]=[draft[i],draft[i-1]];}
  else return;
  draftId=null;paintDraft();
 };
 panel.addEventListener('input',e=>{if(e.target.form===form&&e.target.name)draftId=null;});
 form.onsubmit=async e=>{
  e.preventDefault();if(!draft.length){status.textContent='Selecione pelo menos um vão.';return;}
  const button=form.querySelector('[type=submit]');button.disabled=true;
  try{
   const gaps=draft.slice(1).filter((s,i)=>M.distance(M.last(draft[i]),M.first(s))>25);
   if(gaps.length&&!confirm('Há '+gaps.length+' salto(s) entre vãos. Publique assim se houver deslocamento planejado entre eles.'))return;
   draftId??=crypto.randomUUID();
   await api('/api/routes',{...Object.fromEntries(new FormData(form)),id:draftId,spans:draft});
   draft=[];draftId=null;form.reset();paintDraft();await refresh();status.textContent='Rota publicada para o inspetor baixar.';
  }catch(error){status.textContent=error.message;}finally{button.disabled=false;}
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
   return `<div class="route-result"><strong>${esc(r.name)}</strong><small>${esc(r.locality)} · ${esc(r.feeder)} · T${esc(r.section)} ${esc(r.zone)} · ${esc(r.operator)}</small><p>${km(done.metres)} confirmados · ${miss.length} vão(s) com pendência${last?' · última em '+esc(last.day):''}</p><button type="button" data-route-map="${esc(r.id)}">${miss.length?'Ver de onde retomar':'Ver cobertura'}</button></div>`;
  }).join('')||'<p>Nenhuma rota neste filtro.</p>';
 }
 $('routePublished').onclick=e=>{
  const route=snapshot.routes.find(r=>r.id===e.target.dataset.routeMap);if(!route)return;
  const cover=M.coverage(route.spans,snapshot.visits.filter(v=>v.routeId===route.id));
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
 $('routeRefresh').onclick=load;panel.querySelector('details').addEventListener('toggle',e=>{if(e.target.open)load();});
 for(const id of ['routeDay','routeMonth','routeOperator','routeFilter'])$(id).addEventListener('input',()=>{
  if(id==='routeDay'&&$(id).value)$('routeMonth').value='';
  if(id==='routeMonth'&&$(id).value)$('routeDay').value='';
  paint();
 });
 window.CampoRoutePlanner={
  select(f){if(!selecting)return false;try{add([M.feature(f)]);}catch(e){status.textContent=e.message;}return true;},
  open:load,
  stop(){selecting=false;draft=[];draftId=null;snapshot={routes:[],visits:[]};sgm=null;form.reset();paintDraft();paint();}
 };
})();
