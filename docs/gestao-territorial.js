'use strict';

const GestaoTerritorial = (() => {
 const T=CarteiraTerritorial, $=id=>document.getElementById(id), esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}), fmtMoney=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
 const num=value=>value==null?'—':fmt.format(value), money=value=>value==null?'—':fmtMoney.format(value);
 const poTypes={upa:'UPA',emergencia:'Pronto-socorro',hospital:'Hospital',ambiental:'Autarquia ambiental',
  transito:'Autarquia de trânsito',infra:'Autarquia de infraestrutura',servico:'Serviço essencial',governo:'Órgão público'};
 const glyphs={
  cruzeta:['#6f5447','M6 11h20M16 6v20M10 11l6 8 6-8M9 8v6m14-6v6'],
  isolador:['#47677a','M16 5v22m-5-17h10m-13 5h16M9 20h14m-12 5h10'],
  quente:['#c24932','M13 6v12a5 5 0 1 0 6 0V6a3 3 0 0 0-6 0Zm3 7v8m6-9h4m-4 4h3'],
  poste:['#785c44','M15 6h3l2 21h-7L15 6Zm-6 5h15m-13 0v4m11-4v4'],
  condutor:['#365e9d','M5 10c7 0 6 6 11 6s4-6 11-6M5 17c7 0 6 6 11 6s4-6 11-6'],
  chave:['#635094','M6 23h8m4 0h8m-13-1 8-13m-2-1h5'],
  trafo:['#5b6390','M9 12h14v11H9zm3-5v5m8-5v5m-7 7 3-4 2 2-3 4'],
  estrutura:['#5c6370','M19 7a6 6 0 0 0-7 8l-6 6 4 4 6-6a6 6 0 0 0 8-7l-4 4-4-4 3-5Z'],
  poda:['#2d794a','M16 24V15m0 5c-8 0-10-5-10-10 7 0 10 3 10 9m0-3c0-6 4-9 10-9 0 6-3 10-10 10'],
  faixa:['#927332','M5 23h22M7 22l4-12 5 12 5-14 4 14'],
  upa:['#bb3d65','M7 11h18v13H7zm7-4h4l2 4m-8 0 2-4m2 7v7m-4-3.5h8'],
  emergencia:['#b9343b','M4 17h5l4-8 5 14 4-8h6M8 8l-2-2m18 2 2-2'],
  hospital:['#b03a73','M8 25V7h16v18M6 25h20m-10-15v7m-3-3.5h6m-5 11V20h4v5'],
  ambiental:['#20826b','M25 7c0 13-6 17-15 14-3-9 2-14 15-14ZM7 25l13-13'],
  transito:['#365eab','M7 20V16l4-7h10l4 7v4H7Zm0-4h18M9 20v3m14-3v3m-12-5h1m8 0h1'],
  infra:['#9b6a28','M5 24h22M7 23v-6h18v6m-16-6 3-7h8l3 7m-7-7v7'],
  servico:['#1c7a9a','M17 5c1 4 7 8 7 13a8 8 0 1 1-16 0c0-5 6-9 9-13Zm-5 14a4 4 0 0 0 4 4'],
  governo:['#5a4a92','M5 25h22M7 12h18l-9-6-9 6Zm3 2v8m6-8v8m6-8v8']
 };
 function icon(kind) {
  const [color,path]=glyphs[kind]||glyphs.estrutura;
  return '<svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="14" fill="white" stroke="'+color+'" stroke-width="2.5"/><path d="'+path+'" fill="none" stroke="'+color+'" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>';
 }
 function options(pairs){return pairs.map(([id,label])=>'<option value="'+esc(id)+'">'+esc(label)+'</option>').join('');}
 function date(value){return CP.isNum(value)?CP.fmt(value):'—';}
 function crew(value){
  const txt=T.norm(value);
  if(/FLOREST|POD-LF|^IMP-(?:LF|.*FAIXA)|LIMPEZA DE FAIXA/.test(txt))return 'Florestcon/LF';
  if(/DEOP/.test(txt))return 'DEOP BT';
  if(/LINHA\s*VIVA|\bLV\b|POD-LV|^[A-Z]{3}-LV/.test(txt))return 'Linha viva';
  if(/LINHA\s*MORTA|\bLM\b|POD-LM|^[A-Z]{3}-LM/.test(txt))return 'Linha morta';
  return '';
 }
 const keyOf=value=>T.norm(value).replace(/\s+/g,' ');
 const asMap=(rows,key)=>new Map(rows.filter(row=>row[key]).map(row=>[keyOf(row[key]),row]));
 const datasets=['hierarchy','orders','dec','teams','trees','moPost'];
 function unpack(data){
  if(data?.schema!=='sigora-carteira-1')throw Error('Formato inválido para o complemento da carteira.');
  return {...data,...Object.fromEntries(datasets.map(name=>{
   const table=data.tables?.[name];
   if(!table)return [name,Array.isArray(data[name])?data[name]:[]];
   if(!Array.isArray(table.keys)||!Array.isArray(table.rows)||table.keys.length>100||table.rows.length>150000)throw Error('Tabela inválida: '+name);
   return [name,table.rows.map(row=>Object.fromEntries(table.keys.map((key,index)=>[key,table.dict?.[key]&&row[index]!=null?table.dict[key][row[index]]:row[index]])))];
  }))};
 }
 function point(lat,lon){return CP.location(T.number(lat),T.number(lon));}
 const facilityId=name=>T.norm(name).replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'');
 function facilityList(local){
  const result=new Map((typeof SigoraAcre==='undefined'?[]:SigoraAcre).map(org=>[org.id,org]));
  for(const org of local){
   const id=String(org.id||facilityId(org.nome));
   if(!id||!org.nome&&!result.has(id))continue;
   const original=result.get(id)||{};
   result.set(id,{...original,...org,id,point:point(org.lat,org.lon)||original.point||null});
  }
  return [...result.values()].sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 }
 function structuresFrom(orders,keys,meta){
  const rows=[], seen=new Set();
  for(const order of orders){
   const text=order.classe||order.serv||order.desc||order.tipo;
   if(order.expurgo||/INSPECAO/.test(T.norm(order.tipo))||/EXECUTADA|CANCELAD|INATIV/.test(T.norm(order.status)))continue;
   const asset=T.family(text);
   const assets=new Set([asset,...String(order.serv||'').split(/[|,]/).filter(Boolean).map(T.family).filter(x=>x!=='estrutura')]);
   if(asset==='poda'||asset==='faixa'||!order.os)continue;
   const id=String(order.interv||order.id||[order.os,order.poste,asset].join('|'));
   if(seen.has(id))continue;
   seen.add(id);
   const key=keys.get(T.norm(order.chave))||{};
   rows.push({...order,id,orderId:order.os,posteGIS:order.poste,asset,assets,kind:'estrutura',groupStatus:order.status||'OS aberta',
    tipo:order.desc||order.classe||order.tipo,point:point(order.lat,order.lon),criacao:CP.centralDate(order.criada),
    ...CP.territory({...order,polo:T.pole(order.polo||key.polo),alim:order.alim||key.alim,trecho:order.trecho||order.tr||key.trecho||key.tr,perim:order.per||key.per},meta.conjuntos||{},key)});
  }
  return rows;
 }
 function availability(teams,days,meta,overrides,selectedPools){
  const grouped=new Map(), latestByTeam=new Map(), cut=String(meta.corteOs||meta.hoje||'');
  const currentMonth=Number(cut.slice(5,7)), currentYear=Number(cut.slice(0,4));
  for(const row of teams) {
   const name=T.norm(row.eq),pool=[T.pole(row.polo),crew(name+' '+(row.tipo||'')+' '+(row.servico||'')+' '+(row.emp||''))].join('|');
   if(!name||pool.endsWith('|')||pool.startsWith('|')||/INATIV|DESMOBIL/.test(T.norm(row.status)))continue;
   if(row.ano&&currentYear&&Number(row.ano)!==currentYear)continue;
   if(!row.mes||T.number(row.diasOS)===null||currentMonth&&Number(row.mes)>=currentMonth)continue;
   let record=latestByTeam.get(name);
   if(!record){record={name,pool,months:new Map()};latestByTeam.set(name,record);}
   record.months.set(Number(row.mes),row);
  }
  for(const record of latestByTeam.values()){
   const months=[...record.months].sort((a,b)=>b[0]-a[0]).slice(0,3).map(([,row])=>row);
   const lastMonth=Math.max(...record.months.keys());
   if(currentMonth&&lastMonth<currentMonth-3)continue;
   const data=grouped.get(record.pool)||{hours:0,names:[],basis:'Histórico SGM · estimativa'};
   const present=months.reduce((a,row)=>a+Math.max(row.dias||0,row.diasOS||0),0);
   const producing=months.reduce((a,row)=>a+(row.diasOS||0),0);
   // Use realized crew-days spread across the complete calendar months in the sample.
   const sampleDays=months.reduce((a,row)=>a+weekdays(currentYear||2026,Number(row.mes)),0);
   if(sampleDays&&present&&producing){
    data.hours+=Math.min(1,producing/sampleDays)*8*days;
    data.names.push(record.name); grouped.set(record.pool,data);
   }
  }
  for(const pool of selectedPools)if(!grouped.has(pool))grouped.set(pool,{hours:null,names:[],basis:'Sem histórico recente'});
  for(const [pool,hours] of Object.entries(overrides))grouped.set(pool,{...grouped.get(pool),hours,basis:'Disponibilidade informada'});
  return grouped;
 }
 function weekdays(year,month){
  let workdays=0;
  for(let d=new Date(Date.UTC(year,month-1,1));d.getUTCMonth()===month-1;d.setUTCDate(d.getUTCDate()+1))if(d.getUTCDay()>0&&d.getUTCDay()<6)workdays++;
  return workdays;
 }
 function create({anchor,tools,getMap,update,plot,table,fitServices,classify}){
  const host=document.createElement('section');host.id='territorialPlan';host.className='panel territorial';host.hidden=true;
  host.innerHTML=`<div class="panel-head"><div><span class="eyebrow">SIGORA · Planejamento 2027</span><h3>Carteira territorial e rotas</h3><p id="terrDataStatus" class="small" role="status">Aguardando a base central.</p></div><button type="button" id="terrExport">Exportar carteira</button></div>
  <div id="terrCards" class="cycle-metrics"></div>
  <details class="terr-settings"><summary>Premissas, dados e capacidade</summary>
   <div class="terr-controls">
    <label>Base complementar de planejamento<input id="terrData" type="file" accept=".json,.gz"></label>
    <label>Cadastro de órgãos e vínculos elétricos<input id="terrOrgFile" type="file" accept=".geojson,.json"></label>
    <label>Dias úteis de operação em 2027<input id="terrDays" type="number" min="1" max="261" value="260"></label>
   </div><p id="terrImportStatus" class="small" role="status"></p><p class="small">A triagem de apoio em MT compara a distância documentada, a IT informada e a zona controlada da NR-10. A programação exige avaliação da equipe habilitada e do COI. <a href="https://www.gov.br/trabalho-e-emprego/pt-br/acesso-a-informacao/participacao-social/conselhos-e-orgaos-colegiados/comissao-tripartite-paritaria-permanente/normas-regulamentadora/normas-regulamentadoras-vigentes/norma-regulamentadora-no-10-nr-10" target="_blank" rel="noopener">Consultar a NR-10</a>.</p><p class="small">Use JSON ou JSON.GZ gerado a partir das bases Energisa. Para órgãos, importe GeoJSON de pontos com nome, tipo, município, poste e chave confirmada. A importação vale nesta sessão.</p>
   <div id="terrBudgets" class="terr-controls"></div><div id="terrCapacity"></div><div class="terr-actions"><button id="terrApply" type="button">Aplicar cenário</button><button id="terrReset" type="button">Restaurar premissas da base</button></div>
  </details>
  <div class="terr-controls">
   <label>Natureza / ativo<select id="terrAsset"></select></label>
   <label>Origem<select id="terrOrigin"></select></label>
   <label>Modalidade de execução<select id="terrMode"></select></label>
   <label>Triagem DEOP<select id="terrDeop"></select></label>
   <label>Decisão da carteira<select id="terrDecision"></select></label>
   <label class="terr-check"><input id="terrOnly" type="checkbox"> Aplicar filtros da carteira aos pontos do mapa</label>
  </div>
  <div class="terr-modes" id="terrModes" aria-label="Atalhos da carteira por modalidade"></div>
  <div id="terrCandidates"></div><div class="cycle-pages"><button id="terrPrev" type="button">Anterior</button><span id="terrPage"></span><button id="terrNext" type="button">Próxima</button></div>
  <div id="terrDetails" aria-live="polite"></div>
  <details class="terr-settings"><summary>Pacotes de desligamento por chave</summary><div id="terrOutages"></div></details>
  <details class="terr-settings"><summary>DEC projetado, metas e causas por conjunto</summary><div id="terrDec"></div></details>
  <details class="terr-settings"><summary>Órgãos essenciais e podas por chave</summary><div id="terrImpact"></div></details>
  <div class="terr-route" id="territorialRoutes"><div class="panel-head"><div><h4>Montar rota</h4><p class="small">O cálculo no mapa usa distância em linha reta. As instruções por vias públicas abrem no Google Maps.</p></div></div>
  <div class="terr-controls"><label>Paradas da sugestão<select id="terrRouteSource">${options([['publicos','Órgãos selecionados'],['selecionadas','Serviços selecionados em 2027'],['prioridade','Serviços priorizados no recorte']])}</select></label>
  <label>Máximo de paradas<input id="terrRouteLimit" type="number" min="2" max="60" value="20"></label></div>
  <div class="terr-actions"><button id="terrSuggest" type="button">Sugerir sequência</button><button id="terrSuggestRoad" type="button">Sugerir por ruas · órgãos públicos</button><button id="terrManual" type="button">Traçar rota no mapa</button><button id="terrClearRoute" type="button">Limpar rota</button><button id="terrKml" type="button" disabled>Exportar KML</button></div>
  <p id="terrRouteStatus" class="small" role="status"></p><ol id="terrStops"></ol><nav id="terrRoad" class="terr-actions" aria-label="Rota por vias"></nav></div>`;
  anchor.after(host);
  const mapTools=document.createElement('div');mapTools.className='terr-map-controls';
  mapTools.innerHTML=`<div class="terr-actions"><button id="terrDraw" type="button" aria-pressed="false">Desenhar área livre</button><button id="terrUndo" type="button" hidden>Desfazer vértice</button><button id="terrFinish" type="button" hidden>Concluir área</button><button id="terrClearArea" type="button" disabled>Limpar área</button><button id="terrRouteJump" type="button">Rotas</button></div>
  <div class="terr-controls"><label>Tipos de órgão<select id="terrOrgType"></select></label><label>Municípios dos órgãos<select id="terrOrgTown"></select></label><label>Órgãos no mapa<select id="terrOrgName"></select></label>
  <label>Ícones de estrutura<select id="terrMapAssets"></select></label><label class="terr-check"><input id="terrShowOrg" type="checkbox" checked> Mostrar órgãos</label></div>
  <span id="terrOrgStatus" class="small" role="status"></span>
  <span id="terrAreaStatus" class="small" role="status"></span>`;
  tools.append(mapTools);
  const filters={asset:[$('terrAsset'),'Natureza / ativo'],origin:[$('terrOrigin'),'Origem'],mode:[$('terrMode'),'Modalidade'],
   deop:[$('terrDeop'),'Apoio DEOP'],decision:[$('terrDecision'),'Decisão'],orgType:[$('terrOrgType'),'Tipo de órgão'],orgTown:[$('terrOrgTown'),'Município'],
   orgName:[$('terrOrgName'),'Órgão'],mapAssets:[$('terrMapAssets'),'Estrutura']};
  const multis=Object.fromEntries(Object.entries(filters).map(([key,[el,label]])=>[key,GestaoMulti.mount(el,label)]));
  const values=key=>GestaoMulti.selected(filters[key][0]);
  const passes=(key,value)=>{const selected=values(key);return !selected.length||selected.includes(value);};
  multis.asset.set(Object.entries(T.types));multis.mode.set(Object.entries(T.modes));
  multis.origin.set([['vera','Árvore VERA'],['campo','Árvore de campo'],['sgm','Poda ou faixa SGM'],['estrutura','Estrutura SGM']]);
  multis.decision.set([['selected','Selecionada'],['hold','Reserva'],['review','Revisão']]);
  multis.orgType.set(Object.entries(poTypes));multis.mapAssets.set(Object.entries(T.types).filter(([k])=>!['poda','faixa'].includes(k)));
  let source={}, imported={}, centralSupplement=null, orgInputs=[], orgs=facilityList([]), orgIndex=new Map(), keyIndex=new Map(), progIndex=new Map(), hierIndex=new Map(), treeIndex=new Map(), postIndex=new Map();
  let structureRows=[], days=260, budgetInput={}, crewInput={}, generation='', loadToken=0, monthly=new Map();
  let rows=[], result=null, display=[], live=false, activeArea=null, page=0;
  let map=null, mapArea,mapOrgs,mapRoute, onArea, drawMode='', vertices=[], currentRoute=null, routeCandidates=[], routing=null;
  const yearEnd=CP.DATE(2027,12,31);
  function merge(){
   const summary={...imported.summary,...source.summary};
   summary.corteOs=[imported.summary?.corteOs,source.summary?.corteOs].filter(Boolean).sort().at(-1);
   summary.conjuntos={...imported.summary?.conjuntos,...source.summary?.conjuntos};
   summary.recursos2027={...source.summary?.recursos2027,...imported.summary?.recursos2027};
   source.mergedSummary=summary;
   postIndex=asMap(imported.moPost||[],'id');
   treeIndex=asMap(imported.trees||[],'id');
   hierIndex=asMap(imported.hierarchy||[],'chave');
   keyIndex=new Map([...hierIndex,...asMap(source.keys||[],'chave')]);
   progIndex=asMap(source.program||[],'chave');
   const central=asMap(source.orders||[],'os'), dated=String(imported.summary?.corteOs||'')>String(source.summary?.corteOs||'');
   const seen=new Set(), orders=[];
   for(const order of imported.orders||[]){
    const key=keyOf(order.os), centralOrder=central.get(key);
    seen.add(key);
    if(!centralOrder){orders.push(order);continue;}
    const local=Object.fromEntries(Object.entries(order).filter(([,value])=>value!=null&&value!==''&&value!==false));
    orders.push(dated?{...centralOrder,...local,lv:Boolean(centralOrder.lv||local.lv)}:{...local,...centralOrder});
   }
   for(const [key,row] of central)if(!seen.has(key)&&!(dated&&imported.closedSet?.has(key)))orders.push(row);
   structureRows=structuresFrom(orders,keyIndex,summary);
   source.byOrder=asMap(orders,'os');
   const preferLocal=imported.dec?.length&&(!source.dec?.length||String(imported.summary?.corteDec||'')>String(source.summary?.corteDec||''));
   const reliability=preferLocal?{...summary,corteDec:imported.summary.corteDec,hoje:imported.summary.hoje||summary.hoje,conjDec:{}}:summary;
   monthly=T.decSummary(reliability,preferLocal?imported.dec:(source.dec||[]),2026);
   orgs=facilityList(orgInputs);
   orgIndex=T.impactIndex(orgs,hierIndex);
   updateOrgOptions();
   $('terrDataStatus').textContent=(summary.corteOs?'SGM até '+String(summary.corteOs).slice(0,10):'SGM · data de corte indisponível')+
    (reliability.corteDec?' · DEC até '+reliability.corteDec:' · DEC sem período de corte')+' · '+num(structureRows.length)+' estruturas'+(imported.hierarchy?.length?' · '+num(imported.hierarchy.length)+' chaves no complemento':'');
   paintOrgs();
  }
  async function load(meta,data){
   if(!meta?.manifest||generation===meta.generation)return;
   const token=++loadToken;
   const missing=[];
   const dataset=async name=>{
    if(!meta.manifest[name])return [];
    try{return await Central.rowsFromGeneration(meta,name);}
    catch{missing.push(name);return [];}
   };
   const [dec,teams,program]=await Promise.all(['dec_mes','equipes','cart_prog'].map(dataset));
   if(token!==loadToken)return;
   source={...data,dec,teams,program};generation=missing.length?'':meta.generation;
   merge();
   if(missing.length)$('terrDataStatus').textContent+=' · Consulta parcial: '+missing.join(', ');
  }
  function updateOrgOptions(){
   multis.orgName.set(orgs.map(row=>[row.id,row.nome]));
   multis.orgTown.set(GestaoMulti.pairs(orgs.map(row=>row.municipio)));
  }
  function orgRows(){return orgs.filter(org=>passes('orgType',org.tipo)&&passes('orgTown',org.municipio)&&passes('orgName',org.id));}
  function fitOrgs(){
   if(!live||!map)return;
   const filtered=['orgType','orgTown','orgName'].some(key=>values(key).length);
   const status=$('terrOrgStatus');
   if(!filtered){status.textContent='';fitServices?.();return;}
   const selected=orgRows(),located=selected.filter(org=>point(...(org.point||[]))),missing=selected.filter(org=>!point(...(org.point||[])));
   status.textContent=missing.length?'Sem localização cadastrada: '+missing.map(org=>org.nome).join('; ')+'.':
    !selected.length?'Nenhum órgão corresponde aos filtros.':'';
   if(!located.length)return;
   map.invalidateSize({pan:false});
   if(located.length===1)map.setView(located[0].point,17,{animate:false});
   else map.fitBounds(L.latLngBounds(located.map(org=>org.point)),{padding:[44,46],maxZoom:17,animate:false});
  }
  function isDue(due){return !CP.isNum(due)||due<=yearEnd;}
  function makeRows(all,today){
   const jobs=[], combo=new Map(), represented=new Set();
   const orders=source.byOrder||new Map(), yearStart=CP.DATE(2027,1,1);
   for(const row of all)if(row.kind==='arvore'&&row.poda!=='NÃO'&&row.poda!=='NAO'){
    const fit=treeIndex.get(T.norm(CP.treeId(row.id)));
    const posture=CP.postId(row.posteGIS);if(!posture)continue;
    const info=combo.get(posture)||[];info.push({...row,...fit,renderRow:row});combo.set(posture,info);
   }
   for(const row of all){
    if(row.kind==='arvore')continue;
    const vegetation=row.kind!=='estrutura', post=CP.postId(row.posteGIS||row.id), treeRows=vegetation?(combo.get(post)||[]):[];
    const pred=vegetation?row.calc?.prev?.find(value=>CP.isNum(value)&&value>=yearStart&&value<=yearEnd):null;
    const late=vegetation&&CP.isNum(row.calc?.P)&&row.calc.P<yearStart?row.calc.P:null;
    const order=orders.get(keyOf(row.orderId));
    if(vegetation&&row.kind!=='faixa'&&!row.osOpen&&!treeRows.length&&!pred&&!late&&row.kind!=='ss'&&row.kind!=='ambos')continue;
    if(vegetation&&represented.has(post))continue;
    const minDue=Math.min(...treeRows.map(tree=>tree.due).filter(CP.isNum));
    const due=(Number.isFinite(minDue)?Math.min(minDue,late||pred||Infinity):late||pred)||null;
    if(vegetation&&due&&!isDue(due)&&!row.osOpen)continue;
    const moData=postIndex.get(post)||{}, enriched={...moData,...order,...row};
    const quantity=T.positive(order?.qPod||row.arv||row.arvE)||treeRows.length||null;
    const fa=row.kind==='faixa', asset=vegetation?(fa?'faixa':'poda'):row.asset;
    if(vegetation&&post)represented.add(post);
    const risk=treeRows.map(t=>t.classe).find(x=>/CRIT/.test(T.norm(x)))||treeRows.map(t=>t.classe).find(x=>T.norm(x)==='ALTO')||treeRows[0]?.classe;
    const distances=treeRows.flatMap(t=>[T.positive(t.distMT),T.positive(t.distProjected)]).filter(x=>x!==null);
    const distance=distances.length?Math.min(...distances):null;
    jobs.push({...enriched,id:(vegetation?'p:':'s:')+row.id,asset,due,risk,mtDistance:distance,distIT:row.distIT??treeRows.find(r=>r.distIT!=null)?.distIT,kv:row.kv??treeRows.find(r=>r.kv!=null)?.kv,
     origin:vegetation?'sgm':'estrutura',origins:new Set([vegetation?'sgm':'estrutura',...treeRows.map(tree=>tree.origin==='campo'?'campo':'vera')]),
     moLM:order?.moLM??row.moLM??moData.moLM,moLV:order?.moLV??row.moLV??moData.moLV,voltage:row.tensao||moData.voltage,
     growth:Math.max(0,...treeRows.map(t=>Number(t.growth)||0)),clients:Math.max(-1,...treeRows.map(t=>T.positive(t.clients)??-1)),
     quantity, renderRow:row, related:treeRows.map(t=>t.renderRow), poda:vegetation&&!fa});
   }
   for(const row of all){
    if(row.kind!=='arvore'||represented.has(CP.postId(row.posteGIS))||/^(NAO|N)$/.test(T.norm(row.poda)))continue;
    const tree=treeIndex.get(T.norm(CP.treeId(row.id)))||{}, post=postIndex.get(CP.postId(row.posteGIS))||{};
    if(tree.due&&!isDue(tree.due))continue;
    const origin=row.origin==='campo'?'campo':'vera';
    jobs.push({...post,...row,...tree,conj:row.conj,conjCode:row.conjCode,conjStatus:row.conjStatus,conjMethod:row.conjMethod,conjSource:row.conjSource,
     conjCandidates:row.conjCandidates,conjOriginal:row.conjOriginal,point:row.point,id:'a:'+row.id,asset:'poda',origin,origins:new Set([origin]),renderRow:row,related:[],poda:true,
     quantity:1,mtDistance:[tree.distMT,tree.distProjected,row.distMT].filter(v=>T.positive(v)!==null).reduce((p,n)=>Math.min(p,n),Infinity),distIT:tree.distIT??post.distIT,kv:tree.kv??post.kv,voltage:tree.voltage||post.voltage});
   }
   return jobs.map(row=>{
    const key=keyIndex.get(T.norm(row.chave))||{}, hierarchy=hierIndex.get(T.norm(row.chave))||{};
    const program=progIndex.get(T.norm(row.chave))||{}, impacts=orgIndex.get(T.norm(row.chave))||[];
    const situational=row.demand===true||/RECLAMA|OUVIDOR|SOLICIT|DEMANDA (DO|DE) CLIENTE|ORGAO PUBLICO|PROTOCOL/.test(T.norm([row.demand,row.desc,row.origemOS,row.origem,row.defeito].filter(Boolean).join(' ')));
    const mode=T.classify({...row,situational},{...hierarchy,...key,cli:key.cli??hierarchy.cli},program);
    const costs=costOf(row,mode);
    const pool=mode.team&&row.polo?T.pole(row.polo)+'|'+mode.team:'';
    const normalized={...row,...mode,...costs,pool,impacts,naCandidates:hierarchy.na||[],key:row.chave,
     rationale:(key.causa&&T.family(key.causa)===row.asset)?'Causa principal da chave · '+key.causa:''
    };
    return {...normalized,...T.score(normalized,monthly.get(T.norm(row.conj)),today)};
   });
  }
  function costOf(row,mode){
   const isPoda=row.asset==='poda'||row.asset==='faixa', rural=T.norm(row.perim)==='RURAL';
   const meta=source.mergedSummary||{};
   const registered=Object.keys(meta.recursos2027||{}).map(T.norm);
   const own=mode.mode==='bt'||isPoda&&!rural&&/URBANO|URBANA/.test(T.norm(row.perim));
   const resource=own?'PODA URBANA (PRÓPRIA)':isPoda&&rural?'PODA RURAL (TERCEIRA)':
    T.norm(row.recurso)||(row.cpx==='CAPEX'?'CAPEX 31563':row.cpx==='OPEX'?'OPEX MANUT. PROGRAMADA':'');
   const catalogCode=row.asset==='faixa'?'LIMP_FAIXA':mode.mode==='bt'?'PODA_BT':'PODA_MT';
   const ref=(meta.valorOS?.servicos||[]).find(item=>item.t===catalogCode&&Boolean(item.lv)===(mode.mode==='viva'));
   const duration=T.positive(mode.mode==='viva'?(row.minLv??row.min):(row.minLm??row.min));
   const history=(source.mergedSummary?.valorOS?.servicos||[]).find(item=>
    !isPoda&&Boolean(item.lv)===(mode.mode==='viva')&&String(row.serv||'').split(/[|,]/).map(x=>x.trim()).includes(item.t));
   const units=row.asset==='poda'?T.positive(row.quantity):null;
   const pruneUnits=units==null?null:Math.max(1,units);
   const hours=duration>0?duration/60:pruneUnits!=null&&ref?.min>0?ref.min*pruneUnits/60:history?.min>0?history.min/60:null;
   const exactMode=(mode.mode==='viva')===Boolean(row.lv);
   const mat=own||isPoda&&rural?0:exactMode?T.positive(row.mat):null;
   const mo=own?0:exactMode?T.positive(row.mo):null;
   return {resource:registered.includes(resource)||T.budgetKey(resource)?resource:'',mat,mo:mo??(isPoda&&rural&&pruneUnits&&ref?.mo!=null?ref.mo*pruneUnits:null),
    hours,costBasis:own?'Execução própria · horas':mat!=null&&mo!=null?'Consolidado de OS':isPoda&&rural&&ref?'Histórico por ponto de poda':'Pendente'};
  }
  function budgetLimits(){return T.budgets(source.mergedSummary,{
   'PODA URBANA (PRÓPRIA)':{mo:0,mat:0},...budgetInput
  });}
  function render(all,today,ring){
   activeArea=ring;rows=makeRows(all,today);
   const budgets=budgetLimits();
   const capacity=availability(imported.teams?.length?imported.teams:source.teams||[],days,source.mergedSummary||{},crewInput,new Set(rows.map(row=>row.pool).filter(Boolean)));
   result=T.optimize(rows,budgets,Object.fromEntries([...capacity].map(([pool,info])=>[pool,info.hours])));
   const deopOptions=GestaoMulti.pairs(rows.map(row=>row.deop));
   multis.deop.set(deopOptions);
   const filter=Object.fromEntries(['asset','origin','mode','decision','deop'].map(key=>[key,new Set(values(key))]));
   const match=(key,value)=>!filter[key].size||filter[key].has(value);
   display=result.rows.filter(row=>(!filter.asset.size||[...(row.assets||[row.asset])].some(x=>filter.asset.has(x)))&&match('mode',row.mode)&&match('deop',row.deop)&&
    match('decision',row.planned?'selected':row.review?'review':'hold')&&
    (!filter.origin.size||[...row.origins].some(origin=>filter.origin.has(origin))));
   paintSummary(budgets,capacity);
   paintRows();paintOutages();paintDEC();paintImpact();paintBudgetFields(budgets,capacity);paintOrgs();
   if(!$('terrOnly').checked)return null;
   return new Set(display.flatMap(row=>[row.renderRow,...row.related]));
  }
  function paintSummary(budgets,capacity){
   const c=result.rows.length, selected=result.selected.size;
   const reviews=result.rows.filter(row=>!row.planned&&row.review).length;
   const spent=kind=>Object.entries(result.spend).filter(([name])=>T.budgetKey(name)===kind).reduce((s,[,item])=>s+item.mo+item.mat,0);
   const exhausted=[...capacity].filter(([pool,info])=>info.hours!=null&&(result.workload[pool]||0)>info.hours).length;
   $('terrCards').innerHTML=[['Candidatos',num(c)],['Selecionados em 2027',num(selected)],['CAPEX comprometido',money(spent('CAPEX'))],
    ['OPEX comprometido',money(spent('OPEX'))],['Grupos com demanda acima da capacidade',num(exhausted)],['Candidatos com dados/validação pendentes',num(reviews)]]
    .map(([label,v])=>'<div><span>'+esc(label)+'</span><strong>'+esc(v)+'</strong></div>').join('');
   $('terrModes').innerHTML=Object.entries(T.modes).map(([id,label])=>{
    const matches=result.rows.filter(row=>row.mode===id);
    return '<button type="button" data-terr-mode="'+id+'" aria-pressed="'+String(values('mode').includes(id))+'"><b>'+num(matches.length)+'</b> '+esc(label)+'</button>';
   }).join('');
   const capRows=[...capacity].map(([name,info])=>[name.replace('|',' · '),info.names?.join(', '),num(info.hours),num(result.workload[name]||0),
    num(result.hours[name]||0),info.hours==null?'A validar':(result.workload[name]||0)>info.hours?'Déficit':'Cabe em horas',info.basis]);
   const budgetRows=Object.entries(budgets).map(([k,v])=>{const spent=result.spend[k]||{mo:0,mat:0};
    return [k,money(v.mo),money(spent.mo),money(v.mo==null?null:v.mo-spent.mo),money(v.mat),money(spent.mat),money(v.mat==null?null:v.mat-spent.mat)];});
   $('terrCapacity').innerHTML='<h5>Capacidade por polo e tipo de equipe</h5>'+table(['Equipe','Histórico usado','Disponível (h)','Demanda com tempo (h)','Selecionado (h)','Projeção','Referência'],capRows)+
    '<h5>Saldo por dotação</h5>'+table(['Recurso','Serviço previsto','Serviço selecionado','Saldo serviço','Material previsto','Material selecionado','Saldo material'],budgetRows)+
    '<p class="small">Estimativa baseada em dias com OS por equipe nos três meses fechados mais recentes e em uma jornada de 8 h. Informe a disponibilidade reservada para 2027 para simular exclusividade, emergências e feriados.</p>';
  }
  function paintBudgetFields(budgets,capacity){
   const root=$('terrBudgets');
   const keys=[...new Set(['CAPEX','OPEX',...Object.keys(budgets)])].sort();
   const pools=[...capacity.keys()].sort();
   const token=JSON.stringify([keys,pools]);
   if(root.dataset.values===token)return;
   root.dataset.values=token;
   root.innerHTML=keys.map(key=>['mo','mat'].map(kind=>'<label>'+esc(key)+' · '+(kind==='mo'?'serviço':'material')+
    '<input type="number" min="0" step="0.01" data-budget="'+esc(key)+'" data-money="'+kind+'" placeholder="'+esc(budgets[key]?.[kind]??'Da base')+'" value="'+esc(budgetInput[key]?.[kind]??'')+'"></label>').join('')).join('')+
    pools.map(pool=>'<label>'+esc(pool.replace('|',' · '))+' · horas<input type="number" min="0" step="0.1" data-pool="'+esc(pool)+
     '" placeholder="'+esc(capacity.get(pool)?.hours?.toFixed(1)||'Da base')+'" value="'+esc(crewInput[pool]??'')+'"></label>').join('');
  }
  const headers=['Prioridade','Serviço','Poste / OS','Conjunto','Chave','Prazo','Clientes','Modalidade','Horas','Serviço / material','Situação'];
  function rowValues(row){
   return [row.score,T.types[row.asset],row.orderId||row.posteGIS||row.renderRow.id,row.conj,row.key,date(row.due),num(row.clients),T.modes[row.mode],num(row.hours),
    money(row.mo)+' / '+money(row.mat),row.planned?'Selecionada':row.reason];
  }
  function paintRows(){
   const pages=Math.max(1,Math.ceil(display.length/25));
   page=Math.max(0,Math.min(page,pages-1));
   const body=display.slice(page*25,page*25+25);
   $('terrCandidates').innerHTML='<div class="cycle-table"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+esc(h)+'</th>').join('')+
    '</tr></thead><tbody>'+body.map((row,i)=>'<tr>'+rowValues(row).map((value,j)=>'<td>'+(j===1?'<button type="button" class="quiet" data-terr-row="'+(page*25+i)+'">'+esc(value)+'</button>':esc(value??'—'))+'</td>').join('')+'</tr>').join('')+
    (body.length?'':'<tr><td colspan="'+headers.length+'">Nenhum serviço com este recorte.</td></tr>')+'</tbody></table></div>';
   $('terrPage').textContent=num(display.length)+' candidatos · página '+(page+1)+' de '+pages;
   $('terrPrev').disabled=!page;$('terrNext').disabled=page>=pages-1;
  }
  function paintOutages(){
   const grouped=new Map();
   for(const row of display){
    if(!row.key||!['radial','manobra'].includes(row.mode))continue;
    const id=row.key+'|'+row.mode;
    let group=grouped.get(id);
    if(!group){group={name:row.key,mode:row.mode,alim:row.alim,conj:row.conj,clients:row.clients,residual:row.residual,
     na:row.na,score:row.score,total:0,selected:0,hours:0,assets:new Set()};grouped.set(id,group);}
    group.total++;if(row.planned){group.selected++;group.hours+=row.hours||0;}
    group.assets.add(T.types[row.asset]);
   }
   const all=[...grouped.values()].sort((a,b)=>b.score-a.score);
   const view=all.slice(0,30);
   $('terrOutages').innerHTML='<p class="small">'+num(all.length)+' pacotes por chave no recorte · '+num(view.length)+' maiores prioridades. Horas dos serviços selecionados antes de deslocamento e preparação.</p>'+
    table(['Chave','Conjunto','Alimentador','Modalidade','Clientes no trecho','Residuais com manobra','NA estudada','Tipos','Serviços','Selecionados','Horas selecionadas'],
     view.map(k=>[k.name,k.conj,k.alim,T.modes[k.mode],num(k.clients),num(k.residual),k.na,[...k.assets].join(', '),num(k.total),num(k.selected),num(k.hours)]));
  }
  function paintDEC(){
   const keys=new Set(rows.map(row=>T.norm(row.conj)).filter(Boolean));
   const view=[...monthly].filter(([key])=>!keys.size||keys.has(key)).map(([,value])=>value).sort((a,b)=>(b.nextGap??-Infinity)-(a.nextGap??-Infinity));
   $('terrDec').innerHTML='<p class="small">O fechamento soma o apurado e os meses restantes do ano anterior quando completos. O próximo ano usa a projeção central disponível ou um cenário de repetição. O ganho das ações é estimativo. Limites ANEEL conforme <a href="https://www2.aneel.gov.br/cedoc/rea202315015ti.pdf" target="_blank" rel="noopener">Resolução 15.015/2023</a>.</p>'+
    table(['Conjunto','Ano base','DEC apurado','Restante','Fechamento','Limite atual','Desvio','Projeção seguinte','Limite seguinte','Desvio seguinte','Causas não programadas (h)','Base da projeção'],view.map(item=>[
     item.name,item.year,num(item.ytd),num(item.remainder),num(item.projected),num(item.currentLimit),num(item.gap),num(item.next),num(item.nextLimit),num(item.nextGap),
     item.causes.slice(0,4).map(cause=>cause.cause+' '+num(cause.dec)).join(' · '),item.projectionSource+' / '+item.nextSource]));
  }
  function pruneCounts(visibleRows=rows){
   const output=new Map();
   for(const row of visibleRows)if(row.poda)for(const org of row.impacts){
    const data=output.get(org.id)||{n:0,qty:0,unknown:0,lm:0,man:0};
    data.n++; if(row.quantity!=null)data.qty+=row.quantity;else data.unknown++;
    if(row.mode==='radial')data.lm++;
    if(row.mode==='manobra')data.man++;
    output.set(org.id,data);
   }
   return output;
  }
  function paintImpact(){
   const counts=pruneCounts();
   $('terrImpact').innerHTML='<p class="small">Contagem por chave confirmada e chaves a montante da hierarquia. A transferência das instalações essenciais deve ser validada no estudo da manobra.</p>'+
    '<p class="small">'+num(orgRows().filter(org=>org.chave).length)+' de '+num(orgRows().length)+' órgãos do recorte têm chave cadastrada.</p>'+
    table(['Órgão','Município','Poste','Chave','Intervenções','Pontos de poda conhecidos','Qtd. a conferir','Radiais','Com manobra'],orgRows().map(org=>{
      const data=counts.get(org.id);
      return [org.nome+(org.point?'':' · coordenada pendente'),org.municipio,org.poste,org.chave||'Vínculo elétrico pendente',org.chave?num(data?.n||0):'—',
       org.chave?num(data?.qty||0):'—',org.chave?num(data?.unknown||0):'—',org.chave?num(data?.lm||0):'—',org.chave?num(data?.man||0):'—'];
    }));
  }
  function popup(row) {
   const content=document.createElement('div');
   const view=result?.rows.find(item=>item.renderRow===row||item.related?.includes(row))||row;
   content.innerHTML='<h4>'+esc(T.types[row.asset]||row.tipo||row.id)+'</h4>'+
    [['Referência',row.orderId||row.id],['Chave',row.chave],['Justificativa DEC',view.rationale],['Alimentador',row.alim],['Detalhe',row.tipo],['Modalidade',T.modes[view.mode]],
     ['Clientes',num(view.clients)],['Impacto residual',num(view.residual)],['NA no estudo central',view.na],
     ['NA trifásicas a jusante no cadastro',(view.naCandidates||[]).join(', ')],
     ['Triagem DEOP',view.deop],['Risco / crescimento',[view.risk,view.growth?num(view.growth)+' m/ano':''].filter(Boolean).join(' · ')],
     ['Pontuação',view.components?Object.entries(view.components).map(([key,value])=>key+' '+num(value)).join(' · '):''],
     ['Custos',view.costBasis],['Órgãos no vínculo',view.impacts?.map(x=>x.nome).join(', ')]]
    .filter(([,value])=>value&&value!=='—').map(([title,value])=>'<p><strong>'+esc(title)+'</strong> · '+esc(value)+'</p>').join('');
   if(row.point){
    const add=document.createElement('button');add.type='button';add.textContent='Adicionar parada';
    add.onclick=()=>appendStop({id:row.id,name:row.orderId||row.esp||row.tipo||row.id,point:row.point});
    content.append(add);
   }
   return content;
  }
  function attach(leaflet,callback){
   map=leaflet;onArea=callback;
   for(const [pane,z] of [['territorialArea',625],['territorialRoute',635],['territorialOrgs',650]])map.createPane(pane).style.zIndex=z;
   mapArea=L.layerGroup().addTo(map);mapOrgs=L.layerGroup().addTo(map);mapRoute=L.layerGroup().addTo(map);
   map.on('click',event=>{
    if(!live||!drawMode)return;
    const location=[event.latlng.lat,event.latlng.lng];
    if(drawMode==='area'){
     if(vertices.length>=400)return;
     vertices.push(location);paintArea();
    }else appendStop({id:'manual-'+location.join(','),name:'Ponto no mapa',point:location});
   });
   paintOrgs();
  }
  function paintArea(){
   mapArea?.clearLayers();
   const editing=drawMode==='area';
   map?.getContainer().classList.toggle('terr-drawing',live&&editing);
   const ring=editing?vertices:activeArea;
   if(live&&ring?.length){
    if(ring.length>2)L.polygon(ring,{pane:'territorialArea',color:'#8a5df2',weight:2,fillOpacity:.18,interactive:false}).addTo(mapArea);
    else if(ring.length>1)L.polyline(ring,{pane:'territorialArea',color:'#8a5df2',weight:2,interactive:false}).addTo(mapArea);
    if(editing)for(const p of ring)L.circleMarker(p,{pane:'territorialArea',radius:4,color:'#6336c7',fillColor:'#fff',fillOpacity:1,interactive:false}).addTo(mapArea);
   }
   $('terrDraw').setAttribute('aria-pressed',String(editing));
   $('terrDraw').textContent=editing?'Cancelar desenho':'Desenhar área livre';
   $('terrUndo').hidden=$('terrFinish').hidden=!editing;
   $('terrFinish').disabled=vertices.length<3;$('terrUndo').disabled=!vertices.length;
   $('terrClearArea').disabled=!activeArea;
   $('terrAreaStatus').textContent=editing?'Clique para adicionar vértices · '+vertices.length+' pontos.':activeArea?'Área aplicada ao mapa e às carteiras.':'';
  }
  function clearArea(){
   const existed=Boolean(activeArea);activeArea=null;vertices=[];
   if(drawMode==='area')drawMode='';
   if(existed)onArea?.(null);paintArea();
  }
  function paintOrgs(){
   if(!mapOrgs)return;
   mapOrgs.clearLayers();
   if(!live||!$('terrShowOrg').checked)return;
   const counts=pruneCounts();
   for(const org of orgRows()){
    if(!org.point)continue;
    const marker=L.marker(org.point,{pane:'territorialOrgs',title:org.nome,bubblingMouseEvents:false,
     icon:L.divIcon({className:'cycle-marker',html:icon(org.tipo),iconSize:[32,32],iconAnchor:[16,16],popupAnchor:[0,-16]})});
    marker.bindPopup(()=>{
     const node=document.createElement('div'), count=counts.get(org.id);
     node.innerHTML='<h4>'+esc(org.nome)+'</h4><p>'+esc(poTypes[org.tipo]||org.tipo)+' · '+esc(org.municipio)+'</p><p>'+
      esc(org.chave?'Chave '+org.chave+' · '+num(count?.n||0)+' intervenções de poda no recorte':'Vínculo elétrico pendente')+'</p>'+
      (org.poste?'<p>Poste '+esc(org.poste)+'</p>':'')+(/^https:\/\//.test(org.source||'')?'<p><a href="'+esc(org.source)+'" target="_blank" rel="noopener">Fonte da localização</a></p>':'');
     const button=document.createElement('button');button.type='button';button.textContent='Adicionar parada';button.onclick=()=>appendStop({id:org.id,name:org.nome,point:org.point});node.append(button);
     return node;
    });marker.addTo(mapOrgs);
   }
  }
  function paintRoute(fit=false){
   mapRoute?.clearLayers();
   const stops=currentRoute?.stops||[];
   const roadGeometry=currentRoute?.geometry;
   const pts=stops.map(s=>s.point);
   $('terrKml').disabled=!stops.length;
   $('terrManual').setAttribute('aria-pressed',String(drawMode==='route'));
   $('terrManual').textContent=drawMode==='route'?'Concluir rota manual':'Traçar rota no mapa';
   $('terrRouteStatus').textContent=stops.length?num(stops.length)+' paradas · '+num(currentRoute.km)+' km '+(roadGeometry?'por ruas · '+num(currentRoute.minutes)+' min estimados':'em linha reta')+(drawMode==='route'?' · Clique no mapa para incluir pontos.':''):
     drawMode==='route'?'Clique no mapa ou use Adicionar parada no ponto.':'';
   $('terrStops').innerHTML=stops.map((stop,i)=>'<li><span>'+esc(stop.name||stop.id)+'</span><button type="button" data-up="'+i+'" aria-label="Mover parada para cima"'+(i?'':' disabled')+'>↑</button><button type="button" data-remove="'+i+'" aria-label="Remover parada">×</button></li>').join('');
   const road=$('terrRoad');road.replaceChildren();
   // Each URL stays within the Maps URL waypoint limit and repeats the end of the previous leg as its origin.
   const routeSegments=[];
   for(let i=0;i<pts.length-1;i+=4)routeSegments.push(pts.slice(i,i+5));
   routeSegments.forEach((segment,index)=>{
    const search=new URLSearchParams({api:'1',origin:segment[0].join(','),destination:segment.at(-1).join(','),travelmode:'driving'});
    if(segment.length>2)search.set('waypoints',segment.slice(1,-1).map(p=>p.join(',')).join('|'));
    const link=document.createElement('a');link.className='button-link';link.href='https://www.google.com/maps/dir/?'+search.toString();
    link.target='_blank';link.rel='noopener noreferrer';link.textContent='Abrir por ruas'+(routeSegments.length>1?' · '+(index+1):'');road.append(link);
   });
   if(roadGeometry){
    const attribution=document.createElement('a');attribution.href='https://www.openstreetmap.org/copyright';attribution.target='_blank';attribution.rel='noopener';
    attribution.textContent='OSRM / © OpenStreetMap';road.append(attribution);
    const correct=document.createElement('a');correct.href='https://www.openstreetmap.org/edit?lat='+pts[0][0]+'&lon='+pts[0][1]+'&zoom=16';correct.target='_blank';correct.rel='noopener';correct.textContent='Corrigir o mapa';road.append(correct);
   }
   if(!live||!map||!pts.length)return;
   if(pts.length>1)L.polyline(roadGeometry||pts,{pane:'territorialRoute',color:'#6e32de',dashArray:roadGeometry?null:'7 5',weight:4,interactive:false}).addTo(mapRoute);
   stops.forEach((stop,i)=>L.marker(stop.point,{pane:'territorialRoute',interactive:false,icon:L.divIcon({className:'terr-stop',html:String(i+1),iconSize:[24,24],iconAnchor:[12,12]})}).addTo(mapRoute));
   if(fit)map.fitBounds(L.latLngBounds(roadGeometry||pts),{padding:[44,46],maxZoom:17});
  }
  function appendStop(stop){
   routing?.abort();routeCandidates.push(stop);currentRoute=T.route(routeCandidates,true);paintRoute();
  }
  function download(name,data,type){
   const link=document.createElement('a');link.href=URL.createObjectURL(new Blob([data],{type}));link.download=name;link.click();
   setTimeout(()=>URL.revokeObjectURL(link.href),1000);
  }
  const quote=value=>{const s=String(value??'');return '"'+(/^(\s*[=+@-]|\t|\r)/.test(s)&&!Number.isFinite(Number(s))?"'":'')+s.replace(/"/g,'""')+'"';};
  async function fileJSON(file){
   if(file.size>80*1024*1024)throw Error('Selecione um complemento de até 80 MB.');
   const gzip=(await file.slice(0,2).arrayBuffer());
   const bytes=new Uint8Array(gzip);
   return bytes[0]===31&&bytes[1]===139?new Response(file.stream().pipeThrough(new DecompressionStream('gzip'))).json():JSON.parse(await file.text());
  }
  $('terrData').onchange=async e=>{
   const file=e.target.files[0];if(!file)return;
   const token=loadToken;
   try{
    const data=await fileJSON(file);
    if(!live||token!==loadToken)return;
    imported=unpack(data);
    imported.closedSet=new Set((imported.closed||[]).map(keyOf));merge();$('terrImportStatus').textContent='Complemento carregado · '+num(imported.hierarchy.length)+' chaves · '+num(imported.dec.length)+' registros mensais de DEC por causa.';update();
   }catch(error){if(live)$('terrImportStatus').textContent=error.message;}
   finally{e.target.value='';}
  };
  $('terrOrgFile').onchange=async e=>{
   const file=e.target.files[0];if(!file)return;
   const token=loadToken;
   try{
    const data=await fileJSON(file);
    if(data.type!=='FeatureCollection'||!Array.isArray(data.features))throw Error('Importe uma coleção GeoJSON de pontos.');
    const points=data.features.filter(f=>f.geometry?.type==='Point'||f.geometry===null).map(f=>{
     const p=f.properties||{}, coords=f.geometry?.coordinates||[], type=T.norm(p.tipo).toLowerCase();
     return {id:p.id,nome:p.nome,municipio:p.municipio,lat:coords[1],lon:coords[0],tipo:Object.hasOwn(poTypes,type)?type:'servico',
      chave:p.chave,poste:p.poste,source:p.fonte};
    }).filter(p=>p.nome||p.id);
    if(!points.length)throw Error('Informe nome ou ID em cada órgão.');
    if(!live||token!==loadToken)return;
    orgInputs=points;merge();$('terrImportStatus').textContent=num(points.length)+' órgãos importados.';update();
   }catch(error){if(live)$('terrImportStatus').textContent=error.message;}
   finally{e.target.value='';}
  };
  for(const [key,[select]] of Object.entries(filters))select.addEventListener('change',()=>{
   page=0;update();
   if(['orgType','orgTown','orgName'].includes(key)){paintOrgs();fitOrgs();}
  });
  $('terrOnly').onchange=()=>update();$('terrShowOrg').onchange=paintOrgs;
  $('terrDraw').onclick=()=>{
   if(!map)return;
   drawMode=drawMode==='area'?'':'area';vertices=[];
   paintArea();paintRoute();
  };
  $('terrUndo').onclick=()=>{vertices.pop();paintArea();};
  $('terrFinish').onclick=()=>{
   const distinct=new Set(vertices.map(point=>point.join(',')));
   const validArea=Math.abs(vertices.reduce((n,p,i)=>{const q=vertices[(i+1)%vertices.length];return n+p[1]*q[0]-q[1]*p[0];},0))>1e-11;
   if(distinct.size<3||!validArea){$('terrAreaStatus').textContent='Desenhe uma área com ao menos três pontos distintos e não alinhados.';return;}
   activeArea=[...vertices];vertices=[];drawMode='';onArea?.(activeArea);paintArea();
  };
  $('terrClearArea').onclick=clearArea;
  $('terrRouteJump').onclick=()=>$('territorialRoutes').scrollIntoView({block:'start'});
  $('terrModes').onclick=e=>{
   const button=e.target.closest('[data-terr-mode]');if(!button)return;
   const mode=button.dataset.terrMode,selected=new Set(values('mode'));
   if(selected.has(mode))selected.delete(mode);else selected.add(mode);
   multis.mode.set(Object.entries(T.modes),[...selected]);page=0;update();
  };
  $('terrPrev').onclick=()=>{page--;paintRows();};
  $('terrNext').onclick=()=>{page++;paintRows();};
  $('terrCandidates').onclick=e=>{
   const button=e.target.closest('[data-terr-row]');if(!button)return;
   const row=display[Number(button.dataset.terrRow)];if(!row)return;
   const detail=popup(row.renderRow);
   if(row.renderRow.point){
    const locate=document.createElement('button');locate.type='button';locate.textContent='Localizar no mapa';locate.onclick=()=>plot(row.renderRow.point);detail.append(locate);
   }
   $('terrDetails').replaceChildren(detail);
  };
  $('terrApply').onclick=()=>{
   const budget={}, crews={};
   for(const input of $('terrBudgets').querySelectorAll('input'))if(input.value!==''){
    if(!input.reportValidity())return;
    if(input.dataset.pool)crews[input.dataset.pool]=input.valueAsNumber;
    else {
     const key=input.dataset.budget;
     if(!budget[key])budget[key]={...T.budgets(source.mergedSummary)[key]};
     budget[key][input.dataset.money]=input.valueAsNumber;
    }
   }
   if(!$('terrDays').reportValidity())return;
   budgetInput=budget;crewInput=crews;days=$('terrDays').valueAsNumber||260;update();
  };
  $('terrReset').onclick=()=>{
   budgetInput={};crewInput={};days=260;$('terrDays').value='260';$('terrBudgets').dataset.values='';update();
  };
  $('terrSuggest').onclick=()=>{
   routing?.abort();
   const selection=$('terrRouteSource').value;
   const candidates=selection==='publicos'?orgRows().filter(org=>!activeArea||T.pointIn(org.point,activeArea)).map(row=>({...row,name:row.nome})):
    display.filter(row=>selection!=='selecionadas'||row.planned).map(row=>({id:row.id,name:row.orderId||row.renderRow.esp||row.renderRow.id,point:row.renderRow.point}));
   const count=Math.max(2,Math.min(60,$('terrRouteLimit').valueAsNumber||20));
   if(!candidates.some(row=>row.point)){$('terrRouteStatus').textContent='Nenhuma parada georreferenciada na seleção.';return;}
   if(drawMode==='area')vertices=[];
   drawMode='';currentRoute=T.route(candidates.filter(row=>row.point).slice(0,count));routeCandidates=[...currentRoute.stops];
   paintArea();paintRoute(true);
  };
  $('terrSuggestRoad').onclick=async()=>{
   const catalog=typeof SigoraAcre==='undefined'?[]:SigoraAcre;
   const limit=Math.max(2,Math.min(20,$('terrRouteLimit').valueAsNumber||20));
   const scoped=orgRows().filter(org=>!activeArea||T.pointIn(org.point,activeArea));
   const publicById=new Map(catalog.filter(org=>org.point).map(org=>[org.id,org]));
   const candidates=T.route(scoped.map(org=>publicById.get(org.id)).filter(Boolean).map(org=>({...org,name:org.nome})),true).stops.slice(0,limit);
   if(candidates.length<2){$('terrRouteStatus').textContent='Selecione pelo menos dois órgãos do catálogo público com coordenadas.';return;}
   if(new Set(candidates.map(org=>org.municipio)).size!==1){$('terrRouteStatus').textContent='Selecione um município por vez para sugerir rota por ruas.';return;}
   routing?.abort();routing=new AbortController();
   const pending=routing, button=$('terrSuggestRoad');button.disabled=true;
   $('terrRouteStatus').textContent='Calculando pela rede viária…';
   const root='https://routing.openstreetmap.de/routed-car/';
   const coords=items=>items.map(row=>[row.point[1],row.point[0]].join(',')).join(';');
   const ask=async path=>{
    const response=await fetch(root+path,{signal:AbortSignal.any([pending.signal,AbortSignal.timeout(14000)])});
    if(!response.ok)throw Error('Roteamento indisponível.');
    return response.json();
   };
   try{
    const data=await ask('table/v1/driving/'+coords(candidates)+'?annotations=duration');
    const order=data.code==='Ok'&&Array.isArray(data.durations)?T.roadOrder(data.durations):null;
    if(!order)throw Error('Não foi possível ligar todas as paradas por ruas.');
    const stops=order.map(i=>candidates[i]);
    await new Promise(resolve=>setTimeout(resolve,1100));
    if(pending.signal.aborted)return;
    const body=await ask('route/v1/driving/'+coords(stops)+'?geometries=geojson&overview=simplified&steps=false');
    const path=body.routes?.[0];
    if(body.code!=='Ok'||!path?.geometry?.coordinates?.length)throw Error('Não foi possível montar a rota por ruas.');
    if(pending.signal.aborted||!live)return;
    drawMode='';vertices=[];routeCandidates=stops;
    currentRoute={stops,geometry:path.geometry.coordinates.map(([lon,lat])=>[lat,lon]),km:path.distance/1000,minutes:path.duration/60};
    paintArea();paintRoute(true);
   }catch(error){if(!pending.signal.aborted&&live)$('terrRouteStatus').textContent=error.message+' Use Sugerir sequência para calcular em linha reta.';}
   finally{if(routing===pending){routing=null;button.disabled=false;}}
  };
  $('terrManual').onclick=()=>{
   routing?.abort();drawMode=drawMode==='route'?'':'route';
   vertices=[];paintArea();paintRoute();
   if(drawMode==='route')$('mapFrame').scrollIntoView({block:'center'});
  };
  $('terrClearRoute').onclick=()=>{routing?.abort();if(drawMode==='route')drawMode='';routeCandidates=[];currentRoute=null;paintRoute();};
  $('terrStops').onclick=e=>{
   const control=e.target.closest('[data-up],[data-remove]');if(!control)return;
   const list=[...currentRoute.stops],index=Number(control.dataset.up??control.dataset.remove);
   if(control.hasAttribute('data-up')&&index>0)[list[index-1],list[index]]=[list[index],list[index-1]];
   else if(control.hasAttribute('data-remove'))list.splice(index,1);
   routeCandidates=list;currentRoute=T.route(list,true);paintRoute();
  };
  $('terrKml').onclick=()=>{
   const stops=currentRoute?.stops||[], lines=stops.map(stop=>[stop.point[1],stop.point[0],0].join(','));
   const track=currentRoute?.geometry?.map(([lat,lon])=>[lon,lat,0].join(','))||lines;
   const marks=stops.map((stop,i)=>'<Placemark><name>'+esc((i+1)+' '+stop.name)+'</name><Point><coordinates>'+lines[i]+'</coordinates></Point></Placemark>').join('');
   const line=track.length>1?'<Placemark><name>'+(currentRoute.geometry?'Rota sugerida · por ruas':'Sequência sugerida · linha reta')+'</name><LineString><coordinates>'+track.join(' ')+'</coordinates></LineString></Placemark>':'';
   download('SIGORA_Rota.kml','<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>'+marks+line+'</Document></kml>','application/vnd.google-earth.kml+xml');
  };
  $('terrExport').onclick=()=>{
   const extra=['Recurso','Órgãos na hierarquia','Origem','Apoio DEOP','NA estudada','Clientes residuais','Base do custo'];
   const csv=[headers.concat(extra),...display.map(row=>rowValues(row).concat([row.resource,row.impacts.map(x=>x.nome).join(', '),[...row.origins].join(', '),row.deop,row.na,row.residual,row.costBasis]))];
   download('SIGORA_Carteira_2027.csv','\ufeff'+csv.map(r=>r.map(quote).join(';')).join('\r\n'),'text/csv;charset=utf-8');
  };
  updateOrgOptions();
  return {attach,clearArea,render,load,structurePopup:popup,structures:()=>classify?structureRows.map(classify):structureRows,
   supplement(data){
    if(!data||centralSupplement===data)return;
    imported=unpack(data);imported.closedSet=new Set((imported.closed||[]).map(keyOf));centralSupplement=data;merge();
   },
   getSupplement:()=>centralSupplement,
   assetVisible:asset=>passes('mapAssets',asset),
   drawing:()=>Boolean(drawMode),
   visible(on){
    live=on;host.hidden=!on;if(!on){routing?.abort();drawMode='';vertices=[];}
    paintArea();paintOrgs();paintRoute();
   },
   stop(){
    routing?.abort();loadToken++;generation='';source={};imported={};centralSupplement=null;orgInputs=[];activeArea=null;vertices=[];drawMode='';currentRoute=null;routeCandidates=[];
    rows=[];result=null;display=[];page=0;budgetInput={};crewInput={};$('terrBudgets').dataset.values='';
    for(const id of ['terrCandidates','terrDetails','terrCards','terrCapacity','terrOutages','terrDec','terrImpact','terrImportStatus','terrDataStatus'])$(id).replaceChildren();
    live=false;merge();
   }
  };
 }
 return {create,icon};
})();
