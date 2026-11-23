'use strict';
(()=>{
 const $=id=>document.getElementById(id),F=CampoConsultaFiltros;
 const number=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1});
 const distance=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3});
 const dateTime=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Rio_Branco',dateStyle:'short',timeStyle:'short'});
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Rio_Branco'}).format(new Date());
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=value=>Number.isFinite(value)?number.format(value):'—';
 const km=value=>distance.format(value/1000)+' km';
 const pct=value=>value.toLocaleString('pt-BR',{style:'percent',maximumFractionDigits:1});
 const fields=$('filters').elements;
 fields.from.value=today.slice(0,7)+'-01';fields.to.value=today;
 let data,map,routeLayer,treeLayer,qualityLayer,loadSerial=0,loading=false;
 let qualityRows=[],qualityVisible=false;
 let treeController=null,treeSignature='';
 let availableRoutes=[],selectedRoutes=new Set(),shownRoutes=[],viewMode=null,mapSignature='',mapController=null;
 function filterValues(){
  return {from:fields.from.value,through:fields.to.value,inspectors:fields.inspector.value?[fields.inspector.value]:[]};
 }
 async function api(path,options={}){
  const response=await fetch('/api/gerencial/'+path,{cache:'no-store',credentials:'same-origin',...options});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(Error(result.error||'Consulta temporariamente indisponível.'),{status:response.status});
  return result;
 }
 function table(headers,rows,empty){
  if(!rows.length)return '<p>'+empty+'</p>';
  return '<table><thead><tr>'+headers.map(header=>'<th scope="col">'+header+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }
 function duration(seconds){
  if(!Number.isFinite(seconds))return '—';
  const rounded=Math.round(seconds);
  return Math.floor(rounded/60)+'min '+String(rounded%60).padStart(2,'0')+'s';
 }
 function refreshForecast(summary,daily,operators,todayInPeriod){
  const people=operators.reduce((sum,team)=>sum+team.operatorCount,0),goal=100*people,minimum=70*people;
  const count=daily.find(row=>row.name===today)?.count||0;
  const estimation=CampoForecast.estimate(goal,summary.mean);
  $('forecast').textContent=estimation?.active!=null?fmt(estimation.active)+' horas ativas no total · '+CampoForecast.span(estimation.days/people):'Tempo ainda não medido';
  $('forecastTarget').textContent=people?fmt(goal)+' cadastros de meta por dia · '+fmt(people)+(people===1?' inspetor':' inspetores')+' · Média do filtro e jornada de 8 h ativas por pessoa.':'Nenhum inspetor no recorte.';
  $('dailyGoal').textContent=todayInPeriod&&goal?fmt(count)+' hoje · '+pct(count/goal)+' da meta de '+fmt(goal)+' cadastros'+(count<minimum?' · faltam '+fmt(minimum-count)+' para o mínimo':''):'';
 }
 function productivity(rows,operators,todayInPeriod){
  const summary=F.summary(rows);
  const daily=F.group(rows,'day').filter(row=>row.name!=='Não informado').sort((a,b)=>F.compare(b.name,a.name)).slice(0,31);
  const max=Math.max(1,...daily.map(row=>row.count));
  $('daily').innerHTML=[...daily].reverse().map(row=>{
   const day=row.name.slice(5).split('-').reverse().join('/');
   return '<div class="daily-bar" title="'+esc(day)+' · '+row.count+' cadastros">'+row.count+'<i style="height:'+Math.max(3,Math.round(100*row.count/max))+'px"></i>'+esc(day)+'</div>';
  }).join('')||'<p>Nenhum cadastro de campo no período.</p>';
  refreshForecast(summary,daily,operators,todayInPeriod);
  const metrics=[
   ['Cadastros',fmt(summary.count),fmt(summary.count-summary.grouped)+' individuais · '+fmt(summary.grouped)+' agrupados'],
   ['Tempo médio por cadastro',duration(summary.mean),fmt(summary.measured)+' cadastros com tempo medido'],
   ['Necessitam de poda',fmt(summary.poda),summary.count?pct(summary.poda/summary.count)+' do total':'Sem registros'],
   ['Qualidade cadastral',fmt(summary.missing)+' incompletos',fmt(summary.identification)+' sem identificação']
  ];
  $('metrics').innerHTML=metrics.map(([name,value,description])=>'<article class="panel metric"><span>'+name+'</span><strong>'+esc(value)+'</strong><small>'+esc(description)+'</small></article>').join('');
  $('positions').innerHTML=F.group(rows,'position').map(row=>'<div class="position"><span>'+esc(row.name)+'</span><meter max="'+summary.count+'" value="'+row.count+'"></meter><b>'+fmt(row.count)+'</b></div>').join('')||'<p>Nenhum cadastro de campo no período.</p>';
  $('feedersKpi').innerHTML=table(['Alimentador','Cadastros','Poda','Tempo médio'],F.group(rows,'feeder').map(row=>[esc(row.name),fmt(row.count),fmt(row.poda),duration(row.mean)]),'Nenhum alimentador no recorte.');
  const groups=new Map(F.group(rows,'inspector').map(row=>[row.name,row]));
  $('inspectors').innerHTML=table(['Equipe','Cadastros','Tempo médio','Mediana','Cadastros / hora ativa','Tempo medido','Poda','Sem identificação','Incompletos','Hoje','Meta diária'],operators.map(team=>{
   const row=groups.get(team.id)||F.summary([]);
   const todayCount=rows.filter(record=>record.day===today&&record.inspector===team.id).length;
   return [esc(team.label),fmt(row.count),duration(row.mean),duration(row.median),fmt(row.measured/row.hours),fmt(row.measured)+' / '+fmt(row.count),fmt(row.poda),fmt(row.identification),fmt(row.missing),todayInPeriod?fmt(todayCount):'—',todayInPeriod?pct(todayCount/(100*team.operatorCount)):'—'];
  }),'Nenhum inspetor divulgado.');
 }
 function routes(filter,list,operators){
  const summaries=new Map(F.routeSummary(list,filter,today).map(row=>[row.name,row]));
  $('routes').innerHTML=table(['Equipe','Meta','Rede vistoriada creditada','Cumprimento','Rede paralela','GPS','Dias de saída','Situação até a data','Ver rota'],
   operators.map(team=>{
    const row=summaries.get(team.id),routeCount=list.filter(route=>route.inspector===team.id).length;
    const view=routeCount?'<button type="button" data-team-map="'+esc(team.id)+'">'+(routeCount===1?'Ver rota':'Ver '+routeCount+' rotas')+'</button>':'—';
    if(!row)return [esc(team.label),'—','0,000 km','—','—','—','0','Sem meta ou vistoria no período',view];
    return [esc(team.label),km(row.due),km(row.done),row.due?pct(row.credited/row.due):'Sem meta',
     km(row.shared),km(row.track),fmt(row.days.size),row.lag?row.lag+' rota(s) abaixo da meta acumulada':row.expected?'Em dia com o plano':row.due?'Meta futura':'Sem meta registrada',view];
   }),'Nenhum inspetor divulgado.');
  availableRoutes=list;
  if(viewMode==='all'||viewMode?.team){
   for(const route of list)if(viewMode==='all'||route.inspector===viewMode.team)selectedRoutes.add(route.id);
  }
  paintRouteChoices();
 }
 function routeLabel(route){
  const team=data.groups.find(group=>group.id===route.inspector);
  return [team?.label,route.name].filter(Boolean).join(' · ');
 }
 function paintRouteButtons(){
  $('routeViewSelected').disabled=!availableRoutes.some(route=>selectedRoutes.has(route.id));
  $('routeViewAll').disabled=!availableRoutes.length;
  $('routeClearMap').disabled=!shownRoutes.length&&!viewMode;
 }
 function paintRouteChoices(){
  $('routeChoices').innerHTML=table(['Selecionar','Equipe e rota','Planejado','Vistoriado','Pendente','Ver rota'],availableRoutes.map(route=>[
   '<input aria-label="Selecionar '+esc(routeLabel(route))+'" type="checkbox" data-route-choice="'+esc(route.id)+'"'+(selectedRoutes.has(route.id)?' checked':'')+'>',
   esc(routeLabel(route)),km(route.planned),km(route.confirmed),km(route.pending),
   '<button type="button" data-single-route="'+esc(route.id)+'">Ver rota</button>'
  ]),'Nenhuma rota no filtro.');
  paintRouteButtons();
 }
 function clearMap(){
  shownRoutes=[];viewMode=null;
  hideMap();
  paintRouteButtons();
 }
 function showRoutes(ids,mode){
  selectedRoutes=new Set(ids);
  shownRoutes=ids;viewMode=mode;
  paintRouteChoices();
  void showMap(true,true);
 }
 function hideMap(message=''){
  mapController?.abort();mapSignature='';
  routeLayer?.clearLayers();
  $('legend').hidden=true;
  updateMapVisibility();
  $('routeMapStatus').textContent=message;
  $('routeMapLabels').textContent='';
 }
 function ensureMap(){
  if(map)return;
  map=L.map('map',{preferCanvas:true}).setView([-9.97,-67.81],11);
  const tiles=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{
   maxZoom:20,maxNativeZoom:19,attribution:'Imagens © Esri, Maxar, Earthstar Geographics e comunidade GIS'
  });
  let failed=0;
  tiles.on('tileerror',()=>{
   if(++failed<3)return;
   map.removeLayer(tiles);
   $('basemapStatus').hidden=false;
   $('basemapStatus').textContent='Imagem de fundo indisponível. Rotas e pontos continuam visíveis.';
  });
  tiles.on('tileload',()=>{failed=0;});
  tiles.addTo(map);
  map.createPane('consultationTrees').style.zIndex='390';
  routeLayer=L.featureGroup().addTo(map);
  treeLayer=L.featureGroup().addTo(map);
  qualityLayer=L.featureGroup().addTo(map);
 }
 function updateMapVisibility(){
  const visible=Boolean(routeLayer?.getLayers().length||treeLayer?.getLayers().length||qualityLayer?.getLayers().length);
  const wasHidden=$('map').hidden;
  $('map').hidden=!visible;
  if(visible&&wasHidden)map.invalidateSize();
 }
 function drawQuality(rows,focus=false){
  qualityLayer?.clearLayers();
  $('qualityLegend').hidden=!rows.length;
  if(!rows.length){updateMapVisibility();return;}
  ensureMap();
  for(const row of rows){
   const {lat,lon,span,metres,nearest}=row.spanAlert;
   const point=[lat,lon],target=[nearest[1],nearest[0]];
   L.polyline([point,target],{color:'#ffaf39',weight:2,dashArray:'6 6',interactive:false}).addTo(qualityLayer);
   L.circleMarker(point,{radius:7,color:'#fff',weight:2,fillColor:'#ffaf39',fillOpacity:1})
    .bindTooltip('Vão '+esc(span)+' · '+esc(CampoSpanQuality.format(metres))+' m').addTo(qualityLayer);
  }
  qualityLayer.bringToFront();
  updateMapVisibility();
  if(focus){
   map.fitBounds(qualityLayer.getBounds(),{padding:[26,26],maxZoom:18});
   $('map').scrollIntoView({block:'center'});
  }
 }
 function renderQuality(rows,operators){
  const labels=new Map(operators.map(team=>[team.id,team.label]));
  qualityRows=rows.filter(row=>row.spanAlert);
  const checked=rows.filter(row=>row.spanChecked===true).length;
  $('showQuality').disabled=!qualityRows.length;
  $('showQuality').textContent=qualityVisible?'Ocultar alertas no mapa':'Ver alertas no mapa';
  $('qualityStatus').textContent=fmt(qualityRows.length)+' com alerta · '+fmt(checked)+' avaliados · '+fmt(rows.length-checked)+' sem distância verificada';
  $('qualityRows').innerHTML=table(['Equipe','Alimentador','Vão','Distância','Localização'],qualityRows.map((row,index)=>[
   esc(labels.get(row.inspector)||'—'),esc(row.feeder||'—'),esc(row.spanAlert.span),CampoSpanQuality.format(row.spanAlert.metres)+' m',
   '<button type="button" data-alert="'+index+'">Localizar</button>'
  ]),'Nenhum alerta no recorte.');
  drawQuality(qualityVisible?qualityRows:[]);
 }
 function hideTrees(){
  treeController?.abort();
  treeController=null;
  treeLayer?.clearLayers();
  treeSignature='';
  $('treeMapStatus').hidden=$('treeLegend').hidden=true;
  $('treeMapStatus').textContent='';
  updateMapVisibility();
 }
 async function showTrees(fit=false){
  if(!$('showAllTrees').checked||treeController)return;
  const status=$('treeMapStatus');
  status.hidden=false;
  if(!treeSignature)status.textContent='Carregando árvores…';
  const controller=new AbortController();
  treeController=controller;
  try{
   const result=await api('arvores',{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(95000)])});
   if(controller.signal.aborted)return;
   const signature=JSON.stringify([result.vera,result.field]);
   if(signature!==treeSignature){
    ensureMap();
    treeLayer.clearLayers();
    for(const [points,color] of [[result.vera,'#b4ea91'],[result.field,'#4de1d2']]){
     for(const point of points)L.circleMarker(point,{
      pane:'consultationTrees',radius:4,color:'#163a35',weight:1,fillColor:color,fillOpacity:.9,interactive:false
     }).addTo(treeLayer);
    }
    treeSignature=signature;
   }
   const bounds=treeLayer.getBounds();
   $('treeLegend').hidden=!bounds.isValid();
   updateMapVisibility();
   if(fit&&!routeLayer.getLayers().length&&bounds.isValid())map.fitBounds(bounds,{padding:[26,26],maxZoom:17});
   status.textContent=fmt(result.vera.length)+' da VERA · '+fmt(result.field.length)+' do campo, com coordenadas'+
    (result.veraAvailable?'':' · Base VERA indisponível')+(result.archiveAvailable?'':' · Arquivo do Drive indisponível');
  }catch(error){
   if(!controller.signal.aborted){
    if(error.status===401){await start();return;}
    status.textContent=error.name==='TimeoutError'?'Tempo de carregamento das árvores excedido.':error.message;
   }
  }finally{
   if(treeController===controller)treeController=null;
  }
 }
 async function showMap(fit=true,focus=false){
  const routes=availableRoutes.filter(route=>viewMode==='all'||(viewMode?.team?route.inspector===viewMode.team:shownRoutes.includes(route.id)));
  if(!routes.length){hideMap();return;}
  const signature=JSON.stringify(routes.map(route=>[route.id,route.revision,route.confirmed,route.pending,routeLabel(route)]));
  if(signature===mapSignature&&!fit)return;
  const controller=new AbortController();
  mapController?.abort();mapController=controller;
  if(focus)$('routeMapStatus').textContent='Carregando rotas…';
  try{
   const views=new Map();
   for(let start=0;start<routes.length;start+=12){
    const params=new URLSearchParams({batch:'1'});
    for(const route of routes.slice(start,start+12))params.append('id',route.id);
    const result=await api('rota?'+params,{signal:controller.signal});
    for(const view of result.routes)views.set(view.id,view);
   }
   if(controller.signal.aborted)return;
   const tally=key=>routes.reduce((sum,route)=>sum+(views.has(route.id)?route[key]||0:0),0);
   ensureMap();
   $('legend').hidden=false;
   routeLayer.clearLayers();
   const colors=['#78b8ff','#c3a5ff','#ffa361','#f0d65c','#7ee5c0','#ff99b2'];
   const labels=[];
   for(const [i,route] of routes.entries()){
    const view=views.get(route.id);
    if(!view)continue;
    const label=esc(routeLabel(route)),accent=colors[i%colors.length];
    labels.push('<span><i style="background:'+accent+'"></i>'+label+'</span>');
    for(const [kind,color] of [['pending','#ee344a'],['confirmed','#168756']]){
     if(!view.lines[kind].length)continue;
     const paths=view.lines[kind].map(line=>line.map(([lon,lat])=>[lat,lon]));
     L.polyline(paths,{color:accent,weight:10,opacity:.85,interactive:false}).addTo(routeLayer);
     L.polyline(paths,{color,weight:5}).addTo(routeLayer).bindTooltip(label);
    }
    if(view.outlet)L.circleMarker([view.outlet[1],view.outlet[0]],{radius:7,color:'#255fa5',fillOpacity:1}).addTo(routeLayer).bindTooltip('Saída da subestação · '+label);
    for(const key of view.keys)L.circleMarker([key.point[1],key.point[0]],{radius:5,color:key.pending?'#ee344a':'#168756',fillOpacity:1}).addTo(routeLayer)
     .bindTooltip(esc(key.code)+(key.pending?' · '+key.pending+' trecho(s) pendente(s)':' · encerrada')+' · '+label);
   }
   $('routeMapLabels').innerHTML=labels.join('');
   updateMapVisibility();
   if(fit&&routeLayer.getBounds().isValid())map.fitBounds(routeLayer.getBounds(),{padding:[26,26],maxZoom:17});
   if(focus&&!$('map').hidden)$('map').scrollIntoView({block:'center'});
   $('routeMapStatus').textContent=views.size+' rota(s) · '+km(tally('planned'))+' planejados · '+km(tally('confirmed'))+' vistoriados · '+km(tally('pending'))+' pendentes'+(tally('keys')?' · '+tally('closed')+'/'+tally('keys')+' chaves encerradas':'');
   mapSignature=signature;
  }catch(error){
   if(!controller.signal.aborted)hideMap(error.message);
  }
 }
 function render(fit=true){
  if(!data)return;
  const filter=filterValues(),invalid=filter.from&&filter.through&&filter.from>filter.through;
  $('dataStatus').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':
   !data.archiveAvailable?'Arquivo do Drive indisponível. Indicadores de cadastro mostram os dados da base central.':'';
  const operators=invalid?[]:data.groups.filter(team=>!filter.inspectors.length||filter.inspectors.includes(team.id));
  const rows=invalid?[]:F.apply(data.field,filter);
  renderQuality(rows,operators);
  productivity(rows,operators,!invalid&&F.period(today,filter.from,filter.through));
  const active=invalid?[]:data.routes.filter(route=>operators.some(team=>team.id===route.inspector));
  routes(filter,active,operators);
  void showMap(fit);
 }
 function lock(){
  data=null;loadSerial++;loading=false;
  qualityVisible=false;renderQuality([],[]);
  $('showAllTrees').checked=false;hideTrees();
  clearMap();availableRoutes=[];selectedRoutes.clear();paintRouteButtons();
  for(const id of ['metrics','daily','dailyGoal','forecast','forecastTarget','positions','inspectors','feedersKpi','routes','routeChoices'])$(id).textContent='';
  fields.inspector.replaceChildren(new Option('Todos',''));
  $('sessionActions').hidden=$('workspace').hidden=true;
  $('login').hidden=false;$('updated').textContent='';
 }
 async function load(fit){
  if(loading)return;
  loading=true;
  const serial=++loadSerial;
  $('refresh').disabled=true;
  if(!data)$('dataStatus').textContent='Carregando indicadores…';
  try{
   const result=await api('dados',{signal:AbortSignal.timeout(95000)});
   if(serial!==loadSerial)return;
   data=result;
   const select=fields.inspector,old=select.value;
   select.replaceChildren(new Option('Todos',''),...data.groups.map(team=>new Option(team.label,team.id)));
   if(data.groups.some(team=>team.id===old))select.value=old;
   $('updated').textContent='Atualizado em '+dateTime.format(new Date(data.updatedAt));
   render(fit);
   void showTrees();
  }catch(error){
   if(serial!==loadSerial)return;
   if(error.status===401)await start();
   else $('dataStatus').textContent=error.message;
  }finally{if(serial===loadSerial){loading=false;$('refresh').disabled=false;}}
 }
 async function start(){
  const link=new URLSearchParams(location.hash.slice(1)).get('acesso');
  if(link!==null)history.replaceState(null,'',location.pathname+location.search);
  try{
   if(link!==null)await api('link-session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:link})});
   const session=await api('sessao');
   if(!session.authenticated){
    lock();
    $('loginStatus').textContent='Abra o link compartilhado pela administração.';
    return;
   }
   $('login').hidden=true;
   $('workspace').hidden=$('sessionActions').hidden=false;
   await load(true);
  }catch(error){
   lock();
   $('loginStatus').textContent=error.status===401?error.message:'Não foi possível verificar o acesso. Abra novamente o link compartilhado.';
  }
 }
 $('showQuality').onclick=()=>{
  qualityVisible=!qualityVisible;
  $('showQuality').textContent=qualityVisible?'Ocultar alertas no mapa':'Ver alertas no mapa';
  drawQuality(qualityVisible?qualityRows:[],qualityVisible);
 };
 $('qualityRows').onclick=event=>{
  const index=event.target.closest('[data-alert]')?.dataset.alert;
  if(index===undefined)return;
  qualityVisible=true;
  $('showQuality').textContent='Ocultar alertas no mapa';
  drawQuality([qualityRows[Number(index)]],true);
 };
 $('filters').onsubmit=event=>{event.preventDefault();render();};
 $('filters').onchange=()=>render();
 $('filters').onreset=()=>setTimeout(render,0);
 $('routeChoices').onchange=event=>{
  const id=event.target.dataset.routeChoice;
  if(!id)return;
  if(event.target.checked)selectedRoutes.add(id);else selectedRoutes.delete(id);
  paintRouteButtons();
 };
 $('routeChoices').onclick=event=>{
  const id=event.target.closest('[data-single-route]')?.dataset.singleRoute;
  if(id)showRoutes([id],null);
 };
 $('routes').onclick=event=>{
  const team=event.target.closest('[data-team-map]')?.dataset.teamMap;
  if(team)showRoutes(availableRoutes.filter(route=>route.inspector===team).map(route=>route.id),{team});
 };
 $('routeViewSelected').onclick=()=>showRoutes(availableRoutes.filter(route=>selectedRoutes.has(route.id)).map(route=>route.id),null);
 $('routeViewAll').onclick=()=>showRoutes(availableRoutes.map(route=>route.id),'all');
 $('showAllTrees').onchange=()=>{$('showAllTrees').checked?void showTrees(true):hideTrees();};
 $('routeClearMap').onclick=()=>{selectedRoutes.clear();clearMap();paintRouteChoices();};
 $('refresh').onclick=()=>void load(false);
 void start();
})();
