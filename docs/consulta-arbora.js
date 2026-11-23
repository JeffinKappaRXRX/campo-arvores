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
 let data,current,map,routeLayer,loadSerial=0,mapSerial=0,loading=false;
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
 function refreshForecast(){
  if(!current)return;
  const {summary,daily,operators,todayInPeriod}=current;
  CampoForecast.paint({summary,daily});
  const count=daily.find(row=>row.name===today)?.count||0,goal=100*operators.length,minimum=70*operators.length;
  $('dailyGoal').textContent=todayInPeriod&&goal?fmt(count)+' hoje · '+pct(count/goal)+' da meta de '+fmt(goal)+' cadastros'+(count<minimum?' · faltam '+fmt(minimum-count)+' para o mínimo':''):'';
 }
 function productivity(rows,operators,todayInPeriod){
  const summary=F.summary(rows);
  const daily=F.group(rows,'day').filter(row=>row.name!=='Não informado').sort((a,b)=>F.compare(b.name,a.name)).slice(0,31);
  current={summary,daily,operators,todayInPeriod};
  const max=Math.max(1,...daily.map(row=>row.count));
  $('daily').innerHTML=[...daily].reverse().map(row=>{
   const day=row.name.slice(5).split('-').reverse().join('/');
   return '<div class="daily-bar" title="'+esc(day)+' · '+row.count+' cadastros">'+row.count+'<i style="height:'+Math.max(3,Math.round(100*row.count/max))+'px"></i>'+esc(day)+'</div>';
  }).join('')||'<p>Nenhum cadastro de campo no período.</p>';
  refreshForecast();
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
  $('inspectors').innerHTML=table(['Inspetor','Cadastros','Tempo médio','Mediana','Cadastros / hora ativa','Tempo medido','Poda','Sem identificação','Incompletos','Hoje','Meta diária'],operators.map(name=>{
   const row=groups.get(name)||F.summary([]);
   const todayCount=rows.filter(record=>record.day===today&&record.inspector===name).length;
   return [esc(name),fmt(row.count),duration(row.mean),duration(row.median),fmt(row.measured/row.hours),fmt(row.measured)+' / '+fmt(row.count),fmt(row.poda),fmt(row.identification),fmt(row.missing),todayInPeriod?fmt(todayCount):'—',todayInPeriod?pct(todayCount/100):'—'];
  }),'Nenhum inspetor divulgado.');
 }
 function routes(filter,list,operators){
  const summaries=new Map(F.routeSummary(list,filter,today).map(row=>[row.name,row]));
  $('routes').innerHTML=table(['Inspetor','Meta','Rede vistoriada creditada','Cumprimento','Rede paralela','GPS','Dias de saída','Situação até a data'],
   operators.map(name=>{
    const row=summaries.get(name);
    if(!row)return [esc(name),'—','0,000 km','—','—','—','0','Sem meta ou vistoria no período'];
    return [esc(name),km(row.due),km(row.done),row.due?pct(row.credited/row.due):'Sem meta',
     km(row.shared),km(row.track),fmt(row.days.size),row.lag?row.lag+' rota(s) abaixo da meta acumulada':row.expected?'Em dia com o plano':row.due?'Meta futura':'Sem meta registrada'];
   }),'Nenhum inspetor divulgado.');
  const select=$('routeSelect'),old=select.value;
  select.replaceChildren(new Option('Selecione uma rota',''));
  for(const route of list)select.add(new Option(route.inspector+' · '+route.name,route.id));
  if(list.some(route=>route.id===old))select.value=old;
  else if(list.length===1)select.value=list[0].id;
  select.disabled=!list.length;
 }
 function hideMap(message=''){
  mapSerial++;
  routeLayer?.clearLayers();
  $('map').hidden=$('legend').hidden=true;
  $('routeMapStatus').textContent=message;
 }
 async function showMap(fit=true){
  const id=$('routeSelect').value,route=data?.routes.find(item=>item.id===id);
  if(!route){hideMap();return;}
  const serial=++mapSerial;
  try{
   const view=await api('rota?'+new URLSearchParams({id}));
   if(serial!==mapSerial)return;
   $('map').hidden=$('legend').hidden=false;
   if(!map){
    map=L.map('map',{preferCanvas:true}).setView([-9.97,-67.81],11);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:20,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
    routeLayer=L.featureGroup().addTo(map);
   }
   routeLayer.clearLayers();
   for(const [kind,color] of [['pending','#ee344a'],['confirmed','#168756']]){
    for(const line of view.lines[kind])L.polyline(line.map(([lon,lat])=>[lat,lon]),{color,weight:5}).addTo(routeLayer);
   }
   if(view.outlet)L.circleMarker([view.outlet[1],view.outlet[0]],{radius:7,color:'#255fa5',fillOpacity:1}).addTo(routeLayer).bindTooltip('Saída da subestação');
   for(const key of view.keys)L.circleMarker([key.point[1],key.point[0]],{radius:5,color:key.pending?'#ee344a':'#168756',fillOpacity:1}).addTo(routeLayer)
    .bindTooltip(esc(key.code)+(key.pending?' · '+key.pending+' trecho(s) pendente(s)':' · encerrada'));
   map.invalidateSize();
   if(fit&&routeLayer.getBounds().isValid())map.fitBounds(routeLayer.getBounds(),{padding:[26,26],maxZoom:17});
   $('routeMapStatus').textContent=km(route.planned)+' planejados · '+km(route.confirmed)+' vistoriados na rota · '+km(route.pending)+' pendentes'+(route.keys?' · '+route.closed+'/'+route.keys+' chaves encerradas':'');
  }catch(error){
   if(serial===mapSerial)hideMap(error.message);
  }
 }
 function render(fit=true){
  if(!data)return;
  const filter=filterValues(),invalid=filter.from&&filter.through&&filter.from>filter.through;
  $('dataStatus').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':
   !data.archiveAvailable?'Arquivo do Drive indisponível. Indicadores de cadastro mostram os dados da base central.':'';
  const operators=invalid?[]:data.inspectors.filter(name=>!filter.inspectors.length||filter.inspectors.includes(name));
  productivity(invalid?[]:F.apply(data.field,filter),operators,!invalid&&F.period(today,filter.from,filter.through));
  const active=invalid?[]:data.routes.filter(route=>operators.includes(route.inspector));
  routes(filter,active,operators);
  void showMap(fit);
 }
 function lock(){
  data=current=null;loadSerial++;loading=false;
  hideMap();
  for(const id of ['metrics','daily','dailyGoal','forecast','forecastTarget','positions','inspectors','feedersKpi','routes'])$(id).textContent='';
  $('routeSelect').replaceChildren(new Option('Selecione uma rota',''));
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
   select.replaceChildren(new Option('Todos',''),...data.inspectors.map(name=>new Option(name,name)));
   if(data.inspectors.includes(old))select.value=old;
   $('updated').textContent='Atualizado em '+dateTime.format(new Date(data.updatedAt));
   render(fit);
  }catch(error){
   if(serial!==loadSerial)return;
   if(error.status===401)await start();
   else $('dataStatus').textContent=error.message;
  }finally{if(serial===loadSerial){loading=false;$('refresh').disabled=false;}}
 }
 async function start(){
  try{
   const session=await api('sessao');
   if(!session.authenticated){
    lock();
    $('loginLink').hidden=!session.available;
    const reason=new URL(location.href).searchParams.get('acesso');
    $('loginStatus').textContent=!session.available||reason==='indisponivel'?'Acesso temporariamente indisponível.':reason==='email'?'Acesso não autorizado.':'';
    return;
   }
   $('login').hidden=true;
   $('workspace').hidden=$('sessionActions').hidden=false;
   $('logout').hidden=!session.email;
   $('sessionEmail').textContent=session.email||'Administrador';
   await load(true);
  }catch{lock();$('loginLink').hidden=true;$('loginStatus').textContent='Não foi possível verificar o acesso.';}
 }
 $('filters').onsubmit=event=>{event.preventDefault();render();};
 $('filters').onchange=()=>render();
 $('filters').onreset=()=>setTimeout(render,0);
 $('routeSelect').onchange=()=>void showMap();
 $('refresh').onclick=()=>void load(false);
 $('logout').onclick=async()=>{
  try{
   await api('sair',{method:'POST'});lock();
   $('loginLink').hidden=false;$('loginStatus').textContent='Sessão encerrada.';
  }catch(error){$('dataStatus').textContent=error.message;}
 };
 for(const id of ['forecastHours','forecastCount','forecastMode'])$(id).addEventListener('input',refreshForecast);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!$('workspace').hidden)void load(false);});
 setInterval(()=>{if(!document.hidden&&!$('workspace').hidden&&navigator.onLine)void load(false);},20000);
 void start();
})();
