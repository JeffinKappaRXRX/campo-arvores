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
 const shown=value=>value===null||value===undefined||value===''?'—':value;
 const safe=value=>esc(shown(value));
 const numeric=value=>shown(value)==='—'?'—':fmt(Number(value));
 const colors={'CRÍTICO':'#ff6269','ALTO':'#ff9f53','REVISAR EM CAMPO':'#c894f1','MÉDIO':'#ecd160','BAIXO':'#87d99e','SEM RISCO':'#a6a7b5'};
 const validPoint=row=>[row.lat,row.lon].every(value=>value!==null&&value!==''&&Number.isFinite(Number(value)))&&Math.abs(Number(row.lat))<=90&&Math.abs(Number(row.lon))<=180;
 const pageSize=50;
 let data,prepared,filtered,map,markers,points=[],tiles,page=0,photosSerial=0,requestSerial=0;
 const multiselects=[
  ['Inspector','Inspetor','inspectors'],['Feeder','Alimentador','feeders'],
  ['Section','Trecho','sections'],['Risk','Classe de risco','risks']
 ].map(([id,title,key])=>{
  const root=$('filter'+id);
  root.className='filter-label';
  root.innerHTML='<span>'+title+'</span><details class="multi"><summary aria-label="'+title+'">Todos</summary><div class="multi-pop"><input type="search" aria-label="Buscar em '+title+'" placeholder="Buscar"><div class="multi-list"></div></div></details>';
  const menu=root.querySelector('details'),summary=root.querySelector('summary'),search=root.querySelector('input'),list=root.querySelector('.multi-list');
  const checked=()=>Array.from(list.querySelectorAll(':checked'),input=>input.value);
  const caption=()=>{const values=checked();summary.textContent=values.length===0?'Todos':values.length===1?values[0]:values.length+' selecionados';};
  search.addEventListener('input',()=>{
   const query=search.value.trim().toLocaleLowerCase('pt-BR');
   for(const label of list.children)label.hidden=!label.textContent.toLocaleLowerCase('pt-BR').includes(query);
  });
  list.addEventListener('change',caption);
  return {key,menu,checked,caption,fill(values){
   const previous=new Set(checked());
   list.innerHTML=values.map(value=>'<label><input type="checkbox" value="'+esc(value)+'">'+esc(value)+'</label>').join('');
   for(const input of list.querySelectorAll('input'))input.checked=previous.has(input.value);
   search.dispatchEvent(new Event('input'));
   caption();
  }};
 });
 document.addEventListener('click',event=>{
  for(const item of multiselects)if(!item.menu.contains(event.target))item.menu.open=false;
 });

 async function api(path,options={}){
  const response=await fetch('/api/gerencial/'+path,{cache:'no-store',credentials:'same-origin',...options});
  let body;
  try{body=await response.json();}catch{body={};}
  if(!response.ok)throw Object.assign(Error(body.error||'Consulta indisponível. Atualize a página.'),{status:response.status});
  return body;
 }
 function filterValues(){
  const form=$('filters').elements;
  return {
   from:form.from.value,through:form.to.value,source:form.source.value,pruning:form.pruning.value,keys:form.keys.value,query:form.query.value,
   ...Object.fromEntries(multiselects.map(item=>[item.key,item.checked()]))
  };
 }
 function table(headers,rows,empty){
  if(!rows.length)return '<p>'+empty+'</p>';
  return '<table><thead><tr>'+headers.map(header=>'<th scope="col">'+header+'</th>').join('')+'</tr></thead><tbody>'+
   rows.map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')+'</tbody></table>';
 }
 function sourceName(row){return row.source==='campo'?'Campo (prévia)':row.field?'VERA · atualizado em campo':'Levantamento VERA';}
 function duration(seconds){
  if(!Number.isFinite(seconds))return '—';
  const rounded=Math.round(seconds);
  return Math.floor(rounded/60)+'min '+String(rounded%60).padStart(2,'0')+'s';
 }
 function showList(){
  const sort=$('sort').value;
  const byPriority=(a,b)=>(b.prioridade??-1)-(a.prioridade??-1)||F.compare(a.ref,b.ref);
  const rows=[...filtered.park].sort(sort==='date'?(a,b)=>F.compare(b.day,a.day)||byPriority(a,b):sort==='species'?(a,b)=>F.compare(a.especies,b.especies)||byPriority(a,b):byPriority);
  const pages=Math.max(1,Math.ceil(rows.length/pageSize));
  page=Math.min(page,pages-1);
  $('listCount').textContent=fmt(rows.length)+(rows.length===1?' registro no filtro':' registros no filtro');
  const listing=rows.slice(page*pageSize,(page+1)*pageSize).map(row=>[
   safe(row.id),esc(sourceName(row)),safe(row.especies),safe(row.poste||row.field?.pole),safe(row.vao||row.field?.span),safe(row.feeder),safe(row.section),safe(row.chave||row.field?.key),
   '<i class="risk-dot" style="background:'+(colors[row.classe]||'#a6a7b5')+'"></i>'+safe(row.classe),numeric(row.prioridade),numeric(row.clientes),
   safe(row.ano||row.day?.slice(0,4)),safe(row.verificacao),safe(row.acao),
   '<button type="button" data-tree="'+esc(row.ref)+'">Ver árvore</button>'
  ]);
  $('records').innerHTML=table(['ID','Origem','Espécie','Poste','Vão','Alimentador','Trecho','Chave','Classe de risco','Prioridade','Clientes','Ano','Foto conferida','Ação sugerida','<span aria-label="Detalhes"></span>'],listing,'Nenhuma árvore corresponde aos filtros.');
  $('pageStatus').textContent='Página '+(page+1)+' de '+pages;
  $('previous').disabled=page===0;
  $('next').disabled=page>=pages-1;
 }
 function showProductivity(){
  const summary=F.summary(filtered.field);
  const daily=F.group(filtered.field,'day').filter(row=>row.name!=='Não informado').sort((a,b)=>F.compare(b.name,a.name)).slice(0,31);
  const max=Math.max(1,...daily.map(row=>row.count));
  $('daily').innerHTML=[...daily].reverse().map(row=>{
   const day=row.name.slice(5).split('-').reverse().join('/');
   return '<div class="daily-bar" title="'+esc(day)+' · '+row.count+' cadastros">'+row.count+'<i style="height:'+Math.max(3,Math.round(100*row.count/max))+'px"></i>'+esc(day)+'</div>';
  }).join('')||'<p>Nenhum cadastro de campo com data no filtro.</p>';
  CampoForecast.paint({summary,daily});
  const vera=filtered.park.filter(row=>row.source==='vera').length;
  const metrics=[
   ['Árvores no filtro',filtered.park.length,fmt(vera)+' VERA · '+fmt(filtered.park.length-vera)+' de campo'],
   ['Risco crítico',filtered.park.filter(row=>row.classe==='CRÍTICO').length,'Registros classificados como críticos'],
   ['Cadastros de campo',summary.count,fmt(summary.poda)+' com necessidade de poda'],
   ['Tempo médio por cadastro',duration(summary.mean),fmt(summary.measured)+' cadastros com tempo medido']
  ];
  $('metrics').innerHTML=metrics.map(([name,value,description])=>'<article class="panel metric"><span>'+name+'</span><strong>'+(typeof value==='number'?fmt(value):esc(value))+'</strong><small>'+esc(description)+'</small></article>').join('');
  $('positions').innerHTML=F.group(filtered.field,'position').map(row=>'<div class="position"><span>'+esc(row.name)+'</span><meter max="'+summary.count+'" value="'+row.count+'"></meter><b>'+fmt(row.count)+'</b></div>').join('')||'<p>Nenhum cadastro de campo no filtro.</p>';
  $('inspectors').innerHTML=table(['Inspetor','Cadastros','Tempo médio','Mediana','Cadastros / hora ativa','Tempo medido','Poda','Sem identificação'],F.group(filtered.field,'inspector').map(row=>[
   safe(row.name),fmt(row.count),duration(row.mean),duration(row.median),fmt(row.measured/row.hours),
   fmt(row.measured)+' / '+fmt(row.count),fmt(row.poda),fmt(row.identification)
  ]),'Nenhum cadastro de campo no filtro.');
 }
 function showRoutes(filter){
  const percent=value=>value.toLocaleString('pt-BR',{style:'percent',maximumFractionDigits:1});
  $('routes').innerHTML=table(['Inspetor','Meta','Rede vistoriada creditada','Cumprimento','Desse total, rede paralela','GPS','Dias de saída','Situação até a data'],
   F.routeSummary(data.routes,filter,today).map(row=>[
    safe(row.name),km(row.due),km(row.done),row.due?percent(row.credited/row.due):'Sem meta',
    km(row.shared),km(row.track),fmt(row.days.size),
    row.lag?row.lag+' rota(s) abaixo da meta acumulada':row.expected?'Em dia com o plano':row.due?'Meta futura':'Sem meta registrada'
   ]),'Nenhuma rota com meta ou vistoria no período.');
 }
 function fit(rows=points){
  if(!map||!rows.length)return;
  map.fitBounds(L.latLngBounds(rows.map(row=>[Number(row.lat),Number(row.lon)])),{padding:[30,30],maxZoom:17});
 }
 function basemap(){
  if(!map)return;
  tiles?.remove();
  const satellite=$('basemap').value==='satellite';
  tiles=L.tileLayer(satellite?'https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}':'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
   {maxZoom:20,maxNativeZoom:satellite?20:19,attribution:satellite?'© Google':'© OpenStreetMap contributors'}).addTo(map);
 }
 function initMap(){
  if(map||typeof L==='undefined')return;
  map=L.map('map',{preferCanvas:true}).setView([-9.97,-67.81],11);
  markers=L.layerGroup().addTo(map);
  L.control.scale({imperial:false}).addTo(map);
  map.on('moveend',paintMap);
  basemap();
  $('legend').innerHTML=Object.entries(colors).map(([label,color])=>'<span><i style="background:'+color+'"></i>'+label+'</span>').join('');
 }
 function paintMap(){
  if(!map||!filtered)return;
  const bounds=map.getBounds(),visible=points.filter(row=>bounds.contains([Number(row.lat),Number(row.lon)]));
  $('mapCount').textContent=fmt(visible.length)+' nesta área · '+fmt(points.length)+' com coordenadas · '+fmt(filtered.park.length)+' no filtro';
  markers.clearLayers();
  const cells=new Map(),grouped=visible.length>500;
  for(const row of visible){
   const xy=map.project([Number(row.lat),Number(row.lon)]);
   const cell=(grouped?Math.floor(xy.x/38)+':'+Math.floor(xy.y/38):row.ref);
   if(!cells.has(cell))cells.set(cell,[]);
   cells.get(cell).push(row);
  }
  for(const rows of cells.values()){
   const row=rows[0],color=rows.length>1?'#ede2ff':colors[row.classe]||'#a6a7b5';
   const marker=L.circleMarker([Number(row.lat),Number(row.lon)],{
    radius:rows.length>1?12:row.field?6:5,color:row.field?'#fff':color,weight:row.field?1.5:1,fillColor:color,fillOpacity:.87
   }).addTo(markers);
   if(rows.length>1){
    marker.bindTooltip(String(rows.length),{permanent:true,direction:'center',className:'cluster-label'});
    marker.on('click',()=>fit(rows));
   }else{
    marker.bindTooltip(esc(row.especies||'Árvore')+' · '+esc(row.feeder||row.id));
    marker.on('click',()=>openTree(row.ref));
   }
  }
 }
 function render({reset=false,enquadra=false}={}){
  if(!prepared)return;
  if(reset)page=0;
  const filter=filterValues(),invalid=filter.from&&filter.through&&filter.from>filter.through;
  $('dataStatus').textContent=invalid?'A data inicial deve ser anterior ou igual à data final.':
   [!data.veraAvailable?'Base VERA indisponível.':null,!data.archiveAvailable?'Consulta ao arquivo do Drive indisponível. Exibindo cadastros da base central.':null].filter(Boolean).join(' ');
  filtered=invalid?{park:[],field:[]}:F.apply(prepared,filter);
  points=filtered.park.filter(validPoint);
  showList();
  showProductivity();
  showRoutes(filter);
  if(enquadra)fit();
  paintMap();
 }
 async function openPhoto(row,source,index){
  const serial=++photosSerial,box=$('photo');
  box.textContent='Carregando foto…';
  const id=source==='campo'?row.field.id:row.id;
  try{
   const {image}=await api('foto?'+new URLSearchParams({id,source,index}));
   if(serial!==photosSerial||!$('details').open)return;
   if(!/^data:image\/(?:jpe?g|png|webp);base64,[a-z0-9+/=]+$/i.test(image))throw Error('Formato de foto indisponível.');
   const img=new Image();
   img.alt='Foto de '+(row.especies||'árvore');
   img.src=image;
   box.replaceChildren(img);
  }catch(error){if(serial===photosSerial)box.textContent=error.message;}
 }
 function openTree(ref){
  const row=prepared?.byRef.get(ref);
  if(!row)return;
  const field=row.field;
  $('detailsTitle').textContent=row.especies||'Árvore '+row.id;
  const details=[
   ['ID',row.id],['Origem',sourceName(row)],['Alimentador',row.feeder],['Trecho',row.section],['Chave',row.chave||field?.key],
   ['Poste',row.poste||field?.pole],['Vão',row.vao||field?.span],['Data',row.day?.split('-').reverse().join('/')],
   ['Inspetor',field?.inspector],['Altura (m)',row.altura??field?.height],['DAP (cm)',row.dap],['Distância à rede (m)',row.distRede],
   ['Classe de risco',row.classe],['Prioridade',row.prioridade],['Ação sugerida',row.acao],['Conferência pela foto',row.verificacao],['OS',field?.os]
  ];
  $('detailsBody').innerHTML='<dl>'+details.filter(([,value])=>shown(value)!=='—').map(([key,value])=>'<dt>'+key+'</dt><dd>'+safe(value)+'</dd>').join('')+'</dl>';
  const actions=document.createElement('div');actions.className='actions';$('detailsBody').append(actions);
  const action=(label,run)=>{
   const button=document.createElement('button');button.type='button';button.textContent=label;
   button.onclick=run;actions.append(button);
  };
  if(map&&validPoint(row))action('Localizar no mapa',()=>{
   $('details').close();
   fit([row]);
   $('mapPanel').scrollIntoView({block:'start'});
  });
  for(let index=0;index<(field?.photos||0);index++)action('Foto de campo '+(index+1),()=>void openPhoto(row,'campo',index));
  if(row.source==='vera'&&row.photo)action('Foto VERA',()=>void openPhoto(row,'vera',0));
  if(!$('details').open)$('details').showModal();
 }
 function lock(){
  data=prepared=filtered=null;
  points=[];
  photosSerial++;
  markers?.clearLayers();
  if($('details').open)$('details').close();
  for(const id of ['records','detailsBody','photo','metrics','daily','dailyGoal','forecast','forecastTarget','positions','inspectors','routes','mapCount','listCount','pageStatus','detailsTitle'])$(id).textContent='';
  multiselects.forEach(item=>item.fill([]));
  $('sessionActions').hidden=$('workspace').hidden=true;
  $('login').hidden=false;
  $('updated').textContent='';
 }
 async function load(enquadra){
  const serial=++requestSerial;
  $('refresh').disabled=true;
  $('dataStatus').textContent='Carregando base…';
  try{
   const result=await api('dados',{signal:AbortSignal.timeout(95000)});
   if(serial!==requestSerial)return;
   data=result;
   prepared=F.prepare(data);
   multiselects.forEach(item=>item.fill(prepared[item.key]));
   initMap();
   map?.invalidateSize();
   $('updated').textContent='Atualizado em '+dateTime.format(new Date(data.updatedAt));
   render({enquadra});
  }catch(error){
   if(serial!==requestSerial)return;
   if(error.status===401)await start();
   else $('dataStatus').textContent=error.message;
  }finally{if(serial===requestSerial)$('refresh').disabled=false;}
 }
 async function start(){
  try{
   const session=await api('sessao');
   if(!session.authenticated){
    lock();
    $('loginLink').hidden=!session.available;
    const reason=new URL(location.href).searchParams.get('acesso');
    $('loginStatus').textContent=!session.available||reason==='indisponivel'?'Acesso temporariamente indisponível.':
     reason==='email'?'Acesso não autorizado.':'';
    return;
   }
   $('login').hidden=true;
   $('workspace').hidden=$('sessionActions').hidden=false;
   $('logout').hidden=!session.email;
   $('sessionEmail').textContent=session.email||'Administrador';
   await load(true);
  }catch{lock();$('loginLink').hidden=true;$('loginStatus').textContent='Não foi possível verificar o acesso.';}
 }
 let filterTimer;
 const change=()=>{
  clearTimeout(filterTimer);
  filterTimer=setTimeout(()=>render({reset:true,enquadra:true}),180);
 };
 $('filters').addEventListener('submit',event=>{event.preventDefault();change();});
 $('filters').addEventListener('input',event=>{if(!event.target.closest('.multi-pop')||event.target.type==='checkbox')change();});
 $('filters').addEventListener('reset',()=>setTimeout(()=>{multiselects.forEach(item=>{item.menu.open=false;item.caption();});change();},0));
 $('sort').onchange=()=>{page=0;if(filtered)showList();};
 $('previous').onclick=()=>{page--;showList();};
 $('next').onclick=()=>{page++;showList();};
 $('records').onclick=event=>{const button=event.target.closest('[data-tree]');if(button)openTree(button.dataset.tree);};
 $('details').addEventListener('close',()=>{photosSerial++;$('photo').textContent='';});
 $('fit').onclick=()=>fit();
 $('basemap').onchange=basemap;
 $('refresh').onclick=()=>void load(false);
 $('logout').onclick=async()=>{
  try{
   await api('sair',{method:'POST'});
   requestSerial++;
   lock();
   $('loginLink').hidden=false;
   $('loginStatus').textContent='Sessão encerrada.';
  }catch(error){$('dataStatus').textContent=error.message;}
 };
 for(const id of ['forecastHours','forecastCount','forecastMode'])$(id).addEventListener('input',()=>{
  if(filtered)CampoForecast.paint({summary:F.summary(filtered.field),daily:F.group(filtered.field,'day')});
 });
 document.addEventListener('visibilitychange',async()=>{
  if(document.hidden||$('workspace').hidden)return;
  try{if(!(await api('sessao')).authenticated){requestSerial++;await start();}}
  catch{ /* A conexão pode voltar antes da próxima consulta. */ }
 });
 void start();
})();
