'use strict';
(()=>{
 const M=CampoRoutes,dbKey='campo-route-state-v1',$=id=>document.getElementById(id);
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const km=m=>(m/1000).toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})+' km';
 const panel=$('fieldRoutes'),status=$('fieldRouteStatus');
 let owner=null,state=null,selected=null,busy=false,refreshing=false,map=null,layer=null,currentGPS=null,sampleWrite=false,loadEpoch=0,routeGeometry=null,coverageInput={},fieldOverlay=null,googleOverlay=null;
 const identity=()=>window.CampoAccount?.current()?.id;
 const partOf=route=>/^([a-f0-9-]{36})-([1-9]\d*)$/i.exec(route.id);
 function orderedRoutes(routes){
  const groups=new Map();
  for(const route of routes){
   const group=partOf(route)?.[1]||route.id;
   if(!groups.has(group))groups.set(group,[]);
   groups.get(group).push(route);
  }
  return [...groups.values()].flatMap(parts=>parts.sort((a,b)=>Number(partOf(a)?.[2]||0)-Number(partOf(b)?.[2]||0)));
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
  owner=next;state=saved||blank();selected=state.session?.routeId||(state.routes.some(r=>r.id===last)?last:orderedRoutes(state.routes)[0]?.id)||null;currentGPS=null;
  paint();
 }
 const against=route=>M.coverage(route.spans,[...state.visits,...state.outbox].filter(v=>v.routeId===route.id));
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
   for(const visit of state.outbox){
    await fieldRouteApi('/api/routes/visit',visit);
    if(owner!==actor||identity()!==actor)return;
   }
   const remote=await fieldRouteApi('/api/routes?mine=1');
   if(owner!==actor||identity()!==actor)return;
   const receipts=new Set(remote.visits.map(v=>v.id)),next={...state,routes:remote.routes,visits:remote.visits,outbox:state.outbox.filter(v=>!receipts.has(v.id))};
   await save(next);state=next;
   if(!route())selected=state.session?.routeId||orderedRoutes(state.routes)[0]?.id||null;
   paint();status.textContent=state.outbox.length?'Ainda há conclusões pendentes de confirmação.':'Rotas atualizadas. Conclusões recebidas pelo painel.';
  }catch(error){status.textContent=error.message+' Os dados locais continuam salvos.';}finally{refreshing=false;}
 }
 async function fieldRouteApi(url,body){
  const response=await fetch(url,{method:body?'POST':'GET',cache:'no-store',headers:body?{'Content-Type':'application/json'}:undefined,
   body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout?.(15000)});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data)throw Error(data?.error||'Não foi possível falar com o painel.');
  return data;
 }
 function paint(fit=true){
  const r=route(),active=session();
  $('fieldRouteSelect').replaceChildren(new Option('Selecione uma rota',''));
  for(const item of orderedRoutes(state?.routes||[]))$('fieldRouteSelect').add(new Option(item.name+' · '+item.feeder,item.id));
  $('fieldRouteSelect').value=r?.id||'';
  $('fieldRouteSelect').disabled=Boolean(state?.session);
  $('fieldRouteStart').disabled=!r||Boolean(state?.session);
  $('fieldRouteFinal').hidden=!active;
  $('fieldRouteQueue').textContent=(state?.outbox.length||0)+' conclusão(ões) pendente(s) de envio';
  const prior=r?against(r):null;
  const total=r?M.metres(r.spans):0;
  const estimate=r?M.metres(r.spans.filter(s=>s.estimated)):0;
  const street=$('fieldRouteStreet'),legend=$('fieldRouteMapLegend');
  if(street)street.hidden=!r;
  if(legend){legend.hidden=!r;legend.textContent=r?'Minha rota · '+km(total)+' de rede · verde: confirmado':'';}
  if(r&&street){
   const next=r.spans.map(s=>({s,remaining:M.remaining(M.merge([...(prior.bySpan.get(s.id)||[]),...(active?.ranges[s.id]||[])]))})).find(item=>item.remaining.length);
   const a=M.first(r.spans[0]),b=M.last(r.spans.at(-1));
   const start=next?.remaining.at(next.s.reverse?-1:0);
   const point=start?M.portion(next.s,...start).at(next.s.reverse?-1:0):a;
   $('fieldRouteNavigate').textContent=next?'Google Maps · ir ao próximo ponto':'Google Maps · ir ao início';
   $('fieldRouteNavigate').href=M.streetDirections(point);
   $('fieldRouteRoadTrip').href=M.streetDirections(b,a);
  }
  if(r!==coverageInput.route||active?.ranges!==coverageInput.ranges||state?.visits!==coverageInput.visits||state?.outbox!==coverageInput.outbox){
   coverageInput={route:r,ranges:active?.ranges,visits:state?.visits,outbox:state?.outbox};
   routeGeometry=r?M.mapLines(r.spans,prior.bySpan,active?.ranges):null;
  }
  refreshFieldOverlay();
  $('fieldRouteSummary').textContent=r?r.locality+' · '+r.feeder+' · '+M.sectionLabel(r)+' '+r.zone+' · '+km(total)+' de rede planejada · '+km(prior.metres)+' de rede confirmada · '+km(Math.max(0,total-prior.metres))+' de rede restante · início '+r.spans[0].id+' · fim '+r.spans.at(-1).id:'Baixe suas rotas com internet antes de sair.';
  $('fieldRouteItems').innerHTML=r?r.spans.map((s,i)=>{
   const missing=M.remaining(prior.bySpan.get(s.id)),picked=active?.ranges[s.id]||[];
   const gps=session()?.trails?.some(trail=>{
    let start=-1,end=-1;
    for(let j=0;j<trail.length;j++){
     const [lat,lon]=trail[j],p=[lon,lat];
     if(start<0&&M.distance(p,M.first(s))<=12)start=j;
     if(start>=0&&j>start&&M.distance(p,M.last(s))<=12){end=j;break;}
    }
    return end>=0;
   });
   const label=missing.length?(gps?'GPS passou pelas extremidades · confirme no local':'A vistoriar'):'Confirmado';
   const dir=(a,b)=>s.reverse?[M.FULL-b,M.FULL-a]:[a,b];
   return `<li><b>${esc(s.id)}</b> · ${s.metres.toLocaleString('pt-BR')} m · ${label}${picked.length?' · marcado nesta saída':''}
   ${active&&missing.length?missing.map(([a,b])=>{const [x,y]=dir(a,b);return ` <button type="button" data-route-range="${i},${a},${b}">Confirmar ${x/100}%–${y/100}%</button>`;}).join('')+` <button type="button" data-route-part="${i}">Marcar parte</button>`:''}
   ${picked.length?` <button type="button" data-route-clear="${i}">Desmarcar</button>`:''}</li>`;
  }).join(''):'';
  const group=r&&partOf(r)?.[1];
  if(group)$('fieldRouteSummary').textContent+=' · '+km(M.metres(state.routes.filter(item=>partOf(item)?.[1]===group).flatMap(item=>item.spans)))+' no conjunto atribuído';
  if(estimate)$('fieldRouteSummary').textContent+=' · '+km(estimate)+' estimados pela geometria';
  if(active)$('fieldRouteSummary').textContent+=' · '+km(M.trailMetres(active.trails))+' de trilha GPS nesta saída';
  if(!panel.hidden)paintMap(r,fit);
 }
 function drawLeaflet(target,geometry,pane){
  const group=L.featureGroup().addTo(target),style={pane,interactive:false};
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
    for(const halo of [true,false]){
     const overlay=new google.maps.Data({map:googleMap});
     overlay.addGeoJson({type:'FeatureCollection',features:Object.entries(routeGeometry).filter(([,lines])=>lines.length).map(([key,lines])=>({type:'Feature',geometry:{type:'MultiLineString',coordinates:lines},properties:{key}}))});
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
  if(!r){layer?.remove();layer=null;return;}
  if(!map){map=L.map(target,{attributionControl:false,preferCanvas:true}).setView([-9.97,-67.81],13);L.control.scale({imperial:false}).addTo(map);}
  map.invalidateSize();if(layer)layer.remove();layer=drawLeaflet(map,routeGeometry,'overlayPane');
  for(const [name,p]of [['Início',M.first(r.spans[0])],['Fim',M.last(r.spans.at(-1))]])L.circleMarker([p[1],p[0]],{radius:6}).addTo(layer).bindTooltip(name,{permanent:true});
  if(currentGPS)L.circleMarker([currentGPS.lat,currentGPS.lon],{radius:5,color:'#1a5fb4'}).addTo(layer);
  for(const trail of session()?.trails||[])if(trail.length>1)L.polyline(trail,{color:'#265fc2',weight:2,opacity:.7}).addTo(layer);
  if(fit&&layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[20,20],maxZoom:19});
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
  status.textContent='Vistoria iniciada. Confirme os trechos efetivamente vistoriados.';
  return {...state,session:{id:crypto.randomUUID(),routeId:r.id,startedAt:new Date().toISOString(),ranges:{},trails:[],lastSampleAt:0}};
 });
 $('fieldRouteFinal').onclick=async()=>{
  if(busy||refreshing||sampleWrite||!session())return;
  const ranges=marks();
  if(!confirm(ranges.length?'Finalizar com a cobertura marcada nesta saída?':'Finalizar sem cobertura confirmada?'))return;
  const reason=$('fieldRouteReason').value.trim();
  if(!ranges.length&&!reason){status.textContent='Informe por que a saída terminou sem cobertura.';return;}
  await transact(()=>{
   const {id,routeId,startedAt,trails}=session(),endedAt=new Date().toISOString();
   $('fieldRouteReason').value='';
   status.textContent='Vistoria salva no aparelho. Aguardando confirmação do painel.';
   return {...state,session:null,outbox:[...state.outbox,{id,routeId,startedAt,endedAt,day:M.day(endedAt),trackMetres:Math.round(M.trailMetres(trails)),ranges,reason}]};
  });
  void loadRemote();
 };
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
 window.addEventListener('campo-account-changed',()=>{if(identity()!==owner||state?.outbox.length)void boot().then(loadRemote).catch(e=>{status.textContent=e.message;});});
 window.addEventListener('campo-route-gps',e=>{
  const active=session(),p=e.detail,at=Date.parse(p.timestamp);
  if(!active||identity()!==owner||busy||refreshing||sampleWrite||p.accuracy>35||at-active.lastSampleAt<6000)return;
  let trails=active.trails,prev=trails.at(-1)?.at(-1);
  const point=[p.lat,p.lon];
  if(trails.reduce((n,part)=>n+part.length,0)>=3000)return;
  if(!prev||at-active.lastSampleAt>25000||M.distance([prev[1],prev[0]],[point[1],point[0]])>200)trails=[...trails,[point]];
  else trails=[...trails.slice(0,-1),[...trails.at(-1),point]];
  const next={...state,session:{...active,trails,lastSampleAt:at}};
  const actor=owner;
  sampleWrite=true;void save(next).then(()=>{if(owner!==actor||identity()!==actor)return;state=next;currentGPS=p;if(!panel.hidden&&route())paint(false);}).catch(error=>{status.textContent=error.message;}).finally(()=>{sampleWrite=false;});
 });
})();
