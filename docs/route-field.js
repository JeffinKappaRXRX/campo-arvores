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
 keyPanel.innerHTML='<h3>Vistoria por chave</h3><div id="fieldRouteKeys"></div><div class="route-buttons"><button type="button" id="fieldRouteArea" hidden>Marcar área no mapa</button></div>';
 const spanList=$('fieldRouteItems'),spanDetails=document.createElement('details');
 spanDetails.innerHTML='<summary>Marcação detalhada por vão</summary>';
 spanList.before(keyPanel,spanDetails);
 spanDetails.append(spanList);
 const keyDialog=document.createElement('dialog');
 keyDialog.className='route-return-dialog';
 keyDialog.innerHTML='<form id="fieldRouteKeyForm"><div class="sectionhead"><h2 id="fieldRouteKeyTitle"></h2><button id="fieldRouteKeyClose" type="button" class="secondary">Voltar</button></div><p>Marque os trechos que você percorreu de ponta a ponta. As derivações que ficaram de fora permanecem pendentes no mapa.</p><div id="fieldRouteKeyOptions"></div><p id="fieldRouteKeyFeedback" role="status"></p><button type="submit" class="primary">Confirmar vistoria</button></form>';
 document.body.append(keyDialog);
 let reviewKeys=[],areaMode=false,areaCenter=null,areaLayer=null;
 let keyCache={};
 const fieldKeys=(r,spans)=>{
  const stamp=groupOf(r).map(part=>part.id).join('|');
  if(keyCache.stamp!==stamp||keyCache.outlet!==r?.outlet||keyCache.routes!==state?.routes)keyCache={stamp,outlet:r?.outlet,routes:state?.routes,sections:M.keySections(spans,r?.outlet)};
  return keyCache.sections;
 };
 const showPoint=point=>point[1].toFixed(5)+', '+point[0].toFixed(5);
 function showKeyReview(sections,area=null){
  const r=route();
  if(!r||!session()||!sections.length)return;
  const byId=new Map(groupOf(r).flatMap(part=>part.spans).map(span=>[span.id,span]));
  const inside=segment=>area&&segment.ids.every(id=>byId.get(id).line.every(point=>M.distance(point,area.center)<=area.radius));
  reviewKeys=sections.map(section=>({...section,segments:M.keyProgress(section,against(r).bySpan)})).filter(section=>section.segments.some(segment=>!segment.closed));
  if(area)reviewKeys=reviewKeys.filter(section=>section.segments.some(segment=>!segment.closed&&inside(segment)));
  if(!reviewKeys.length){areaLayer?.remove();areaLayer=null;status.textContent=area?'Nenhum trecho pendente cabe por inteiro na área marcada.':'A chave já está vistoriada.';return;}
  $('fieldRouteKeyTitle').textContent=area?'Revisar área percorrida':'Chave '+sections[0].code;
  $('fieldRouteKeyFeedback').textContent='';
  $('fieldRouteKeyOptions').innerHTML=reviewKeys.map(section=>'<fieldset><legend>'+esc(section.code)+'</legend>'+section.segments.map((segment,i)=>{
   const label=(segment.branch?'Derivação':'Trecho principal')+' · '+km(segment.metres)+' · '+showPoint(segment.start)+' → '+showPoint(segment.end);
   const allowed=!segment.closed&&(!area||inside(segment));
   return '<label><input type="checkbox" name="segment" value="'+esc(segment.id)+'" '+(allowed?'':'disabled')+(segment.closed?' checked':'')+'> '+esc(label)+(segment.closed?' · confirmado':allowed?'':' · fora da área')+'</label>';
  }).join('')+'</fieldset>').join('');
  if(typeof keyDialog.showModal==='function')keyDialog.showModal();else keyDialog.setAttribute('open','');
 }
 function closeKeyReview(){
  if(typeof keyDialog.close==='function')keyDialog.close();else keyDialog.removeAttribute('open');
  areaLayer?.remove();areaLayer=null;
 }
 $('fieldRouteKeyClose').onclick=closeKeyReview;
 $('fieldRouteKeyForm').onsubmit=async event=>{
  event.preventDefault();
  const checks=new Set([...event.target.querySelectorAll('input[name="segment"]:checked:not(:disabled)')].map(input=>input.value));
  if(!checks.size){$('fieldRouteKeyFeedback').textContent='Selecione o trecho percorrido.';return;}
  const affected=reviewKeys.filter(section=>section.segments.some(segment=>checks.has(segment.id)));
  const pending=affected.flatMap(section=>section.segments.filter(segment=>segment.branch&&!segment.closed&&!checks.has(segment.id)));
  if(pending.length&&!confirm('Deixar '+pending.length+' derivação(ões) pendente(s) e confirmar apenas os trechos marcados?'))return;
  let saved=false;
  await transact(()=>{
   const active=session();
   if(!active)return;
   const endedAt=new Date().toISOString(),outbox=[...state.outbox];
   for(const section of affected){
    const picked=section.segments.filter(segment=>checks.has(segment.id));
    if(!picked.length)continue;
    outbox.push({id:crypto.randomUUID(),routeId:active.routeId,startedAt:active.startedAt,endedAt,day:M.day(endedAt),trackMetres:0,
     keyCheck:{code:section.code,segments:picked.map(segment=>segment.id)},ranges:picked.flatMap(segment=>segment.ranges)});
   }
   saved=true;
   return {...state,outbox,session:{...active,keysSaved:true}};
  });
  if(saved&&state.outbox.some(visit=>visit.keyCheck?.segments.some(id=>checks.has(id)))){
   closeKeyReview();
   status.textContent='Trechos registrados. As derivações não marcadas seguem pendentes.';
   void loadRemote();
  }
 };
 $('fieldRouteKeys').onclick=event=>{
  const code=event.target.dataset.routeKey;
  const r=route();
  if(!r||!code)return;
  showKeyReview(fieldKeys(r,groupOf(r).flatMap(part=>part.spans)).filter(section=>section.code===code));
 };
 $('fieldRouteArea').onclick=()=>{
  areaMode=!areaMode;areaCenter=null;areaLayer?.remove();areaLayer=null;
  $('fieldRouteArea').textContent=areaMode?'Cancelar seleção de área':'Marcar área no mapa';
  if(areaMode){status.textContent='Toque no centro da área e depois no limite do círculo.';$('fieldRouteMap').scrollIntoView?.({block:'center'});}
 };
 const identity=()=>window.CampoAccount?.current()?.id;
 const orderedRoutes=routes=>M.campaignParts(routes).flat();
 const groupOf=r=>r?M.campaignParts(state.routes).find(parts=>parts.includes(r))||[r]:[];
 function resumeRoute(){
  const routes=orderedRoutes(state?.routes||[]);
  return routes.find(r=>r.spans.some(s=>M.remaining(against(r).bySpan.get(s.id)).length))?.id||routes[0]?.id||null;
 }
 const blank=()=>({routes:[],visits:[],outbox:[],session:null});
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
  const group=groupOf(route),ids=new Set(group.map(part=>part.id));
  return M.coverage(group.flatMap(part=>part.spans),[...state.visits,...state.outbox].filter(visit=>ids.has(visit.routeId)));
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
 function paint(fit=true){
  const r=route(),active=session();
  if(!active){areaMode=false;areaCenter=null;areaLayer?.remove();areaLayer=null;$('fieldRouteArea').textContent='Marcar área no mapa';}
  $('fieldRouteSelect').replaceChildren(new Option('Selecione uma rota',''));
  for(const item of orderedRoutes(state?.routes||[]))$('fieldRouteSelect').add(new Option(item.name+' · '+item.feeder+(item.homologation?' · Homologação':''),item.id));
  $('fieldRouteSelect').value=r?.id||'';
  $('fieldRouteSelect').disabled=Boolean(state?.session);
  const prior=r?against(r):null;
  const completed=r&&r.spans.every(s=>!M.remaining(prior.bySpan.get(s.id)).length);
  $('fieldRouteStart').disabled=!r||completed||Boolean(state?.session);
  $('fieldRouteFinal').hidden=!active;
  $('fieldRouteQueue').textContent=(state?.outbox.length||0)+' conclusão(ões) pendente(s) de envio';
  const group=groupOf(r),spans=group.flatMap(part=>part.spans);
  const keys=new Set(group.map(part=>part.id));
   const pendingReturn=r&&state?.outbox.some(visit=>keys.has(visit.routeId));
   returnButton.hidden=!r;returnButton.disabled=!r||Boolean(active)||pendingReturn||busy||refreshing;
   returnButton.title=active?'Finalize a saída antes de devolver.':pendingReturn?'Sincronize a conclusão pendente antes de devolver.':'';
  const visits=r?[...state.visits,...state.outbox].filter(visit=>keys.has(visit.routeId)):[];
  const covered=M.coverage(spans,visits),buffer=r?M.bufferMetres(r.buffer):0;
  const total=M.metres(spans),sections=r?fieldKeys(r,spans):[];
  spanDetails.hidden=!r;
  keyPanel.hidden=!r;
  $('fieldRouteArea').hidden=!active||!sections.length;
  $('fieldRouteKeys').innerHTML=sections.map(section=>{
   const progress=M.keyProgress(section,covered.bySpan),left=progress.filter(part=>!part.closed).length;
   return '<button type="button" data-route-key="'+esc(section.code)+'" '+(!active||!left?'disabled':'')+'>'+esc(section.code)+' · '+(left?left+' trecho(s) pendente(s)':'encerrada')+'</button>';
  }).join(' ')||'<p>Use GPS ou a marcação detalhada para esta rota. A rota por chave precisa de uma saída de subestação vinculada e continuidade na rede.</p>';
  const estimate=r?M.metres(r.spans.filter(s=>s.estimated)):0;
  const street=$('fieldRouteStreet'),legend=$('fieldRouteMapLegend');
  if(street)street.hidden=!r;
  if(legend){legend.hidden=!r;legend.textContent=r?'Minha rota · '+km(total)+' de rede · azul: faixa de '+buffer+' m por lado · verde: confirmado':'';}
  if(r&&street){
   const paths=M.pendingPaths(M.outletOrder(group.flatMap(part=>part.spans),r.outlet).filter(span=>r.spans.some(item=>item.id===span.id)),prior.bySpan,active?.ranges),stops=M.roadStops(paths);
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
  if(routeKey!==coverageInput.routeKey||active?.ranges!==coverageInput.ranges||state?.visits!==coverageInput.visits||state?.outbox!==coverageInput.outbox){
   const scopeSame=routeKey===coverageInput.routeKey;
   coverageInput={routeKey,ranges:active?.ranges,visits:state?.visits,outbox:state?.outbox};
   routeGeometry=r?{...M.mapLines(spans,covered.bySpan,active?.ranges),buffer:scopeSame&&routeGeometry?routeGeometry.buffer:M.bufferRings(spans,buffer)}:null;
  }
  refreshFieldOverlay();
  $('fieldRouteSummary').textContent=r?(r.campaign?.name||r.name)+' · '+km(total)+' planejados · '+km(covered.metres)+' confirmados · '+km(Math.max(0,total-covered.metres))+' pendentes na rota'+(group.length>1?' · parte '+(group.indexOf(r)+1)+'/'+group.length:''):'Baixe suas rotas com internet antes de sair.';
  if(r?.plan){
   const targets=M.schedule(r.plan,total),current=M.day(Date.now()),target=targets.find(item=>item.day===current);
   if(target)$('fieldRouteSummary').textContent+=' · meta de hoje '+km(target.metres);
   if(targets.length)$('fieldRouteSummary').textContent+=' · concluir até '+targets.at(-1).day.split('-').reverse().join('/');
  }
  if(covered.sharedMetres)$('fieldRouteSummary').textContent+=' · '+km(covered.sharedMetres)+' confirmados em vãos compartilhados';
  const remaining=r?M.pendingPaths(r.spans,prior.bySpan,active?.ranges):[];
  const nextPart=group.find(part=>part!==r&&part.spans.some(s=>M.remaining(covered.bySpan.get(s.id)).length));
  const move=$('fieldRouteNextPart');
  if(move){move.hidden=!completed||!nextPart||Boolean(active);move.dataset.target=nextPart?.id||'';}
  const hint=$('fieldRouteGPSHint'),confirmGPS=$('fieldRouteConfirmGPS');
  if(hint&&confirmGPS){
   const suggested=r&&active?gpsRanges(r,active,prior):[];
   const amount=r?M.coverage(r.spans,[{ranges:suggested}]).metres:0;
   hint.hidden=!active;confirmGPS.hidden=!amount;
   hint.textContent=amount?km(amount)+' de rede sugeridos pelo GPS. Revise antes de confirmar.':active?'GPS ativo durante a saída. Confirme no mapa ou na lista a rede que você vistoriou.':'';
  }
  if(r&&remaining.length)$('fieldRouteSummary').textContent+=' · próximo vão '+r.spans.find(s=>M.remaining(M.merge([...(prior.bySpan.get(s.id)||[]),...(active?.ranges[s.id]||[])])).length).id;
  $('fieldRouteItems').innerHTML=r?r.spans.map((s,i)=>{
   const missing=M.remaining(prior.bySpan.get(s.id)),picked=active?.ranges[s.id]||[];
   const label=missing.length?(active?.gpsMatches?.[s.id]?.length?'GPS sugeriu cobertura':'A vistoriar'):'Confirmado';
   const dir=(a,b)=>s.reverse?[M.FULL-b,M.FULL-a]:[a,b];
   return `<li><b>${esc(s.id)}</b> · ${s.metres.toLocaleString('pt-BR')} m · ${label}${s.parallel?.length?' · junto com '+esc([...new Set(s.parallel.map(peer=>peer.feeder))].join(', ')):''}${picked.length?' · marcado nesta saída':''}
   ${active&&missing.length?missing.map(([a,b])=>{const [x,y]=dir(a,b);return ` <button type="button" data-route-range="${i},${a},${b}">Confirmar ${x/100}%–${y/100}%</button>`;}).join('')+` <button type="button" data-route-part="${i}">Marcar parte</button>`:''}
   ${picked.length?` <button type="button" data-route-clear="${i}">Desmarcar</button>`:''}</li>`;
  }).join(''):'';
  if(estimate)$('fieldRouteSummary').textContent+=' · '+km(estimate)+' estimados pela geometria nesta parte';
  if(active)$('fieldRouteSummary').textContent+=' · '+km(M.trailMetres(active.trails))+' de trilha GPS nesta saída';
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
  if(typeof fieldMap!=='undefined'&&fieldMap&&fieldOverlay?.geometry!==routeGeometry){
   fieldOverlay?.group?.remove();
   if(!fieldMap.getPane('myInspectionRoute'))fieldMap.createPane('myInspectionRoute').style.zIndex='455';
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
 }
 window.CampoFieldRouteMap={refresh:refreshFieldOverlay};
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
   map.on('click',event=>{
    if(!areaMode||!session())return;
    const point=[event.latlng.lng,event.latlng.lat];
    if(!areaCenter){
     areaCenter=point;areaLayer=L.circle([point[1],point[0]],{radius:1,color:'#255fa5',interactive:false}).addTo(map);
     status.textContent='Toque no limite da área percorrida.';return;
    }
    const radius=M.distance(areaCenter,point);
    if(radius<10||radius>2000){status.textContent='Marque um raio entre 10 m e 2 km.';return;}
    areaLayer?.setRadius(radius);
    const current=route(),area={center:areaCenter,radius};
    areaMode=false;areaCenter=null;$('fieldRouteArea').textContent='Marcar área no mapa';
    showKeyReview(fieldKeys(current,groupOf(current).flatMap(part=>part.spans)),area);
   });
  }
  if(navigator.onLine&&!scopeTiles&&typeof L.tileLayer==='function')scopeTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:21,maxNativeZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);
  else if(!navigator.onLine&&scopeTiles){scopeTiles.remove();scopeTiles=null;}
  map.invalidateSize();
  if(mapScope?.geometry!==routeGeometry){mapScope?.group.remove();mapScope={geometry:routeGeometry,group:drawLeaflet(map,routeGeometry,'overlayPane')};}
  layer?.remove();layer=L.featureGroup().addTo(map);
  for(const [name,p]of r.outlet?[['Saída da subestação',r.outlet]]:[['Início',M.first(r.spans[0])],['Fim',M.last(r.spans.at(-1))]])L.circleMarker([p[1],p[0]],{radius:6}).addTo(layer).bindTooltip(name,{permanent:true});
  for(const section of fieldKeys(r,groupOf(r).flatMap(part=>part.spans))){
   const first=section.segments[0].start,closed=M.keyProgress(section,against(r).bySpan).every(segment=>segment.closed);
   L.circleMarker([first[1],first[0]],{radius:8,color:closed?M.confirmedColor:'#174993',fillOpacity:.95,bubblingMouseEvents:false}).addTo(layer)
    .bindTooltip(esc(section.code)).on('click',()=>{if(!areaMode&&session()&&!closed)showKeyReview([section]);});
  }
  if(currentGPS)L.circleMarker([currentGPS.lat,currentGPS.lon],{radius:5,color:'#1a5fb4'}).addTo(layer);
  for(const trail of session()?.trails||[])if(trail.length>1)L.polyline(trail,{color:'#265fc2',weight:2,opacity:.7}).addTo(layer);
  if(fit&&mapScope.group.getBounds().isValid())map.fitBounds(mapScope.group.getBounds(),{padding:[25,25],maxZoom:18});
 }
 async function transact(fn){
  if(busy||refreshing||sampleWrite||!state)return;
  busy=true;
  try{const next=fn();if(next){await save(next);state=next;paint();}}
  catch(error){status.textContent=error.message;}finally{busy=false;}
 }
 $('fieldRouteStart').onclick=()=>void transact(()=>{
  const r=route();if(!r||state.session)return;
  currentGPS=null;
  if(typeof startLiveGPS==='function')startLiveGPS();
  status.textContent='Vistoria iniciada. Confirme os trechos efetivamente vistoriados.';
  return {...state,session:{id:crypto.randomUUID(),routeId:r.id,startedAt:new Date().toISOString(),ranges:{},gpsMatches:{},trails:[],lastSampleAt:0}};
 });
 $('fieldRouteFinal').onclick=async()=>{
  if(busy||refreshing||sampleWrite||!session())return;
  const ranges=marks();
  if(!confirm(ranges.length||session().keysSaved?'Finalizar com a cobertura marcada nesta saída?':'Finalizar sem cobertura confirmada?'))return;
  const reason=$('fieldRouteReason').value.trim()||(!ranges.length&&session().keysSaved?'Vistoria por chave registrada durante a saída.':'');
  if(!ranges.length&&!reason){status.textContent='Informe por que a saída terminou sem cobertura.';return;}
  await transact(()=>{
   const {id,routeId,startedAt,trails}=session(),endedAt=new Date().toISOString();
   $('fieldRouteReason').value='';
   status.textContent='Vistoria salva no aparelho. Aguardando confirmação do painel.';
   return {...state,session:null,outbox:[...state.outbox,{id,routeId,startedAt,endedAt,day:M.day(endedAt),trackMetres:Math.round(M.trailMetres(trails)),ranges,reason}]};
  });
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
  const data=e.target.dataset,raw=data.routeRange?.split(','),idx=Number(raw?.[0]??data.routePart??data.routeClear),s=r.spans[idx];if(!s)return;
  const ranges={...active.ranges};
  if(data.routeClear!==undefined)delete ranges[s.id];
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
  sampleWrite=true;void save(next).then(()=>{if(owner!==actor||identity()!==actor)return;state=next;currentGPS=p;if(!panel.hidden&&route())paint(false);}).catch(error=>{status.textContent=error.message;}).finally(()=>{sampleWrite=false;});
 });
})();
