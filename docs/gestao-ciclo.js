'use strict';
(()=>{
 const $=id=>document.getElementById(id), fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
 const pct=new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1});
 const collator=new Intl.Collator('pt-BR',{numeric:true});
 const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[char]);
 const route=()=>['#mapa','#c-mapa','#c-carteira-territorial'].includes(location.hash), endpoint='/api/ciclo-poda';
 const statusColors={'Atrasada':'#be3b39','Pendente (OS aberta)':'#b96121','No ciclo atual':'#236eba','Próximos ciclos':'#237344',
  'Fora do Prazo':'#be3b39','Urgente (< 30 dias)':'#b96121','Dentro do Prazo':'#237344','Sem dados':'#798982','Sem data':'#798982','Atualizada em campo':'#18747b','Sem ciclo vinculado':'#18747b','SS aberta':'#754b91','SS aberta sem OS':'#754b91'};
 const labels={estrutura:'Estruturas',poste:'Poste com OS de poda',ss:'Poste com SS de poda',ambos:'Poste com OS e SS',arvore:'Árvore individual',faixa:'Limpeza de faixa'};
 const icon=(kind,ring='#526c62')=>{
  const tree='<path d="M20 7a5 5 0 0 0-5 5 4 4 0 0 0 0 8h10a4 4 0 0 0 0-8 5 5 0 0 0-5-5Z" fill="#38934f"/><path d="M20 16v9" stroke="#654530" stroke-width="2"/>';
  const pole='<path d="M10 7v17m-4-13h8" fill="none" stroke="#31443f" stroke-width="2.4" stroke-linecap="round"/>';
  const badge=kind==='ss'||kind==='ambos'?'<rect x="2" y="20" width="15" height="10" rx="3" fill="'+(kind==='ss'?'#754b91':'#255c99')+'"/><text x="9.5" y="27.5" font-size="7" font-weight="700" fill="white" text-anchor="middle">'+(kind==='ss'?'SS':'+SS')+'</text>':'';
  const symbol=['poste','ss','ambos'].includes(kind)?pole+tree+badge:kind==='faixa'?'<path d="M7 22h18M8 19l4-8 3 5 4-8 5 10M15 18l-3 5m10-6-2 6" fill="none" stroke="#8a602b" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>':'<g transform="translate(-4)">'+tree+'</g>';
  return '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="#fff" stroke="'+ring+'" stroke-width="2.8"/>'+symbol+'</svg>';
 };
 const options=items=>items.map(([value,text])=>'<option value="'+esc(value)+'">'+esc(text)+'</option>').join('');
 const nums=n=>fmt.format(n||0), dateIso=s=>CP.ymd(s).map((n,i)=>String(n).padStart(i?2:4,'0')).join('-');
 const serial=s=>s?CP.DATE(...s.split('-').map(Number)):null;
 const active=()=>route()&&window.CampoControl?.authorized();
 const section=document.createElement('section');section.id='cycleManagement';section.className='panel';section.hidden=true;
 section.innerHTML=`<div class="panel-head"><div><h2>Plano de ciclo de poda</h2><p id="cycleSource" class="small" role="status"></p><p id="cycleSSStatus" class="small" role="status"></p><p id="cycleGeoCoverage" class="small" role="status"></p><span id="cycleRefreshStatus" class="small" role="status"></span></div><div class="cycle-actions"><button type="button" id="cycleReload">Atualizar dados</button><button type="button" id="cycleOpenSettings">Parâmetros e diretórios</button></div></div>
 <nav class="cycle-jumps" aria-label="Seções do plano"><button data-cycle-jump="cycleMetrics">Visão geral</button><button data-cycle-jump="cycleMapTools">Mapa</button><button data-cycle-jump="cycleSummary">Ciclos</button><button data-cycle-jump="cycleLedger">Carteira por poste</button><button data-cycle-jump="territorialPlan">Carteira 2027 e rotas</button></nav>
 <dialog id="cycleSettings" aria-labelledby="cycleSettingsTitle"><div class="panel-head"><h2 id="cycleSettingsTitle">Parâmetros e diretórios</h2><button type="button" id="cycleCloseSettings" autofocus>Fechar</button></div>
 <h3>Arquivo de ciclo</h3>
 <form id="cycleUpload"><label>Controle Man V1.xlsx ou extrato do Ciclo Poda<input id="cycleFile" type="file" accept=".xlsx,.js,.json,.gz" required></label><div class="cycle-actions"><button type="submit" value="local">Carregar neste navegador</button><button type="submit" value="central">Publicar na gestão</button></div></form>
 <p class="small">Use a planilha salva após o recálculo no Excel ou o extrato gerado pelo atualizador. A carga neste navegador vale enquanto esta página estiver aberta.</p>
 <p id="cycleUploadStatus" role="status"></p><form id="cycleParameters"><label>Início do plano<input name="inicio" type="date" required></label>
 <label>Janela (meses)<input name="janela" type="number" min="1" max="120" required></label>
 <label>Poda padrão (meses)<input name="padrao" type="number" min="1" max="120" required></label>
 <label>Faixa (meses)<input name="faixa" type="number" min="1" max="120" required></label>
 <label>Número de ciclos<input name="count" type="number" min="2" max="12" value="4" required></label>
 <label>Data de referência<input name="today" type="date"></label><button type="submit">Recalcular cenário</button><button type="reset">Premissas do Excel</button></form>
 <p id="cycleCheck" class="small"></p><div id="cycleGrowth"></div>
 <h3>Polígonos dos conjuntos elétricos</h3>
 <form id="cycleGeoForm">
 <label>GeoPackage de conjuntos<input id="cycleGeoFile" type="file" accept=".gpkg"></label>
 <label hidden>Camada<select id="cycleGeoLayer"></select></label>
 <label hidden>Campo de nome ou código<select id="cycleGeoColumn"></select></label>
 <button type="submit" id="cycleGeoApply" disabled>Vincular por área</button>
 </form>
 <p id="cycleGeoStatus" class="small" role="status">Selecione o GeoPackage do QGIS para cruzar os pontos com os polígonos.</p>
 <h3>Diretórios de origem</h3><form id="cycleDirectories">
 <label>Servidor<input name="SERVIDOR" placeholder="Caminho do arquivo no servidor"></label>
 <label>Notebook<input name="NOTEBOOK" placeholder="Caminho do arquivo no notebook"></label>
 <label>PC de casa<input name="PC_CASA" placeholder="Caminho do arquivo no PC"></label>
 <label>Importar configuração<input id="cycleDirectoryFile" type="file" accept=".json,application/json"></label>
 <button type="submit">Salvar diretórios neste navegador</button></form>
 <p id="cycleDirStatus" class="small">Use os caminhos como referência para escolher o arquivo. O navegador pede que você selecione o arquivo para liberar o acesso.</p></dialog>
 <form id="cycleFilters" class="cycle-filters"><label>Ciclo<select name="cycle" disabled><option value="">Aguardando base de ciclo</option></select></label>
 <label>Polo<select name="polo"></select></label><div class="cycle-multi-field"><span>Conjunto</span><details class="msel cycle-multi" id="cycleConj">
 <summary>Todos os conjuntos</summary><div class="msel-pop"><input type="search" id="cycleConjSearch" placeholder="Buscar conjunto" aria-label="Buscar conjunto">
 <div class="cycle-actions"><button type="button" id="cycleConjAll">Selecionar todos</button><button type="button" id="cycleConjClear">Limpar seleção</button></div>
 <div class="msel-lista" id="cycleConjOptions"></div></div></details></div>
 <label>Alimentador<select name="alim"></select></label><label>Trecho<select name="trecho"></select></label>
 <label>Perímetro<select name="perim"></select></label><label>Origem do ponto<select name="vera"><option value="">Todos</option><option value="com">Com VERA</option><option value="sem">Sem VERA</option><option value="excel">Referência provisória do Excel</option></select></label>
 <label>Situação<select name="state"></select></label><label>Chave<select name="chave"></select></label><label>Buscar poste, árvore ou chave<input name="query" type="search" autocomplete="off"></label>
 <label><span><input name="scheduled" type="checkbox"> Só previstos nas janelas</span></label><button type="reset">Limpar filtros</button></form>
 <p id="cycleFilterCount" class="small" role="status"></p><div id="cycleMetrics" class="cycle-metrics"></div>`;
 const mapPanel=$('mapa');mapPanel.parentElement.classList.add('cycle-map-row');mapPanel.parentElement.before(section);
 const tools=document.createElement('div');tools.id='cycleMapTools';tools.hidden=true;tools.innerHTML=`
 <button id="cycleFit" type="button">Enquadrar serviços</button><div class="cycle-map-legend">`+
 Object.entries(labels).map(([id,label])=>'<label><input type="checkbox" data-cycle-layer="'+id+'" checked>'+icon(id)+esc(label)+'</label>').join('')+
 `<label><input type="checkbox" id="cycleLinks"> Vínculo árvore–poste</label><label><input type="checkbox" id="cycleClusters" checked> Agrupar pontos</label></div><span id="cycleMapStatus" class="small" role="status"></span><details class="cycle-color-legend"><summary>Cores dos marcadores</summary><div>`+
 Object.entries(statusColors).filter(([status])=>!['Atualizada em campo','Sem ciclo vinculado'].includes(status)).map(([status,color])=>'<span><i style="--ring:'+color+'"></i>'+esc(status)+'</span>').join('')+`</div></details>`;
 $('mapFrame').before(tools);
 const summary=document.createElement('section');summary.id='cycleSummary';summary.className='panel';summary.hidden=true;
 summary.innerHTML=`<h3>Resumo de todos os ciclos</h3><div id="cycleWindows"></div>
 <div class="cycle-overview-grid"><div id="cycleMonthly"></div><div id="cycleBreakdown"></div></div><div id="cycleSets"></div>`;
 mapPanel.parentElement.after(summary);
 const ledger=document.createElement('article');ledger.id='cycleLedger';ledger.className='panel';ledger.hidden=true;
 ledger.innerHTML=`<div class="panel-head"><div><h3>Carteira por poste</h3><p id="cycleLedgerCount" class="small"></p></div><div class="cycle-actions"><label>Exibir <select id="cycleLedgerView"><option value="postes">Postes e serviços</option><option value="arvores">Árvores individuais</option><option value="estruturas">Estruturas</option></select></label><button id="cycleCsv" type="button">Exportar CSV filtrado</button></div></div>
 <div id="cycleDetail" aria-live="polite"></div><div id="cycleRows"></div><div class="cycle-pages"><button type="button" id="cyclePrev">Anterior</button><span id="cyclePage"></span><button type="button" id="cycleNext">Próxima</button></div>`;
 summary.after(ledger);
 let structures=new Map(),conjuntos={},structureGeneration='', structureRequest=null;
 let references=null,polygonIndex=null,polygonSource=null,geoRestored=false,geoWorker=null,geoLayers=[],registry=null;
 let source=null,localSource=false,revision='',params=null,windows=[],now=0,allRows=[],visible=[],treeRows=[],stats=[],page=0,map=null,markers=null,links=null,markerByRow=new Map(),zoomTimer,filterTimer,epoch=0,loading=null,request=null,publishing=false,lastHash=false,needsFit=false;
 const filters=$('cycleFilters'),parameterForm=$('cycleParameters');
 const unknownConj='SEM CONJUNTO IDENTIFICADO';
 const fields=filters.elements,selectedConj=new Set(),conjMenu=$('cycleConj'),conjSearch=$('cycleConjSearch');
 function paintConjSummary(){
  conjMenu.querySelector('summary').textContent=selectedConj.size===1?(conjuntos[[...selectedConj][0]]||[...selectedConj][0]):selectedConj.size?selectedConj.size+' conjuntos':'Todos os conjuntos';
 }
 function searchConj(){
  const query=CP.norm(conjSearch.value);
  for(const label of $('cycleConjOptions').children)label.hidden=!CP.norm(label.textContent).includes(query);
 }
 function setConj(all){
  selectedConj.clear();
  for(const input of $('cycleConjOptions').querySelectorAll('input')){
   input.checked=all;if(all)selectedConj.add(input.value);
  }
  paintConjSummary();update();
 }
 $('cycleConjAll').onclick=()=>setConj(true);
 $('cycleConjClear').onclick=()=>setConj(false);
 conjSearch.oninput=searchConj;
 $('cycleConjOptions').onchange=event=>{
  const input=event.target;if(input.checked)selectedConj.add(input.value);else selectedConj.delete(input.value);
  paintConjSummary();
 };
 conjMenu.ontoggle=()=>{if(conjMenu.open)conjSearch.focus();};
 document.addEventListener('click',event=>{if(conjMenu.open&&!conjMenu.contains(event.target))conjMenu.open=false;});
 function populateConj(rows){
  const names=new Map(rows.filter(row=>row.conjCode).map(row=>[row.conjCode,row.conjName||row.conj]));
  const values=[...new Set(rows.map(r=>r.conjCode||unknownConj))].sort((a,b)=>collator.compare(names.get(a)||a,names.get(b)||b));
  const available=new Set(values);
  for(const value of selectedConj)if(!available.has(value))selectedConj.delete(value);
  const root=$('cycleConjOptions');
  if(root.dataset.values!==JSON.stringify(values)){
   root.dataset.values=JSON.stringify(values);
   root.innerHTML=values.map(value=>'<label><input type="checkbox" value="'+esc(value)+'"'+(selectedConj.has(value)?' checked':'')+'><span>'+esc(names.get(value)||value)+'</span></label>').join('');
   searchConj();
  }
  paintConjSummary();
 }

 const multiLabels={cycle:'Ciclo',polo:'Polo',alim:'Alimentador',trecho:'Trecho',perim:'Perímetro',vera:'Origem VERA',state:'Situação',chave:'Chave'};
 const multi=Object.fromEntries(Object.entries(multiLabels).map(([name,caption])=>[name,GestaoMulti.mount(fields[name],caption)]));
 const selected=name=>GestaoMulti.selected(fields[name]);
 let cycleInitialized=false,area=null;
 const territorial=GestaoTerritorial.create({
  anchor:ledger,tools, getMap:()=>map, fitServices:fit,classify:row=>CycleConjuntos.classifyRow(row,polygonIndex,null,{registry,anchor:true}),update:()=>{populate();update(false);},
  plot:point=>{if(map){$('mapFrame').scrollIntoView({block:'center'});map.setView(point,18);}},
  table:(...args)=>table(...args)
 });
 const pageSize=40;
 let sorting={column:'created',ascending:false},ledgerRows=[];
 const plannedOnly=fields.scheduled;
 plannedOnly.checked=true;
 plannedOnly.disabled=true;
 const folderForm=$('cycleDirectories'),directoryNames=['SERVIDOR','NOTEBOOK','PC_CASA'];
 function fillDirectories(paths){for(const key of directoryNames)folderForm.elements[key].value=String(paths?.[key]||'');}
 try{fillDirectories(JSON.parse(localStorage.getItem('campo-cycle-folders')||'{}'));}catch{}
 folderForm.onsubmit=event=>{
  event.preventDefault();
  try{localStorage.setItem('campo-cycle-folders',JSON.stringify(Object.fromEntries(directoryNames.map(key=>[key,folderForm.elements[key].value.trim()]))));$('cycleDirStatus').textContent='Diretórios salvos neste navegador.';}
  catch{$('cycleDirStatus').textContent='O navegador não permitiu salvar os diretórios.';}
 };
 $('cycleDirectoryFile').onchange=async event=>{
  const file=event.target.files[0];if(!file)return;
  try{if(file.size>64000)throw Error('Arquivo acima de 64 KB.');const config=JSON.parse(await file.text());if(!config.locais)throw Error('A configuração precisa conter a seção locais.');fillDirectories(config.locais);$('cycleDirStatus').textContent='Diretórios carregados. Salve para manter neste navegador.';}
  catch(error){$('cycleDirStatus').textContent=error.message;}
  finally{event.target.value='';}
 };
 $('cycleOpenSettings').onclick=()=>$('cycleSettings').showModal();
 $('cycleCloseSettings').onclick=()=>$('cycleSettings').close();
 section.querySelector('.cycle-jumps').onclick=event=>{const id=event.target.dataset.cycleJump;if(id)$(id).scrollIntoView({block:'start'});};
 function updateParameters(){
  for(const key of ['inicio','janela','padrao','faixa','count','today'])parameterForm.elements[key].value=key==='inicio'||key==='today'?(params[key]?dateIso(params[key]):''):params[key];
 }
 function defaults(){return {...source.par,count:4,today:null};}
 function copyOptions(name,values){multi[name].set(GestaoMulti.pairs(values));}
 function resolveArea(territory,point,row,poleRecord=false){
  return CycleConjuntos.classifyRow({...row,...territory,conjOriginal:row.conjOriginal??row.conj??'',point},polygonIndex,null,{registry,anchor:poleRecord,poleRecord});
 }
 function enriched(row){
  const central=structures.get(CP.postId(row.id));
  const territory=resolveArea(CP.territory(row,conjuntos,central),row.point,row,true);
  if(!central)return {...row,...territory};
  const kind=row.kind==='faixa'?'faixa':central.ss?(central.os||/PODA/.test(CP.norm(row.tipo))?'ambos':'ss'):'poste';
  return {...central,...row,...territory,kind,point:territory.point,criacao:row.criacao??central.criacao,
   execucao:row.execucao??central.execucao,status:row.status||central.status,statusSGM:row.statusSGM||row.status||central.statusSGM,
   tipo:row.tipo||central.tipo,equipe:row.equipe||central.equipe};
 }
 function centralOnly(row){
  const kind=row.ss?(row.os?'ambos':'ss'):'poste';
  return {...row,...resolveArea(CP.territory(row,conjuntos),row.point,row,true),kind,
   groupStatus:row.osOpen?'Pendente (OS aberta)':row.ssWithoutOS?'SS aberta sem OS':row.ssOpen?'SS aberta':'Sem ciclo vinculado'};
 }
 let effectivePosts=[];
 function collectPosts(){
  effectivePosts=(source?.postes||[]).map(enriched);
  for(const [id,row] of structures)if(!source?.index.has(id))effectivePosts.push(centralOnly(row));
 }
 function populate(){
  const rows=[...effectivePosts,...treeRows,...territorial.structures()];
  for(const name of ['polo','alim','chave'])copyOptions(name,rows.map(r=>String(r[name]||'')));
  populateConj(rows);
  for(const [name,values] of [['perim',['RURAL','URBANO']],['trecho',['T1','T2','T3','T1+T2','T1+T2+T3']]]){
   multi[name].set(values.map(value=>[value,value.replaceAll('+',' + ')]));
  }
  copyOptions('state',rows.flatMap(row=>[...CP.statuses(row)]));
 }
 function takeTrees(){
  const index=new Map(effectivePosts.map(row=>[CP.postId(row.id),row]));
  treeRows=CP.overlay(source,window.CampoParque?.unifiedSnapshot()).map(tree=>{
   const post=index.get(CP.postId(tree.posteGIS));
   const point=CycleConjuntos.pointOf(tree);
   const territory=CP.territory({...tree,perim:tree.perim||tree.zona},conjuntos,post);
   const location=resolveArea(territory,point,tree);
   return {...tree,...location,kind:'arvore',post,groupStatus:tree.prazo||(tree.live?'Atualizada em campo':'Sem dados')};
  });
  updateCoverage();
 }
 function recalc(){
  plannedOnly.disabled=!source;
  if(!source){
   windows=[];fields.cycle.disabled=true;multi.cycle.set([]);
   collectPosts();takeTrees();populate();render();return;
  }
  fields.cycle.disabled=false;
  now=params.today||CP.hojeSerial();windows=CP.janelas(params,params.count);
  const choices=selected('cycle').filter(value=>Number(value)<=params.count);
  const first=String(Math.min(params.count,CP.cicloAtual(params,now)));
  multi.cycle.set(windows.map(j=>[String(j.k),j.rotulo]),choices.length||cycleInitialized?choices:[first]);
  cycleInitialized=true;
  let aligned=0;
  const eq=(a,b)=>a==null&&b==null||a!=null&&b!=null&&Math.abs(a-b)<1e-6;
  source.postes.forEach((p,i)=>{
   p.calc=CP.calcula(p,params,now,Math.max(4,params.count));p.kind=CP.service(p);p.groupStatus=p.calc.S;
   if(source.estimated&&p.status==='PENDENTE')p.calc.origem='Criação da OS aberta';
   const check=source.check[i];
   if(!check)return;
   if(eq(p.calc.P,check[0])&&eq(p.calc.Q,check[1])&&p.calc.prev.slice(0,4).every((date,j)=>eq(date,check[j+3])))aligned++;
  });
  const scenario=['inicio','janela','padrao','faixa'].some(k=>params[k]!==source.par[k]);
  $('cycleCheck').textContent=source.estimated?'Previsão do consolidado com as premissas de ciclo abaixo. Importe o Excel para conferir suas datas e quantidades.':scenario?'Simulação com premissas ajustadas nesta tela.':nums(aligned)+' de '+nums(source.postes.length)+' registros coincidem com o Excel em próximo retorno, ciclo e datas C1–C4.';
  $('cycleGrowth').innerHTML=table(['Classe de crescimento','Rebrota de referência (m/ano)','Ciclo (meses)','Referência'],source.classes)+
   table(['Rede','Rede nua (m)','Rede protegida (m)','Zona de risco (m)'],source.par.it||[]);
  collectPosts();takeTrees();populate();render();
 }
 function render(){
  if(!active())return;
  const values=Object.fromEntries(Object.keys(multi).map(name=>[name,new Set(selected(name))]));
  const k=Number(values.cycle.values().next().value)||1,q=CP.norm(fields.query.value),scheduled=Boolean(source)&&plannedOnly.checked;
  const windowIds=values.cycle.size?[...values.cycle].map(Number):windows.map(w=>w.k);
  const inWindows=calc=>windowIds.some(index=>CP.isNum(calc?.prev[index-1]));
  const segments=[...values.trecho];
  const passes=row=>{
   for(const name of ['polo','alim','chave'])if(values[name].size&&!values[name].has(String(row[name]||'')))return false;
   if(values.perim.size&&!values.perim.has(CarteiraTerritorial.perimeter(row.perim)))return false;
   if(selectedConj.size&&!selectedConj.has(row.conjCode||unknownConj))return false;
   if(segments.length&&!segments.some(value=>CP.filtroTrecho(row.trecho,value)))return false;
   if(row.kind!=='estrutura'&&values.vera.size){
    const origin=row.kind==='arvore'?({vera:'com',campo:'sem'}[row.origin]||'excel'):((row.nvera||row.vera)>0?'com':'sem');
    if(!values.vera.has(origin))return false;
   }
   if(values.state.size&&![...CP.statuses(row)].some(value=>values.state.has(value)))return false;
   if(q&&!CP.norm([row.id,row.posteGIS,row.esp,row.espVera,row.idsVera,row.alim,row.conj,row.chave,row.orderId,row.tipo].join(' ')).includes(q))return false;
   return !area||CycleConjuntos.pointInArea(row.point,area);
  };
  const posts=source?.postes||[],ledgerPosts=effectivePosts;
  for(const [i,row] of posts.entries()){
   const effective=ledgerPosts[i];
   row.fg=passes(effective)&&CP.norm(row.cat)!=='OUTROS (NAO PODA)';
   effective.fg=row.fg;
  }
  const layers=new Set([...$('cycleMapTools').querySelectorAll('[data-cycle-layer]:checked')].map(input=>input.dataset.cycleLayer));
  const postRows=ledgerPosts.filter((row,i)=>(i<posts.length?posts[i].fg:passes(row))&&(!scheduled||inWindows(row.calc)));
  const trees=treeRows.filter(row=>passes(row)&&(!scheduled||!row.post?.calc||inWindows(row.post.calc)));
  const structuresInView=territorial.structures().filter(passes);updateCoverage();
  allRows=[...postRows,...trees,...structuresInView];
  const planning=territorial.render(allRows,now||CP.hojeSerial(),area);
  visible=allRows.filter(row=>layers.has(row.kind)&&(row.kind!=='estrutura'||territorial.assetVisible(row.asset))&&(!planning||planning.has(row)));
  const forecastPosts=ledgerPosts.slice(0,posts.length);
  stats=windows.map(j=>CP.gerencial(forecastPosts,source.execs,params,j.k,windows));
  const windowsText=values.cycle.size?windowIds.map(value=>'C'+value).join(', '):'todas as janelas';
  $('cycleFilterCount').textContent=nums(postRows.length)+' postes e serviços · '+nums(trees.length)+' árvores · '+nums(structuresInView.length)+' estruturas no recorte. '+(scheduled?'Poda em '+windowsText+'.':'Inclui postes sem previsão na janela.')+(scheduled&&!postRows.length&&values.state.size?' Confira o recorte com Só previstos nas janelas desmarcado.':'');
  paintMetrics(k,trees,postRows,windowIds);refreshLedger();paintMap();
 }
 const table=(heads,rows)=>'<div class="cycle-table"><table><thead><tr>'+heads.map(v=>'<th scope="col">'+esc(v)+'</th>').join('')+
  '</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>'<td>'+esc(v==null||v===''?'—':v)+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
 function paintMetrics(k,trees,posts,windowIds){
  const m=stats[k-1],estimated=source?.estimated;
  const windowStats=stats.filter((_,i)=>windowIds.includes(i+1));
  const total=key=>windowStats.reduce((count,item)=>count+(item[key]||0),0);
  const executed=value=>estimated?'—':nums(value),advance=(total,real)=>estimated||!total?'—':pct.format(real/total);
  const cards=m?[['Postes previstos',windowIds.length===1?m.postes:posts.filter(row=>windowIds.some(j=>CP.isNum(row.calc?.prev[j-1]))).length],
   ['Pontos de poda previstos'+(estimated?' · estimativa':''),total('arv')],['Executado no SGM',estimated?'—':total('exec')],['Avanço nas janelas',advance(total('arv'),total('exec'))],
   ['OS abertas (pontos)',windowIds.length===1?m.pend:posts.filter(row=>row.osOpen||row.status==='PENDENTE').reduce((sum,row)=>sum+(row.arv||row.arvE||0),0)],
   ['Atrasos herdados (pontos)',total('atras')],['Limpeza de faixa (qtd.)',estimated?'—':total('faixa')]]:[];
  const vera=trees.filter(t=>t.origin==='vera').length,campo=trees.filter(t=>t.origin==='campo').length;
  cards.push(['Árvores individuais no recorte',trees.length],['Base VERA',vera],['Novas árvores do campo',campo],
   ['Referências provisórias do Excel',trees.length-vera-campo],
   ['Serviços sem coordenada',posts.filter(p=>!p.point).length+trees.filter(t=>!t.point).length]);
  $('cycleMetrics').innerHTML=cards.filter(([label,value])=>label!=='Referências provisórias do Excel'||value).map(([label,value])=>'<div><span>'+esc(label)+'</span><strong>'+esc(typeof value==='number'?nums(value):value)+'</strong></div>').join('');
  const missing='<p class="small">Carregue o arquivo em <button type="button" data-cycle-settings>Parâmetros e diretórios</button> para ver as previsões e o realizado por janela.</p>';
  const polos=['BRA','CZS','RBR'];
  const centralNote='<p class="small">Previsão estimada a partir da última poda e das OS abertas por poste. O realizado por poste e a limpeza de faixa da janela dependem do Excel do ciclo.</p>';
  $('cycleWindows').innerHTML=m?(estimated?centralNote:'')+table(['Ciclo','Janela','Postes','Pontos de poda',...polos,'Executado','OS aberta','Avanço'],
   windows.map((j,i)=>{
    const r=stats[i];
    return ['C'+j.k+(windowIds.includes(j.k)?' · selecionado':''),CP.fmt(j.ini)+' a '+CP.fmt(j.fim),nums(r.postes),nums(r.arv),...polos.map(p=>nums(r.polo[p])),executed(r.exec),nums(r.pend),advance(r.arv,r.exec)];
   })):missing;
  const monthLabel=new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit',timeZone:'UTC'});
  const max=Math.max(1,...(m?.mes||[]).map(x=>Math.max(x.arv,x.exec)));
  $('cycleMonthly').innerHTML=m?'<h4>Distribuição mensal · detalhe C'+k+'</h4><p class="small">'+(estimated?'Previsto estimado em pontos de poda':'Previsto e executado em pontos de poda')+'</p><div class="cycle-month-chart">'+
   m.mes.map(x=>'<div class="cycle-month" title="'+esc(CP.fmt(x.ini)+' a '+CP.fmt(x.fim)+' · '+nums(x.arv)+' previstos'+(estimated?'':' · '+nums(x.exec)+' executados'))+'"><div><span style="height:'+100*x.arv/max+'%"></span><span style="height:'+100*x.exec/max+'%"></span></div><small>'+esc(monthLabel.format(new Date(dateIso(x.ini)+'T12:00:00Z')))+ '</small></div>').join('')+'</div>'+
   table(['Período','Postes','Previsto',...polos,'Executado','Avanço'],m.mes.map(x=>[CP.fmt(x.ini)+' a '+CP.fmt(x.fim),nums(x.postes),nums(x.arv),...polos.map(p=>nums(x.polo[p])),executed(x.exec),advance(x.arv,x.exec)])):'';
  $('cycleSets').innerHTML=m?'<h4>Por conjunto · detalhe C'+k+'</h4>'+table(['Conjunto','Polo','Postes','Pontos de poda','T1','T2','T3','OS aberta','Atraso','Executado'],
   Object.entries(m.conj).sort((a,b)=>b[1].arv-a[1].arv).map(([name,x])=>[name,x.polo,...['postes','arv','T1','T2','T3','pend','atras','exec'].map(v=>v==='exec'?executed(x.exec):nums(x[v]))])):'';
  const distribution=new Map(),rhythm=new Map();
  for(const row of source?.postes||[]){
   if(!row.fg)continue;
   distribution.set(row.calc.S,(distribution.get(row.calc.S)||0)+1);
   if(row.calc.W)rhythm.set(row.calc.W,(rhythm.get(row.calc.W)||0)+1);
  }
  const bars=(group,colors)=>{
   const max=Math.max(1,...group.values());
   return [...group].sort((a,b)=>b[1]-a[1]).map(([label,n])=>'<div class="cycle-balance"><span>'+esc(label)+'</span><i style="--length:'+100*n/max+'%;--bar:'+(colors[label]||'#3482aa')+'"></i><b>'+nums(n)+'</b></div>').join('')||'<p class="small">Sem registros nos filtros.</p>';
  };
  $('cycleBreakdown').innerHTML=m?'<h4>Situação dos postes</h4>'+bars(distribution,statusColors)+'<h4>Ritmo de retorno</h4>'+bars(rhythm,{}):'';
 }
 summary.onclick=e=>{if(e.target.closest('[data-cycle-settings]'))$('cycleSettings').showModal();};
 const columns=[
  ['id','ID',r=>r.id],['kind','Serviço',r=>CarteiraTerritorial.types[r.asset]||labels[r.kind]],['post','Poste',r=>r.posteGIS||r.id],
  ['feeder','Alimentador',r=>r.alim],['set','Conjunto',r=>r.conj],['setCode','Código do conjunto',r=>r.conjCode],['setStatus','Auditoria territorial',r=>geoLabels[r.conjStatus]||r.conjStatus],['setMethod','Vínculo do conjunto',r=>r.conjMethod],['hub','Polo',r=>r.polo],['segment','Trecho',r=>r.trecho],['zone','Perímetro',r=>r.perim],
  ['key','Chave',r=>r.chave],['type','Tipo da OS',r=>r.tipo],['status','Status SGM',r=>r.statusSGM||r.status],['osId','OS aberta',r=>r.orderId],['situation','Situação',r=>r.groupStatus],
  ['created','Última criação',r=>r.criacao,CP.fmt],['executed','Última execução',r=>r.execucao,CP.fmt],
  ['months','Ciclo (meses)',r=>r.calc?.J],['basis','Origem do ciclo',r=>r.calc?.origem],['last','Ciclo da última poda',r=>r.calc?.cicloUlt],
  ['next','Próxima poda',r=>r.calc?.P,CP.fmt],['forecast','Previsão por ciclo',r=>selected('cycle').length===1?CP.fmt(r.calc?.prev[Number(fields.cycle.value)-1]):(selected('cycle').length?selected('cycle').map(Number):windows.map(w=>w.k)).map(k=>CP.isNum(r.calc?.prev[k-1])?'C'+k+' '+CP.fmt(r.calc.prev[k-1]):'').filter(Boolean).join(' · ')],['rhythm','Ritmo',r=>r.calc?.W],
  ['qty','Pontos de poda',r=>r.arv],['range','Qtd. faixa',r=>r.faixa],['team','Equipe',r=>r.equipe],['ss','SS no parque',r=>r.ss],
  ['ssOpen','SS aberta sem OS',r=>r.ssWithoutOS],['os','OS no parque',r=>r.os],['species','Espécie',r=>r.esp||r.espVera]
 ];
 const treeKeys=new Set(['id','post','species','feeder','set','setCode','setStatus','setMethod','hub','segment','zone','key','situation']);
 const structureKeys=new Set(['id','kind','post','feeder','set','setCode','setStatus','setMethod','hub','segment','zone','key','type','status','osId','created','team']);
 const tableColumns=()=>{
  const mode=$('cycleLedgerView').value;
  return mode==='arvores'?columns.filter(([key])=>treeKeys.has(key)):mode==='estruturas'?columns.filter(([key])=>structureKeys.has(key)):columns;
 };
 function rowValues(row){return tableColumns().map(([, ,read,format])=>format?format(read(row)):read(row));}
 function refreshLedger(){
  const view=$('cycleLedgerView').value,trees=view==='arvores';
  const list=allRows.filter(r=>r.kind==='estrutura'?view==='estruturas':view==='arvores'?r.kind==='arvore':view==='postes');
  const [, ,value]=tableColumns().find(([key])=>key===sorting.column)||tableColumns()[0];
  const direction=sorting.ascending?1:-1;
  ledgerRows=list.sort((a,b)=>{
   const v=value(a),w=value(b);
   if(v==null||v==='')return w==null||w===''?0:1;
   if(w==null||w==='')return -1;
   return direction*(typeof v==='number'&&typeof w==='number'?v-w:collator.compare(String(v),String(w)));
  });
  $('cycleLedgerCount').textContent=nums(ledgerRows.length)+(trees?' árvores no recorte':view==='estruturas'?' estruturas no recorte':' postes e serviços no recorte');
  paintRows();
 }
 function paintRows(){
  const total=Math.max(1,Math.ceil(ledgerRows.length/pageSize));page=Math.max(0,Math.min(page,total-1));
  const start=page*pageSize, rows=ledgerRows.slice(start,start+pageSize);
  $('cycleRows').innerHTML=rows.length?'<div class="cycle-table"><table><thead><tr><th scope="col">Mapa</th>'+
   tableColumns().map(([key,label])=>'<th scope="col"'+(sorting.column===key?' aria-sort="'+(sorting.ascending?'ascending':'descending')+'"':'')+'><button type="button" data-cycle-sort="'+key+'">'+esc(label)+(sorting.column===key?(sorting.ascending?' ↑':' ↓'):'')+'</button></th>').join('')+
   '</tr></thead><tbody>'+rows.map((row,i)=>{
    const locate=row.point?'<button type="button" data-cycle-map="'+(start+i)+'" aria-label="Ver '+esc(row.id)+' no mapa">Localizar</button>':'';
    const ext=row.point?'<a target="_blank" rel="noopener noreferrer" href="https://maps.google.com/?q='+row.point.join(',')+'">Google Maps</a>':'';
    return '<tr><td>'+locate+ext+'</td>'+rowValues(row).map((v,n)=>n===0?'<td><button type="button" class="link-button" data-cycle-row="'+(start+i)+'">'+esc(v)+'</button></td>':'<td>'+esc(v==null||v===''?'—':v)+'</td>').join('')+'</tr>';
   }).join('')+'</tbody></table></div>':'<p>Nenhum registro neste recorte.</p>';
  $('cyclePage').textContent='Página '+(page+1)+' de '+total+' · '+nums(ledgerRows.length)+' registros';
  $('cyclePrev').disabled=!page;$('cycleNext').disabled=page>=total-1;
 }
 function details(row){
  const box=document.createElement('div');box.className='cycle-popup';
  const title=document.createElement('strong');title.textContent=labels[row.kind]+' · '+row.id;box.append(title);
  const rows=row.kind==='arvore'?[
   ['Espécie',row.esp],['Situação',row.groupStatus],['Prazo no Excel',row.prazo],['Necessita poda',row.poda],['Local da árvore',({publico:'Público',privado:'Privado'})[row.site]],
   ['Poste',row.posteGIS],['Altura (m)',row.altura],['DAP (cm)',row.dap],['Risco',row.classe],['Ação',row.acao],['Motivo',row.motivo],['Levantamento',CP.fmt(row.dataLev)]
  ]:[['Situação',row.groupStatus],['Última OS',row.tipo],['Status SGM',row.statusSGM||row.status],['OS aberta',row.orderId],['Criação',CP.fmt(row.criacao)],['Última execução',CP.fmt(row.execucao)],
   ['Próximo retorno',CP.fmt(row.calc?.P)],['Retorno seguinte',CP.fmt(row.calc?.U)],['Ciclo',row.calc?row.calc.J+' meses · '+row.calc.origem:''],
   ['Previsões',row.calc?.prev.slice(0,params.count).map((value,i)=>value==null?'':'C'+(i+1)+' '+CP.fmt(value)).filter(Boolean).join(' · ')],
   ['Pontos de poda',row.arv],['Quantidade de faixa',row.faixa],['Equipe',row.equipe],['Árvores VERA',row.idsVera],['Espécies VERA',row.espVera]];
  if(row.ss)rows.push(['SS de poda no poste',row.ss],['SS abertas',row.ssOpen],['SS abertas sem OS',row.ssWithoutOS]);
  if(row.os)rows.push(['OS de poda no parque',row.os]);
  rows.unshift(['Conjunto',row.conj],['Vínculo do conjunto',row.conjMethod],['Alimentador',row.alim],['Trecho',row.trecho],['Chave',row.chave]);
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
  const grouped=onScreen.length>800||$('cycleClusters').checked&&map.getZoom()<=13;
  if(grouped){
   const grid=new Map();
   for(const row of onScreen){
    const {x,y}=map.latLngToContainerPoint(row.point), key=[row.asset||row.kind,Math.floor(x/53),Math.floor(y/53)].join('|');
    const entry=grid.get(key)||{kind:row.kind,asset:row.asset,points:[]};entry.points.push(row.point);grid.set(key,entry);
   }
   for(const {kind,asset,points} of grid.values()){
    const b=L.latLngBounds(points),summary=nums(points.length);
    const symbol=L.divIcon({className:'cycle-marker cycle-cluster',html:(asset?GestaoTerritorial.icon(asset):icon(kind))+'<span>'+summary+'</span>',iconSize:[32,32],iconAnchor:[16,16]});
    L.marker(b.getCenter(),{icon:symbol,pane:'cycleMarkers',title:labels[kind]+' · '+summary,bubblingMouseEvents:false}).on('click',()=>map.fitBounds(b,{padding:[48,48],maxZoom:Math.min(20,Math.max(16,map.getZoom()+2))})).addTo(markers);
   }
  }else{
   const icons=new Map();
   for(const row of onScreen){
    const key=(row.asset||row.kind)+row.groupStatus;
    if(!icons.has(key))icons.set(key,L.divIcon({className:'cycle-marker',html:row.asset?GestaoTerritorial.icon(row.asset):icon(row.kind,statusColors[row.groupStatus]),iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]}));
    const marker=L.marker(row.point,{icon:icons.get(key),title:labels[row.kind]+' '+row.id,pane:'cycleMarkers',bubblingMouseEvents:false}).bindPopup(()=>row.kind==='estrutura'?territorial.structurePopup(row):details(row),{maxWidth:380}).addTo(markers);
    markerByRow.set(row,marker);
    if($('cycleLinks').checked&&row.post?.point)L.polyline([row.point,row.post.point],{pane:'cycleLinks',color:'#8258ae',dashArray:'4 5',weight:1.5,interactive:false}).addTo(links);
   }
  }
  $('cycleMapStatus').textContent=nums(onScreen.length)+' serviços e árvores na área visível'+(grouped?' · aproxime para abrir pontos individuais':'')+'.';
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
  territorial.attach(leaflet,ring=>{area=ring;window.CampoSpatialArea=ring;Central.setSpatialArea(ring);window.dispatchEvent(new Event('campo-spatial-area'));update(false);});
  if(active())paintMap();
 }
 function activateSource(data,local=false){
  const loaded=CP.source(data);
  if(data.territorial)territorial.supplement(data.territorial);
  source=loaded;localSource=local;params=defaults();updateParameters();recalc();
  $('cycleSource').textContent=[local?'Arquivo local':source.source.local,source.source.modificado?'Salvo em '+source.source.modificado:'',
   nums(source.postes.length)+' registros de poste',nums(source.execs.length)+' execuções SGM'].filter(Boolean).join(' · ');
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
    revision=meta.revision||'';
    if(localSource)return;
    if(!revision){if(!source){$('cycleSource').textContent='Carregando o Parque de Poda e o SGM…';recalc();}return;}
    if(!force&&source?.revision===revision)return;
    $('cycleSource').textContent='Carregando a base de ciclo…';
    const response=await fetch(endpoint,{cache:'no-store',signal});
    if(!response.ok)throw Error((await response.json()).error);
    const stream=response.body.pipeThrough(new DecompressionStream('gzip'));
    const data=await new Response(stream).json();
    if(!active()||token!==epoch)return;
    if(localSource)return;
    activateSource(data);revision=response.headers.get('X-Cycle-Revision')||revision;source.revision=revision;
   }catch(error){if(token===epoch&&error.name!=='AbortError')$('cycleRefreshStatus').textContent=error.message;}
   finally{if(token===epoch){loading=null;request=null;}}
  })();
  return loading;
 }
 async function loadStructures(){
  if(!active()||structureRequest)return;
  const token=epoch;
  structureRequest=(async()=>{
   try{
    const meta=await window.CampoControl.api('/api/central/meta');
    if(token!==epoch||!active())return;
    if(!meta.manifest?.parque_postes){$('cycleSSStatus').textContent='Parque de Poda com vínculos de SS indisponível.';if(!source)$('cycleSource').textContent='Carregue o Excel em Parâmetros e diretórios para ver as previsões.';return;}
    if(structureGeneration&&meta.generation===structureGeneration)return;
    const [rows,orders,metadata,keys,geography,postesGis]=await Promise.all([
     Central.rowsFromGeneration(meta,'parque_postes'),
     meta.manifest.os_abertas?Central.rowsFromGeneration(meta,'os_abertas'):[],
     meta.manifest.resumo?Central.dataFromGeneration(meta,'resumo'):{},
     meta.manifest.chaves?Central.rowsFromGeneration(meta,'chaves').catch(()=>[]):[],
     meta.manifest.conjuntos_geo?Central.dataFromGeneration(meta,'conjuntos_geo'):null,
     meta.manifest.postes_gis?Central.dataFromGeneration(meta,'postes_gis'):null
    ]);
    if(token!==epoch||!active())return;
    conjuntos=metadata.conjuntos||{};
    registry=Central.configurePoleRegistry(postesGis);
    if(geography){preparePolygons(geography);Central.configureGeography(geography);}else if(polygonSource?.source?.sha256){polygonSource=null;polygonIndex=null;$('cycleGeoStatus').textContent='A geração central atual não contém os polígonos oficiais.';}
    references=CycleConjuntos.indexReferences(keys,conjuntos);
    if(polygonSource&&!geography)try{preparePolygons(polygonSource);}catch(error){$('cycleGeoStatus').textContent=error.message;}
    structures=CP.structureSources(rows,orders);structureGeneration=meta.generation;
    const ss=[...structures.values()].filter(row=>row.ss);
    $('cycleSSStatus').textContent=nums(ss.length)+' postes vinculados a SS de poda · '+nums(ss.filter(row=>row.ssWithoutOS).length)+' com SS aberta sem OS.';
    if(!source||source.estimated){
     source=CP.centralPlan(structures,conjuntos,metadata.corteOs||meta.updatedAt);
     params=params||defaults();updateParameters();
     $('cycleSource').textContent='Parque de Poda / SGM · previsão estimada '+(metadata.corteOs?'· corte do SGM em '+metadata.corteOs.split(' ')[0].split('-').reverse().join('/'):'');
    }
    recalc();
    void territorial.load(meta,{summary:metadata,orders,keys}).then(()=>{if(token===epoch&&active()){populate();render();}});
   }catch(e){if(token===epoch)$('cycleSSStatus').textContent='Parque de Poda: '+e.message;}
   finally{if(token===epoch)structureRequest=null;}
  })();
  return structureRequest;
 }
 const geoLabels={classificado:'Classificados',fora_cobertura:'Fora dos conjuntos',divisa_ambigua:'Divisa ou sobreposição ambígua',sem_coordenada:'Sem coordenada',coordenada_invalida:'Coordenada inválida',poste_ambiguo:'Poste com posições divergentes',fora_acre:'Fora do Acre sem poste verificável',poste_fora_acre:'Poste GIS fora do Acre',poligonos_indisponiveis:'Polígonos indisponíveis'};
 function geographyRows(){return [...effectivePosts,...treeRows,...territorial.structures()];}
 function updateCoverage(){
  const rows=geographyRows(),audit=CycleConjuntos.audit(rows);
  const positions=rows.filter(row=>row.locationStatus==='corrigido_gis'||row.locationStatus==='localizado_gis').length;
  const pending=Object.entries(audit.statuses).filter(([status])=>status!=='classificado').map(([status,count])=>nums(count)+' '+(geoLabels[status]||status).toLocaleLowerCase('pt-BR'));
  $('cycleGeoCoverage').textContent=[nums(audit.classified)+' de '+nums(audit.total)+' registros com conjunto espacial',
   registry?nums(positions)+' posições atualizadas pelo ID do poste':'Base GIS de postes indisponível',
   ...pending,audit.conflicts?nums(audit.conflicts)+' divergências do conjunto original':''].filter(Boolean).join(' · ');
 }
 function exportGeographyAudit(){
  const head=['Tipo','ID','OS','Poste','Status do conjunto','Código oficial','Nome oficial','Conjunto original','Divergência','Status da coordenada','Método','Latitude original','Longitude original','Latitude GIS','Longitude GIS','Latitude no mapa','Longitude no mapa','Diferença até o poste (m)','Camada de postes','Candidatos','SHA256 da fonte'];
  const lines=geographyRows().map(row=>[row.kind,row.id,row.orderId||row.os,row.posteGIS||row.poste||(row.kind==='arvore'||row.kind==='estrutura'?'':row.id),
   row.conjStatus,row.conjCode,row.conjName,row.conjOriginal,row.conjConflict?'Sim':'Não',geoLabels[row.locationStatus]||row.locationStatus,row.locationMethod,
   row.originalPoint?.[0],row.originalPoint?.[1],row.polePoint?.[0],row.polePoint?.[1],row.point?.[0],row.point?.[1],row.poleDistanceM?.toFixed(1),row.locationSource?.layer,
   (row.conjCandidates||[]).map(item=>item.code+' '+item.name).join(' | '),row.conjSource?.sha256]);
  const csv=[head,...lines].map(row=>row.map(value=>'"'+String(value??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
  const link=document.createElement('a');link.href=URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'}));link.download='auditoria-conjuntos.csv';link.click();URL.revokeObjectURL(link.href);
 }
 const auditButton=document.createElement('button');auditButton.type='button';auditButton.textContent='Exportar auditoria territorial';auditButton.onclick=exportGeographyAudit;$('cycleGeoCoverage').after(auditButton);
 function accessPolygonCache(value){
  return new Promise((resolve,reject)=>{
   const open=indexedDB.open('campo-ciclo-conjuntos',1);
   open.onupgradeneeded=()=>open.result.createObjectStore('layers');
   open.onerror=()=>reject(open.error);open.onblocked=()=>reject(Error('Armazenamento local ocupado.'));
   open.onsuccess=()=>{
    const db=open.result,tx=db.transaction('layers',value?'readwrite':'readonly');
    const store=tx.objectStore('layers'),request=value?store.put(value,'primary'):store.get('primary');
    tx.oncomplete=()=>{db.close();resolve(request.result);};
    tx.onabort=()=>{db.close();reject(tx.error);};
   };
  });
 }
 function preparePolygons(data){
  const official=data.targetCRS==='EPSG:4326';
  if(data.targetCRS&&!official)throw Error('A referência dos polígonos deve ser EPSG:4326.');
  if(official)conjuntos={...conjuntos,...Object.fromEntries(data.features.map(f=>[String(f.properties.codigo),f.properties.nome]))};
  const index=CycleConjuntos.spatial(data.features,official?'codigo':'name',conjuntos,data.source||{fileName:data.file});
  polygonSource=data;polygonIndex=index;
  $('cycleGeoStatus').textContent=(data.source?.fileName||data.file||'Base central de conjuntos')+' · '+nums(index.names)+' conjuntos · '+nums(index.polygons)+' polígonos'+
   (official?' · importação central em WGS84':' · importação local')+(index.skipped||data.skipped?' · '+nums(index.skipped+(data.skipped||0))+' feições sem uso':'')+'.';
 }
 function refreshGeography(){collectPosts();takeTrees();populate();render();}
 async function restorePolygons(){
  if(geoRestored)return;
  geoRestored=true;const token=epoch;
  try{
   const saved=await accessPolygonCache();
   if(!saved||epoch!==token||!active()||polygonSource)return;
   // Numeric fields need the official code/name dictionary before being resolved.
   polygonSource=saved;
   if(!Object.keys(conjuntos).length&&saved.features.every(f=>/^\d+$/.test(f.properties.name)))return;
   preparePolygons(saved);refreshGeography();
  }catch(error){if(token===epoch&&polygonSource)$('cycleGeoStatus').textContent=error.message;}
 }
 function chooseGeoColumn(){
  const layer=geoLayers[Number($('cycleGeoLayer').value)],field=$('cycleGeoColumn');
  if(!layer)return;
  const preferred=layer.columns.find(name=>/^(?:NOMECONJUNTO|NOMECONJ|NOMCONJ|CONJUNTONOME|CONJUNTONOMECLATURA|NOME|NAME|CONJUNTO)$/.test(CP.norm(name).replace(/[^A-Z0-9]/g,'')))||
    layer.columns.find(name=>/^(?:CODCONJ|CODIGOCONJUNTO|CODID|CODCONJUNTO|CONJ)$/.test(CP.norm(name).replace(/[^A-Z0-9]/g,'')));
  field.innerHTML=options([['','Selecione o campo'],...layer.columns.map(name=>[name,name])]);
  field.value=preferred||'';
  $('cycleGeoApply').disabled=!field.value;
 }
 $('cycleGeoLayer').onchange=chooseGeoColumn;
 $('cycleGeoColumn').onchange=event=>{$('cycleGeoApply').disabled=!event.target.value;};
 $('cycleGeoFile').onchange=async event=>{
  const file=event.target.files[0],note=$('cycleGeoStatus'),token=epoch;
  $('cycleGeoApply').disabled=true;geoWorker?.terminate();geoWorker=null;geoLayers=[];
  for(const id of ['cycleGeoLayer','cycleGeoColumn'])$(id).closest('label').hidden=true;
  if(!file)return;
  note.textContent='Lendo camadas do GeoPackage…';
  try{
   if(!/\.gpkg$/i.test(file.name)||!file.size||file.size>128*1024*1024)throw Error('Selecione um GeoPackage de polígonos com até 128 MB.');
   const buffer=await file.arrayBuffer();
   if(token!==epoch||event.target.files[0]!==file)return;
   const worker=new Worker('gpkg-worker.js');geoWorker=worker;
   worker.onerror=()=>{if(geoWorker===worker){worker.terminate();geoWorker=null;for(const id of ['cycleGeoFile','cycleGeoLayer','cycleGeoColumn'])$(id).disabled=false;note.textContent='Falha ao abrir GeoPackage neste navegador.';}};
   worker.onmessage=async({data})=>{
    if(geoWorker!==worker||token!==epoch)return;
    try{
     if(data.action==='error')throw Error(data.message);
     if(data.action==='inspect'){
      geoLayers=data.layers.filter(layer=>/POLYGON|^GEOMETRY$/i.test(layer.geometry_type_name)&&layer.count>0);
      if(!geoLayers.length)throw Error('Nenhuma camada de polígonos encontrada.');
      const layer=$('cycleGeoLayer');
      layer.innerHTML=options(geoLayers.map((item,i)=>[i,item.table_name]));
      layer.value=String(Math.max(0,geoLayers.findIndex(item=>CP.norm(item.table_name).includes('CONJUNTO'))));
      layer.closest('label').hidden=false;$('cycleGeoColumn').closest('label').hidden=false;
      chooseGeoColumn();note.textContent='Confira a camada e o campo de identificação.';
     }
     if(data.action==='import'){
      const field=$('cycleGeoColumn').value;
      const saved={file:file.name,skipped:data.skipped||0,features:data.collection.features.map(feature=>({
       geometry:feature.geometry,properties:{name:String(feature.properties?.[field]??'').trim()}}))};
      preparePolygons(saved);refreshGeography();
      try{await accessPolygonCache(saved);}catch{if(token===epoch)note.textContent+=' Carga preservada até fechar a página.';}
      worker.terminate();geoWorker=null;event.target.value='';
      for(const id of ['cycleGeoLayer','cycleGeoColumn'])$(id).closest('label').hidden=true;
     }
    }catch(error){if(token===epoch)note.textContent=error.message;}
    finally{if(token===epoch){$('cycleGeoFile').disabled=false;$('cycleGeoLayer').disabled=false;$('cycleGeoColumn').disabled=false;$('cycleGeoApply').disabled=!geoWorker||!$('cycleGeoColumn').value;}}
   };
   worker.postMessage({action:'inspect',buffer},[buffer]);
  }catch(error){if(token===epoch)note.textContent=error.message;}
 };
 $('cycleGeoForm').onsubmit=event=>{
  event.preventDefault();
  const layer=geoLayers[Number($('cycleGeoLayer').value)];
  if(!geoWorker||!layer||!$('cycleGeoColumn').value)return;
  for(const id of ['cycleGeoFile','cycleGeoLayer','cycleGeoColumn','cycleGeoApply'])$(id).disabled=true;
  $('cycleGeoStatus').textContent='Cruzando a posição das árvores e dos postes com os polígonos…';
  geoWorker.postMessage({action:'import',layers:[layer]});
 };
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
  publishing=true;const buttons=[...event.currentTarget.querySelectorAll('[type=submit]')];
  for(const submit of buttons)submit.disabled=true;
  const at=epoch,note=$('cycleUploadStatus'),local=button.value==='local';
  try{
   const data=await readFile(file);
   if(at!==epoch||!active())return;
   if(local){
    activateSource(data,true);$('cycleSettings').close();
    $('cycleRefreshStatus').textContent='Arquivo carregado neste navegador.';return;
   }
   const candidate=CP.source(data);
   if(!confirm('Publicar '+nums(candidate.postes.length)+' registros de postes, '+nums(candidate.arvores.length)+' referências de árvore no Excel e '+nums(candidate.execs.length)+' execuções de poda para a gestão?')){note.textContent='Arquivo validado. Publicação cancelada.';return;}
   note.textContent='Publicando a base recalculável…';
   const payload=!data.territorial&&territorial.getSupplement()?{...data,territorial:territorial.getSupplement()}:data;
   const stream=new Blob([JSON.stringify(payload)]).stream().pipeThrough(new CompressionStream('gzip'));
   const archive=await new Response(stream).blob();
   const response=await fetch(endpoint+'?base='+encodeURIComponent(revision),{method:'POST',headers:{'Content-Type':'application/gzip'},
    body:archive,signal:AbortSignal.timeout(90000)});
   const result=await response.json();
   if(!response.ok)throw Error(result.error);
   note.textContent='Base publicada para a gestão.';localSource=false;
   $('cycleFile').value='';await load(true);
  }catch(error){if(at===epoch)note.textContent=error.message;}
  finally{publishing=false;for(const submit of buttons)submit.disabled=false;}
 };
 parameterForm.onsubmit=event=>{
  event.preventDefault();if(!source)return;
  const values=Object.fromEntries(new FormData(parameterForm));
  params={...source.par,inicio:serial(values.inicio),janela:Number(values.janela),padrao:Number(values.padrao),faixa:Number(values.faixa),count:Number(values.count),today:serial(values.today)};
  page=0;recalc();
 };
 parameterForm.onreset=event=>{event.preventDefault();if(source){params=defaults();updateParameters();recalc();}};
 const update=(autoFit=true)=>{page=0;needsFit=autoFit;$('cycleDetail').replaceChildren();render();};
 filters.onchange=event=>{if(event.target===fields.cycle&&source)plannedOnly.checked=true;if(event.target!==conjSearch)update();};filters.onsubmit=event=>event.preventDefault();
 filters.onreset=event=>{
  event.preventDefault();
  for(const control of Object.values(multi))control.set([],[]);
  selectedConj.clear();for(const input of $('cycleConjOptions').querySelectorAll('input'))input.checked=false;
  conjSearch.value='';searchConj();paintConjSummary();fields.query.value='';plannedOnly.checked=Boolean(source);
  territorial.clearArea();populate();recalc();
 };
 fields.query.oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(()=>update(),220);};
 $('cycleMapTools').onchange=event=>{if(event.target.matches('[data-cycle-layer],#cycleLinks,#cycleClusters'))render();};
 $('cycleFit').onclick=fit;
 $('cycleReload').onclick=()=>{void load(true);void loadStructures();void window.CampoParque?.refresh();};
 $('cyclePrev').onclick=()=>{page--;paintRows();};$('cycleNext').onclick=()=>{page++;paintRows();};
 $('cycleLedgerView').onchange=()=>{page=0;sorting=$('cycleLedgerView').value==='arvores'?{column:'id',ascending:true}:{column:'created',ascending:false};$('cycleDetail').replaceChildren();refreshLedger();};
 $('cycleRows').onclick=event=>{
  const sort=event.target.closest('[data-cycle-sort]');
  if(sort){const key=sort.dataset.cycleSort;sorting={column:key,ascending:sorting.column===key?!sorting.ascending:!['created','executed'].includes(key)};page=0;refreshLedger();return;}
  const target=event.target.closest('[data-cycle-row],[data-cycle-map]');if(!target)return;
  const row=ledgerRows[Number(target.dataset.cycleRow??target.dataset.cycleMap)];if(!row)return;
  $('cycleDetail').replaceChildren(row.kind==='estrutura'?territorial.structurePopup(row):details(row));
  if(map&&row.point&&target.dataset.cycleMap!==undefined){
   const layer=tools.querySelector('[data-cycle-layer="'+row.kind+'"]');
   if(!layer.checked){layer.checked=true;visible=allRows.filter(r=>tools.querySelector('[data-cycle-layer="'+r.kind+'"]').checked);}
   $('mapFrame').scrollIntoView({block:'center'});
   map.invalidateSize();map.setView(row.point,19);paintMap();
   const marker=markerByRow.get(row);
   if(marker)marker.openPopup();else L.popup({maxWidth:380}).setLatLng(row.point).setContent(row.kind==='estrutura'?territorial.structurePopup(row):details(row)).openOn(map);
  }
 };
 $('cycleCsv').onclick=()=>{
  const quote=value=>{const text=String(value??'');return '"'+(/^[=+@\t\r-]/.test(text)&&!Number.isFinite(Number(text))?"'":'')+text.replace(/"/g,'""')+'"';};
  const archive=new Blob(['\ufeff'+[tableColumns().map(([,label])=>label),...ledgerRows.map(rowValues)].map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(archive),link=document.createElement('a');link.href=url;link.download='plano_ciclo_poda.csv';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 };
 function visibility(){
  const on=Boolean(active()), entering=on&&!lastHash;lastHash=on;
  document.body.classList.toggle('cycle-on',on);territorial.visible(on);section.hidden=ledger.hidden=summary.hidden=tools.hidden=!on;
  window.CampoControlMap?.cycleMode(on);
  if(entering){
   if(location.hash==='#c-carteira-territorial')plannedOnly.checked=false;
   needsFit=true;paintMap();void restorePolygons();void load();void loadStructures();void window.CampoParque?.refresh();
  }
  if(!on){if($('cycleSettings').open)$('cycleSettings').close();markers?.clearLayers();links?.clearLayers();}else if(!entering){paintMap();}
 }
 window.CampoCycle={attach,active,visibility,audit:()=>CycleConjuntos.audit(geographyRows()),drawing:()=>territorial.drawing(),stop(){
  territorial.stop();area=null;window.CampoSpatialArea=null;Central.setSpatialArea(null);window.dispatchEvent(new Event('campo-spatial-area'));registry=null;Central.configurePoleRegistry(null);cycleInitialized=false;
  epoch++;geoWorker?.terminate();geoWorker=null;geoRestored=false;geoLayers=[];polygonSource=null;polygonIndex=null;references=null;structures=new Map();conjuntos={};effectivePosts=[];selectedConj.clear();paintConjSummary();structureGeneration='';structureRequest=null;request?.abort();request=null;loading=null;source=null;localSource=false;revision='';params=null;windows=[];allRows=[];ledgerRows=[];visible=[];plannedOnly.disabled=true;fields.cycle.replaceChildren();treeRows=[];stats=[];lastHash=false;
  for(const id of ['cycleSource','cycleRefreshStatus','cycleSSStatus','cycleGeoCoverage','cycleUploadStatus','cycleCheck','cycleGrowth','cycleDetail','cycleRows','cycleMetrics','cycleMonthly','cycleSets','cycleWindows','cycleBreakdown','cycleLedgerCount','cyclePage','cycleFilterCount'])$(id).replaceChildren();
  $('cycleFile').value='';$('cycleGeoFile').value='';$('cycleGeoApply').disabled=true;
  for(const id of ['cycleGeoLayer','cycleGeoColumn']){$(id).disabled=false;$(id).closest('label').hidden=true;}
  $('cycleGeoFile').disabled=false;
  visibility();
 }};
 addEventListener('campo-unified-data',()=>{if(active()){takeTrees();populate();render();}});
 visibility();
})();
