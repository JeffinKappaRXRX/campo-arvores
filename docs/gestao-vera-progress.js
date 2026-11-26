'use strict';
(()=>{
 const root=document.getElementById('veraProgress');
 if(!root)return;
 const core=CampoVeraProgress;
 const localDay=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Rio_Branco'}).format(new Date());
 const km=metres=>(metres/1000).toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:3});
 const int=value=>value.toLocaleString('pt-BR');
 const stamp=timestamp=>new Date(timestamp).toLocaleString('pt-BR',{timeZone:'America/Rio_Branco',dateStyle:'short'});
 const monthName=value=>new Date(value+'-15T12:00:00Z').toLocaleString('pt-BR',{month:'short',timeZone:'America/Rio_Branco'});
 const dateLabel=value=>value.length===7?monthName(value):value.slice(8,10)+'/'+value.slice(5,7);
 const el=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
 root.innerHTML=`
  <div class="panel-head"><h3 id="veraProgressTitle">Avanço de inspeção VERA · EAC</h3></div>
  <p data-progress="status" class="small" role="status"></p>
  <div class="vera-progress-filters">
   <label>Visão<select data-progress="view"><option value="day">Por dia</option><option value="month" selected>Por mês</option></select></label>
   <label data-progress="monthLabel" hidden>Mês<input type="month" data-progress="month" min="2025-01"></label>
   <label data-progress="yearLabel">Ano<input type="number" data-progress="year" min="2025" max="2099" step="1"></label>
   <label>Alimentador<select data-progress="feeder"><option value="">Todos</option></select></label>
   <label>Trecho<select data-progress="section"><option value="12">T1 + T2</option><option value="">Todos</option><option value="1">T1</option><option value="2">T2</option><option value="3">T3</option></select></label>
  </div>
  <div class="vera-progress-totals" data-progress="totals"></div>
  <div class="vera-progress-scroll" data-progress="periods"></div>
  <p class="small" data-progress="routeNote"></p>
  <p class="small" data-progress="treeNote"></p>
  <details data-progress="details"><summary>Alimentadores, chaves e vãos</summary>
   <div class="vera-progress-scroll" data-progress="feeders"></div>
   <label>Buscar alimentador, chave ou ID do vão<input type="search" data-progress="spanQuery"></label>
   <div class="vera-progress-scroll" data-progress="spans"></div>
  </details>
  <h4>Meta pactuada e antecipação por ano</h4>
  <div class="vera-progress-scroll" data-progress="annual"></div>
  <p class="small" data-progress="annualNote"></p>
  <details data-progress="orderDetails"><summary>Ordens de serviço VERA · SGM</summary>
   <label>Situação<select data-progress="orderStatus"><option value="executada">Executadas no período</option><option value="pendente">Pendentes atuais</option></select></label>
   <div class="vera-progress-scroll" data-progress="orders"></div>
  </details>
  <div class="vera-progress-actions">
   <button type="button" data-progress="reload">Atualizar avanço</button>
   <details><summary>Enviar histórico VERA</summary>
    <label>Extrato histórico JSON<input type="file" data-progress="file" accept=".json,application/json"></label>
   </details>
  </div>`;
 const get=name=>root.querySelector('[data-progress="'+name+'"]');
 let history,sgm,historyUpdatedAt,sgmUpdatedAt,snapshot={},ledger=null,selection=null;
 let generation=0,lastLoad=0,pending=false,requestError='';
 const setupDate=localDay();
 get('month').value=setupDate.slice(0,7);
 get('year').value=setupDate.slice(0,4);
 function table(target,labels,rows,empty){
  if(!rows.length){target.replaceChildren(el('p',empty));return;}
  const out=el('table'),head=out.createTHead().insertRow();
  for(const label of labels){const cell=el('th',label);cell.scope='col';head.append(cell);}
  const body=out.createTBody();
  for(const row of rows){
   const tr=body.insertRow();
   for(const content of row){const cell=tr.insertCell();if(content instanceof Node)cell.append(content);else cell.textContent=content;}
  }
  target.replaceChildren(out);
 }
 function summary(target,value,label){
  const item=el('div');item.append(el('strong',value),el('span',label));target.append(item);
 }
 function options(){
  const field=get('view').value,year=get('year').value;
  return {field,period:field==='day'?get('month').value:year,feeder:get('feeder').value,section:get('section').value};
 }
 function rebuild(){
  ledger=core.ledger(history||{},sgm||{},snapshot);
  const feeders=[...new Set([...ledger.credited.map(row=>row.feeder),...ledger.trees.map(row=>row[1]),...ledger.orders.map(row=>row.feeder)])].filter(Boolean).sort();
  const choice=get('feeder').value;
  get('feeder').replaceChildren(new Option('Todos',''),...feeders.map(feeder=>new Option(feeder,feeder)));
  get('feeder').value=feeders.includes(choice)?choice:'';
  render();
 }
 function renderSpans(){
  if(!ledger||!selection||!get('details').open)return;
  const {period,field,feeder,section}=options(),query=get('spanQuery').value.trim().toUpperCase();
  if(!period)return;
  const rows=ledger.credited.filter(row=>row.day.startsWith(field==='day'?period.slice(0,7):period.slice(0,4))&&
   (!feeder||row.feeder===feeder)&&(!section||(section==='12'?['1','2'].includes(row.section):row.section===section))&&
   (!query||[row.feeder,row.block,row.id].some(value=>value.includes(query))));
  table(get('feeders'),['Alimentador','Rede vistoriada (km)','Rotas ARBORA (km)'],selection.feeders
   .filter(row=>!query||row.feeder.includes(query)).map(row=>[row.feeder,km(row.metres),km(row.routeMetres)]),
   'Nenhum alimentador no recorte.');
  const spanTarget=get('spans');
  table(spanTarget,['Alimentador','Chave','Vão','Data','km','Fonte'],rows.slice(0,250).map(row=>
   [row.feeder,row.block||'—',row.id,dateLabel(row.day),km(row.metres),row.source]),'Nenhum vão neste recorte.');
  if(rows.length>250)spanTarget.prepend(el('p','Primeiros 250 de '+int(rows.length)+' lançamentos. Use a busca para detalhar.'));
 }
 function renderOrders(){
  if(!selection||!get('orderDetails').open)return;
  const status=get('orderStatus').value;
  const orders=selection.orders.filter(order=>order.status===status).sort((a,b)=>b.day.localeCompare(a.day)||a.number.localeCompare(b.number));
  table(get('orders'),['OS','Alimentador / chave','Término','Inspetor / equipe','Vínculo'],orders.map(order=>[
   order.number||order.id,[order.feeder,order.block].filter(Boolean).join(' · ')||'—',
   order.day?dateLabel(order.day)+'/'+order.day.slice(0,4):'—',[order.inspector,order.team].filter(Boolean).join(' · ')||'—',order.link
  ]),'Nenhuma OS nesta situação.');
 }
 function render(){
  const filter=options(),{field,period}=filter;
  get('monthLabel').hidden=field!=='day';
  get('yearLabel').hidden=field!=='month';
  if(!ledger||!period)return;
  selection=core.select(ledger,filter);
  const {periods,metres,routeMetres,netRouteMetres,trees,orders}=selection;
  const totals=get('totals');
  totals.replaceChildren();
  summary(totals,km(metres)+' km','Rede vistoriada');
  summary(totals,Array.isArray(snapshot.visits)?km(routeMetres)+' km':'–','Rotas confirmadas no ARBORA');
  get('routeNote').textContent=routeMetres>0?km(netRouteMetres)+' km das rotas entraram no total consolidado após cruzar os vãos com VERA e SGM.':'';
  summary(totals,history?int(trees):'—','Árvores da planilha');
  summary(totals,orders.filter(row=>row.status==='executada').length.toLocaleString('pt-BR'),'OS executadas no período');
  summary(totals,orders.filter(row=>row.status==='pendente').length.toLocaleString('pt-BR'),sgm?'OS pendentes':'OS pendentes na planilha');
  table(get('periods'),[field==='day'?'Dia':'Mês','km','km acum.','Árvores','Árv. acum.'],periods.map(row=>[
   dateLabel(row.when),km(row.metres),km(row.accumulated),history?int(row.trees):'—',history?int(row.accumulatedTrees):'—'
  ]),'Sem lançamentos no período selecionado.');
  const today=localDay();
  get('treeNote').textContent=ledger.trees.some(([day])=>day>today&&day.startsWith(period))?'A planilha contém árvores com data posterior a hoje neste recorte. Consulte os meses na tabela.':'';
  const goals=core.annual(ledger,today);
  table(get('annual'),['Ano','Meta (km)','Real do ano','Antecipado¹','Saldo da meta'],goals.map(row=>[
   String(row.year),km(row.target),km(row.realised),km(row.advance),km(row.pending)
  ]),'');
  const historic=ledger.credited.filter(row=>row.day.startsWith('2025-')&&['1','2'].includes(row.section)).reduce((n,row)=>n+row.metres,0);
  get('annualNote').textContent=(history?'Base 2025 (T1 + T2) '+km(historic)+' km. ':'')+
   '¹ Crédito de anos anteriores do ciclo 2026–2028. A meta de 2026 considera T1 e T2. A tabela EAC independe do filtro de alimentador.';
  renderSpans();renderOrders();
 }
 function status(){
  const parts=[history?'Histórico VERA de 2025 e 2026':'Histórico VERA aguardando envio',
   sgm?'SGM recebido em '+stamp(sgmUpdatedAt||sgm.files[0].modified):'SGM diário aguardando primeiro envio'];
  get('status').textContent=requestError||parts.join(' · ');
 }
 async function load(force=false){
  if(!window.CampoControl?.authorized()||pending||(!force&&Date.now()-lastLoad<300000))return;
  const current=generation;
  pending=true;
  get('reload').disabled=true;
  try{
   const result=await window.CampoControl.api('/api/vera/progress');
   if(current!==generation)return;
   ({history,sgm,historyUpdatedAt,sgmUpdatedAt}=result);
   requestError='';
   lastLoad=Date.now();
   rebuild();
  }catch(error){if(current===generation)requestError=error.message+(historyUpdatedAt?' · Mantido o histórico anterior.':'');}
  finally{if(current===generation){pending=false;get('reload').disabled=false;status();}}
 }
 get('reload').onclick=()=>void load(true);
 for(const name of ['view','month','year','section','feeder'])get(name).addEventListener('change',render);
 get('spanQuery').addEventListener('input',renderSpans);
 get('details').addEventListener('toggle',renderSpans);
 get('orderDetails').addEventListener('toggle',renderOrders);
 get('orderStatus').addEventListener('change',renderOrders);
 get('file').addEventListener('change',async event=>{
  const input=event.target,file=input.files[0];
  if(!file)return;
  try{
   if(file.size>8000000)throw Error('O extrato histórico excede 8 MB.');
   const body=JSON.parse(await file.text());
   if(!confirm('Atualizar o histórico VERA do painel de gestão?'))return;
   input.disabled=true;
   await window.CampoControl.api('/api/vera/progress',body);
   await load(true);
  }catch(error){get('status').textContent=error.message;}
  finally{input.value='';input.disabled=false;}
 });
 window.addEventListener('campo-control-logout',()=>{
  generation++;lastLoad=0;pending=false;requestError='';
  history=sgm=historyUpdatedAt=sgmUpdatedAt=null;snapshot={};ledger=selection=null;
  for(const name of ['annual','annualNote','periods','routeNote','treeNote','feeders','spans','orders','totals','status'])get(name).replaceChildren();
  get('feeder').replaceChildren(new Option('Todos',''));
  get('reload').disabled=false;
 });
 window.CampoVeraDashboard={load,updateRoutes(state){snapshot=state;rebuild();void load();}};
})();
