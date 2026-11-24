'use strict';
(()=>{
 const M=CampoRoutes,dbKey='campo-route-state-v1',$=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const km=m=>(m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 const panel=$('fieldRoutes'),status=$('fieldRouteStatus');
 let owner=null,state=null,selected=null,busy=false,refreshing=false,map=null,layer=null,currentGPS=null,sampleWrite=false,loadEpoch=0,routeGeometry=null,coverageInput={},fieldOverlay=null,googleOverlay=null,roadLeg=0,lastRoadSignature="",scopeTiles=null,mapScope=null;
 const returnButton=document.createElement('button');
 returnButton.type='button';returnButton.id='fieldRouteReturn';returnButton.className='secondary';returnButton.textContent='Devolver rota';
 $('fieldRouteStreet')?.append(returnButton);
 const returnDialog=document.createElement('dialog');
 returnDialog.id='fieldRouteReturnDialog';returnDialog.className='route-return-dialog';
 returnDialog.innerHTML=`<form id="fieldRouteReturnForm"><div class="sectionhead"><div><span class="eyebrow">DEVOLUÇÃO</span><h2>Devolver rota</h2></div><button type="button" id="fieldRouteReturnClose" class="secondary">Fechar</button></div><p>A rota voltará para a gestão e sairá de Minhas rotas. Se ela foi dividida, todas as partes serão devolvidas juntas.</p><label>Motivo<select id="fieldRouteReturnReason" required><option value="">Selecione</option><option value="acesso">Acesso impedido</option><option value="seguranca">Condição insegura</option><option value="rede">Dados ou traçado da rede incorretos</option><option value="area">Fora da área ou atribuição</option><option value="reprogramacao">Reprogramação operacional</option><option value="homologacao">Homologação</option><option value="outro">Outro</option></select></label><label>Observação<textarea id="fieldRouteReturnNote" maxlength="480" rows="3" placeholder="Detalhe o motivo quando necessário"></textarea></label><div id="fieldRouteReturnAdmin" hidden><p><strong>Homologação exige a senha de um administrador.</strong></p><label>Usuário ou e-mail do administrador<input id="fieldRouteReturnAdminLogin" maxlength="254" autocomplete="username"></label><label>Senha do administrador<input id="fieldRouteReturnAdminPassword" type="password" maxlength="128" autocomplete="current-password"></label></div><p id="fieldRouteReturnFeedback" role="status"></p><button type="submit" class="primary">Confirmar devolução</button></form>`;
 document.body.append(returnDialog);
 const keyPanel=document.createElement('section');
 keyPanel.id='fieldRouteCoverage';
 keyPanel.innerHTML='<h3>Vistoria por chave</h3><div id="fieldRouteKeys"></div><button type="button" id="fieldRouteArea" hidden>Selecionar vãos ou área no mapa</button>';
 const spanList=$('fieldRouteItems'),spanDetails=document.createElement('details');
 spanDetails.innerHTML='<summary>Detalhes por ID do vão</summary><label>Chave ou grupo<select id="fieldRouteSpanGroup"></select></label><div class="route-buttons" id="fieldRouteSpanPages"><button type="button" id="fieldRouteSpanPrev">Anterior</button><span id="fieldRouteSpanPage"></span><button type="button" id="fieldRouteSpanNext">Próxima</button></div>';
 $('fieldRouteMap').before(keyPanel);
 spanList.before(spanDetails);
 spanDetails.append(spanList);
 const mapTools=document.createElement('div');
 mapTools.id='fieldRouteMapSelection';
 mapTools.hidden=true;
 mapTools.innerHTML='<div class="route-buttons"><button type="button" id="fieldRouteTapMode" aria-pressed="true">Tocar no vão</button><button type="button" id="fieldRoutePolygonMode" aria-pressed="false">Desenhar polígono</button><button type="button" id="fieldRouteUndoVertex" hidden>Desfazer ponto</button><button type="button" id="fieldRoutePolygonApply" hidden>Selecionar pelo polígono</button><button type="button" id="fieldRouteSelectionBack">Cancelar</button><button type="button" id="fieldRouteSelectionDone" class="primary">Marcar como feito</button></div><p id="fieldRouteSelectionStatus" role="status"></p>';
 $('fieldRouteMap').before(mapTools);
 const routeTools=document.createElement('section');
 routeTools.id='fieldRouteOnMap';routeTools.hidden=true;
 routeTools.innerHTML='<div class="route-buttons"><button type="button" id="mapRouteStart">Iniciar vistoria</button><button type="button" id="mapTrailStart">Marcar início</button><button type="button" id="mapTrailEnd">Marcar fim</button><button type="button" id="mapRouteExclude">Retirar vãos</button><button type="button" id="mapRouteFinish">Salvar saída</button><button type="button" id="mapTrailCancel" hidden>Cancelar seleção</button></div><p id="mapRouteStatus" role="status"></p>';
 document.querySelector('.map-canvas')?.append(routeTools);

 const keyDialog=document.createElement('dialog');
 keyDialog.className='route-return-dialog';
 keyDialog.innerHTML='<form id="fieldRouteKeyForm"><div class="sectionhead"><h2 id="fieldRouteKeyTitle"></h2><button id="fieldRouteKeyClose" type="button" class="secondary">Voltar</button></div><p id="fieldRouteKeyReview"></p><button type="button" id="fieldRouteKeyExceptions">Deixar vãos pendentes no mapa</button><p id="fieldRouteKeyFeedback" role="status"></p><button type="submit" class="primary" id="fieldRouteKeyDone">Concluir chave</button></form>';
 document.body.append(keyDialog);
 let keyReview=null,selection=null,selectionLayer=null,fieldSelectionLayer=null,googleSelectionLayers=[],anchorMode=null,spanPage=0,catalogCache={},spanPanelState=null;
 const spanPageSize=35;
 function routeCatalog(r){
  const group=groupOf(r),scope=group[0];
  if(catalogCache.items&&catalogCache.routes===state?.routes&&catalogCache.scope===scope)return catalogCache;
  const items=[],byId=new Map(),byBlock=new Map();
  for(const part of group)for(const span of part.spans){
   if(byId.has(span.id))continue;
   const block=M.blockCode(span.block);
   const item={span,routeId:part.id,block,index:items.length};
   items.push(item);byId.set(span.id,item);
   if(!byBlock.has(block))byBlock.set(block,[]);
   byBlock.get(block).push(item);
  }
  const oriented=scope?M.outletOrder(items.map(item=>item.span),scope.outlet):[];
  return catalogCache={scope,routes:state?.routes,items,byId,byBlock,oriented};
 }
 function pendingSpan(prior,active,spanId){
  return M.remaining(M.merge([...(prior.bySpan.get(spanId)||[]),...(active?.ranges[spanId]||[])]));
 }
 function pendingItems(r,block=null){
  const catalog=routeCatalog(r),prior=against(r),active=session();
  return (block===null?catalog.items:catalog.byBlock.get(block)||[]).filter(({span})=>pendingSpan(prior,active,span.id).length);
 }
 function closeKeyReview(){
  if(typeof keyDialog.close==='function')keyDialog.close();else keyDialog.removeAttribute('open');
 }
 function showKeyReview(code,excluded=new Set(),onField=false){
  const r=route(),active=session();
  if(!r||!active||!code)return;
  const pending=pendingItems(r,code),count=pending.filter(item=>!excluded.has(item.span.id)).length;
  const held=pending.length-count;
  keyReview={code,excluded,onField,sessionId:active.id};
  $('fieldRouteKeyTitle').textContent='Chave '+code;
  $('fieldRouteKeyReview').textContent=count+' vão(s) serão marcados nesta saída.'+(held?' '+held+' ficarão pendentes.':' Confirme se percorreu todos, inclusive as derivações.');
  $('fieldRouteKeyFeedback').textContent='';
  $('fieldRouteKeyDone').disabled=!count;
  $('fieldRouteKeyExceptions').disabled=!pending.length;
  if(!keyDialog.open){if(typeof keyDialog.showModal==='function')keyDialog.showModal();else keyDialog.setAttribute('open','');}
 }
 async function stageSpans(ids,sessionId){
  return transact(()=>{
   const r=route(),active=session();
   if(!r||active?.id!==sessionId)throw Error('A saída mudou. Abra a rota novamente.');
   const byId=routeCatalog(r).byId,prior=against(r),ranges={...active.ranges};
   let added=0;
   for(const id of ids){
    if(!byId.has(id))continue;
    const unused=pendingSpan(prior,active,id);
    if(!unused.length)continue;
    ranges[id]=M.merge([...(ranges[id]||[]),...unused]);added++;
   }
   if(!added)throw Error('Nenhum vão pendente na seleção.');
   return {...state,session:{...active,ranges}};
  },false);
 }
 $('fieldRouteKeyClose').onclick=closeKeyReview;
 $('fieldRouteKeys').onclick=event=>{
  const code=event.target.closest('[data-route-key]')?.dataset.routeKey;
  if(code)showKeyReview(code);
 };
 $('fieldRouteKeyForm').onsubmit=async event=>{
  event.preventDefault();
  const r=route(),review=keyReview,button=$('fieldRouteKeyDone');
  if(!r||!review||button.disabled)return;
  button.disabled=true;
  const ids=pendingItems(r,review.code).map(item=>item.span.id).filter(id=>!review.excluded.has(id));
  const saved=await stageSpans(ids,review.sessionId);
  if(saved){
   closeKeyReview();
   routeMessage('Chave '+review.code+' · '+ids.length+' vão(s) marcado(s) nesta saída.');
  }else{
   $('fieldRouteKeyFeedback').textContent=status.textContent;
   button.disabled=false;
  }
 };
 $('fieldRouteKeyExceptions').onclick=()=>{
  const review=keyReview;
  if(!review)return;
  closeKeyReview();
  startMapSelection(review,review.onField);
 };
 $('fieldRouteArea').onclick=()=>startMapSelection();
 function routeMessage(message){
  status.textContent=message;$('mapRouteStatus').textContent=message;
 }
 function showSelection(next){
  selection=next;
  if(next.onField)routeTools.append(mapTools);else $('fieldRouteMap').before(mapTools);
  paintMapSelection();
  if(!next.onField)mapTools.scrollIntoView?.({block:'start'});
 }
 function startMapSelection(review=null,onField=false,remove=false){
  const r=route(),active=session();
  if(!r||!active||(!onField&&!map))return;
  const candidates=remove?routeCatalog(r).items.filter(({span})=>active.ranges[span.id]?.length):pendingItems(r,review?.code??null);
  if(!candidates.length){routeMessage(remove?'Nenhum vão marcado nesta saída.':'Nenhum vão pendente nesta seleção.');return;}
  showSelection({sessionId:active.id,review,onField,remove,ids:new Set(review?.excluded),candidates,eligible:new Set(candidates.map(item=>item.span.id)),mode:'tap',vertices:[]});
 }
 function clearSelectionLayers(){
  selectionLayer?.remove();selectionLayer=null;fieldSelectionLayer?.remove();fieldSelectionLayer=null;
  for(const item of googleSelectionLayers)item.setMap(null);
  googleSelectionLayers=[];
 }
 function clearMapSelection(){
  selection=null;clearSelectionLayers();mapTools.hidden=true;paintRouteTools();
 }
 function paintMapSelection(message=''){
  if(!selection)return;
  const {mode,ids,candidates,vertices,review,remove,trail,onField}=selection,polygon=mode==='polygon';
  mapTools.hidden=false;paintRouteTools();
  $('fieldRouteTapMode').setAttribute('aria-pressed',String(!polygon));
  $('fieldRoutePolygonMode').setAttribute('aria-pressed',String(polygon));
  $('fieldRouteUndoVertex').hidden=!polygon||!vertices.length;
  $('fieldRoutePolygonApply').hidden=!polygon;
  $('fieldRoutePolygonApply').disabled=vertices.length<3;
  $('fieldRouteSelectionDone').textContent=review?'Revisar chave':remove?'Confirmar retirada':trail?'Confirmar trecho':'Marcar como feito';
  const count=trail?candidates.length-ids.size:ids.size;
  $('fieldRouteSelectionDone').disabled=!review&&!count||polygon&&vertices.length>0;
  const guide=polygon?'Toque para contornar a área e aplique o polígono.':trail?'Toque nos vãos que devem ficar pendentes.':remove||review?'Toque nos vãos para retirar.':'Toque nos vãos para marcar.';
  const detail=trail?count+' vão(s) no trecho · '+ids.size+' retirado(s). '+(selection.protectedCount?selection.protectedCount+' de ramais com chave mantidos pendentes. ':''):ids.size+' vão(s) selecionado(s). ';
  $('fieldRouteSelectionStatus').textContent=message||detail+guide;
  const color=review||remove?'#ff9c36':'#5b47db',leave='#ff9c36';
  const selectedPaths=[],excludedPaths=[];
  for(const {span} of candidates){
   if(trail)(ids.has(span.id)?excludedPaths:selectedPaths).push(span.line);
   else if(ids.has(span.id))selectedPaths.push(span.line);
  }
  clearSelectionLayers();
  const leaflet=([x,y])=>[y,x],target=onField?fieldMap:map;
  if(target){
   const group=L.featureGroup().addTo(target),style={interactive:false,pane:onField?'myInspectionRoute':'overlayPane'};
   if(onField)fieldSelectionLayer=group;else selectionLayer=group;
   for(const [paths,stroke]of [[selectedPaths,color],[excludedPaths,leave]])if(paths.length)L.polyline(paths.map(line=>line.map(leaflet)),{...style,color:stroke,weight:8,opacity:.95}).addTo(group);
   if(vertices.length>=3)L.polygon(vertices.map(leaflet),{...style,color:leave,weight:2,dashArray:'6 4',fillOpacity:.15}).addTo(group);
   else if(vertices.length===2)L.polyline(vertices.map(leaflet),{...style,color:leave,weight:2}).addTo(group);
  }
  if(onField&&typeof google!=='undefined'&&typeof googleMap!=='undefined'&&googleMap&&!$('googleMap').hidden){
   const googlePoint=([lng,lat])=>({lat,lng});
   for(const [paths,strokeColor]of [[selectedPaths,color],[excludedPaths,leave]])for(const line of paths)
    googleSelectionLayers.push(new google.maps.Polyline({map:googleMap,path:line.map(googlePoint),clickable:false,strokeColor,strokeWeight:8,zIndex:12}));
   if(vertices.length>=3)googleSelectionLayers.push(new google.maps.Polygon({map:googleMap,paths:vertices.map(googlePoint),clickable:false,strokeColor:leave,strokeWeight:2,fillOpacity:.15,zIndex:12}));
   else if(vertices.length===2)googleSelectionLayers.push(new google.maps.Polyline({map:googleMap,path:vertices.map(googlePoint),clickable:false,strokeColor:leave,strokeWeight:2,zIndex:12}));
  }
 }
 function routeSpanAt(point){
  const r=route();
  return r&&M.spanAtPoint(routeCatalog(r).items.map(item=>item.span),point,M.bufferMetres(r.buffer));
 }
 function selectRoutePoint(point){
  if(!selection||session()?.id!==selection.sessionId)return;
  if(selection.mode==='polygon'){
   if(selection.vertices.length>=80){paintMapSelection('Use até 80 pontos por polígono. Separe a área em duas seleções.');return;}
   if(selection.vertices.length&&M.distance(selection.vertices.at(-1),point)<.2)return;
   selection.vertices.push(point);paintMapSelection();return;
  }
  const span=routeSpanAt(point);
  if(!span||!selection.eligible.has(span.id)){paintMapSelection('Aproxime e toque perto do centro de um vão desta seleção.');return;}
  if(selection.ids.has(span.id))selection.ids.delete(span.id);else selection.ids.add(span.id);
  paintMapSelection();
 }
 for(const [id,mode]of [['fieldRouteTapMode','tap'],['fieldRoutePolygonMode','polygon']])$(id).onclick=()=>{
  if(!selection||mode===selection.mode)return;
  selection.mode=mode;selection.vertices=[];paintMapSelection();
 };
 $('fieldRouteUndoVertex').onclick=()=>{if(selection){selection.vertices.pop();paintMapSelection();}};
 $('fieldRoutePolygonApply').onclick=()=>{
  if(!selection||selection.vertices.length<3)return;
  const spans=M.spansInsideArea(selection.candidates.map(item=>item.span),selection.vertices);
  if(!spans.length){paintMapSelection('Nenhum vão elegível ficou inteiro dentro do polígono. Amplie o contorno ou toque no vão.');return;}
  for(const span of spans)selection.ids.add(span.id);
  selection.vertices=[];selection.mode='tap';paintMapSelection();
 };
 $('fieldRouteSelectionBack').onclick=()=>{
  const review=selection?.review;
  clearMapSelection();
  if(review)showKeyReview(review.code,review.excluded,review.onField);
 };
 $('fieldRouteSelectionDone').onclick=async()=>{
  const current=selection,button=$('fieldRouteSelectionDone');
  if(!current||button.disabled)return;
  if(current.review){clearMapSelection();showKeyReview(current.review.code,current.ids,current.review.onField);return;}
  const ids=current.trail?current.candidates.map(({span})=>span.id).filter(id=>!current.ids.has(id)):[...current.ids];
  if(current.remove&&!confirm('Retirar '+ids.length+' vão(s) desta saída e manter pendentes?'))return;
  if(current.trail&&!confirm('Confirmar a inspeção dos '+ids.length+' vão(s) selecionados neste trecho?'))return;
  button.disabled=true;
  const saved=current.remove?await transact(()=>{
   const active=session();
   if(active?.id!==current.sessionId)throw Error('A saída mudou. Abra a rota novamente.');
   const ranges={...active.ranges};
   for(const id of ids)delete ranges[id];
   return {...state,session:{...active,ranges}};
  },false):await stageSpans(ids,current.sessionId);
  if(saved){clearMapSelection();routeMessage(ids.length+' vão(s) '+(current.remove?'retirado(s) da saída.':'marcado(s) nesta saída. Confira e salve a saída.'));}
  else if(selection===current)paintMapSelection(status.textContent);
 };
 function startAnchor(mode){
  if(!session())return;
  clearMapSelection();anchorMode=mode;paintRouteTools();
  routeMessage(mode==='start'?'Toque no centro do primeiro vão que vai vistoriar.':'Toque no centro do último vão vistoriado.');
 }
 function trailCandidates(r,first,last){
  const catalog=routeCatalog(r),spans=catalog.items.map(item=>item.span);
  const path=M.networkTrail(spans,first,last);
  if(!path)return null;
  const pendingIds=new Set(pendingItems(r).map(({span})=>span.id)),held=new Set();
  const rooted=M.lateralKeySpans(catalog.oriented.filter(span=>span.feeder===path.spans[0].feeder),catalog.scope?.outlet);
  const candidates=[];
  let protectedBlock=null,previous=null;
  for(const span of path.spans){
   const item=catalog.byId.get(span.id);
   if(protectedBlock!==item.block)protectedBlock=null;
   if(!rooted&&path.junctions.has(span.id)&&previous&&item.block&&item.block!==previous.block)protectedBlock=item.block;
   if(pendingIds.has(span.id)){
    if(rooted?.has(span.id)||protectedBlock&&item.block===protectedBlock)held.add(span.id);
    else candidates.push(item);
   }
   previous=item;
  }
  return {candidates,protectedCount:held.size};
 }
 async function chooseAnchor(point){
  const active=session(),r=route(),mode=anchorMode,span=routeSpanAt(point);
  if(!r||!active||!mode)return;
  if(!span){routeMessage('Toque perto do centro de um vão da rota, longe de cruzamentos.');return;}
  if(mode==='start'){
   const saved=await transact(()=>({...state,session:{...session(),trailStart:{id:span.id,point}}}),false);
   if(saved){anchorMode=null;paintRouteTools();paintAnchorMarker();routeMessage('Início no vão '+span.id+'. Ao terminar o trecho, marque o último vão.');}
   else routeMessage(status.textContent);
   return;
  }
  const proposal=trailCandidates(r,active.trailStart?.id,span.id);
  if(!proposal){routeMessage('O início e o fim não têm uma ligação única. Divida o percurso em trechos menores.');return;}
  if(!proposal.candidates.length){routeMessage('Sem vãos pendentes neste trajeto. Para ramais com chave, abra a chave no mapa ou na lista.');return;}
  anchorMode=null;paintRouteTools();
  showSelection({sessionId:active.id,onField:true,trail:true,ids:new Set(),mode:'tap',vertices:[],
   ...proposal,eligible:new Set(proposal.candidates.map(item=>item.span.id))});
 }
 let fieldAnchorMarker=null,googleAnchorMarker=null;
 function paintAnchorMarker(){
  const start=session()?.trailStart,point=start?.point;
  if(typeof fieldMap!=='undefined'&&fieldMap){
   if(point){
    if(fieldAnchorMarker)fieldAnchorMarker.setLatLng([point[1],point[0]]);
    else fieldAnchorMarker=L.circleMarker([point[1],point[0]],{pane:'myInspectionRoute',radius:8,weight:2,color:'#fff',fillColor:'#285ad4',fillOpacity:1,interactive:false}).bindTooltip('Início da vistoria').addTo(fieldMap);
   }else if(fieldAnchorMarker){fieldAnchorMarker.remove();fieldAnchorMarker=null;}
  }
  if(typeof google!=='undefined'&&typeof googleMap!=='undefined'&&googleMap){
   if(point){
    const coords={lat:point[1],lng:point[0]};
    if(googleAnchorMarker)googleAnchorMarker.setPosition(coords);
    else googleAnchorMarker=new google.maps.Marker({map:googleMap,position:coords,title:'Início da vistoria',clickable:false,label:'I'});
   }else if(googleAnchorMarker){googleAnchorMarker.setMap(null);googleAnchorMarker=null;}
  }
 }
 function paintRouteTools(){
  const r=route(),active=session(),reviewing=Boolean(selection?.onField);
  routeTools.hidden=!r;
  $('mapRouteStart').hidden=Boolean(active);
  $('mapRouteStart').disabled=$('fieldRouteStart').disabled;
  $('mapTrailStart').hidden=!active||Boolean(anchorMode)||reviewing;
  $('mapTrailStart').textContent=active?.trailStart?'Mudar início':'Marcar início';
  $('mapTrailEnd').hidden=!active?.trailStart||Boolean(anchorMode)||reviewing;
  $('mapRouteExclude').hidden=!active||!Object.keys(active.ranges).length||Boolean(anchorMode)||reviewing;
  $('mapRouteFinish').hidden=!active||Boolean(anchorMode)||reviewing;
  $('mapTrailCancel').hidden=!anchorMode;
 }
 $('mapTrailStart').onclick=()=>startAnchor('start');
 $('mapTrailEnd').onclick=()=>startAnchor('end');
 $('mapTrailCancel').onclick=()=>{anchorMode=null;paintRouteTools();routeMessage('Seleção cancelada.');};
 $('mapRouteExclude').onclick=()=>startMapSelection(null,true,true);
 $('mapRouteStart').onclick=async()=>{if(await beginRoute())startAnchor('start');};
 $('mapRouteFinish').onclick=()=>void finishRoute(true);
 const identity=()=>window.CampoAccount?.current()?.id;
 const orderedRoutes=routes=>M.campaignParts(routes).flat();
 const groupOf=r=>r?M.campaignParts(state.routes).find(parts=>parts.includes(r))||[r]:[];
 function resumeRoute(){
  const routes=orderedRoutes(state?.routes||[]);
  return routes.find(r=>r.spans.some(s=>M.remaining(against(r).bySpan.get(s.id)).length))?.id||routes[0]?.id||null;
 }
 const blank=()=>({routes:[],visits:[],outbox:[],session:null});
 const coverageCache=new WeakMap();
 async function save(next){
  const actor=owner,version=state?.version||0;
  if(!actor||identity()!==actor)throw Error('Entre com a conta da vistoria.');
  const connection=await openFieldDatabase(),key=dbKey+':'+actor;
  next.version=version+1;
  await new Promise((resolve,reject)=>{
   const tx=connection.transaction('meta','readwrite'),store=tx.objectStore('meta'),get=store.get(key);
   let conflict=false;
   get.onsuccess=()=>{
    if(identity()!==actor||(get.result?.version||0)!==version){conflict=true;tx.abort();return;}
    store.put(next,key);
   };
   tx.oncomplete=resolve;
   tx.onabort=()=>reject(Error(conflict?'Outra aba atualizou a rota. Reabra Minhas rotas para continuar.':'Não foi possível salvar a rota no aparelho.'));
  });
 }
 async function boot(force=false){
  const next=identity();
  if(!next){owner=null;state=null;selected=null;currentGPS=null;paint();return;}
  if(owner===next&&state&&!force)return;
  const turn=++loadEpoch;
  const saved=await req('meta','readonly',store=>store.get(dbKey+':'+next));
  if(turn!==loadEpoch||identity()!==next)return;
  const last=owner===next?selected:null;
  owner=next;state=saved||blank();selected=state.session?.routeId||(state.routes.some(r=>r.id===last)?last:resumeRoute())||null;currentGPS=null;
  paint();
 }
 function against(route){
  const catalog=routeCatalog(route),cached=coverageCache.get(catalog);
  if(cached?.visits===state.visits&&cached?.outbox===state.outbox)return cached.coverage;
  const ids=new Set(groupOf(route).map(part=>part.id));
  const visits=[...state.visits,...state.outbox].filter(visit=>ids.has(visit.routeId));
  const coverage=M.coverage(catalog.items.map(item=>item.span),visits);
  coverageCache.set(catalog,{visits:state.visits,outbox:state.outbox,coverage});
  return coverage;
 }
 const route=()=>state?.routes.find(r=>r.id===selected);
 const session=()=>state?.session?.routeId===selected?state.session:null;
 function marks(){
  const active=session();return active?Object.entries(active.ranges).flatMap(([spanId,items])=>items.map(([start,end])=>({spanId,start,end}))):[];
 }
 async function loadRemote(){
  if(!state||!navigator.onLine||refreshing||busy||sampleWrite||!window.CampoAccount?.verified())return;
  refreshing=true;
  const actor=owner;
  try{
   const removed=new Set();
   for(const visit of state.outbox){
    try{await fieldRouteApi('/api/routes/visit',visit);}
    catch(error){if(error.status!==410)throw error;removed.add(visit.id);}
    if(owner!==actor||identity()!==actor)return;
   }
   const remote=await fieldRouteApi('/api/routes?mine=1');
   if(owner!==actor||identity()!==actor)return;
   const receipts=new Set(remote.visits.map(v=>v.id)),active=state.session;
   const next={...state,routes:remote.routes,visits:remote.visits,outbox:state.outbox.filter(v=>!receipts.has(v.id)&&!removed.has(v.id)),session:active&&!remote.deletedIds?.includes(active.routeId)?active:null};
   await save(next);state=next;
   const hadRoute=Boolean(route());
   if(!hadRoute)selected=state.session?.routeId||resumeRoute();
   paint(!hadRoute);status.textContent=removed.size?'Rota de homologação removida pela gestão.':state.outbox.length?'Ainda há conclusões pendentes de confirmação.':'Rotas atualizadas. Conclusões recebidas pelo painel.';
  }catch(error){status.textContent=error.message+' Os dados locais continuam salvos.';}finally{refreshing=false;}
 }
 async function fieldRouteApi(url,body){
  const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout?.(15000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Object.assign(Error(data?.error||'Não foi possível falar com o painel.'),{status:response.status});
  return data;
 }
 function paintSpanDetails(r,prior=r?against(r):null,active=session()){
  if(!r||!spanDetails.open){spanList.replaceChildren();return;}
  const catalog=routeCatalog(r),select=$('fieldRouteSpanGroup'),scope=catalog.scope?.id;
  if(spanPanelState!==catalog){
   const previous=spanPanelState?.scope?.id===scope?select.value:null;
   spanPanelState=catalog;
   select.replaceChildren(...[...catalog.byBlock.keys()].map(block=>new Option(block||'Sem chave',block)));
   select.value=previous!==null&&catalog.byBlock.has(previous)?previous:select.options[0]?.value||'';
   spanPage=0;
  }
  const items=catalog.byBlock.get(select.value)||[],pages=Math.max(1,Math.ceil(items.length/spanPageSize));
  spanPage=Math.min(spanPage,pages-1);
  $('fieldRouteSpanPages').hidden=pages===1;
  $('fieldRouteSpanPrev').disabled=!spanPage;
  $('fieldRouteSpanNext').disabled=spanPage===pages-1;
  $('fieldRouteSpanPage').textContent=(spanPage+1)+' / '+pages;
  spanList.innerHTML=items.slice(spanPage*spanPageSize,(spanPage+1)*spanPageSize).map(({span:s,index:i})=>{
   const picked=active?.ranges[s.id]||[],missing=pendingSpan(prior,active,s.id);
   const label=missing.length?(active?.gpsMatches?.[s.id]?.length?'GPS sugeriu cobertura':'A vistoriar'):(picked.length?'Marcado nesta saída':'Confirmado');
   const dir=(a,b)=>s.reverse?[M.FULL-b,M.FULL-a]:[a,b];
   return `<li><b>${esc(s.id)}</b> · ${s.metres.toLocaleString('pt-BR')} m · ${label}
   ${active&&missing.length?missing.map(([a,b])=>{const [x,y]=dir(a,b);return ` <button type="button" data-route-range="${i},${a},${b}">Marcar ${x/100}%–${y/100}%</button>`;}).join('')+` <button type="button" data-route-part="${i}">Marcar parte</button>`:''}
   ${picked.length?` <button type="button" data-route-clear="${i}">Desmarcar</button>`:''}</li>`;
  }).join('');
 }
 spanDetails.ontoggle=()=>paintSpanDetails(route());
 $('fieldRouteSpanGroup').onchange=()=>{spanPage=0;paintSpanDetails(route());};
 $('fieldRouteSpanPrev').onclick=()=>{spanPage=Math.max(0,spanPage-1);paintSpanDetails(route());};
 $('fieldRouteSpanNext').onclick=()=>{spanPage++;paintSpanDetails(route());};
 function paintGpsSummary(r,active,prior){
  const hint=$('fieldRouteGPSHint'),button=$('fieldRouteConfirmGPS');
  if(!hint||!button)return;
  const suggested=r&&active?gpsRanges(r,active,prior):[];
  const amount=suggested.length?M.coverage(r.spans,[{ranges:suggested}]).metres:0;
  hint.hidden=!active;button.hidden=!amount;
  hint.textContent=amount?km(amount)+' de rede sugeridos pelo GPS. Revise antes de confirmar.':active?'GPS ativo durante a saída.':'';
  if(active)hint.textContent+=' · '+km(M.trailMetres(active.trails))+' de trilha GPS';
 }
 function paint(fit=true){
  const r=route(),active=session();
  if(selection&&selection.sessionId!==active?.id)clearMapSelection();
  if(!active)anchorMode=null;
  $('fieldRouteSelect').replaceChildren(new Option('Selecione uma rota',''));
  for(const item of orderedRoutes(state?.routes||[]))$('fieldRouteSelect').add(new Option(item.name+' · '+item.feeder+(item.homologation?' · Homologação':''),item.id));
  $('fieldRouteSelect').value=r?.id||'';
  $('fieldRouteSelect').disabled=Boolean(state?.session);
  const prior=r?against(r):null;
  const catalog=routeCatalog(r),spans=catalog.items.map(item=>item.span);
  const completed=r&&r.spans.every(s=>!M.remaining(prior.bySpan.get(s.id)).length);
  const campaignComplete=r&&spans.every(s=>!M.remaining(prior.bySpan.get(s.id)).length);
  $('fieldRouteStart').disabled=!r||campaignComplete||Boolean(state?.session);
  $('fieldRouteFinal').hidden=!active;
  $('fieldRouteQueue').textContent=(state?.outbox.length||0)+' conclusão(ões) pendente(s) de envio';
  const group=groupOf(r);
  const keys=new Set(group.map(part=>part.id));
   const pendingReturn=r&&state?.outbox.some(visit=>keys.has(visit.routeId));
   returnButton.hidden=!r;returnButton.disabled=!r||Boolean(active)||pendingReturn||busy||refreshing;
   returnButton.title=active?'Finalize a saída antes de devolver.':pendingReturn?'Sincronize a conclusão pendente antes de devolver.':'';
  const covered=prior||M.coverage([],[]),buffer=r?M.bufferMetres(r.buffer):0;
  const total=M.metres(spans),marked=M.coverage(spans,[{ranges:marks()}]).metres;
  const pending=spans.length?spans.filter(span=>pendingSpan(covered,active,span.id).length):[];
  const pendingIds=new Set(pending.map(span=>span.id));
  spanDetails.hidden=!r;
  keyPanel.hidden=!r;
  $('fieldRouteArea').hidden=!active||!pending.length;
  const blocks=[...catalog.byBlock].filter(([code])=>code);
  $('fieldRouteKeys').innerHTML=blocks.map(([code,items])=>{
   const left=items.filter(({span})=>pendingIds.has(span.id)).length;
   const text=left?left+' / '+items.length+' pendentes':'Feita';
   return '<button type="button" data-route-key="'+esc(code)+'" '+(!active||!left?'disabled':'')+'><strong>'+esc(code)+'</strong><small>'+text+'</small></button>';
  }).join('')||'<p>Sem NAME_BLOCO nesta rota. Selecione a rede percorrida no mapa.</p>';
  const unkeyed=(catalog.byBlock.get('')||[]).filter(({span})=>pendingIds.has(span.id)).length;
  $('fieldRouteArea').textContent='Selecionar vãos ou área no mapa'+(unkeyed?' · '+unkeyed+' sem chave':'');
  const estimate=r?M.metres(r.spans.filter(s=>s.estimated)):0;
  const street=$('fieldRouteStreet'),legend=$('fieldRouteMapLegend');
  if(street)street.hidden=!r;
  if(legend){legend.hidden=!r;legend.textContent=r?'Minha rota · '+km(total)+' de rede · azul: faixa de '+buffer+' m por lado · verde: confirmado':'';}
  if(r&&street){
   const paths=M.pendingPaths(catalog.oriented.filter(span=>catalog.byId.get(span.id).routeId===r.id),prior.bySpan,active?.ranges),stops=M.roadStops(paths);
   const signature=r.id+'|'+stops.map(p=>p.join(',')).join('|');
   if(signature!==lastRoadSignature){roadLeg=0;lastRoadSignature=signature;}
   const firstDeparture=!covered.metres&&!active&&r.outlet;
   const next=stops[0],start=firstDeparture||next||M.first(r.spans[0]);
   $('fieldRouteNavigate').textContent=firstDeparture?'Navegar à saída da subestação':next?'Navegar ao próximo ponto':'Navegar ao início';
   $('fieldRouteNavigate').href=M.streetDirections(start);
   const leg=stops.slice(roadLeg,roadLeg+5),trip=$('fieldRouteRoadTrip'),advance=$('fieldRouteRoadNext');
   trip.hidden=leg.length<2;
   if(leg.length>=2){
    trip.href=M.streetDirections(leg.at(-1),leg[0],leg.slice(1,-1));
    trip.textContent='Trajeto por ruas · '+(Math.floor(roadLeg/4)+1)+'/'+Math.ceil((stops.length-1)/4);
   }
   if(advance)advance.hidden=stops.length<=5;
  }
  const routeKey=group.map(part=>part.id).join('|');
  if(routeKey!==coverageInput.routeKey||catalog!==coverageInput.catalog||active?.ranges!==coverageInput.ranges||state?.visits!==coverageInput.visits||state?.outbox!==coverageInput.outbox){
   const scopeSame=routeKey===coverageInput.routeKey&&catalog===coverageInput.catalog;
   coverageInput={routeKey,catalog,ranges:active?.ranges,visits:state?.visits,outbox:state?.outbox};
   routeGeometry=r?{...M.mapLines(spans,covered.bySpan,active?.ranges),buffer:scopeSame&&routeGeometry?routeGeometry.buffer:M.bufferRings(spans,buffer)}:null;
  }
  refreshFieldOverlay();paintRouteTools();
  $('fieldRouteSummary').textContent=r?(r.campaign?.name||r.name)+' · '+km(total)+' planejados · '+km(covered.metres)+' confirmados'+(marked?' · '+km(marked)+' marcados nesta saída':'')+' · '+km(Math.max(0,total-covered.metres-marked))+' pendentes na rota'+(group.length>1?' · parte '+(group.indexOf(r)+1)+'/'+group.length:''):'Baixe suas rotas com internet antes de sair.';
  if(r?.plan){
   const targets=M.schedule(r.plan,total),current=M.day(Date.now()),target=targets.find(item=>item.day===current);
   if(target)$('fieldRouteSummary').textContent+=' · meta de hoje '+km(target.metres);
   if(targets.length)$('fieldRouteSummary').textContent+=' · concluir até '+targets.at(-1).day.split('-').reverse().join('/');
  }
  if(covered.sharedMetres)$('fieldRouteSummary').textContent+=' · '+km(covered.sharedMetres)+' confirmados em vãos compartilhados';
  const nextPart=group.find(part=>part!==r&&part.spans.some(s=>M.remaining(covered.bySpan.get(s.id)).length));
  const move=$('fieldRouteNextPart');
  if(move){move.hidden=!completed||!nextPart||Boolean(active);move.dataset.target=nextPart?.id||'';}
  paintGpsSummary(r,active,prior);
  paintSpanDetails(r,prior,active);
  if(estimate)$('fieldRouteSummary').textContent+=' · '+km(estimate)+' estimados pela geometria nesta parte';

  if(!panel.hidden)paintMap(r,fit);
 }
 function drawLeaflet(target,geometry,pane){
  const group=L.featureGroup().addTo(target),style={pane,interactive:false};
  if(geometry.buffer.length&&typeof L.polygon==='function')L.polygon(geometry.buffer.map(ring=>[ring.map(([lon,lat])=>[lat,lon])]),{...style,stroke:false,fillColor:'#167da3',fillOpacity:.23,fillRule:'nonzero'}).addTo(group);
  for(const [key,color] of [['pending',M.pendingColor],['confirmed',M.confirmedColor]]){
   if(!geometry[key].length)continue;
   const lines=geometry[key].map(line=>line.map(([lon,lat])=>[lat,lon]));
   L.polyline(lines,{...style,color:M.haloColor,weight:14,opacity:.82}).addTo(group);
   L.polyline(lines,{...style,color,weight:7,opacity:1}).addTo(group);
  }
  return group;
 }
 function refreshFieldOverlay(){
  if(typeof fieldMap!=='undefined'&&fieldMap&&!fieldMap.getPane('myInspectionRoute'))fieldMap.createPane('myInspectionRoute').style.zIndex='455';
  if(routeGeometry&&$('inspect').hidden){
   fieldOverlay?.group?.remove();fieldOverlay=null;
   for(const overlay of googleOverlay?.layers||[])overlay.setMap(null);
   googleOverlay=null;
   return;
  }
  if(typeof fieldMap!=='undefined'&&fieldMap&&fieldOverlay?.geometry!==routeGeometry){
   fieldOverlay?.group?.remove();
   fieldOverlay={geometry:routeGeometry,group:routeGeometry?drawLeaflet(fieldMap,routeGeometry,'myInspectionRoute'):null};
  }
  if(typeof google!=='undefined'&&typeof googleMap!=='undefined'&&googleMap&&googleOverlay?.geometry!==routeGeometry){
   for(const overlay of googleOverlay?.layers||[])overlay.setMap(null);
   const layers=[];
   if(routeGeometry){
    if(routeGeometry.buffer.length){
     const corridor=new google.maps.Data({map:googleMap});
     corridor.addGeoJson({type:'Feature',geometry:{type:'MultiPolygon',coordinates:routeGeometry.buffer.map(ring=>[ring])},properties:{}});
     corridor.setStyle({clickable:false,fillColor:'#167da3',fillOpacity:.23,strokeWeight:0,zIndex:9});layers.push(corridor);
    }
    for(const halo of [true,false]){
     const overlay=new google.maps.Data({map:googleMap});
     overlay.addGeoJson({type:'FeatureCollection',features:Object.entries(routeGeometry).filter(([key,lines])=>key!=='buffer'&&lines.length).map(([key,lines])=>({type:'Feature',geometry:{type:'MultiLineString',coordinates:lines},properties:{key}}))});
     overlay.setStyle(feature=>({clickable:false,strokeColor:halo?M.haloColor:feature.getProperty('key')==='confirmed'?M.confirmedColor:M.pendingColor,strokeWeight:halo?14:7,strokeOpacity:halo ? .82 : 1,zIndex:halo?10:11}));
     layers.push(overlay);
    }
   }
   googleOverlay={geometry:routeGeometry,layers};
  }
  paintAnchorMarker();
 }
 window.CampoFieldRouteMap={
  refresh:refreshFieldOverlay,
  span:routeSpanAt,
  consume(point){
   if(anchorMode){void chooseAnchor(point);return true;}
   if(selection?.onField){selectRoutePoint(point);return true;}
   return false;
  },
  keyReady(code){return Boolean(session()&&code&&pendingItems(route(),code).length);},
  openKey(code){
   if(typeof setMapFullscreen==='function')setMapFullscreen(true);
   showKeyReview(code,new Set(),true);
  },
  closeTools(){anchorMode=null;if(selection?.onField)clearMapSelection();else paintRouteTools();}
 };
 $('fieldRouteOpenMap')?.addEventListener('click',()=>{
  if(!route()||typeof view!=='function'||typeof fieldMap==='undefined'||!fieldMap)return;
  view('inspect');
  if($('inspect').hidden)return;
  setMapFullscreen(true);
  setTimeout(()=>{
   fieldMap.invalidateSize();refreshFieldOverlay();
   const bounds=fieldOverlay?.group?.getBounds();
   if(!bounds?.isValid())return;
   fieldMap.fitBounds(bounds,{padding:[45,55],maxZoom:18});
   if(typeof google!=='undefined'&&typeof googleMap!=='undefined'&&googleMap&&!$('googleMap').hidden){
    googleMap.fitBounds({west:bounds.getWest(),east:bounds.getEast(),south:bounds.getSouth(),north:bounds.getNorth()},55);
   }
   requestNetworkView();
  },80);
 });
 function paintMap(r,fit){
  if(typeof L==='undefined')return;
  const target=$('fieldRouteMap');target.hidden=!r;
  if(!r){layer?.remove();mapScope?.group.remove();mapScope=null;layer=null;return;}
  if(!map){
   map=L.map(target,{preferCanvas:true}).setView([-9.97,-67.81],13);
   L.control.scale({imperial:false}).addTo(map);
   map.on('click',event=>selectRoutePoint([event.latlng.lng,event.latlng.lat]));
  }
  if(navigator.onLine&&!scopeTiles&&typeof L.tileLayer==='function')scopeTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  else if(!navigator.onLine&&scopeTiles){scopeTiles.remove();scopeTiles=null;}
  map.invalidateSize();
  if(mapScope?.geometry!==routeGeometry){mapScope?.group.remove();mapScope={geometry:routeGeometry,group:drawLeaflet(map,routeGeometry,'overlayPane')};}
  layer?.remove();layer=L.featureGroup().addTo(map);
  for(const [name,p]of r.outlet?[['Saída da subestação',r.outlet]]:[['Início',M.first(r.spans[0])],['Fim',M.last(r.spans.at(-1))]])L.circleMarker([p[1],p[0]],{radius:6}).addTo(layer).bindTooltip(name,{permanent:true});
  const prior=against(r),active=session();
  for(const [code,items] of routeCatalog(r).byBlock){
   if(!code)continue;
   const first=M.first(items[0].span),closed=items.every(({span})=>!pendingSpan(prior,active,span.id).length);
   L.circleMarker([first[1],first[0]],{radius:7,color:closed?M.confirmedColor:'#174993',fillOpacity:.95}).addTo(layer)
    .bindTooltip(esc(code)).on('click',()=>{
     if(!selection&&session()&&!closed)showKeyReview(code);
    });
  }
  if(currentGPS)L.circleMarker([currentGPS.lat,currentGPS.lon],{radius:5,color:'#1a5fb4'}).addTo(layer);
  for(const trail of session()?.trails||[])if(trail.length>1)L.polyline(trail,{color:'#265fc2',weight:2,opacity:.7}).addTo(layer);
  if(fit&&mapScope.group.getBounds().isValid())map.fitBounds(mapScope.group.getBounds(),{padding:[25,25],maxZoom:18});
 }
 async function transact(fn,fit=true){
  if(!state)return false;
  if(busy||refreshing||sampleWrite){status.textContent='Aguarde a atualização em andamento e tente novamente.';return false;}
  busy=true;
  let saved=false;
  try{const next=fn();if(next){await save(next);state=next;saved=true;paint(fit);}}
  catch(error){status.textContent=error.message;}finally{busy=false;}
  return saved;
 }
 function beginRoute(){
  return transact(()=>{
   const r=route();if(!r||state.session)return;
   currentGPS=null;
   if(typeof startLiveGPS==='function')startLiveGPS();
   routeMessage('Vistoria iniciada. Marque o primeiro vão no mapa ou use a lista de chaves.');
   return {...state,session:{id:crypto.randomUUID(),routeId:r.id,startedAt:new Date().toISOString(),ranges:{},gpsMatches:{},trails:[],lastSampleAt:0}};
  });
 }
 $('fieldRouteStart').onclick=()=>void beginRoute();
 function visitBatches(r,active,ranges,reason){
  const {id,routeId,startedAt,trails}=active,endedAt=new Date().toISOString(),day=M.day(endedAt);
  const trackMetres=Math.round(M.trailMetres(trails)),byPart=new Map([[routeId,[]]]),catalog=routeCatalog(r);
  for(const range of ranges){
   const item=catalog.byId.get(range.spanId);
   if(!item)throw Error('Um vão marcado saiu da rota. Confira a atribuição antes de salvar.');
   if(!byPart.has(item.routeId))byPart.set(item.routeId,[]);
   byPart.get(item.routeId).push(range);
  }
  const visits=[];
  for(const [part,items] of byPart){
   if(!items.length&&ranges.length&&!trackMetres)continue;
   for(let offset=0;offset<Math.max(1,items.length);offset+=750){
    visits.push({id:visits.length?crypto.randomUUID():id,routeId:part,startedAt,endedAt,day,
     trackMetres:part===routeId&&offset===0?trackMetres:0,ranges:items.slice(offset,offset+750),
     reason:reason||(!items.length?'Trilha GPS da saída.':'')});
   }
  }
  return visits;
 }
 $('fieldRouteFinal').onclick=()=>finishRoute();
 async function finishRoute(fromMap=false){
  if(!session())return;
  if(selection||anchorMode){routeMessage('Confirme ou cancele a seleção antes de salvar a saída.');return;}
  const ranges=marks();
  if(fromMap&&!ranges.length&&session().trailStart){startAnchor('end');return;}
  if(!confirm(ranges.length||session().keysSaved?'Salvar a saída com a cobertura marcada?':'Finalizar sem cobertura confirmada?'))return;
  const reason=$('fieldRouteReason').value.trim()||(!ranges.length&&session().keysSaved?'Vistoria por chave registrada durante a saída.':'');
  if(!ranges.length&&!reason){routeMessage('Informe por que a saída terminou sem cobertura em Minhas rotas.');return;}
  const saved=await transact(()=>{
   const visits=visitBatches(route(),session(),ranges,reason);
   return {...state,session:null,outbox:[...state.outbox,...visits]};
  });
  if(!saved){if(fromMap)routeMessage(status.textContent);return;}
  $('fieldRouteReason').value='';
  routeMessage('Vistoria salva no aparelho. Aguardando confirmação do painel.');
  void loadRemote();
 };
  const closeReturnDialog=()=>{if(typeof returnDialog.close==='function')returnDialog.close();else returnDialog.removeAttribute('open');$('fieldRouteReturnAdminPassword').value='';};
  const showReturnDialog=()=>{if(typeof returnDialog.showModal==='function')returnDialog.showModal();else returnDialog.setAttribute('open','');};
  $('fieldRouteReturnClose').onclick=closeReturnDialog;
  $('fieldRouteReturnReason').onchange=e=>{
   const protectedReason=e.target.value==='homologacao',admin=$('fieldRouteReturnAdmin');admin.hidden=!protectedReason;
   $('fieldRouteReturnAdminLogin').required=protectedReason;$('fieldRouteReturnAdminPassword').required=protectedReason;
   if(!protectedReason)$('fieldRouteReturnAdminPassword').value='';
  };
  returnButton.onclick=()=>{
   const r=route(),group=groupOf(r),ids=new Set(group.map(part=>part.id));
   if(!r)return;
   if(!navigator.onLine){status.textContent='Conecte-se à internet para devolver a rota.';return;}
   if(session()){status.textContent='Finalize a saída atual antes de devolver a rota.';return;}
   if(state.outbox.some(visit=>ids.has(visit.routeId))){status.textContent='Sincronize a conclusão pendente antes de devolver a rota.';return;}
   $('fieldRouteReturnForm').reset();$('fieldRouteReturnAdmin').hidden=true;$('fieldRouteReturnFeedback').textContent='';
   const account=window.CampoAccount?.current?.()||{};$('fieldRouteReturnAdminLogin').value=account.role==='admin'?(account.username||account.email||''):'';
   showReturnDialog();
  };
  $('fieldRouteReturnForm').onsubmit=async e=>{
   e.preventDefault();const r=route();if(!r||busy||refreshing)return;
   const reasonCode=$('fieldRouteReturnReason').value,note=$('fieldRouteReturnNote').value.trim(),feedback=$('fieldRouteReturnFeedback');
   if(reasonCode==='outro'&&!note){feedback.textContent='Descreva o outro motivo.';return;}
   if(!navigator.onLine){feedback.textContent='Conecte-se à internet para devolver a rota.';return;}
   if(!confirm('Confirma a devolução desta rota para a gestão?'))return;
   busy=true;returnButton.disabled=true;feedback.textContent='Validando e devolvendo…';
   try{
    const body={id:crypto.randomUUID(),routeId:r.id,reasonCode,note};
    if(reasonCode==='homologacao'){body.adminLogin=$('fieldRouteReturnAdminLogin').value.trim();body.adminPassword=$('fieldRouteReturnAdminPassword').value;}
    await fieldRouteApi('/api/routes/return',body);
    const scope=r.campaign?.id||r.id,next={...state,routes:state.routes.filter(item=>(item.campaign?.id||item.id)!==scope)};
    await save(next);state=next;selected=resumeRoute();closeReturnDialog();paint();status.textContent='Rota devolvida para a gestão.';
   }catch(error){feedback.textContent=error.message;}finally{busy=false;$('fieldRouteReturnAdminPassword').value='';paint(false);}
  };
 function gpsRanges(r,active,prior){
  return r.spans.flatMap(span=>{
   const done=M.merge([...(prior.bySpan.get(span.id)||[]),...(active.ranges[span.id]||[])]);
   return M.remaining(done).flatMap(([a,b])=>(active.gpsMatches?.[span.id]||[]).map(([c,d])=>({spanId:span.id,start:Math.max(a,c),end:Math.min(b,d)})).filter(range=>range.start<range.end));
  });
 }
 $('fieldRouteConfirmGPS')?.addEventListener('click',()=>void transact(()=>{
  const r=route(),active=session();if(!r||!active)return;
  const suggested=gpsRanges(r,active,against(r));
  if(!suggested.length||!confirm('Confirma que vistoriou todos os trechos sugeridos pelo GPS?'))return;
  const ranges={...active.ranges};
  for(const {spanId,start,end} of suggested)ranges[spanId]=M.merge([...(ranges[spanId]||[]),[start,end]]);
  return {...state,session:{...active,ranges}};
 }));
 $('fieldRouteNextPart')?.addEventListener('click',e=>{if(e.target.dataset.target&&!state.session){selected=e.target.dataset.target;paint();}});
 $('fieldRouteRoadNext')?.addEventListener('click',()=>{
  const r=route();if(!r)return;
  const stops=M.roadStops(M.pendingPaths(r.spans,against(r).bySpan,session()?.ranges));
  roadLeg=roadLeg+5<stops.length?roadLeg+4:0;paint(false);
 });
 $('fieldRouteItems').onclick=e=>void transact(()=>{
  const active=session(),r=route();if(!active||!r)return;
  const data=e.target.dataset,raw=data.routeRange?.split(','),idx=Number(raw?.[0]??data.routePart??data.routeClear),s=routeCatalog(r).items[idx]?.span;if(!s)return;
  const ranges={...active.ranges};
  if(data.routeClear!==undefined){if(!confirm('Retirar o vão '+s.id+' desta saída?'))return;delete ranges[s.id];}
  else{
   let segment=raw?.slice(1).map(Number);
   if(!segment){
    const text=prompt('Informe início e fim, de 0 a 100% no sentido da rota. Exemplo: 25-70');
    if(text===null)return;
    const values=/^\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*-\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*$/.exec(text);
    if(!values)throw Error('Use o formato 25-70.');
    const [a,b]=values.slice(1).map(x=>Math.round(Number(x.replace(',','.'))*100));
    if(a>=b||b>M.FULL)throw Error('O início deve ser menor que o fim, entre 0% e 100%.');
    segment=s.reverse?[M.FULL-b,M.FULL-a]:[a,b];
   }
   const unused=M.remaining(against(r).bySpan.get(s.id)).map(([a,b])=>[Math.max(a,segment[0]),Math.min(b,segment[1])]).filter(([a,b])=>a<b);
   if(!unused.length){status.textContent='Essa parte já está confirmada.';return;}
   ranges[s.id]=M.merge([...(ranges[s.id]||[]),...unused]);
  }
  return {...state,session:{...active,ranges}};
 });
 $('fieldRouteSelect').onchange=e=>{selected=e.target.value;currentGPS=null;paint();};
 $('fieldRouteSync').onclick=()=>void boot(true).then(loadRemote).catch(error=>{status.textContent=error.message;});
 document.querySelector('[data-view="fieldRoutes"]').addEventListener('click',()=>void boot(true).then(()=>{paint();return loadRemote();}).catch(e=>{status.textContent=e.message;}));
 window.addEventListener('online',()=>void loadRemote());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!panel.hidden)void loadRemote();});
 setInterval(()=>{if(!document.hidden&&!panel.hidden)void loadRemote();},60000);
 window.addEventListener('campo-account-changed',()=>{if(identity()!==owner||state?.outbox.length)void boot().then(loadRemote).catch(e=>{status.textContent=e.message;});});
 window.addEventListener('campo-route-gps',e=>{
  const active=session(),p=e.detail,at=Date.parse(p.timestamp);
  if(!active||identity()!==owner||busy||refreshing||sampleWrite||!Number.isFinite(at)||p.accuracy>35||at-active.lastSampleAt<6000)return;
  let trails=active.trails,prev=trails.at(-1)?.at(-1);
  const point=[p.lat,p.lon];
  if(trails.reduce((n,part)=>n+part.length,0)>=3000)return;
  if(!prev||at-active.lastSampleAt>25000||M.distance([prev[1],prev[0]],[point[1],point[0]])>200)trails=[...trails,[point]];
  else trails=[...trails.slice(0,-1),[...trails.at(-1),point]];
  const gpsMatches={...active.gpsMatches};
  if(prev&&p.accuracy<=25&&active.lastAccuracy<=25&&at-active.lastSampleAt<=25000){
   for(const {spanId,ranges} of M.matchedRanges(route().spans,[prev[1],prev[0]],[p.lon,p.lat]))gpsMatches[spanId]=M.merge([...(gpsMatches[spanId]||[]),...ranges]);
  }
  const next={...state,session:{...active,trails,gpsMatches,lastSampleAt:at,lastAccuracy:p.accuracy}};
  const actor=owner;
  sampleWrite=true;void save(next).then(()=>{if(owner!==actor||identity()!==actor)return;state=next;currentGPS=p;if(!panel.hidden&&route()){paintGpsSummary(route(),session(),against(route()));paintMap(route(),false);}}).catch(error=>{status.textContent=error.message;}).finally(()=>{sampleWrite=false;});
 });
})();
