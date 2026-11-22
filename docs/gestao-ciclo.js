'use strict';
(()=>{
 const $=id=>document.getElementById(id), fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
 const pct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
 const route='#c-mapa', endpoint='/api/ciclo-poda';
 const statusColors={'Atrasada':'#be3b39','Pendente (OS aberta)':'#b96121','No ciclo atual':'#236eba','Próximos ciclos':'#237344',
  'Fora do Prazo':'#be3b39','Urgente (< 30 dias)':'#b96121','Dentro do Prazo':'#237344','Atualizada em campo':'#18747b','Sem ciclo vinculado':'#18747b'};
 const labels={poste:'Poste com poda',arvore:'Árvore individual',faixa:'Limpeza de faixa'};
 const icon=(kind,ring='#526c62')=>{
  const tree='<path d="M20 7a5 5 0 0 0-5 5 4 4 0 0 0 0 8h10a4 4 0 0 0 0-8 5 5 0 0 0-5-5Z" fill="#38934f"/><path d="M20 16v9" stroke="#654530" stroke-width="2"/>';
  const pole='<path d="M10 7v17m-4-13h8" fill="none" stroke="#31443f" stroke-width="2.4" stroke-linecap="round"/>';
  const symbol=kind==='poste'?pole+tree:kind==='faixa'?'<path d="M7 22h18M8 19l4-8 3 5 4-8 5 10M15 18l-3 5m10-6-2 6" fill="none" stroke="#8a602b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>':'<g transform="translate(-4)">'+tree+'</g>';
  return '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="'+ring+'" stroke-width="2.8"/>'+symbol+'</svg>';
 };
 const options=items=>items.map(([value,text])=>'<option value="'+esc(value)+'">'+esc(text)+'</option>').join('');
 const nums=n=>fmt.format(n||0), dateIso=s=>CP.ymd(s).map((n,i)=>String(n).padStart(i?2:4,'0')).join('-');
 const serial=s=>s?CP.DATE(...s.split('-').map(Number)):null;
 const active=()=>location.hash===route&&window.CampoControl?.authorized();
 const section=document.createElement('section');section.id='cycleManagement';section.className='panel';section.hidden=true;
 section.innerHTML=`<div class="panel-head"><div><h2>Plano de ciclo de poda</h2><p id="cycleSource" class="small" role="status"></p><a id="cycleLegacy" href="#c-mapa-anterior" hidden>Abrir o plano anterior</a></div><button type="button" id="cycleReload">Atualizar</button></div>
 <details id="cycleSettings"><summary>Base de atualização e premissas</summary>
 <form id="cycleUpload"><label>Controle Man V1.xlsx ou extrato do Ciclo Poda<input id="cycleFile" type="file" accept=".xlsx,.js,.json" required></label><button type="submit">Publicar atualização</button></form>
 <p class="small">A planilha precisa estar salva após o recálculo no Excel. A gestão importa as quatro abas do ciclo e recalcula as previsões aqui.</p>
 <p id="cycleUploadStatus" role="status"></p><form id="cycleParameters"><label>Início do plano<input name="inicio" type="date" required></label>
 <label>Janela (meses)<input name="janela" type="number" min="1" max="120" required></label>
 <label>Poda padrão (meses)<input name="padrao" type="number" min="1" max="120" required></label>
 <label>Faixa (meses)<input name="faixa" type="number" min="1" max="120" required></label>
 <label>Número de ciclos<input name="count" type="number" min="2" max="12" value="4" required></label>
 <label>Data de referência<input name="today" type="date"></label><button type="submit">Recalcular cenário</button><button type="reset">Premissas do Excel</button></form>
 <p id="cycleCheck" class="small"></p><div id="cycleGrowth"></div></details>
 <form id="cycleFilters" class="cycle-filters"><label>Ciclo<select name="cycle"></select></label>
 <label>Polo<select name="polo"></select></label><label>Conjunto<select name="conj"></select></label>
 <label>Alimentador<select name="alim"></select></label><label>Trecho<select name="trecho"></select></label>
 <label>Perímetro<select name="perim"></select></label><label>VERA no poste<select name="vera"><option value="">Todos</option><option value="com">Com VERA</option><option value="sem">Sem VERA</option></select></label>
 <label>Situação<select name="state"></select></label><label>Buscar poste, árvore ou chave<input name="query" type="search" autocomplete="off"></label>
 <label><span><input name="scheduled" type="checkbox"> Só com previsão no ciclo</span></label></form>
 <div id="cycleMetrics" class="cycle-metrics"></div><details id="cycleSummary"><summary>Janelas, produção mensal e conjuntos</summary><div id="cycleMonthly"></div><div id="cycleSets"></div><div id="cycleWindows"></div></details>`;
 const mapPanel=$('mapa');mapPanel.parentElement.classList.add('cycle-map-row');mapPanel.parentElement.before(section);
 const tools=document.createElement('div');tools.id='cycleMapTools';tools.hidden=true;tools.innerHTML=`
 <button id="cycleFit" type="button">Enquadrar serviços</button><div class="cycle-map-legend">`+
 Object.entries(labels).map(([id,label])=>'<label><input type="checkbox" data-cycle-layer="'+id+'" checked>'+icon(id)+esc(label)+'</label>').join('')+
 `<label><input type="checkbox" id="cycleLinks"> Vínculo árvore–poste</label></div><span id="cycleMapStatus" class="small" role="status"></span>`;
 $('mapFrame').before(tools);
 const ledger=document.createElement('article');ledger.id='cycleLedger';ledger.className='panel';ledger.hidden=true;
 ledger.innerHTML=`<div class="panel-head"><h3>Base filtrada</h3><button id="cycleCsv" type="button">Exportar CSV</button></div>
 <div id="cycleDetail" aria-live="polite"></div><div id="cycleRows"></div><div class="cycle-pages"><button type="button" id="cyclePrev">Anterior</button><span id="cyclePage"></span><button type="button" id="cycleNext">Próxima</button></div>`;
 mapPanel.parentElement.after(ledger);
 let source=null,revision='',params=null,windows=[],now=0,allRows=[],visible=[],treeRows=[],stats=[],page=0,map=null,markers=null,links=null,markerByRow=new Map(),zoomTimer,filterTimer,epoch=0,loading=null,request=null,publishing=false,lastHash=false,needsFit=false;
 const filters=$('cycleFilters'),parameterForm=$('cycleParameters');
 const fields=filters.elements;
 const pageSize=40;
 function updateParameters(){
  for(const key of ['inicio','janela','padrao','faixa','count','today'])parameterForm.elements[key].value=key==='inicio'||key==='today'?(params[key]?dateIso(params[key]):''):params[key];
 }
 function defaults(){return {...source.par,count:4,today:null};}
 function copyOptions(name,values){
  const input=fields[name],old=input.value;
  input.innerHTML=options([['','Todos'],...[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR',{numeric:true})).map(value=>[value,value])]);
  input.value=[...input.options].some(option=>option.value===old)?old:'';
 }
 function populate(){
  const rows=[...(source?.postes||[]),...treeRows];
  for(const name of ['polo','conj','alim','trecho','perim'])copyOptions(name,rows.map(r=>String(r[name]||'')));
  const status=['Atrasada','Pendente (OS aberta)','No ciclo atual','Próximos ciclos','Sem data','Fora do Prazo','Urgente (< 30 dias)','Dentro do Prazo','Sem dados','Sem ciclo vinculado','Atualizada em campo'];
  copyOptions('state',status);
 }
 function takeTrees(){
  treeRows=CP.overlay(source,window.CampoParque?.unifiedSnapshot()).map(tree=>{
   const post=source?.index.get(CP.postId(tree.posteGIS));
   return {...tree,kind:'arvore',post,point:CP.location(tree.lat,tree.lon),conj:post?.conj,perim:post?.perim,polo:tree.polo||post?.polo,
    trecho:tree.trecho||post?.trecho,alim:tree.alim||post?.alim,chave:tree.chave||post?.chave,groupStatus:tree.live?'Atualizada em campo':tree.prazo||'Sem dados'};
  });
 }
 function recalc(){
  if(!source){windows=[];takeTrees();populate();render();return;}
  now=params.today||CP.hojeSerial();windows=CP.janelas(params,params.count);
  const selected=Number(fields.cycle.value)||Math.min(params.count,CP.cicloAtual(params,now));
  fields.cycle.innerHTML=options(windows.map(j=>[j.k,j.rotulo]));fields.cycle.value=String(Math.min(selected,params.count));
  let aligned=0;
  const eq=(a,b)=>a==null&&b==null||a!=null&&b!=null&&Math.abs(a-b)<1e-6;
  source.postes.forEach((p,i)=>{
   p.calc=CP.calcula(p,params,now,Math.max(4,params.count));p.kind=CP.service(p);p.groupStatus=p.calc.S;
   const check=source.check[i];
   if(eq(p.calc.P,check[0])&&eq(p.calc.Q,check[1])&&p.calc.prev.slice(0,4).every((date,j)=>eq(date,check[j+3])))aligned++;
  });
  const scenario=['inicio','janela','padrao','faixa'].some(k=>params[k]!==source.par[k]);
  $('cycleCheck').textContent=scenario?'Simulação com premissas ajustadas nesta tela.':nums(aligned)+' de '+nums(source.postes.length)+' registros coincidem com o Excel em próximo retorno, ciclo e datas C1–C4.';
  $('cycleGrowth').innerHTML=table(['Classe de crescimento','Rebrota de referência (m/ano)','Ciclo (meses)','Referência'],source.classes)+
   table(['Rede','Rede nua (m)','Rede protegida (m)','Zona de risco (m)'],source.par.it||[]);
  takeTrees();populate();render();
 }
 function attributes(row){
  for(const name of ['polo','conj','alim','trecho','perim'])if(fields[name].value&&fields[name].value!==String(row[name]||''))return false;
  if(fields.vera.value&&((row.kind==='arvore'?Boolean(row.post?.nvera):row.nvera>0)!==(fields.vera.value==='com')))return false;
  return true;
 }
 function render(){
  if(!active())return;
  const k=Number(fields.cycle.value)||1,sit=fields.state.value,q=CP.norm(fields.query.value);
  const passes=row=>(!sit||sit===row.groupStatus)&&(!q||CP.norm([row.id,row.posteGIS,row.esp,row.espVera,row.idsVera,row.alim,row.conj,row.chave].join(' ')).includes(q));
  const posts=source?.postes||[];
  for(const row of posts)row.fg=attributes(row)&&CP.norm(row.cat)!=='OUTROS (NAO PODA)'&&passes(row);
  const layers=new Set([...$('cycleMapTools').querySelectorAll('[data-cycle-layer]:checked')].map(input=>input.dataset.cycleLayer));
  const postRows=posts.filter(row=>row.fg&&(!fields.scheduled.checked||CP.isNum(row.calc.prev[k-1])));
  const trees=treeRows.filter(row=>attributes(row)&&passes(row)&&(!fields.scheduled.checked||CP.isNum(row.post?.calc?.prev[k-1])));
  allRows=[...postRows,...trees];
  visible=allRows.filter(row=>layers.has(row.kind));
  stats=windows.map(j=>CP.gerencial(posts,source.execs,params,j.k,windows));
  paintMetrics(k,trees,postRows);paintRows();paintMap();
 }
 const table=(heads,rows)=>'<div class="cycle-table"><table><thead><tr>'+heads.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 function paintMetrics(k,trees,posts){
  const m=stats[k-1];
  const cards=m?[['Postes previstos',m.postes],['Pontos de poda previstos',m.arv],['Executado no SGM',m.exec],['Avanço da janela',m.arv?pct.format(m.exec/m.arv):'—'],
   ['OS abertas (pontos)',m.pend],['Atrasos herdados (pontos)',m.atras],['Limpeza de faixa (qtd.)',m.faixa]]:[];
  cards.push(['Árvores individuais no recorte',trees.length],['Inspeções sincronizadas',trees.filter(t=>t.live).length],
   ['Serviços sem coordenada',posts.filter(p=>!p.point).length+trees.filter(t=>!t.point).length]);
  $('cycleMetrics').innerHTML=cards.map(([label,value])=>'<div><span>'+esc(label)+'</span><strong>'+esc(typeof value==='number'?nums(value):value)+'</strong></div>').join('');
  $('cycleMonthly').innerHTML=m?'<h4>Por mês · C'+k+'</h4>'+table(['Período','Postes','Pontos de poda','Executado','Avanço'],m.mes.map(x=>[CP.fmt(x.ini)+' a '+CP.fmt(x.fim),nums(x.postes),nums(x.arv),nums(x.exec),x.arv?pct.format(x.exec/x.arv):'—'])):'';
  $('cycleSets').innerHTML=m?'<h4>Por conjunto · C'+k+'</h4>'+table(['Conjunto','Polo','Postes','Pontos de poda','T1','T2','T3','OS aberta','Atraso','Executado'],
   Object.entries(m.conj).sort((a,b)=>b[1].arv-a[1].arv).map(([name,x])=>[name,x.polo,...['postes','arv','T1','T2','T3','pend','atras','exec'].map(v=>nums(x[v]))])):'';
  $('cycleWindows').innerHTML=m?'<h4>Todas as janelas</h4>'+table(['Ciclo','Início','Fim','Postes','Pontos de poda','Executado','OS aberta'],
   windows.map((j,i)=>['C'+j.k,CP.fmt(j.ini),CP.fmt(j.fim),...['postes','arv','exec','pend'].map(key=>nums(stats[i][key]))])):'';
 }
 const rowValues=row=>[labels[row.kind],row.id,row.posteGIS||(row.kind!=='arvore'?row.id:''),row.esp||row.espVera,row.alim,row.trecho,row.chave,row.groupStatus,
  CP.fmt(row.execucao),CP.fmt(row.calc?.P),CP.fmt(row.calc?.prev[Number(fields.cycle.value)-1]),row.arv,row.faixa,row.equipe];
 const heads=['Serviço','ID','Poste','Espécie','Alimentador','Trecho','Chave','Situação','Última execução','Próxima poda','Previsão no ciclo','Pontos de poda','Qtd. faixa','Equipe'];
 function paintRows(){
  const total=Math.max(1,Math.ceil(allRows.length/pageSize));page=Math.min(page,total-1);
  const start=page*pageSize, rows=allRows.slice(start,start+pageSize);
  $('cycleRows').innerHTML=rows.length?'<div class="cycle-table"><table><thead><tr>'+heads.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+
   '</tr></thead><tbody>'+rows.map((row,i)=>'<tr>'+rowValues(row).map((v,n)=>n===1?'<td><button type="button" class="link-button" data-cycle-row="'+(start+i)+'">'+esc(v)+'</button></td>':'<td>'+esc(v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>':'<p>Nenhum serviço ou árvore neste recorte.</p>';
  $('cyclePage').textContent='Página '+(page+1)+' de '+total+' · '+nums(allRows.length)+' registros';
  $('cyclePrev').disabled=!page;$('cycleNext').disabled=page>=total-1;
 }
 function details(row){
  const box=document.createElement('div');box.className='cycle-popup';
  const title=document.createElement('strong');title.textContent=labels[row.kind]+' · '+row.id;box.append(title);
  const rows=row.kind==='arvore'?[
   ['Espécie',row.esp],['Situação',row.groupStatus],['Prazo no Excel',row.prazo],['Necessita poda',row.poda],['Local da árvore',({publico:'Público',privado:'Privado'})[row.site]],
   ['Poste',row.posteGIS],['Altura (m)',row.altura],['DAP (cm)',row.dap],['Risco',row.classe],['Ação',row.acao],['Motivo',row.motivo],['Levantamento',CP.fmt(row.dataLev)]
  ]:[['Situação',row.groupStatus],['Última OS',row.tipo],['Status SGM',row.status],['Criação',CP.fmt(row.criacao)],['Última execução',CP.fmt(row.execucao)],
   ['Próximo retorno',CP.fmt(row.calc.P)],['Retorno seguinte',CP.fmt(row.calc.U)],['Ciclo',row.calc.J+' meses · '+row.calc.origem],
   ['Previsões',row.calc.prev.slice(0,params.count).map((value,i)=>value==null?'':'C'+(i+1)+' '+CP.fmt(value)).filter(Boolean).join(' · ')],
   ['Pontos de poda',row.arv],['Quantidade de faixa',row.faixa],['Equipe',row.equipe],['Árvores VERA',row.idsVera],['Espécies VERA',row.espVera]];
  rows.unshift(['Alimentador',row.alim],['Trecho',row.trecho],['Chave',row.chave]);
  const list=document.createElement('dl');for(const [label,value] of rows)if(value!=null&&value!==''){
   const term=document.createElement('dt'),desc=document.createElement('dd');term.textContent=label;desc.textContent=value;list.append(term,desc);
  }
  box.append(list);
  if(row.kind==='arvore'){
   const btn=document.createElement('button');btn.type='button';btn.textContent='Abrir cadastro e fotos';btn.onclick=()=>row.recordId?void window.CampoControl.openRecord(row.recordId):window.CampoParque?.openTree(row.id);
   if(row.recordId||window.CampoParque?.unifiedSnapshot()?.trees.some(t=>String(t.id)===String(row.id)))box.append(btn);
  }
  return box;
 }
 function paintMap(){
  if(!map||!markers||!active())return;
  markers.clearLayers();links.clearLayers();markerByRow=new Map();
  const bounds=map.getBounds().pad(.06), onScreen=visible.filter(row=>row.point&&bounds.contains(row.point));
  if(onScreen.length>800){
   const grid=new Map();
   for(const row of onScreen){
    const {x,y}=map.latLngToContainerPoint(row.point), key=[row.kind,Math.floor(x/53),Math.floor(y/53)].join('|');
    const entry=grid.get(key)||{kind:row.kind,points:[]};entry.points.push(row.point);grid.set(key,entry);
   }
   for(const {kind,points} of grid.values()){
    const b=L.latLngBounds(points),summary=nums(points.length);
    const symbol=L.divIcon({className:'cycle-marker cycle-cluster',html:icon(kind)+'<span>'+summary+'</span>',iconSize:[32,32],iconAnchor:[16,16]});
    L.marker(b.getCenter(),{icon:symbol,pane:'cycleMarkers',title:labels[kind]+' · '+summary,bubblingMouseEvents:false}).on('click',()=>map.fitBounds(b,{padding:[48,48],maxZoom:Math.min(20,Math.max(16,map.getZoom()+2))})).addTo(markers);
   }
  }else{
   const icons=new Map();
   for(const row of onScreen){
    const key=row.kind+row.groupStatus;
    if(!icons.has(key))icons.set(key,L.divIcon({className:'cycle-marker',html:icon(row.kind,statusColors[row.groupStatus]),iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]}));
    const marker=L.marker(row.point,{icon:icons.get(key),title:labels[row.kind]+' '+row.id,pane:'cycleMarkers',bubblingMouseEvents:false}).bindPopup(()=>details(row),{maxWidth:380}).addTo(markers);
    markerByRow.set(row,marker);
    if($('cycleLinks').checked&&row.post?.point)L.polyline([row.point,row.post.point],{pane:'cycleLinks',color:'#8258ae',dashArray:'4 5',weight:1.5,interactive:false}).addTo(links);
   }
  }
  $('cycleMapStatus').textContent=nums(onScreen.length)+' serviços e árvores na área visível'+(onScreen.length>800?' · aproxime para abrir pontos individuais':'')+'.';
  if(needsFit&&visible.some(row=>row.point)){needsFit=false;fit();}
 }
 function fit(){
  const points=visible.filter(row=>row.point).map(row=>row.point);
  if(!map||!points.length){$('cycleMapStatus').textContent='Nenhum ponto com coordenada no recorte.';return;}
  map.invalidateSize();map.fitBounds(L.latLngBounds(points),{padding:[32,36],maxZoom:18});
 }
 function attach(leaflet){
  if(map)return;
  map=leaflet;map.createPane('cycleMarkers').style.zIndex='643';map.createPane('cycleLinks').style.zIndex='631';
  markers=L.layerGroup().addTo(map);links=L.layerGroup().addTo(map);
  map.on('moveend',()=>{clearTimeout(zoomTimer);zoomTimer=setTimeout(paintMap,120);});
  if(active())paintMap();
 }
 async function load(force=false){
  if(!active())return;
  if(loading)return loading;
  const token=epoch;
  request=new AbortController();
  const {signal}=request;
  loading=(async()=>{
   try{
    const meta=await window.CampoControl.api(endpoint+'?meta=1',undefined,signal);
    if(!active()||token!==epoch)return;
    $('cycleLegacy').hidden=Boolean(meta.revision);
    if(!meta.revision){$('cycleSource').textContent='Importe Controle Man V1.xlsx para ativar as previsões do ciclo.';if(!source){$('cycleSettings').open=true;recalc();}return;}
    if(!force&&source&&meta.revision===revision)return;
    $('cycleSource').textContent='Carregando a base de ciclo…';
    const response=await fetch(endpoint,{cache:'no-store',signal});
    if(!response.ok)throw Error((await response.json()).error);
    const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
    const data=await new Response(stream).json();
    if(!active()||token!==epoch)return;
    source=CP.source(data);revision=response.headers.get('X-Cycle-Revision')||meta.revision;params=defaults();
    updateParameters();recalc();
    $('cycleSource').textContent=[source.source.local,source.source.modificado?'Salvo em '+source.source.modificado:'',
     nums(source.postes.length)+' registros de poste',nums(source.arvores.length)+' árvores VERA',nums(source.execs.length)+' execuções SGM'].filter(Boolean).join(' · ');
   }catch(error){if(token===epoch&&error.name!=='AbortError'){$('cycleSource').textContent=error.message;$('cycleLegacy').hidden=Boolean(source);}}
   finally{if(token===epoch){loading=null;request=null;}}
  })();
  return loading;
 }
 function readFile(file){
  return new Promise((resolve,reject)=>{
   const worker=new Worker('ciclo-poda-import.js');
   worker.onmessage=({data})=>{
    if(data.message){$('cycleUploadStatus').textContent=data.message;return;}
    worker.terminate();
    if(data.error)reject(Error(data.error));else resolve(data.data);
   };
   worker.onerror=error=>{worker.terminate();reject(Error(error.message||'Falha ao ler a planilha.'));};
   worker.postMessage(file);
  });
 }
 $('cycleUpload').onsubmit=async event=>{
  event.preventDefault();
  const file=$('cycleFile').files[0], button=event.submitter;
  if(!file||publishing||!active())return;
  publishing=true;button.disabled=true;const at=epoch,note=$('cycleUploadStatus');
  try{
   const data=await readFile(file),candidate=CP.source(data);
   if(at!==epoch||!active())return;
   if(!confirm('Publicar '+nums(candidate.postes.length)+' registros de postes, '+nums(candidate.arvores.length)+' árvores VERA e '+nums(candidate.execs.length)+' execuções de poda para a gestão?')){note.textContent='Arquivo validado. Publicação cancelada.';return;}
   note.textContent='Publicando a base recalculável…';
   const stream=new Blob([JSON.stringify(data)]).stream().pipeThrough(new CompressionStream('gzip'));
   const archive=await new Response(stream).blob();
   const response=await fetch(endpoint+'?base='+encodeURIComponent(revision),{method:'POST',headers:{'Content-Type':'application/gzip'},
    body:archive,signal:AbortSignal.timeout(90000)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   note.textContent='Base publicada para a gestão.';
   $('cycleFile').value='';await load(true);
  }catch(error){if(at===epoch)note.textContent=error.message;}
  finally{publishing=false;button.disabled=false;}
 };
 parameterForm.onsubmit=event=>{
  event.preventDefault();if(!source)return;
  const values=Object.fromEntries(new FormData(parameterForm));
  params={...source.par,inicio:serial(values.inicio),janela:Number(values.janela),padrao:Number(values.padrao),faixa:Number(values.faixa),count:Number(values.count),today:serial(values.today)};
  page=0;recalc();
 };
 parameterForm.onreset=event=>{event.preventDefault();if(source){params=defaults();updateParameters();recalc();}};
 const update=()=>{page=0;$('cycleDetail').replaceChildren();render();};
 filters.onchange=update;filters.onsubmit=event=>event.preventDefault();
 fields.query.oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(update,220);};
 $('cycleMapTools').onchange=render;
 $('cycleFit').onclick=fit;
 $('cycleReload').onclick=()=>{void load(true);void window.CampoParque?.refresh();};
 $('cyclePrev').onclick=()=>{page--;paintRows();};$('cycleNext').onclick=()=>{page++;paintRows();};
 $('cycleRows').onclick=event=>{
  const target=event.target.closest('[data-cycle-row]');if(!target)return;
  const row=allRows[Number(target.dataset.cycleRow)];if(!row)return;
  $('cycleDetail').replaceChildren(details(row));
  if(map&&row.point&&visible.includes(row)){map.setView(row.point,19);paintMap();markerByRow.get(row)?.openPopup();}
 };
 $('cycleCsv').onclick=()=>{
  const quote=value=>{const text=String(value??'');return '"'+(/^[=+@\t\r-]/.test(text)&&!Number.isFinite(Number(text))?"'":'')+text.replace(/"/g,'""')+'"';};
  const archive=new Blob(['\ufeff'+[heads,...allRows.map(rowValues)].map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(archive),link=document.createElement('a');link.href=url;link.download='plano_ciclo_poda.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function visibility(){
  const on=Boolean(active()), entering=on&&!lastHash;lastHash=on;
  document.body.classList.toggle('cycle-on',on);section.hidden=ledger.hidden=tools.hidden=!on;
  window.CampoControlMap?.cycleMode(on);
  if(entering){
   needsFit=true;paintMap();void load();void window.CampoParque?.refresh();
  }
  if(!on){markers?.clearLayers();links?.clearLayers();}else if(!entering){paintMap();}
 }
 window.CampoCycle={attach,active,visibility,stop(){
  epoch++;request?.abort();request=null;loading=null;source=null;revision='';params=null;windows=[];allRows=[];visible=[];treeRows=[];stats=[];lastHash=false;
  for(const id of ['cycleSource','cycleUploadStatus','cycleCheck','cycleGrowth','cycleDetail','cycleRows','cycleMetrics','cycleMonthly','cycleSets','cycleWindows'])$(id).replaceChildren();
  $('cycleFile').value='';
  visibility();
 }};
 addEventListener('campo-unified-data',()=>{if(active()){takeTrees();populate();render();}});
 visibility();
})();
