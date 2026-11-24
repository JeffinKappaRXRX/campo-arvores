const ASSETS={};
(function(root){'use strict';
function numeric(value){return (typeof value==='number'||typeof value==='string')&&value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));}
function missing(r){const out=[];const add=(field,label)=>out.push({field,label});if(!String(r.inspector||'').trim())add('inspector','Inspetor');if(!String(r.feeder||'').trim())add('feeder','Alimentador / localidade');if(!numeric(r.lat)||Math.abs(Number(r.lat))>90)add('lat','Latitude válida');if(!numeric(r.lon)||Math.abs(Number(r.lon))>180)add('lon','Longitude válida');if(!String(r.id||r.editing||'').startsWith('vera-')&&!r.photos?.some(p=>typeof p.original==='string'&&p.original.trim()))add('photos','Ao menos uma foto');if(!numeric(r.height)||Number(r.height)<=0)add('height','Altura da árvore');const network=['mt','bt','at'].filter(k=>r[k]===true||r[k]==='sim');if(network.length&&!String(r.pole||'').trim())add('pole','ID do poste');if(network.includes('mt')&&!String(r.span||'').trim())add('span','ID do vão MT');for(const k of network)if(!numeric(r[k+'Distance'])||Number(r[k+'Distance'])<0)add(k+'Distance','Distância copa → '+k.toUpperCase());return out;}
function unknownSpecies(r){return !String(r.species||'').trim()||/^(árvore|arvore|não identificad[ao]|nao identificad[ao]|desconhecid[ao])$/i.test(String(r.species).trim());}
function identificationPending(r){return !r.deletedRemote&&(unknownSpecies(r)||['queued','error','suggested'].includes(r.plantIdentification?.status));}
root.CampoInspectionRules={missing,unknownSpecies,identificationPending};if(typeof module!=='undefined')module.exports=root.CampoInspectionRules;
})(typeof globalThis!=='undefined'?globalThis:this);

'use strict';
const CampoRoutes=(()=>{
 const FULL=10000;
 const text=(value,max=100)=>String(value??'').trim().slice(0,max);
 const key=value=>text(value,100).toUpperCase();
 const codes=value=>[...new Set(String(value??'').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
 const sections=values=>[...new Set(values.map(v=>key(v).replace(/^T\s*/, '').replace(/\.0+$/, '')).filter(v=>['1','2','3'].includes(v)))].sort();
 const sectionLabel=route=>(route.sections||[route.section]).map(s=>'T'+s).join(' + ');
 const DEFAULT_BUFFER=30;
 const bufferMetres=value=>Number.isFinite(Number(value))&&Number(value)>=5&&Number(value)<=200?Number(value):DEFAULT_BUFFER;
 const identifier=value=>/^[A-Za-z0-9_.:-]{1,100}$/.test(value||'');
 const comparePoint=(a,b)=>a[0]-b[0]||a[1]-b[1];
 const distance=(a,b)=>{
  const rad=Math.PI/180, dy=(b[1]-a[1])*rad, dx=(b[0]-a[0])*rad;
  const x=Math.sin(dy/2)**2+Math.cos(a[1]*rad)*Math.cos(b[1]*rad)*Math.sin(dx/2)**2;
  return 12742000*Math.asin(Math.min(1,Math.sqrt(x)));
 };
 function span(raw){
  const id=text(raw.id),metres=Number(raw.metres),line=raw.line;
  if(!identifier(id)||!Number.isFinite(metres)||metres<=0||metres>50000||
   !Array.isArray(line)||line.length<2||line.length>300||line.some(p=>!Array.isArray(p)||p.length!==2||
    !Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90))throw Error('Vão sem ID, extensão ou geometria válida.');
  if(line.every(p=>comparePoint(p,line[0])===0))throw Error('Vão sem geometria linear.');
  const inverted=comparePoint(line[0],line.at(-1))>0;
  const poles=Array.isArray(raw.poles)?[...new Set(raw.poles.map(p=>text(p)))].filter(identifier).slice(0,2):[];
  const parallel=[];
  if(poles.length===2&&Array.isArray(raw.parallel))for(const peer of raw.parallel.slice(0,15)){
   const peerId=text(peer?.id),peerMetres=Number(peer?.metres),feeder=key(peer?.feeder);
   if(peerId!==id&&identifier(peerId)&&feeder&&feeder!==key(raw.feeder)&&peerMetres>0&&peerMetres<=50000&&!parallel.some(p=>p.id===peerId))parallel.push({id:peerId,feeder,metres:peerMetres,flip:peer.flip===true,...(peer.estimated?{estimated:true}:{})});
  }
  return {id,metres,feeder:key(raw.feeder),locality:key(raw.locality),block:key(raw.block),zone:key(raw.zone),section:key(raw.section).replace(/^T/,'').trim(),
   ...(raw.estimated?{estimated:true}:{}),...(poles.length?{poles}:{}),...(parallel.length?{parallel}:{}),line:inverted?[...line].reverse():line,reverse:Boolean(raw.reverse)!==inverted};
 }
 const first=s=>s.line[s.reverse?s.line.length-1:0],last=s=>s.line[s.reverse?0:s.line.length-1];
 function feature(f){
  const p=Object.fromEntries(Object.entries(f.properties||{}).map(([k,v])=>[k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''),v]));
  const line=continuousLine(f.geometry);
  if(!line)throw Error('O vão MT precisa de uma geometria linear contínua.');
  const layer=key(f.properties?._class||f.properties?._layer);
  if(layer&&!/(^MT$|VAO.*MT|REDE.*MT)/.test(layer))throw Error('Selecione um vão de MT.');
  const numeric=v=>Number(String(v??'').trim().replace(',','.'));
  const recorded=[p.redecompm,p.comprimentoatual,p.comprimentom,p.comprimento,p.extensaom,p.extensao,p.routemetres,numeric(p.redecompkm)*1000].map(numeric).find(value=>Number.isFinite(value)&&value>0);
  const estimated=!(recorded>0);
  const metres=estimated?line.slice(1).reduce((total,point,i)=>total+distance(line[i],point),0):recorded;
  const rawZone=key(p.routezone??p.zona??p.urbanorural);
  const zone=['U','URBANA'].includes(rawZone)?'URBANO':rawZone==='R'?'RURAL':rawZone;
  return span({poles:p.routepoles,parallel:p.routeparallel,id:p.routeid??p.id??p.idvao??p.idvaomt??p.gisid??p.idtrecho??p.idsegmento??p.objectid,metres,line,estimated,feeder:p.routefeeder??p.alimentador??p.feeder,
   locality:p.routelocality??p.localidade??p.cidade,block:p.routeblock??p.namebloco??p.bloco??p.chave,zone:['URBANO','RURAL'].includes(zone)?zone:'',section:sections([p.routesection??p.tipotrecho??p.trecho])[0]});
 }
 const metres=spans=>spans.reduce((sum,span)=>sum+span.metres,0);
 const pendingColor='#ee344a',confirmedColor='#168756',haloColor='#fff4f0';
 function mapLines(spans,coverage,marked={}){
  const lines={pending:[],confirmed:[]};
  for(const span of spans){
   const ranges=merge([...(coverage?.get(span.id)||[]),...(Object.hasOwn(marked,span.id)?marked[span.id]:[])]);
   for(const [state,items] of [['pending',remaining(ranges)],['confirmed',ranges]])
    for(const [a,b] of items)lines[state].push(portion(span,a,b));
  }
  return lines;
 }
 function streetDirections(destination,origin,waypoints=[]){
  const coords=([lon,lat])=>lat.toFixed(6)+','+lon.toFixed(6);
  const options=new URLSearchParams({api:'1',destination:coords(destination),travelmode:'driving'});
  if(origin)options.set('origin',coords(origin));else options.set('dir_action','navigate');
  if(waypoints.length)options.set('waypoints',waypoints.slice(0,3).map(coords).join('|'));
  return 'https://www.google.com/maps/dir/?'+options;
 }
 function continuousLine(geometry){
  if(geometry?.type==='LineString')return geometry.coordinates.map(p=>p.slice(0,2));
  if(geometry?.type!=='MultiLineString'||!geometry.coordinates.length)return null;
  const [head,...tail]=geometry.coordinates.map(line=>line.map(p=>p.slice(0,2)));
  let line=head;
  while(tail.length){
   const end=line.at(-1),start=line[0];
   const i=tail.findIndex(part=>[start,end].some(a=>[part[0],part.at(-1)].some(b=>distance(a,b)<.25)));
   if(i<0)return null;
   const part=tail.splice(i,1)[0];
   if(distance(end,part[0])<.25)line=[...line,...part.slice(1)];
   else if(distance(end,part.at(-1))<.25)line=[...line,...[...part].reverse().slice(1)];
   else if(distance(start,part.at(-1))<.25)line=[...part.slice(0,-1),...line];
   else line=[...[...part].reverse().slice(0,-1),...line];
  }
  return line;
 }
 function campaignParts(routes){
  const groups=new Map();
  for(const route of routes){
   const legacy=/^([a-f0-9-]{36})-([1-9]\d*)$/i.exec(route.id);
   const code=route.campaign?.id||legacy?.[1]||route.id;
   if(!groups.has(code))groups.set(code,[]);
   groups.get(code).push(route);
  }
  return [...groups.values()].map(parts=>parts.sort((a,b)=>(a.campaign?.index||Number(a.id.split('-').at(-1))||0)-(b.campaign?.index||Number(b.id.split('-').at(-1))||0)));
 }
 function pendingPaths(spans,covered,marked={}){
  return spans.flatMap(s=>{
   const paths=remaining(merge([...(covered?.get(s.id)||[]),...(Object.hasOwn(marked,s.id)?marked[s.id]:[])])).map(([a,b])=>portion(s,a,b));
   return s.reverse?paths.reverse().map(line=>[...line].reverse()):paths;
  });
 }
 function roadStops(paths){
  const stops=[];let previous=null;
  for(const line of paths){
   if(!previous||distance(previous,line[0])>35)stops.push(line[0]);
   previous=line.at(-1);
   if(distance(stops.at(-1),previous)>=250)stops.push(previous);
  }
  const end=paths.at(-1)?.at(-1);
  if(end&&distance(stops.at(-1),end)>5)stops.push(end);
  return stops;
 }
 function bufferRings(spans,metres){
  if(!metres)return [];
  const result=[];
  for(const {line} of spans)for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i],y=111195,x=y*Math.cos((a[1]+b[1])*Math.PI/360);
   const angle=Math.atan2((b[1]-a[1])*y,(b[0]-a[0])*x),ring=[];
   if(comparePoint(a,b)===0)continue;
   for(const [point,start] of [[b,angle-Math.PI/2],[a,angle+Math.PI/2]])for(let j=0;j<=8;j++){
    const t=start+j*Math.PI/8;
    ring.push([point[0]+metres*Math.cos(t)/x,point[1]+metres*Math.sin(t)/y]);
   }
   result.push([...ring,ring[0]]);
  }
  return result;
 }
 // Area review only selects whole spans. Check every open interval between crossings
 // so a line whose endpoints lie inside a concave boundary is handled correctly.
 function spansInsideArea(spans,ring){
  const cross=(ax,ay,bx,by)=>ax*by-ay*bx;
  const edges=ring.map((point,i)=>[point,ring[(i+1)%ring.length]]);
  const eps=1e-9;
  const contains=([x,y])=>{
   let inside=false;
   for(const [[ax,ay],[bx,by]] of edges){
    const dx=bx-ax,dy=by-ay;
    if(Math.abs(cross(dx,dy,x-ax,y-ay))<=eps*Math.hypot(dx,dy)&&x>=Math.min(ax,bx)-eps&&x<=Math.max(ax,bx)+eps&&y>=Math.min(ay,by)-eps&&y<=Math.max(ay,by)+eps)return true;
    if((ay>y)!==(by>y)&&x<ax+(y-ay)*dx/dy)inside=!inside;
   }
   return inside;
  };
  if(ring.length<3||Math.abs(edges.reduce((sum,[[ax,ay],[bx,by]])=>sum+cross(ax-ring[0][0],ay-ring[0][1],bx-ring[0][0],by-ring[0][1]),0))<eps*eps)return [];
  const xs=ring.map(p=>p[0]),ys=ring.map(p=>p[1]);
  const west=Math.min(...xs),east=Math.max(...xs),south=Math.min(...ys),north=Math.max(...ys);
  return spans.filter(({line})=>{
   if(!line.every(([x,y])=>x>=west-eps&&x<=east+eps&&y>=south-eps&&y<=north+eps&&contains([x,y])))return false;
   for(let i=1;i<line.length;i++){
    const [x,y]=line[i-1],dx=line[i][0]-x,dy=line[i][1]-y,cuts=[0,1];
    for(const [[ax,ay],[bx,by]] of edges){
     const ex=bx-ax,ey=by-ay,den=cross(dx,dy,ex,ey);
     if(Math.abs(den)<=eps*eps)continue;
     const t=cross(ax-x,ay-y,ex,ey)/den,u=cross(ax-x,ay-y,dx,dy)/den;
     if(t>0&&t<1&&u>=-eps&&u<=1+eps)cuts.push(t);
    }
    cuts.sort((a,b)=>a-b);
    for(let j=1;j<cuts.length;j++){
     const mid=(cuts[j-1]+cuts[j])/2;
     if(!contains([x+mid*dx,y+mid*dy]))return false;
    }
   }
   return true;
  });
 }
 function spanAtPoint(spans,point,radius){
  const y=111195,x=y*Math.cos(point[1]*Math.PI/180);
  let picked=null,best=Infinity,second=Infinity;
  for(const span of spans){
   let nearest=Infinity;
   for(let i=1;i<span.line.length;i++){
    const [a,b]=[span.line[i-1],span.line[i]];
    const ax=(a[0]-point[0])*x,ay=(a[1]-point[1])*y,bx=(b[0]-point[0])*x,by=(b[1]-point[1])*y;
    if((ax>radius&&bx>radius)||(ax< -radius&&bx< -radius)||(ay>radius&&by>radius)||(ay< -radius&&by< -radius))continue;
    const dx=bx-ax,dy=by-ay,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,(-ax*dx-ay*dy)/length)):0;
    nearest=Math.min(nearest,Math.hypot(ax+t*dx,ay+t*dy));
   }
   if(nearest<best){second=best;best=nearest;picked=span;}
   else second=Math.min(second,nearest);
  }
  return best<=radius&&second-best>=1?picked:null;
 }
 function matchedRanges(spans,previous,position){
  const lat=previous[1],y=111195,x=y*Math.cos(lat*Math.PI/180);
  const local=p=>[(p[0]-previous[0])*x,(p[1]-lat)*y];
  const [dx,dy]=local(position),step=Math.hypot(dx,dy);
  if(step<7||step>160)return [];
  const radius=14,results=[];
  for(const span of spans){
   const points=span.line.map(local);
   if(points.every(p=>p[0]<Math.min(0,dx)-radius)||points.every(p=>p[0]>Math.max(0,dx)+radius)||
    points.every(p=>p[1]<Math.min(0,dy)-radius)||points.every(p=>p[1]>Math.max(0,dy)+radius))continue;
   const ranges=[];let offset=0;
   for(let i=1;i<points.length;i++){
    const [ax,ay]=points[i-1],sx=points[i][0]-ax,sy=points[i][1]-ay,len=Math.hypot(sx,sy);
    if(!len)continue;
    const from=(-ax*sx-ay*sy)/len,to=((dx-ax)*sx+(dy-ay)*sy)/len;
    const a=Math.max(0,Math.min(from,to)),b=Math.min(len,Math.max(from,to));
    const distanceFromTrack=t=>Math.abs((ax+sx*t/len)*dy-(ay+sy*t/len)*dx)/step;
    if(b-a>=Math.min(7,len*.75)&&Math.abs(to-from)>=step*.8&&distanceFromTrack(a)<=radius&&distanceFromTrack(b)<=radius){
     ranges.push([offset+a,offset+b]);
    }
    offset+=len;
   }
   const valid=ranges.map(([a,b])=>[Math.round(FULL*a/offset),Math.round(FULL*b/offset)]).filter(([a,b])=>a<b);
   if(valid.length)results.push({spanId:span.id,ranges:merge(valid)});
  }
  // GPS cannot reliably distinguish overlapping or parallel candidate spans.
  const ids=new Map(spans.map(s=>[s.id,s]));
  return results.filter((result,i)=>results.every((other,j)=>{
   if(i===j)return true;
   const a=ids.get(result.spanId),b=ids.get(other.spanId);
   return [a.line[0],a.line.at(-1)].some(p=>[b.line[0],b.line.at(-1)].some(q=>distance(p,q)<3))&&
    !(distance(a.line[0],b.line[0])<3&&distance(a.line.at(-1),b.line.at(-1))<3);
  }));
 }
 function routeParts(spans){
  const parts=[];let part=[],bytes=0;
  const encoder=new TextEncoder();
  for(const span of spans){
   const size=encoder.encode(JSON.stringify(span)).length+1;
   if(part.length===250||bytes+size>440000){parts.push(part);part=[];bytes=0;}
   part.push(span);bytes+=size;
  }
  if(part.length)parts.push(part);
  return parts;
 }
 function order(spans,keys,start){
  const rank=new Map(keys.map((k,i)=>[k,i])),groups=new Map(),result=[];
  for(const s of spans){
   const group=rank.has(s.block)?rank.get(s.block):s.feeder+"|"+s.block;
   if(!groups.has(group))groups.set(group,[]);
   groups.get(group).push(s);
  }
  for(const group of [...groups.keys()].sort((a,b)=>(typeof a==='number'?a:keys.length)-(typeof b==='number'?b:keys.length))){
   const pending=new Set(groups.get(group)),ends=new Map();
   const coordinate=p=>p.map(n=>n.toFixed(5)).join(',');
   for(const s of pending)for(const p of [first(s),last(s)]){
    const key=coordinate(p);if(!ends.has(key))ends.set(key,new Set());ends.get(key).add(s);
   }
   if(!start){
    const s=[...pending].find(s=>ends.get(coordinate(first(s))).size===1||ends.get(coordinate(last(s))).size===1)||pending.values().next().value;
    pending.delete(s);
    const reverse=ends.get(coordinate(first(s))).size!==1&&ends.get(coordinate(last(s))).size===1;
    const initial={...s,reverse:s.reverse!==reverse};
    result.push(initial);start=last(initial);
   }
   while(pending.size){
    let nearest=Infinity,chosen,reverse=false;
    const connected=[...(ends.get(coordinate(start))||[])].filter(s=>pending.has(s));
    for(const s of connected.length?connected:pending){
     const a=distance(start,first(s)),b=distance(start,last(s));
     if(Math.min(a,b)<nearest){nearest=Math.min(a,b);chosen=s;reverse=b<a;}
    }
    pending.delete(chosen);
    const next={...chosen,reverse:chosen.reverse!==reverse};
    result.push(next);start=last(next);
   }
  }
  return result;
 }
 // Direct the selected network from the confirmed substation outlet. Unrooted, cyclic
 // or disconnected sections remain available for manual/GPS inspection.
 function directedRoute(spans,outlet){
  if(!Array.isArray(outlet)||outlet.length!==2||!outlet.every(Number.isFinite))return null;
  const nodes=new Map(),pointKey=p=>p.map(n=>n.toFixed(5)).join(',');
  const node=p=>{
   const id=pointKey(p);
   if(!nodes.has(id))nodes.set(id,{id,point:p,edges:[],depth:0,children:[]});
   return nodes.get(id);
  };
  for(const span of spans){
   const a=node(span.line[0]),b=node(span.line.at(-1)),edge={span,a,b};
   a.edges.push(edge);b.edges.push(edge);
  }
  const roots=[...nodes.values()].filter(n=>n.edges.length===1&&n.edges[0].span.section==='1')
   .map(n=>({n,d:distance(n.point,outlet)})).filter(x=>x.d<=35).sort((a,b)=>a.d-b.d);
  if(!roots.length||roots.length>1&&roots[1].d-roots[0].d<3)return null;
  const root=roots[0].n,feeder=root.edges[0].span.feeder,walk=[root],seen=new Set([root]);
  for(let at=0;at<walk.length;at++){
   const n=walk[at];
   for(const edge of n.edges){
    if(edge===n.parent||edge.span.feeder!==feeder)continue;
    const next=edge.a===n?edge.b:edge.a;
    if(seen.has(next))return null;
    seen.add(next);walk.push(next);next.parent=edge;
    const directed={edge,from:n,to:next};
    n.children.push(directed);
   }
  }
  const orderOf=link=>Number(link.edge.span.section)||4;
  for(const n of [...walk].reverse()){
   n.children.sort((a,b)=>orderOf(a)-orderOf(b)||(b.edge.span.metres+b.to.depth)-(a.edge.span.metres+a.to.depth)||a.edge.span.id.localeCompare(b.edge.span.id));
   if(n.children.length)n.depth=n.children[0].edge.span.metres+n.children[0].to.depth;
  }
  return {root,feeder};
 }
 function outletOrder(spans,outlet){
  const network=directedRoute(spans,outlet);
  if(!network)return spans;
  const pending=[...network.root.children].reverse(),oriented=[],seen=new Set();
  while(pending.length){
   const {edge,from,to}=pending.pop();
   oriented.push({...edge.span,reverse:edge.b===from});
   seen.add(edge.span.id);
   for(let i=to.children.length-1;i>=0;i--)pending.push(to.children[i]);
  }
  return [...oriented,...spans.filter(span=>!seen.has(span.id))];
 }
 function keySections(spans,outlet){
  const network=directedRoute(spans,outlet);
  if(!network)return [];
  const {root,feeder}=network;
  const byKey=new Map(),pending=root.children.map(child=>({child,segment:null,branch:false}));
  for(let index=0;index<pending.length;index++){
   const {child,segment,branch}=pending[index],{edge,from,to}=child,code=edge.span.block;
   let part=segment;
   if(code&&(!part||part.code!==code||branch)){
    part={id:edge.span.id,code,branch,start:from.point,end:to.point,ids:[],metres:0};
    if(!byKey.has(code))byKey.set(code,[]);
    byKey.get(code).push(part);
   }
   if(part&&code){
    part.ids.push(edge.span.id);part.end=to.point;part.metres+=edge.span.metres;
   }
   for(const [i,next] of to.children.entries()){
    const diverges=i>0;
    pending.push({child:next,segment:code?part:null,branch:diverges});
   }
  }
  const counts=new Map();
  for(const span of spans)if(span.feeder===feeder&&span.block)counts.set(span.block,(counts.get(span.block)||0)+1);
  return [...byKey].flatMap(([code,segments])=>segments.reduce((n,part)=>n+part.ids.length,0)===counts.get(code)?[{code,segments}]:[]);
 }
 function keyProgress(section,cover){
  return section.segments.map(segment=>{
   const ranges=segment.ids.flatMap(spanId=>remaining(cover?.get(spanId)).map(([start,end])=>({spanId,start,end})));
   return {...segment,closed:!ranges.length,ranges};
  });
 }
 function bounds(intervals){
  return intervals.map(([start,end])=>{
   if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>FULL||start>=end)throw Error('Faixa de cobertura inválida.');
   return [start,end];
  }).sort((a,b)=>a[0]-b[0]);
 }
 function merge(intervals){
  const result=[];
  for(const interval of bounds(intervals)){
   const prior=result.at(-1);
   if(prior&&interval[0]<=prior[1])prior[1]=Math.max(prior[1],interval[1]);
   else result.push(interval);
  }
  return result;
 }
 function remaining(intervals){
  const out=[];let cursor=0;
  for(const [start,end] of merge(intervals||[])){if(cursor<start)out.push([cursor,start]);cursor=end;}
  if(cursor<FULL)out.push([cursor,FULL]);
  return out;
 }
 function coverage(spans,visits,filter=()=>true){
  const byId=new Map(spans.map(s=>[s.id,s])),bySpan=new Map(),shared=new Map();
  const append=(map,id,range)=>{if(!map.has(id))map.set(id,[]);map.get(id).push(range);};
  for(const visit of visits.filter(filter))for(const {spanId,start,end} of visit.ranges){
   const base=byId.get(spanId);if(!base)continue;
   append(bySpan,spanId,[start,end]);
   for(const peer of base.parallel||[]){
    const range=peer.flip?[FULL-end,FULL-start]:[start,end];
    if(byId.has(peer.id))append(bySpan,peer.id,range);
    else{if(!shared.has(peer.id))shared.set(peer.id,{...peer,ranges:[]});shared.get(peer.id).ranges.push(range);}
   }
  }
  let metres=0,sharedMetres=0;
  for(const [id,items] of bySpan){
   const joined=merge(items);bySpan.set(id,joined);
   metres+=lengthIn(joined,byId.get(id).metres);
  }
  for(const extra of shared.values()){
   extra.ranges=merge(extra.ranges);extra.covered=lengthIn(extra.ranges,extra.metres);
   sharedMetres+=extra.covered;
  }
  return {bySpan,metres,shared,sharedMetres};
 }
 const lengthIn=(intervals,metres)=>intervals.reduce((sum,[a,b])=>sum+(b-a)*metres/FULL,0);
 function dailyCoverage(spans,visits){
  const days=new Map(),seen=new Map(),lengths=new Map(spans.map(s=>[s.id,s.metres]));
  for(const visit of visits){if(!days.has(visit.day))days.set(visit.day,[]);days.get(visit.day).push(visit);}
  return [...days.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([day,entries])=>{
   const result=coverage(spans,entries);
   let metres=0,sharedMetres=0;
   for(const [id,next,length,extra] of [...[...result.bySpan].map(([id,ranges])=>[id,ranges,lengths.get(id),false]),...[...result.shared].map(([id,peer])=>[id,peer.ranges,peer.metres,true])]){
    const old=seen.get(id)||[],combined=merge([...old,...next]),growth=lengthIn(combined,length)-lengthIn(old,length);
    seen.set(id,combined);
    if(extra)sharedMetres+=growth;else metres+=growth;
   }
   return {day,metres,sharedMetres,track:entries.reduce((n,v)=>n+(v.trackMetres||0),0)};
  });
 }
 function routePlan(raw){
  const date=String(raw?.start||''),start=new Date(date+'T12:00:00Z'),metresPerDay=Number(raw?.metresPerDay);
  if(!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(+start)||start.toISOString().slice(0,10)!==date||
   !Number.isFinite(metresPerDay)||metresPerDay<100||metresPerDay>250000)return null;
  return {start:date,metresPerDay:Math.round(metresPerDay),source:raw.source==='history'?'history':'manual'};
 }
 function schedule(plan,metres){
  const out=[];
  if(!plan||!metres)return out;
  const date=new Date(plan.start+'T12:00:00Z');
  for(let remaining=metres,i=0;remaining>.001&&i<3660;i++,date.setUTCDate(date.getUTCDate()+1)){
   if(date.getUTCDay()===6||date.getUTCDay()===0)continue;
   const target=Math.min(remaining,plan.metresPerDay);remaining-=target;
   out.push({day:date.toISOString().slice(0,10),metres:target});
  }
  return out;
 }
 function capacity(routes,visits,assignee){
  const days=new Map();
  for(const group of campaignParts(routes.filter(r=>r.assignee===assignee))){
   const ids=new Set(group.map(r=>r.id));
   for(const entry of dailyCoverage(group.flatMap(r=>r.spans),visits.filter(v=>ids.has(v.routeId))))days.set(entry.day,(days.get(entry.day)||0)+entry.metres+entry.sharedMetres);
  }
  const last=[...days].sort(([a],[b])=>b.localeCompare(a)).slice(0,20).map(([,m])=>m).sort((a,b)=>a-b);
  const middle=last.length>>1,metres=last.length%2?last[middle]:(last[middle-1]+last[middle])/2;
  return {days:last.length,metres:last.length>=3&&metres>=100?Math.round(metres):0};
 }
 function portion(span,start,end){
  if(start===0&&end===FULL)return span.line;
  const cumulative=[0];
  for(let i=1;i<span.line.length;i++)cumulative.push(cumulative[i-1]+distance(span.line[i-1],span.line[i]));
  const total=cumulative.at(-1),a=total*start/FULL,b=total*end/FULL;
  function point(target){
   let i=cumulative.findIndex(value=>value>=target);
   if(i<=0)return span.line[0];
   const width=cumulative[i]-cumulative[i-1],fraction=width?(target-cumulative[i-1])/width:0;
   return span.line[i-1].map((v,axis)=>v+(span.line[i][axis]-v)*fraction);
  }
  return [point(a),...span.line.filter((_,i)=>cumulative[i]>a&&cumulative[i]<b),point(b)];
 }
 function trailMetres(trails){
  return trails.reduce((sum,line)=>sum+line.slice(1).reduce((m,[lat,lon],i)=>m+distance([line[i][1],line[i][0]],[lon,lat]),0),0);
 }
 function phase(zone,section){
  return ({'URBANO:1':1,'URBANO:2':1,'URBANO:3':2,'RURAL:1':3,'RURAL:2':3,'RURAL:3':4})[key(zone)+':'+key(section).replace(/^T/,'').trim()]||0;
 }
 const day=at=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Rio_Branco',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
 return {FULL,DEFAULT_BUFFER,bufferMetres,bufferRings,spansInsideArea,spanAtPoint,campaignParts,pendingPaths,roadStops,matchedRanges,metres,mapLines,dailyCoverage,routePlan,schedule,capacity,pendingColor,confirmedColor,haloColor,streetDirections,routeParts,outletOrder,keySections,keyProgress,text,key,codes,sections,sectionLabel,identifier,distance,first,last,span,feature,order,merge,remaining,coverage,portion,trailMetres,phase,day};
})();
if(typeof module!=='undefined')module.exports=CampoRoutes;

'use strict';
const CampoSpanQuality=(()=>{
 const threshold=60;
 const coordinate=(value,max)=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value))&&Math.abs(Number(value))<=max;
 const point=pair=>Array.isArray(pair)&&coordinate(pair[0],180)&&coordinate(pair[1],90);
 const key=value=>String(value??'').trim().toUpperCase();
 const metresPerDegree=Math.PI*6371000/180;

 function measure(lat,lon,geometry){
  if(!coordinate(lat,90)||!coordinate(lon,180))return null;
  lat=Number(lat);lon=Number(lon);
  const east=metresPerDegree*Math.cos(lat*Math.PI/180);
  if(east<1)return null;
  const lines=geometry?.type==='LineString'?[geometry.coordinates]:
   geometry?.type==='MultiLineString'?geometry.coordinates:[];
  let best=null;
  for(const line of lines||[]){
   if(!Array.isArray(line))continue;
   for(let i=1;i<line.length;i++){
    const a=line[i-1],b=line[i];
    if(!point(a)||!point(b))continue;
    const x=(a[0]-lon)*east,y=(a[1]-lat)*metresPerDegree;
    const dx=(b[0]-a[0])*east,dy=(b[1]-a[1])*metresPerDegree;
    const length=dx*dx+dy*dy;
    if(!length)continue;
    const t=Math.max(0,Math.min(1,-(x*dx+y*dy)/length));
    const metres=Math.hypot(x+t*dx,y+t*dy);
    if(!best||metres<best.metres)best={metres,nearest:[Number(a[0])+t*(b[0]-a[0]),Number(a[1])+t*(b[1]-a[1])]};
   }
  }
  return best;
 }
 function select(matches,feeder){
  if(matches.length===1)return matches[0];
  const exact=key(feeder)?matches.filter(match=>key(match.feeder)===key(feeder)):[];
  return exact.length===1?exact[0]:null;
 }
 function reference(record,nearest){
  const span=String(record.span??'').trim();
  if(!span||span.length>1000||!coordinate(record.lat,90)||!coordinate(record.lon,180)||!point(nearest))return null;
  return {span,feeder:key(record.feeder),lat:Number(record.lat),lon:Number(record.lon),nearest:nearest.slice(0,2).map(Number)};
 }
 function read(record){
  const stored=record.spanReference;
  if(!stored||key(stored.span)!==key(record.span)||key(stored.feeder)!==key(record.feeder)||
   stored.lat!==Number(record.lat)||stored.lon!==Number(record.lon))return null;
  const checked=reference(record,stored.nearest);
  if(!checked)return null;
  return {...checked,metres:metresPerDegree*Math.hypot((checked.nearest[0]-checked.lon)*Math.cos(checked.lat*Math.PI/180),checked.nearest[1]-checked.lat)};
 }
 const format=metres=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:1}).format(metres>threshold&&metres<threshold+.05?threshold+.1:metres);
 const alert=check=>check?.metres>threshold?'A árvore está a '+format(check.metres)+' m do vão '+check.span+'. Confira o ponto no mapa e o ID do vão.':'';
 return {threshold,key,measure,select,reference,read,format,alert};
})();
if(typeof window!=='undefined')window.CampoSpanQuality=CampoSpanQuality;
if(typeof module!=='undefined')module.exports=CampoSpanQuality;

'use strict';
// Mesma fórmula de risco da análise VERA (analise_vera.py), para as inspeções novas do campo.
// tests/gestao-risco.cjs compara o resultado com o Python; qualquer mudança aqui precisa ser igual lá.
(()=>{
 const H_MT=9,H_BT=7,ESBELTEZ=80,FRAGEIS=['EUCALIPTO','EMBAÚBA','EMBAUBA','LEUCENA','BAMBU','BAMBÚ','PINHEIRO','PINUS','ACÁCIA','FLAMBOYANT','PAU-DE-BALSA','PAU DE BALSA','GUAPURUVU'],ALERTA=/crítico|inclinad|mort|decepad/i,PESO={T1:1,T2:.8},SOBE={'MÉDIO':'ALTO','BAIXO':'MÉDIO','SEM RISCO':'MÉDIO'};
 const rede=v=>{const n=num(v);return n<0?NaN:n;},num=v=>{if(v===null||v===undefined||v==='')return NaN;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:NaN;};
 const round=(v,d)=>{const f=10**d;return Math.round(v*f)/f;};
 // Entrada: altura, distâncias (m), DAP (cm), espécie, alerta, projeção, clientes, trecho, vendaval, clientesMax.
 function calcular(a){let h=num(a.altura);if(h<=0)h=NaN;if(h>40)h=round(h/10,1);const dmt=rede(a.distMT),dbt=rede(a.distBT),raio=Number.isFinite(h)?Math.min(6,Math.max(1.5,.25*h)):NaN;let d=num(a.distRede);if(!Number.isFinite(d)){const base=Number.isFinite(dmt)?dmt:Number.isFinite(dbt)?dbt:1;d=base+raio;}
  const alcanca=(alt)=>Number.isFinite(h)&&Number.isFinite(d)&&h*h>=d*d+alt*alt,alcancaMT=alcanca(H_MT),alcancaBT=alcanca(H_BT),copa=dmt<=.5||dbt<=.3;
  const dap=num(a.dap),altaFina=Boolean(a.dapMedido)&&dap>0&&Number.isFinite(h)&&h/(dap/100)>=ESBELTEZ,especie=String(a.especie||'').toUpperCase(),fragil=FRAGEIS.some(e=>especie.includes(e)),alerta=ALERTA.test(String(a.alerta||''));
  const prob=Math.max(0,Math.min(100,(alcancaMT?40:0)+(!alcancaMT&&alcancaBT?25:0)+(copa?20:0)+(dmt>.5&&dmt<=1.5?10:0)+(altaFina?15:0)+(fragil?10:0)+(h>=15?10:0)+(alerta?15:0)+(a.projecao==='SIM'?10:0)));
  const clientes=num(a.clientes)||0,maximo=Math.max(num(a.clientesMax)||0,1);let impacto=Math.sqrt(clientes/maximo)*(PESO[a.trecho]??.6)*(a.vendaval==='Sim'?1.15:1);impacto=round(Math.max(0,Math.min(1,impacto)),3);
  const prioridade=round(prob*(.4+.6*impacto),1),real=alcancaMT||alcancaBT||copa,calculada=!real?'SEM RISCO':prioridade>=60?'CRÍTICO':prioridade>=40?'ALTO':prioridade>=25?'MÉDIO':'BAIXO',forte=calculada==='CRÍTICO'||calculada==='ALTO';
  // Foto que não sustenta manda revisar em campo; foto que confirma sobe um nível.
  let classe=calculada;if(a.verificacao==='NÃO CONFIRMADA'&&forte)classe='REVISAR EM CAMPO';else if(a.verificacao==='CONFIRMADA'&&a.elevar!==false)classe=SOBE[calculada]||calculada;
  let acao=real?'Monitorar no ciclo':'Sem ação';if(classe==='CRÍTICO'||classe==='ALTO'){if(forte&&alcancaMT&&(altaFina||fragil||ALERTA.test(String(a.obsAcao??a.alerta??''))||h>=15))acao='Supressão (com compensação SEMEIA)';else acao=copa||alcancaMT?'Poda de redução/afastamento':'Poda de limpeza';}
  const motivo=[];if(alcancaMT)motivo.push('alcança a MT se cair ('+h+' m a '+round(d,1)+' m da rede)');else if(alcancaBT)motivo.push('alcança a BT se cair ('+h+' m)');if(copa)motivo.push('copa encostada na rede');if(altaFina)motivo.push('alta e fina');if(fragil)motivo.push('espécie de queda/quebra frequente');if(alerta)motivo.push('alerta na observação do campo');
  return {classeCalculada:calculada,altura:Number.isFinite(h)?h:null,distRede:Number.isFinite(d)?round(d,1):null,prob,impacto,prioridade,classe,acao,alcancaMT:alcancaMT?'SIM':'NÃO',motivo:motivo.join('; ')};}
 const plain=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
 const nomes=s=>plain(s).split(/[,;/]/).map(x=>x.trim()).filter(Boolean);
 const metros=(a,b)=>{const y=(a.lat-b.lat)*111320,x=(a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(x,y);};
 // Possível duplicata: mesma espécie a poucos metros. Árvores diferentes lado a lado não são marcadas.
 function duplicatas(novas,base,limite=15){const cell=.0005,grid=new Map(),key=(la,lo)=>Math.floor(la/cell)+':'+Math.floor(lo/cell);for(const b of base)for(const p of b.pontos){const k=key(p.lat,p.lon);if(!grid.has(k))grid.set(k,[]);grid.get(k).push({...p,id:b.id,especies:nomes(b.especies)});}
  const out=new Map();for(const n of novas){if(!Number.isFinite(n.lat)||!Number.isFinite(n.lon))continue;const esp=nomes(n.especies),ci=Math.floor(n.lat/cell),cj=Math.floor(n.lon/cell);let melhor=null;for(let i=ci-1;i<=ci+1;i++)for(let j=cj-1;j<=cj+1;j++)for(const c of grid.get(i+':'+j)||[]){if(c.id===n.id||!c.especies.some(e=>esp.includes(e)))continue;const m=metros(n,c);if(m<=limite&&(!melhor||m<melhor.m))melhor={id:c.id,m:Math.round(m)};}if(melhor)out.set(n.id,melhor);}return out;}
 const api={calcular,duplicatas};if(typeof module!=='undefined')module.exports=api;globalThis.CampoRisco=api;if(typeof window!=='undefined')window.CampoRisco=api;
})();

/* Regras compartilhadas pelo parque administrativo e pela consulta gerencial. */
globalThis.CampoParqueRegistros=(()=>{
 const CAMPO='Campo (prévia)',riscoCore=globalThis.CampoRisco;
 const position=t=>Number.isFinite(Number(t.lat))&&Number.isFinite(Number(t.lon))&&t.lat!==null&&t.lat!=='';
 function liveTree(r,referencia){const year=Date.parse(r.createdAt),info=referencia?.alimentadores?.[r.feeder]||{},lat=Number(r.lat),lon=Number(r.lon),dap=Number(r.dap)>0?Number(r.dap):Number(r.circ)>0?Number(r.circ)/Math.PI:null,risco=riscoCore.calcular({altura:r.height,distMT:r.mtDistance,distBT:r.btDistance,dap,dapMedido:dap!==null,especie:r.species,alerta:r.note,verificacao:r.review?.verificacao,projecao:/proje|abaixo/i.test(r.position)?'SIM':'',clientes:info.clientes||0,trecho:info.trecho,vendaval:info.vendaval,clientesMax:referencia?.clientesMax});return {...risco,raw:r,qtd:r.count,photoAsset:r.photoAsset,conferencia:r.review,id:r.id,origem:CAMPO,ano:Number.isFinite(year)?new Date(year).getFullYear():'',especies:r.species,poste:r.pole,vao:r.span,alimentador:r.feeder,trecho:info.trecho||'',clientes:info.clientes||0,clientesEstimado:true,semReferencia:!referencia?.alimentadores?.[r.feeder],verificacao:r.review?.verificacao||'NÃO CONFERIDA',dap,origemDap:dap===null?'Sem medição':'Medido em campo',lat:Number.isFinite(lat)&&r.lat!==null&&r.lat!==''?lat:null,lon:Number.isFinite(lon)&&r.lon!==null&&r.lon!==''?lon:null,data:Number.isFinite(year)?new Date(year).toLocaleDateString('pt-BR',{timeZone:'America/Rio_Branco'}):'',obsFoto:r.review?.obs||r.note};}
 const originalPoint=t=>{const m=/(-?\d+[.,]\d+)\s*;\s*(-?\d+[.,]\d+)/.exec(String(t.coordOriginal||''));return m?{lat:Number(m[1].replace(',','.')),lon:Number(m[2].replace(',','.'))}:null;};
 const baseId=id=>id.startsWith('vera-')?id.slice(5):'';
 function comCampo(b,t,referencia){const r=t.raw,valor=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),distMT=r.mt&&valor(r.mtDistance)?r.mtDistance:null,distBT=r.bt&&valor(r.btDistance)?r.btDistance:null,medida=distMT!==null||distBT!==null,verificacao=r.review?.verificacao||(['NÃO CONFIRMADA','SEM PROJEÇÃO NA FOTO'].includes(b.verificacao)?'NÃO CONFERIDA':b.verificacao),original=String(b.observacao||''),texto=String(r.note||''),nota=original&&texto.startsWith(original)?texto.slice(original.length).replace(/^[\s;,.-]+/,''):texto,ano=Number(b.ano),dapNovo=t.dap!==null&&!(Number(b.dap)>0&&Math.abs(t.dap-Number(b.dap))<.06),dap=dapNovo?t.dap:b.dap,dapMedido=dapNovo||!/^(Média|Sem)/.test(b.origemDap||''),especie=r.species||(b.especieConf?'':b.especies),projecao=r.projection==='sim'?'SIM':r.projection==='nao'?'':b.projecao==='SIM'?'SIM':'',risco=riscoCore.calcular({altura:valor(r.height)?r.height:b.altura,distMT,distBT,distRede:medida?null:b.distRede,dap,dapMedido,especie,alerta:ano===2026?[b.obsFoto,nota].filter(Boolean).join('; '):nota,obsAcao:[b.obsFoto,nota,r.review?.obs].filter(Boolean).join('; '),verificacao,elevar:ano===2025,projecao,clientes:b.clientes,trecho:b.trecho,vendaval:b.vendaval,clientesMax:referencia?.clientesMax});return {...b,...risco,campoId:t.id,raw:r,conferencia:r.review,photoAsset:r.photoAsset,especies:r.species||b.especies,especieConf:r.species?'':b.especieConf,dap,origemDap:dapNovo?'Medido em campo (app)':b.origemDap,lat:t.lat??b.lat,lon:t.lon??b.lon,poste:r.pole||b.poste,vao:r.span||b.vao,alimentador:r.feeder||b.alimentador,verificacao,obsFoto:r.review?.obs||nota||b.obsFoto,atualizadoEm:r.updatedAt,atualizadoPor:r.actor};}
 function merge(base,live,mergedIds,referencia){const activeBase=base.filter(t=>!mergedIds.has('vera-'+t.id)),ids=new Set(activeBase.map(t=>t.id)),campo=new Map(live.filter(t=>ids.has(baseId(t.id))).map(t=>[baseId(t.id),t])),novas=live.filter(t=>!ids.has(baseId(t.id))),atual=activeBase.map(b=>campo.has(b.id)?comCampo(b,campo.get(b.id),referencia):b),pool=[...atual.filter(position).map(t=>({id:t.id,especies:t.especies,pontos:[{lat:Number(t.lat),lon:Number(t.lon)},originalPoint(t)].filter(Boolean)})),...novas.filter(position).map(t=>({id:t.id,especies:t.especies,pontos:[{lat:t.lat,lon:t.lon}]}))],found=riscoCore.duplicatas(novas,pool);for(const t of novas){const d=found.get(t.id);t.duplicataDe=d?.id;t.duplicataM=d?.m;t.duplicata=d?'Sim':'';}return [...atual,...novas];}
 return {liveTree,merge};
})();

const ROUTE_REFERENCE_KEY='arbora:mt-reference:2026-08-03';
async function routeReference(request,env,admin){
 if(!admin)throw sharedError('Complemento de rede restrito à gestão.',403);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 const manifest=await env.LOGIN_GUARD?.get(ROUTE_REFERENCE_KEY,'json');
 if(!Number.isInteger(manifest?.parts)||manifest.parts<1||manifest.parts>32||!Number.isInteger(manifest.size)||manifest.size<1||manifest.size>6000000)throw sharedError('Complemento VERA ainda não está disponível na base central.',404);
 const parts=await Promise.all(Array.from({length:manifest.parts},(_,i)=>env.LOGIN_GUARD.get(ROUTE_REFERENCE_KEY+':'+i,'arrayBuffer')));
 if(parts.some(part=>!part)||parts.reduce((size,part)=>size+part.byteLength,0)!==manifest.size)throw sharedError('Complemento VERA incompleto. Tente novamente.',503);
 return new Response(new Blob(parts),{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
const ROUTE_GEOMETRY_KEY='arbora:route-geometry:campo-20260803-v2';
async function routeGeometry(request,env,admin){
 if(!admin)throw sharedError('Rede MT do planejador restrita à gestão.',403);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 const manifest=await env.LOGIN_GUARD?.get(ROUTE_GEOMETRY_KEY,'json');
 if(!manifest?.feeders?.length||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>40||!Number.isInteger(manifest.size)||manifest.size>12000000)throw sharedError('A rede MT do planejador está indisponível.',503);
 if(new URL(request.url).searchParams.has('catalog'))return json({feeders:manifest.feeders,count:manifest.count});
 const parts=await Promise.all(Array.from({length:manifest.parts},(_,i)=>env.LOGIN_GUARD.get(ROUTE_GEOMETRY_KEY+':'+i,'arrayBuffer')));
 if(parts.some(part=>!part)||parts.reduce((size,part)=>size+part.byteLength,0)!==manifest.size)throw sharedError('Arquivo da rede MT incompleto. Tente novamente.',503);
 return new Response(new Blob(parts),{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
function visibleRoutes(routes){
 return CampoRoutes.campaignParts(routes).flatMap(parts=>{
  const plan=parts[0].campaign;
  if(!plan)return parts;
  return parts.length===plan.total&&parts.every((part,i)=>part.campaign?.index===i+1&&part.campaign.total===plan.total&&part.assignee===parts[0].assignee)?parts:[];
 });
}
const ROUTE_TABLES=[
 'CREATE TABLE IF NOT EXISTS campo_routes (id TEXT PRIMARY KEY, assignee TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_routes_assignee ON campo_routes(assignee,created_at)',
 'CREATE TABLE IF NOT EXISTS campo_route_visits (id TEXT PRIMARY KEY, route_id TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, received_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_route_visits_route ON campo_route_visits(route_id,received_at)',
 'CREATE TABLE IF NOT EXISTS campo_route_returns (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL UNIQUE, route_id TEXT NOT NULL, assignee TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_route_returns_assignee ON campo_route_returns(assignee,created_at)'
];
const ROUTE_RETURN_REASONS={acesso:'Acesso impedido',seguranca:'Condição insegura',rede:'Dados ou traçado da rede incorretos',area:'Fora da área ou atribuição',reprogramacao:'Reprogramação operacional',homologacao:'Homologação',outro:'Outro',gestao_reatribuicao:'Reatribuição pela gestão',gestao_correcao:'Correção da rota pela gestão',gestao_homologacao:'Homologação ou teste da gestão',gestao_solicitacao:'Solicitação do inspetor à gestão',gestao_outro:'Retirada pela gestão'};
async function authorizeRouteHomologation(request,env,db,input){
 const login=String(input.adminLogin||'').trim().toLowerCase(),password=input.adminPassword;
 if(!login||login.length>254||typeof password!=='string'||!password||password.length>128)throw sharedError('Administrador ou senha incorretos.',401);
 await campoPasswordRateLimit(request,env,'route-homologation:'+login);
 const administrator=await db.prepare("SELECT u.id,u.name,u.role,u.blocked,c.password_hash,c.salt FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE (c.username=? COLLATE NOCASE OR u.email=? COLLATE NOCASE) AND u.role='admin' AND u.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id AND deleted_at IS NOT NULL)").bind(login,login).first();
 if(!await checkCampoPassword(password,administrator,env))throw sharedError('Administrador ou senha incorretos.',401);
 return {id:administrator.id,name:administrator.name};
}
function routeIsTest(route){
 return route.homologation===true||['homologacao','gestao_homologacao'].includes(route.returned?.reasonCode);
}
const validRouteOutlet=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
async function routeUpdateOutlet(db,input){
 const {routeId,outlet}=input;
 if(!CampoRoutes.identifier(routeId)||!validRouteOutlet(outlet))throw sharedError('Selecione a saída da subestação no mapa.');
 const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first();
 if(!entry)throw sharedError('Rota não encontrada.',404);
 const route=JSON.parse(entry.data);
 if(route.deletedAt)throw sharedError('Rota indisponível.',404);
 if(route.outlet&&JSON.stringify(route.outlet)!==JSON.stringify(outlet))throw sharedError('A saída já foi vinculada a esta rota. Preserve a referência das chaves já confirmadas.',409);
 const args=route.campaign?[route.assignee,route.campaign.id]:[route.id];
 const where=route.campaign?"assignee=? AND json_extract(data,'$.campaign.id')=?":"id=?";
 const {results}=await db.prepare('SELECT data FROM campo_routes WHERE '+where).bind(...args).all();
 if(!CampoRoutes.keySections(visibleRoutes(results.map(row=>JSON.parse(row.data))).flatMap(part=>part.spans),outlet).length)throw sharedError('A saída não tem conexão inequívoca com uma ponta T1 da rota.');
 const edited=await db.prepare("UPDATE campo_routes SET data=json_set(data,'$.outlet',json(?)) WHERE "+where+" AND json_extract(data,'$.outlet') IS NULL AND json_extract(data,'$.deletedAt') IS NULL").bind(JSON.stringify(outlet),...args).run();
 if(!edited.meta?.changes&&!route.outlet)throw sharedError('A rota mudou durante o vínculo. Atualize a tela.',409);
 return json({ok:true});
}
async function routeUpdateTest(db,input){
 const {routeId,action}=input;
 if(!CampoRoutes.identifier(routeId)||!['classify','delete'].includes(action))throw sharedError('Informe uma rota válida.');
 const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first();
 if(!entry)throw sharedError('Rota não encontrada.',404);
 const route=JSON.parse(entry.data),scope=route.campaign?.id||route.id;
 const returned=await db.prepare('SELECT data FROM campo_route_returns WHERE scope_id=?').bind(scope).first();
 if(action==='delete'&&!routeIsTest({...route,returned:returned?JSON.parse(returned.data):null}))throw sharedError('Classifique a rota como homologação antes de excluir.',409);
 const rows=route.campaign?await db.prepare("SELECT data FROM campo_routes WHERE assignee=? AND json_extract(data,'$.campaign.id')=?").bind(route.assignee,scope).all():{results:[entry]};
 const stamp=new Date().toISOString(),parts=rows.results.map(row=>JSON.parse(row.data));
 if(parts.some(part=>part.deletedAt))return json({ok:true});
 const where=route.campaign?"assignee=? AND json_extract(data,'$.campaign.id')=?":"id=?";
 const args=route.campaign?[route.assignee,scope]:[route.id];
 const assign=action==='delete'?"json_set(data,'$.homologation',json('true'),'$.deletedAt',?)":"json_set(data,'$.homologation',json('true'))";
 await db.prepare("UPDATE campo_routes SET data="+assign+" WHERE "+where+" AND json_extract(data,'$.deletedAt') IS NULL").bind(...(action==='delete'?[stamp,...args]:args)).run();
 return json({ok:true});
}
async function routeKeyRanges(db,route,check){
 if(!check||typeof check.code!=='string'||!Array.isArray(check.segments)||!check.segments.length||check.segments.length>250||new Set(check.segments).size!==check.segments.length)throw sharedError('Selecione a chave e os trechos vistoriados.');
 const rows=route.campaign?await db.prepare("SELECT data FROM campo_routes WHERE assignee=? AND json_extract(data,'$.campaign.id')=?").bind(route.assignee,route.campaign.id).all():{results:[{data:JSON.stringify(route)}]};
 const parts=visibleRoutes(rows.results.map(row=>JSON.parse(row.data)).filter(part=>!part.deletedAt));
 if(!parts.length)throw sharedError('Rota ainda indisponível.',409);
 const section=CampoRoutes.keySections(parts.flatMap(part=>part.spans),route.outlet).find(part=>part.code===check.code);
 const byId=new Map((section?.segments||[]).map(segment=>[segment.id,segment]));
 if(check.segments.some(id=>!byId.has(id)))throw sharedError('A chave ou derivação não pertence a esta rota.',409);
 return check.segments.flatMap(id=>byId.get(id).ids.map(spanId=>({spanId,start:0,end:CampoRoutes.FULL})));
}
async function routeAPI(request,env){
 try{
  const admin=isAdministrator(request,env),actor=env.CAMPO_USER?.id,url=new URL(request.url),path=url.pathname;
  if(path==='/api/routes/geometry')return await routeGeometry(request,env,admin);
  if(path==='/api/routes/reference')return await routeReference(request,env,admin);
  if(!admin&&!actor)throw sharedError('Entre com sua conta para acessar as rotas.',403);
  const db=await adminDb(env);
   await db.batch(ROUTE_TABLES.map(sql=>db.prepare(sql)));
  if(path==='/api/routes'&&request.method==='GET'){
   const all=admin&&url.searchParams.get('mine')!=='1';
   if(!all&&!actor)throw sharedError('Entre com uma conta de inspetor.',403);
   try{
    const routeQuery=all?db.prepare('SELECT data FROM campo_routes ORDER BY created_at DESC'):db.prepare('SELECT data FROM campo_routes WHERE assignee=? ORDER BY created_at DESC').bind(actor);
    const visitQuery=all?db.prepare('SELECT data,received_at FROM campo_route_visits ORDER BY received_at'):db.prepare('SELECT data,received_at FROM campo_route_visits WHERE actor=? ORDER BY received_at').bind(actor);
     const returnQuery=all?db.prepare('SELECT data FROM campo_route_returns ORDER BY created_at DESC'):db.prepare('SELECT data FROM campo_route_returns WHERE assignee=? ORDER BY created_at DESC').bind(actor);
     const [a,b,c]=await Promise.all([routeQuery.all(),visitQuery.all(),returnQuery.all()]);
     const returns=c.results.map(row=>JSON.parse(row.data)),byScope=new Map(returns.map(item=>[item.scopeId,item]));
     let routes=visibleRoutes(a.results.map(row=>JSON.parse(row.data)).filter(route=>!route.deletedAt)).map(route=>{const returned=byScope.get(route.campaign?.id||route.id);return returned?{...route,returned}:route;});
     if(!all)routes=routes.filter(route=>!route.returned);
     const ids=new Set(routes.map(route=>route.id));
    const visits=b.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at})).filter(visit=>ids.has(visit.routeId));
     const deletedIds=all?[]:a.results.map(row=>JSON.parse(row.data)).filter(route=>route.deletedAt).map(route=>route.id);
    return json({routes,visits,returns,...(deletedIds.length?{deletedIds}:{})});
    }catch(error){if(centralMissingTable(error))return json({routes:[],visits:[],returns:[]});throw error;}
  }
  if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
  const input=await sharedBody(request,500000),now=new Date().toISOString();
  if(path==='/api/routes/saida'&&admin){
   const result=await routeUpdateOutlet(db,input);
   await realtimePublish(env,'route-assigned');
   return result;
  }
  if(path==='/api/routes/homologacao'&&admin){
   const result=await routeUpdateTest(db,input);
   await realtimePublish(env,'route-return');
   return result;
  }
  if(path==='/api/routes'&&admin){
   const {id,assignee}=input||{};
   if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(assignee)||!Array.isArray(input.spans)||!input.spans.length||input.spans.length>250)throw sharedError('Informe o inspetor e até 250 vãos.');
   const {text,key,phase:priority,sections:validSections}=CampoRoutes;
   const name=text(input.name),fallback={locality:key(input.locality),feeder:key(input.feeder),zone:key(input.zone),section:key(input.section).replace(/^T/,'')};
   let spans;
   try{spans=input.spans.map(CampoRoutes.span);}catch(error){throw sharedError(error.message);}
   const derive=input.fromNetwork===true;
   if(derive)spans=spans.map(s=>({...s,locality:s.locality||fallback.locality,feeder:s.feeder||fallback.feeder,zone:s.zone||fallback.zone,section:s.section||fallback.section}));
   if(!name||new Set(spans.map(s=>s.id)).size!==spans.length)throw sharedError('Informe o nome da rota e revise os vãos repetidos.');
   if(derive&&spans.some(s=>!s.feeder||!s.locality||!priority(s.zone,s.section)))throw sharedError('Complete os dados ausentes na rede: localidade, alimentador, zona ou trecho.');
   if(!derive&&(!fallback.locality||!fallback.feeder||!priority(fallback.zone,fallback.section)||spans.some(s=>Object.keys(fallback).some(k=>s[k]&&s[k]!==fallback[k]))))throw sharedError('Revise localidade, alimentador, zona e trecho dos vãos.');
   const values=field=>[...new Set(spans.map(s=>s[field]))].sort();
   const sections=derive?validSections(values('section')):[fallback.section];
   const locality=derive?values('locality').join(' / '):fallback.locality;
   const feeder=derive?values('feeder').join(' / '):fallback.feeder;
   const zone=derive?values('zone').join(' / '):fallback.zone;
   const section=sections[0],phase=derive?Math.min(...spans.map(s=>priority(s.zone,s.section))):priority(zone,section);
   const buffer=CampoRoutes.bufferMetres(input.buffer),plan=CampoRoutes.routePlan(input.plan);
   if(input.plan!=null&&!plan)throw sharedError('Informe a data inicial e uma capacidade diária válida.');
   const campaign=input.campaign;
   const outlet=input.outlet;
   if(outlet!==undefined&&!validRouteOutlet(outlet))throw sharedError('Selecione a saída da subestação no mapa.');
   if(campaign&&(!CampoRoutes.identifier(campaign.id)||!Number.isInteger(campaign.index)||!Number.isInteger(campaign.total)||campaign.total<2||campaign.total>160||campaign.index<1||campaign.index>campaign.total||id!==campaign.id+'-'+campaign.index||!text(campaign.name)))throw sharedError('Identificação da rota fracionada inválida.');
   const operator=await db.prepare(`SELECT id,name FROM campo_users WHERE id=? AND blocked=0 AND NOT EXISTS (SELECT 1 FROM campo_user_lifecycle WHERE user_id=campo_users.id AND deleted_at IS NOT NULL)`).bind(assignee).first();
   if(!operator)throw sharedError('Selecione uma conta ativa.');
   const route={id,assignee,operator:operator.name,name,locality,feeder,zone,section,...(sections.length>1?{sections}:{}),phase,spans,createdAt:now,...(input.homologation===true?{homologation:true}:{}),...(outlet?{outlet}:{}),...(plan?{plan}:{}),...(input.buffer!=null?{buffer}:{}),...(campaign?{campaign:{id:campaign.id,index:campaign.index,total:campaign.total,name:text(campaign.name)}}:{})};
   if(campaign){
    const peer=await db.prepare('SELECT assignee,data FROM campo_routes WHERE id=?').bind(campaign.id+'-1').first();
    if((peer&&(peer.assignee!==assignee||JSON.stringify(JSON.parse(peer.data).plan||null)!==JSON.stringify(plan)||JSON.stringify(JSON.parse(peer.data).outlet||null)!==JSON.stringify(outlet||null)||Boolean(JSON.parse(peer.data).homologation)!==Boolean(route.homologation)||JSON.parse(peer.data).deletedAt))||(!peer&&campaign.index!==1))throw sharedError('A primeira parte da rota precisa estar gravada para o mesmo inspetor.',409);
   }
   const insert=await db.prepare('INSERT OR IGNORE INTO campo_routes(id,assignee,data,created_at) VALUES(?,?,?,?)').bind(id,assignee,JSON.stringify(route),now).run();
   if(!insert.meta?.changes){const stored=JSON.parse((await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(id).first()).data);const {createdAt:_new,...wanted}=route,{createdAt:_old,...existing}=stored;if(JSON.stringify(wanted)!==JSON.stringify(existing))throw sharedError('Esta rota já foi publicada. Crie uma nova rota para alterar o plano.',409);return json({route:stored});}
   await realtimePublish(env,'route-assigned');
   return json({route},201);
  }
   if(path==='/api/routes/return'&&(actor||admin)){
    const {id,routeId}=input||{},reasonCode=String(input.reasonCode||''),note=CampoRoutes.text(input.note,480);
    const management=reasonCode.startsWith('gestao_');
    if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(routeId)||!ROUTE_RETURN_REASONS[reasonCode]||(['outro','gestao_outro'].includes(reasonCode)&&!note))throw sharedError('Informe a rota e um motivo válido para a devolução.');
    if(management&&!admin)throw sharedError('Somente a gestão pode retirar uma rota do inspetor.',403);
    const entry=management?await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first():await db.prepare('SELECT data FROM campo_routes WHERE id=? AND assignee=?').bind(routeId,actor).first();
    if(!entry)throw sharedError(management?'Rota não encontrada.':'Rota não atribuída à sua conta.',404);
    const route=JSON.parse(entry.data);if(route.deletedAt)throw sharedError('Rota de homologação excluída.',410);const scopeId=route.campaign?.id||route.id;
    const authorizedBy=reasonCode==='homologacao'?await authorizeRouteHomologation(request,env,db,input):null;
    const returnActor=actor||'administrator',returned={id,scopeId,routeId,assignee:route.assignee,actor:returnActor,actorName:env.CAMPO_USER?.name||(management?'Administrador':route.operator||'Inspetor'),source:management?'management':'field',reasonCode,reason:ROUTE_RETURN_REASONS[reasonCode],note,createdAt:now,...(authorizedBy?{authorizedBy}:{})};
    const insert=await db.prepare('INSERT OR IGNORE INTO campo_route_returns(id,scope_id,route_id,assignee,actor,data,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,scopeId,routeId,route.assignee,returnActor,JSON.stringify(returned),now).run();
    if(!insert.meta?.changes){
     const row=await db.prepare('SELECT data FROM campo_route_returns WHERE scope_id=?').bind(scopeId).first(),stored=row&&JSON.parse(row.data);
     if(stored?.id!==id)throw sharedError('Esta rota já foi devolvida.',409);
     return json({returned:stored});
    }
    await realtimePublish(env,'route-return');
    return json({returned},201);
   }
  if(path==='/api/routes/visit'&&actor){
   const {id,routeId,startedAt,endedAt}=input||{},start=Date.parse(startedAt),end=Date.parse(endedAt);
   if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(routeId)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>Date.now()+600000||end-start>7*86400000||
     (!input.keyCheck&&(!Array.isArray(input.ranges)||input.ranges.length>750)))throw sharedError('Dados da vistoria inválidos.');
   const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=? AND assignee=?').bind(routeId,actor).first();
   if(!entry)throw sharedError('Rota não atribuída à sua conta.',404);
   const route=JSON.parse(entry.data),ids=new Set(route.spans.map(s=>s.id));
   if(route.deletedAt)throw sharedError('Rota de homologação excluída.',410);
   const old=await db.prepare('SELECT data,received_at FROM campo_route_visits WHERE id=? AND actor=?').bind(id,actor).first();
   if(old&&input.keyCheck){
    const saved=JSON.parse(old.data);
    if(saved.routeId===routeId&&JSON.stringify(saved.keyCheck)===JSON.stringify(input.keyCheck))return json({visit:{...saved,receivedAt:old.received_at}});
    throw sharedError('O identificador já pertence a outra vistoria.',409);
   }
    if(await db.prepare('SELECT id FROM campo_route_returns WHERE scope_id=?').bind(route.campaign?.id||route.id).first())throw sharedError('A rota já foi devolvida e não aceita novas conclusões.',409);
   const ranges=input.keyCheck?await routeKeyRanges(db,route,input.keyCheck):input.ranges.map(x=>{
    if(!x||!ids.has(x.spanId)||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end>CampoRoutes.FULL||x.start>=x.end)throw sharedError('Vão ou faixa de vistoria inválida.');
    return {spanId:x.spanId,start:x.start,end:x.end};
   });
   const visit={id,routeId,actor,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),day:CampoRoutes.day(end),trackMetres:Math.round(Math.max(0,Math.min(1000000,Number(input.trackMetres)||0))),ranges,reason:CampoRoutes.text(input.reason,480),...(input.keyCheck?{keyCheck:input.keyCheck}:{})};
   if(!ranges.length&&!visit.reason)throw sharedError('Informe por que a rota foi encerrada sem cobertura.');
   const result=await db.prepare("INSERT OR IGNORE INTO campo_route_visits(id,route_id,actor,data,received_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_routes WHERE id=? AND json_extract(data,'$.deletedAt') IS NULL) AND NOT EXISTS(SELECT 1 FROM campo_route_returns WHERE scope_id=?)").bind(id,routeId,actor,JSON.stringify(visit),now,routeId,route.campaign?.id||route.id).run();
   const row=await db.prepare('SELECT data,received_at FROM campo_route_visits WHERE id=? AND actor=?').bind(id,actor).first();
   if(row?.data!==JSON.stringify(visit))throw sharedError('A rota mudou antes de confirmar a vistoria ou o identificador já foi usado.',409);
   if(result.meta?.changes)await realtimePublish(env,'route-visit');
   return json({visit:{...visit,receivedAt:row.received_at}});
  }
  throw sharedError('Operação não permitida.',403);
 }catch(error){return json({error:error.status?error.message:'Rotas temporariamente indisponíveis.'},error.status||503);}
}

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
let activeRequests=0;
function consolidatedLink(value){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(u.username||u.password)return null;
  if(u.origin==='https://drive.google.com'&&/^\/file\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(u.pathname))return u.href;
  if(u.origin==='https://docs.google.com'&&/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(u.pathname))return u.href;
 }catch{}return null;
}
async function limitedBody(request,limit=12*1024*1024){const reader=request.body?.getReader();if(!reader)throw Error('EMPTY');const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('SIZE');}chunks.push(value);}return new Blob(chunks);}
const driveRequestLeases=new Map();
function reserveDriveRequest(){const now=Date.now();for(const [id,deadline]of driveRequestLeases)if(deadline<=now)driveRequestLeases.delete(id);if(driveRequestLeases.size>=2)return null;const id=Symbol();driveRequestLeases.set(id,now+85000);return ()=>driveRequestLeases.delete(id);}
let activeStreetRequests=0;
async function streets(request){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(activeStreetRequests)return json({error:'Download de ruas ocupado. Tente novamente em alguns segundos.'},429);
 let p;try{p=JSON.parse(await(await limitedBody(request,2048)).text());}catch{return json({error:'Área inválida.'},400);}
 if(!Number.isFinite(p.lat)||Math.abs(p.lat)>85||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||![1,2,5,10,11].includes(p.radius))return json({error:'Informe posição válida e raio de consulta válido.'},400);
 const dy=p.radius/111.32,dx=p.radius/(111.32*Math.max(.1,Math.cos(p.lat*Math.PI/180)));
 const box=[Math.max(-85,p.lat-dy),Math.max(-180,p.lon-dx),Math.min(85,p.lat+dy),Math.min(180,p.lon+dx)].join(',');
 const query='[out:json][timeout:25][maxsize:134217728];(way["highway"]('+box+');node["place"]('+box+'););out geom;';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);activeStreetRequests++;
 try{let r;for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'CampoVegetacao/2.9 (manual offline area preparation)'},body:new URLSearchParams({data:query}),signal:controller.signal});if(r.ok)break;}

 if(!r.ok)return json({error:'Serviço de ruas indisponível (HTTP '+r.status+'). Tente novamente mais tarde.'},502);
 const data=JSON.parse(await(await limitedBody(r,16*1024*1024)).text());
 if(data.remark||!Array.isArray(data.elements))return json({error:'Consulta de ruas incompleta. Reduza o raio e tente novamente.'},502);
 return json({elements:data.elements});
 }catch(e){return json({error:e.name==='AbortError'?'Download de ruas excedeu o tempo. Tente novamente.':'Não foi possível obter as ruas. Tente novamente mais tarde.'},504);}finally{clearTimeout(timer);activeStreetRequests--;}
}
async function drive(request,env,status=false,consolidate=false,adminView=false){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(request.method!==(status?'GET':'POST'))return json({error:'Método não permitido.'},405);
 const endpoint=env.GOOGLE_SCRIPT_URL,secret=env.GOOGLE_SCRIPT_TOKEN;
 if(!endpoint||!secret)return status?json({configured:false,connected:false}):json({error:'Google Drive ainda não conectado. Siga Configurar Google Drive na aba Envio.'},503);
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(endpoint))return json({error:'Endereço do receptor Google inválido. Avise o responsável.'},503);
 let payload={action:'status'};
 if(!status){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},400);
  try{payload=JSON.parse(await (await limitedBody(request,30*1024*1024)).text());}catch(e){return json({error:e.message==='SIZE'?'Solicitação excede o limite. Use fotos de até 20 MB.':'Solicitação inválida.'},e.message==='SIZE'?413:400);}
  if(consolidate){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(payload.recordId||'')||!Number.isFinite(Date.parse(payload.version))||!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(payload.version||''))return json({error:'Cadastro inválido.'},400);payload={action:'consolidate',recordId:payload.recordId,version:payload.version};}else{
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(payload.recordId||'')||!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(payload.version||'')||!Number.isFinite(Date.parse(payload.version))||! /^(?:[a-zA-Z0-9_-]+_(?:original\.(?:jpg|png|webp|heic)|georreferenciada\.jpg)|inspecao\.(?:xlsx|kml)|metadados\.json)$/.test(payload.name||'')||typeof payload.base64!=='string'||!payload.base64.length||payload.base64.length>28000000||payload.base64.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64))return json({error:'Arquivo ou identificação inválidos.'},400);
  if(payload.name==='metadados.json'){try{const bytes=Uint8Array.from(atob(payload.base64),c=>c.charCodeAt(0)),metadata=JSON.parse(new TextDecoder().decode(bytes)),missing=CampoInspectionRules.missing(metadata);if(metadata.id!==payload.recordId||metadata.updatedAt!==payload.version)return json({error:'Metadados não correspondem ao cadastro enviado.',code:'INVALID',retryable:false},422);if(missing.length)return json({error:'Preencha antes de sincronizar: '+missing.map(p=>p.label).join(', '),code:'INCOMPLETE',retryable:false},422);}catch{return json({error:'Metadados inválidos.',code:'INVALID',retryable:false},422);}}payload={action:'file',recordId:payload.recordId,version:payload.version,name:payload.name,base64:payload.base64};
  }
 }
 if(!status&&env.SHARED_DB){try{const tree=await env.SHARED_DB.prepare('SELECT deleted FROM shared_trees WHERE id=?').bind(payload.recordId).first();if(tree?.deleted)return json({error:'Árvore excluída pelo administrador. Não será reenviada.',code:'DELETED'},410);}catch{return json({error:'Não foi possível conferir o cadastro. Tente novamente.'},503);}}
 if(!status&&env.PRODUCTION_DATA_EPOCH&&Date.parse(payload.version)<Date.parse(env.PRODUCTION_DATA_EPOCH))return json({error:'Cadastro de homologação encerrado. Atualize o aplicativo.',code:'DELETED'},410);
 const releaseDriveRequest=reserveDriveRequest();if(!releaseDriveRequest)return json({error:'Envio ocupado. Tente novamente em alguns segundos.'},429);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),85000);
 try{
  const result=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:secret}),signal:abort.signal});
  if(!result.ok)return json({error:'Receptor Google indisponível. Confira a implantação e tente novamente.'},502);
  let data;try{data=await result.json();}catch(e){return json({error:'Google retornou uma página de login. Implante como “Eu”, com acesso “Qualquer pessoa”, e use a URL /exec.'},502);}
  if(!data.ok){const errors={AUTH:'Chave da integração Google incorreta. Avise o responsável.',BUSY:'Google ocupado. Tente novamente.',CONFLICT:'Arquivo diferente nesta versão. Edite e salve a inspeção antes de reenviar.',SIZE:'Arquivo excede 20 MB.',INVALID:'Google recusou o formato.',VERIFY:'Google não confirmou o arquivo.',DELETED:'Inspeção excluída pelo administrador. Não será reenviada.',GOOGLE:'Google não concluiu o envio. Confira espaço, permissões e cotas no Apps Script.'};const code=typeof data.code==='string'&&/^[A-Z_]{1,40}$/.test(data.code)?data.code:'RECEIVER_ERROR';let detail=String(data.error||'Sem detalhe fornecido pelo receptor').slice(0,400);detail=detail.split(secret).join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').replace(/[\w.+-]+@[\w.-]+/g,'[conta]');console.warn(JSON.stringify({event:'drive_receiver_error',code,detail,action:payload.action}));return json({error:errors[data.code]||'O receptor Google recusou o envio (código '+code+'). Confira a execução no Apps Script.',code,retryable:['BUSY','GOOGLE','RECEIVER_ERROR'].includes(code)},data.code==='BUSY'?429:502);}
  if(status)return json({configured:true,connected:true,folderName:String(data.folderName||'Pasta de inspeções'),consolidation:data.consolidation===true,management:data.management===true,deletedIds:Array.isArray(data.deletedIds)?data.deletedIds:[],consolidatedUrl:adminView?consolidatedLink(data.consolidatedUrl):null});
  if(consolidate){if(data.consolidated!==true||data.recordId!==payload.recordId||data.version!==payload.version)return json({error:'O receptor não confirmou o ID e a versão do cadastro no Excel único. Os arquivos da inspeção são conferidos separadamente.'},502);return json({consolidated:true,version:data.version,url:isAdministrator(request,env)?consolidatedLink(data.url):null,count:isAdministrator(request,env)?data.count:undefined});}
  if(typeof data.id!=='string'||!Number.isFinite(data.size)||! /^[a-f0-9]{64}$/.test(data.sha256||'')||typeof data.folderId!=='string')return json({error:'Confirmação incompleta do Google. Arquivo continua pendente.'},502);
  return json({id:data.id,size:data.size,sha256:data.sha256,folderId:data.folderId,folderUrl:typeof data.folderUrl==='string'&&data.folderUrl.startsWith('https://drive.google.com/')?data.folderUrl:null});
 }catch(e){return json({error:e.name==='AbortError'?'Google excedeu o tempo de resposta. Reenvie para verificar os arquivos pendentes.':'Falha de conexão com Google. Tente novamente.'},504);}finally{clearTimeout(timer);releaseDriveRequest();}
}
async function adminRepository(request,env,remove=false){
 if(!isAdministrator(request,env))return json({error:'Acesso restrito ao administrador.'},403);
 const url=new URL(request.url),origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Origem não autorizada.'},403);
 if(request.method!==(remove?'POST':'GET'))return json({error:'Método não permitido.'},405);
 if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)return json({error:'Receptor não configurado.'},503);if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(env.GOOGLE_SCRIPT_URL))return json({error:'Receptor inválido.'},503);
 let payload={action:'admin_list',offset:Number(url.searchParams.get('offset')||0),limit:200};
 if(remove){try{const data=JSON.parse(await(await limitedBody(request,20000)).text());if(!Array.isArray(data.records)||!data.records.length||data.records.length>20||data.records.some(r=>! /^[a-zA-Z0-9_-]{1,100}$/.test(r.id||'')||!Number.isFinite(Date.parse(r.version))))throw Error();payload={action:'admin_delete',records:data.records.map(r=>({id:r.id,version:r.version}))};}catch{return json({error:'Selecione de 1 a 20 cadastros válidos.'},400);}}
 if(!remove&&(!Number.isInteger(payload.offset)||payload.offset<0))return json({error:'Página inválida.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);
 try{const response=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:controller.signal});const data=await response.json();if(!response.ok||!data.ok)return json({error:data.code==='CONFLICT'?'Uma inspeção foi alterada em outro aparelho. Atualize a lista antes de excluir.':data.code==='BUSY'?'Repositório ocupado. Tente novamente.':'Atualize o receptor no Apps Script para usar gestão e exclusão. Nenhuma confirmação recebida.',code:data.code||'RECEIVER'},502);
 if(remove){if(!Array.isArray(data.deletedIds)||payload.records.some(r=>!data.deletedIds.includes(r.id)))return json({error:'Exclusão não confirmada. Atualize a lista e tente novamente.'},502);if(env.SHARED_DB)for(const id of data.deletedIds)await env.SHARED_DB.prepare('UPDATE shared_trees SET deleted=1,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND deleted=0').bind(new Date().toISOString(),crypto.randomUUID(),'Administrador',id).run();return json({deletedIds:data.deletedIds});}
 if(!Array.isArray(data.records))return json({error:'Receptor ainda não oferece a lista administrativa. Atualize o Apps Script.'},502);
 return json({records:data.records,deletedIds:data.deletedIds||[],pendingDeletes:data.pendingDeletes||[],nextOffset:data.nextOffset??null,total:data.total,revision:data.revision});
 }catch{return json({error:'Gestão do repositório indisponível. Dados locais preservados.'},504);}finally{clearTimeout(timer);}
}
async function centralNetwork(request,env){
 if(request.method!=='GET')return json({error:'Use GET.'},405);
 const url=new URL(request.url),chunk=url.pathname.endsWith('/chunk'),endpoint=env.GOOGLE_SCRIPT_URL;
 if(!endpoint||!env.GOOGLE_SCRIPT_TOKEN)return json({error:'Receptor Google não configurado.'},503);
 let payload={action:'network_manifest'};
 if(chunk){const offset=Number(url.searchParams.get('offset')),revision=url.searchParams.get('revision');if(!Number.isSafeInteger(offset)||offset<0||!revision||revision.length>200)return json({error:'Bloco inválido.'},400);payload={action:'network_chunk',offset,revision};}
 const releaseDriveRequest=reserveDriveRequest();if(!releaseDriveRequest)return json({error:'Conexão ocupada. Tente novamente.'},429);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);
 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:controller.signal});
  const data=await r.json();if(!r.ok||!data.ok){const errors={REDE_ACCESS:'O receptor não conseguiu acessar a rede privada. Execute configurarRedeCampo no Apps Script.',REDE_FORMAT:'A origem deve ser GPKG ou ZIP contendo GPKG.',REDE_CHANGED:'A rede mudou durante o download. Tente novamente.',REDE_RANGE:'Google não confirmou o bloco da rede.'};return json({error:errors[data.code]||'Atualize o receptor Google na Administração para habilitar a rede central.'},502);}
  if(!chunk){const m=data.network;if(m?.fileId!==env.REDE_CAMPO_ID||!Number.isSafeInteger(m.size)||m.size<1||!/[.](gpkg|zip)$/i.test(m.name||'')||typeof m.revision!=='string')return json({error:'Atualize o receptor Google na Administração para habilitar a rede central.'},502);return json(m);}
  if(data.offset!==payload.offset||data.revision!==payload.revision||typeof data.base64!=='string'||data.base64.length>5600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))return json({error:'Bloco não confirmado. Base local preservada.'},502);
  const binary=atob(data.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
 }catch{return json({error:'Rede central indisponível. Confira a implantação do receptor; a base local continua disponível.'},502);}finally{clearTimeout(timer);releaseDriveRequest();}
}
async function networkBtFeeders(request,env){
 if(request.method!=='GET')return json({error:'Use GET.'},405);
 if(!env.SHARED_DB)return json({error:'Relação BT indisponível.'},503);
 try{const row=await env.SHARED_DB.prepare("SELECT data,revision FROM campo_network_lookup WHERE id='bt-feeder'").first();if(!row)return json({error:'Relação BT ainda não preparada.'},503);const body=atob(row.data);JSON.parse(body);return new Response(body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','ETag':'"'+String(row.revision).replace(/[^a-zA-Z0-9._:-]/g,'')+'"','X-Content-Type-Options':'nosniff'}});}catch{return json({error:'Relação BT indisponível.'},503);}
}
async function identify(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(!env.PLANTNET_API_KEY)return json({error:'Identificação ainda sem chave no servidor. Avise o administrador.'},503);
 if(activeRequests>=2)return json({error:'Identificação ocupada. Tente novamente em alguns segundos.'},429);
 if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return json({error:'Envie as fotos como formulário.'},400);
 activeRequests++;
 try{
  let form;try{const body=await limitedBody(request);form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();}catch(e){return json({error:e.message==='SIZE'?'Fotos excedem 12 MB por solicitação.':'Não foi possível ler as fotos.'},e.message==='SIZE'?413:400);}
  const images=form.getAll('images'),organs=form.getAll('organs');
  if(images.length<1||images.length>5||organs.length!==images.length)return json({error:'Selecione de 1 a 5 fotos da mesma árvore.'},400);
  const upload=new FormData();
  for(let i=0;i<images.length;i++){
   const image=images[i];if(typeof image==='string'||!['image/jpeg','image/png'].includes(image.type)||image.size<1||image.size>5*1024*1024)return json({error:'Use fotos JPEG/PNG de até 5 MB cada.'},400);
   if(!['auto','leaf','bark','flower','fruit'].includes(organs[i]))return json({error:'Órgão da planta inválido.'},400);
   upload.append('images',image,'planta-'+(i+1)+(image.type==='image/png'?'.png':'.jpg'));upload.append('organs',organs[i]);
  }
  const url=new URL('https://my-api.plantnet.org/v2/identify/all');url.searchParams.set('api-key',env.PLANTNET_API_KEY);url.searchParams.set('lang','pt');url.searchParams.set('nb-results','5');url.searchParams.set('type','kt');url.searchParams.set('detailed','true');url.searchParams.set('include-related-images','true');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),55000);
  try{
   const response=await fetch(url,{method:'POST',body:upload,signal:abort.signal});
   if(!response.ok){const errors={401:'Pl@ntNet recusou a chave do servidor. Avise o administrador.',403:'Pl@ntNet bloqueou o acesso do servidor. No portal API, desative “expor minha chave de API” e salve as configurações.',429:'Cota Pl@ntNet esgotada. Tente posteriormente.',404:'Planta não identificada. Fotografe folha, flor ou fruto com mais detalhe.'};return json({error:errors[response.status]||'Serviço de identificação indisponível (HTTP '+response.status+').',providerStatus:response.status},[401,403].includes(response.status)?502:response.status);}
   const data=await response.json();return json({results:data.results||[],version:data.version||null,remainingIdentificationRequests:data.remainingIdentificationRequests??null,predictedOrgans:data.predictedOrgans||[],bestMatch:data.bestMatch||null,preferedReferential:data.preferedReferential||null,otherResults:data.otherResults||null});
  }catch(e){return json({error:e.name==='AbortError'?'Pl@ntNet excedeu o tempo de resposta. Tente novamente.':'Não foi possível conectar ao Pl@ntNet. Tente novamente.'},504);}finally{clearTimeout(timer);}
 }finally{activeRequests--;}
}
function isAdministrator(request,env){
 const id=request.headers.get('oai-authenticated-user-id');
 const email=request.headers.get('oai-authenticated-user-email');
 return Boolean(id&&email&&env.CAMPO_ADMIN_EMAIL&&email.toLowerCase()===env.CAMPO_ADMIN_EMAIL.toLowerCase());
}
const internalApp={async fetch(request,env){
 const url=new URL(request.url);
 if(['/api/routes','/api/routes/visit','/api/routes/return','/api/routes/homologacao','/api/routes/saida','/api/routes/reference','/api/routes/geometry'].includes(url.pathname))return routeAPI(request,env);
 if(url.pathname.startsWith('/api/control/'))return controlAPI(request,env);
 if(url.pathname==='/api/vera/progress')return veraProgressAPI(request,env);
 if(url.pathname.startsWith('/api/vera/'))return veraAPI(request,env);
 if(url.pathname==='/api/ciclo-poda')return cicloPodaAPI(request,env);
 if(url.pathname.startsWith('/api/central/'))return centralAPI(request,env);
 if(/^\/api\/(?:admin\/(?:universe|audit|presence)|team\/presence)(?:[/?]|$)/.test(url.pathname))return adminControlAPI(request,env);
 if(url.pathname==='/api/map/search')return mapAddressSearch(request,env);
 if(url.pathname.startsWith('/api/shared/'))return sharedAPI(request,env);
 if(url.pathname==='/api/network/manifest'||url.pathname==='/api/network/chunk')return centralNetwork(request,env);
 if(url.pathname==='/api/network/bt-feeders')return networkBtFeeders(request,env);
 if(url.pathname==='/api/access')return request.method==='GET'?json({admin:isAdministrator(request,env)}):json({error:'Use GET.'},405);
 if(url.pathname==='/api/admin/drive/status'){
  if(!isAdministrator(request,env))return json({error:'Acesso restrito ao administrador.'},403);
  return drive(request,env,true,false,true);
 }
 if(url.pathname==='/api/streets/area')return streets(request);
 if(url.pathname==='/api/admin/records')return adminRepository(request,env);
 if(url.pathname==='/api/admin/records/delete')return adminRepository(request,env,true);
 if(url.pathname==='/api/drive/status')return drive(request,env,true);
 if(url.pathname==='/api/drive/file')return drive(request,env);
 if(url.pathname==='/api/drive/consolidate')return drive(request,env,false,true);
 if(url.pathname==='/api/plant/identify')return identify(request,env);
 if(url.pathname==='/api/plant/status')return request.method==='GET'?json({configured:Boolean(env.PLANTNET_API_KEY),provider:'Pl@ntNet'}):json({error:'Use GET.'},405);
 if(url.pathname.startsWith('/api/'))return json({error:'Rota não encontrada.'},404);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1),asset=ASSETS[name];if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':name==='sw.js'?'no-cache':'no-cache','X-Content-Type-Options':'nosniff'}});
}};

// Real-time invalidation channel for field and management clients. D1 remains the source of truth.
export class CampoRealtime {
 constructor(ctx,env){this.ctx=ctx;this.env=env;}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/connect'){
   if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket obrigatório.',{status:426,headers:{Upgrade:'websocket'}});
   const pair=new WebSocketPair(),client=pair[0],server=pair[1];
   this.ctx.acceptWebSocket(server);
   server.send(JSON.stringify({type:'ready',version:'4.6.2',at:new Date().toISOString()}));
   return new Response(null,{status:101,webSocket:client});
  }
  if(url.pathname==='/publish'&&request.method==='POST'){
   let event;try{event=await request.json();}catch{return Response.json({error:'Evento inválido.'},{status:400});}
   const kind=typeof event?.kind==='string'&&/^[a-z][a-z0-9-]{0,39}$/.test(event.kind)?event.kind:'data-change';
   const message=JSON.stringify({type:'change',kind,at:new Date().toISOString()});let delivered=0;
   for(const socket of this.ctx.getWebSockets()){try{socket.send(message);delivered++;}catch{try{socket.close(1011,'Falha ao atualizar');}catch{}}}
   return Response.json({ok:true,delivered});
  }
  return new Response('Not found',{status:404});
 }
 webSocketMessage(socket,message){if(message==='ping')socket.send('pong');}
 webSocketError(socket){try{socket.close(1011,'Conexão interrompida');}catch{}}
}

async function realtimePublish(env,kind){
 if(!env.CAMPO_REALTIME)return;
 try{
  const response=await env.CAMPO_REALTIME.getByName('management').fetch(new Request('https://campo-realtime/publish',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind})}));
  if(!response.ok)throw Error('HTTP '+response.status);
 }catch(error){console.warn(JSON.stringify({event:'realtime_publish_failed',kind,error:error instanceof Error?error.message:String(error)}));}
}

// Private shared data stays in D1. Every route runs behind the access gateway.
const sharedId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sharedError=(message,status=400)=>Object.assign(new Error(message),{status});
function sharedCoordinate(v,max){return !(typeof v==='string'&&!v.trim())&&v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=max;}
function sharedView(row){return {...JSON.parse(row.data),id:row.tree_id||row.id,sharedVersion:row.version,sharedDeleted:Boolean(row.deleted),deletionRequest:row.pending||null,sharedUpdatedAt:row.updated_at,sharedActor:row.actor};}
async function sharedBody(request,limit=6500000){try{return JSON.parse(await(await limitedBody(request,limit)).text());}catch{throw sharedError('Solicitação inválida ou acima do tamanho permitido.',413);}}
async function sharedRead(db,id){return db.prepare('SELECT * FROM shared_trees WHERE id=?').bind(id).first();}
function sharedData(raw,actor,imported=false){
 if(!raw||!sharedId(raw.id)||!sharedCoordinate(raw.lat,90)||!sharedCoordinate(raw.lon,180))throw sharedError('ID, latitude e longitude válidos são obrigatórios.');
 const allowed=['externalId','inspector','feeder','height','dap','circ','position','pole','span','os','species','note','poda','projection','grouped','treeSite','mt','bt','at','mtDistance','btDistance','atDistance','area','access','team','photoReference','address','municipality','perimeter','key','street'];
 const out={id:raw.id,lat:Number(raw.lat),lon:Number(raw.lon),photos:[],createdAt:Number.isFinite(Date.parse(raw.createdAt))?raw.createdAt:new Date().toISOString(),updatedAt:Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:new Date().toISOString()};
 for(const key of allowed){if(typeof raw[key]==='boolean')out[key]=raw[key];else if(raw[key]!==undefined&&raw[key]!==null)out[key]=String(raw[key]).slice(0,key==='note'?5000:1000);}
 if(out.treeSite!==undefined&&!['','publico','privado'].includes(out.treeSite))throw sharedError('Selecione área pública ou privada para o local da árvore.');
 for(const key of ['height','dap','circ','mtDistance','btDistance','atDistance'])if(out[key]!==undefined&&out[key]!==''&&(!Number.isFinite(Number(out[key]))||Number(out[key])<0))throw sharedError('Medida inválida: '+key);
 for(const key of ['mt','bt','at'])out[key]=raw[key]===true||raw[key]==='sim';
 for(const key of ['inspectionTiming','plantIdentification','heightMeasurement','measurements','origin'])if(raw[key]&&typeof raw[key]==='object'){const serialized=JSON.stringify(raw[key]);if(serialized.length>16000)throw sharedError('Metadados acima do limite: '+key);out[key]=JSON.parse(serialized);}
 const spanCheck=typeof CampoSpanQuality==='undefined'?null:CampoSpanQuality.read({...out,spanReference:raw.spanReference});
 if(spanCheck)out.spanReference=CampoSpanQuality.reference(out,spanCheck.nearest);
 out.imported=imported||raw.imported===true;out.lastInspector=actor;
 return out;
}
async function sharedPhoto(photo){
 if(!sharedId(photo.assetId)||typeof photo.image!=='string'||photo.image.length>480000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo.image))throw sharedError('Foto compartilhada inválida ou grande demais.');
 const bytes=Uint8Array.from(atob(photo.image.split(',')[1]),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(photo.sha256!==hash)throw sharedError('Conteúdo da foto não confirmado.');return photo;
}
async function sharedSave(db,body,actor,imported=false,identity=null){
 const data=sharedData(body.record,actor,imported),id=data.id,expected=body.baseVersion;
 if(!Number.isSafeInteger(expected)||expected<0||!sharedId(body.operationId))throw sharedError('Versão e identificador da operação obrigatórios.');
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,id))throw sharedError('Administrador está revisando a exclusão deste cadastro. Tente novamente.',409);
 const old=await sharedRead(db,id);
 if(old?.deleted)throw sharedError('Árvore excluída pelo administrador. O cadastro não será recriado.',410);
 if(old?.last_op===body.operationId)return sharedView(old);
 if((old?.version||0)!==expected)throw sharedError('Outra pessoa atualizou esta árvore. Reabra a versão mais recente antes de salvar suas alterações.',409);
 if(old&&data.treeSite===undefined){const site=JSON.parse(old.data).treeSite;if(site!==undefined)data.treeSite=site;}
 data.createdBy=old?JSON.parse(old.data).createdBy||JSON.parse(old.data).inspector||JSON.parse(old.data).lastInspector||old.actor:actor;
 if(identity){const original=old?JSON.parse(old.data):null;data.createdByUserId=original?.createdByUserId||(old?null:identity.id);data.createdByEmail=original?.createdByEmail||(old?null:identity.email);data.lastEditorUserId=identity.id;data.lastEditorEmail=identity.email;if(!old)data.inspector=identity.name;else data.inspector=original.inspector||data.inspector;}
 const uploads=body.uploads||[];if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie no máximo 12 fotos por cadastro.');
 const photos=body.record.photos||[];if(!Array.isArray(photos)||photos.length>12)throw sharedError('Limite de 12 fotos na base compartilhada.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);uploadMap.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Referência de foto inválida.');
  if(!uploadMap.has(p.assetId)&&!await db.prepare('SELECT asset_id FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,p.assetId).first())throw sharedError('Foto ainda não recebida. Tente sincronizar novamente.');
  data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'foto.jpg').slice(0,180),receivedAt:p.receivedAt||data.updatedAt,identify:p.identify===true,organ:String(p.organ||'auto').slice(0,20),phase:['before','after','current'].includes(p.phase)?p.phase:'current'});
 }
 const stamp=new Date().toISOString(),version=expected+1;
 const statement=old?db.prepare('UPDATE shared_trees SET data=?,version=?,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(JSON.stringify(data),version,stamp,body.operationId,actor,id,expected):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) SELECT ?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=? AND expires_at>unixepoch()*1000)').bind(id,JSON.stringify(data),stamp,body.operationId,actor,id);
 const statements=[statement];for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(id,p.assetId,p.image,id,body.operationId));
 if(typeof historyBaseline==='function'&&id.startsWith('vera-'))statements.push(...historyBaselineStatements(db,await historyBaseline(db,id),body.operationId,id));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado por outra pessoa. Sua cópia local foi preservada.',409);
 return {...data,id,sharedVersion:version,sharedDeleted:false,deletionRequest:old?.pending||null,sharedUpdatedAt:stamp,sharedActor:actor};
}
async function sharedAddress(db,lat,lon){
 const key=Number(lat).toFixed(4)+','+Number(lon).toFixed(4),cached=await db.prepare('SELECT address FROM shared_geocodes WHERE key=?').bind(key).first();if(cached)return {address:cached.address,source:'OpenStreetMap/Nominatim',approximate:true};
 // One outbound lookup per second across the shared database; no bulk geocoding.
 await db.prepare("INSERT OR IGNORE INTO shared_geocodes(key,address,created_at) VALUES('__rate__','',0)").run();
 const now=Date.now(),permit=await db.prepare("UPDATE shared_geocodes SET created_at=? WHERE key='__rate__' AND created_at<?").bind(now,now-1100).run();if(!permit.meta.changes)return {address:'',pending:true};
 try{const u=new URL('https://nominatim.openstreetmap.org/reverse');u.search=new URLSearchParams({format:'jsonv2',lat:String(lat),lon:String(lon),'accept-language':'pt-BR',zoom:'18'}).toString();const r=await fetch(u,{headers:{'User-Agent':'CampoVegetacao/4.0 (https://jeffinkapparxrx.github.io/campo-arvores/)'},signal:AbortSignal.timeout(8000)});if(!r.ok)return {address:'',pending:true};const value=await r.json(),address=String(value.display_name||'').slice(0,1000);if(address)await db.prepare('INSERT OR REPLACE INTO shared_geocodes(key,address,created_at) VALUES(?,?,?)').bind(key,address,now).run();return {address,pending:!address,source:'OpenStreetMap/Nominatim',approximate:true};}catch{return {address:'',pending:true};}
}
async function sharedRequestDelete(db,body){
 if(!sharedId(body.id)||!sharedId(body.treeId)||!Number.isSafeInteger(body.baseVersion))throw sharedError('Pedido inválido.');
 const existing=await db.prepare('SELECT id,tree_id,status FROM shared_deletions WHERE id=?').bind(body.id).first();if(existing){if(existing.tree_id!==body.treeId)throw sharedError('Identificador de solicitação já utilizado.',409);return {id:existing.id,status:existing.status};}
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,body.treeId))throw sharedError('Exclusão administrativa em andamento.',409);
 const tree=await sharedRead(db,body.treeId);if(!tree||tree.deleted)throw sharedError('Árvore não disponível.',410);if(tree.version!==body.baseVersion)throw sharedError('A árvore mudou. Atualize o mapa antes de solicitar exclusão.',409);if(tree.pending)throw sharedError('Esta árvore já tem solicitação pendente.',409);
 const e=body.evidence,actor=String(body.actor||'').trim().slice(0,120),reason=String(body.reason||'').trim().slice(0,2000);
 if(!actor||!reason||!e||!sharedCoordinate(e.lat,90)||!sharedCoordinate(e.lon,180)||!Number.isFinite(e.accuracy)||e.accuracy<0||!Number.isFinite(Date.parse(e.capturedAt)))throw sharedError('Foto, motivo, inspetor e GPS da evidência são obrigatórios.');
 if(!Number.isFinite(Date.parse(e.gpsTimestamp))||Math.abs(Date.parse(e.capturedAt)-Date.parse(e.gpsTimestamp))>120000)throw sharedError('Capture o GPS junto com a foto.');
 await sharedPhoto({assetId:body.id,image:e.original,sha256:e.sha256});if(typeof e.annotated!=='string'||e.annotated.length>650000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(e.annotated))throw sharedError('Foto georreferenciada obrigatória.');
 const now=new Date().toISOString(),evidence={original:e.original,annotated:e.annotated,sha256:e.sha256,lat:Number(e.lat),lon:Number(e.lon),accuracy:e.accuracy,capturedAt:e.capturedAt,gpsTimestamp:e.gpsTimestamp,address:String(e.address||'').slice(0,1000),addressPending:!e.address,treeLat:JSON.parse(tree.data).lat,treeLon:JSON.parse(tree.data).lon,receivedAt:now};
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET pending=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND pending IS NULL AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(body.id,now,body.id,actor,tree.id,body.baseVersion),
 db.prepare("INSERT INTO shared_deletions(id,tree_id,tree_version,status,reason,actor,created_at,evidence) SELECT ?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)").bind(body.id,tree.id,tree.version+1,reason,actor,now,JSON.stringify(evidence),tree.id,body.id)]);
 if(!result[0].meta.changes)throw sharedError('Árvore alterada; atualize o mapa.',409);return {id:body.id,status:'pending',tree:sharedView(await sharedRead(db,tree.id))};
}
async function sharedArchiveCleanup(db,id,env){
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(id).first();if(!row||row.status!=='approved')throw sharedError('Aprovação necessária.',409);
 if(row.archive_status==='removed')return row.archive_status;
 let status='pending';try{
  if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)throw Error('Receiver unavailable');
  const tree=await sharedRead(db,row.tree_id),version=JSON.parse(tree.data).updatedAt;
  if(!Number.isFinite(Date.parse(version)))throw Error('Archive version missing');
  // The receiver rejects a newer archived version. Never delete unreviewed work.
  const r=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin_delete',records:[{id:row.tree_id,version}],token:env.GOOGLE_SCRIPT_TOKEN}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok||!data.ok||!data.deletedIds?.includes(row.tree_id))throw Error('Deletion not confirmed');status='removed';
 }catch{status='pending';}
 await db.prepare('UPDATE shared_deletions SET archive_status=? WHERE id=?').bind(status,id).run();return status;
}
async function sharedReview(db,body,env){
 if(!sharedId(body.id)||!['approve','reject'].includes(body.decision))throw sharedError('Decisão inválida.');
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(body.id).first();if(!row)throw sharedError('Solicitação não encontrada.',404);if(row.status!=='pending')return {status:row.status,id:row.id,archiveStatus:row.archive_status};
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,row.tree_id))throw sharedError('Exclusão administrativa em andamento.',409);
 const tree=await sharedRead(db,row.tree_id);if(!tree||tree.pending!==row.id)throw sharedError('Pedido não corresponde ao cadastro atual.',409);
 if(body.decision==='approve'&&tree.version!==row.tree_version)throw sharedError('A árvore foi editada após a evidência. Rejeite este pedido e solicite uma nova avaliação.',409);
 const now=new Date().toISOString(),approved=body.decision==='approve',operation=crypto.randomUUID();
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET deleted=?,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND pending=? AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(approved?1:0,now,operation,'Administrador',tree.id,tree.version,row.id),
 db.prepare('UPDATE shared_deletions SET status=?,reviewed_at=?,reviewer_note=? WHERE id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(approved?'approved':'rejected',now,String(body.note||'').slice(0,2000),row.id,tree.id,operation)]);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a análise. Atualize e revise.',409);
 const archiveStatus=approved?await sharedArchiveCleanup(db,row.id,env):'not_requested';return {id:row.id,status:approved?'approved':'rejected',tree:sharedView(await sharedRead(db,tree.id)),archiveStatus};
}
async function sharedAPI(request,env){
 if(!env.SHARED_DB)return json({error:'Base compartilhada ainda não configurada.'},503);
 if(new URL(request.url).pathname==='/api/shared/generation'&&request.method==='GET')return json({id:env.PRODUCTION_DATA_EPOCH||null});
 const db=env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB,url=new URL(request.url),path=url.pathname;
 try{
  if(request.method==='GET'&&path==='/api/shared/history')return json(await historyList(db,url));
  if(request.method==='GET'&&path==='/api/shared/history/photo')return json(await historyPhoto(db,url));
  if(request.method==='GET'&&path==='/api/shared/compare'){const a=await historyRecord(db,url.searchParams.get('a')),b=await historyRecord(db,url.searchParams.get('b'));return json({a:a.record,b:b.record});}
  if(request.method==='POST'&&path==='/api/shared/history/import')return json(await historyImport(db,await sharedBody(request),env.CAMPO_USER?.name||'Administrador'));
  if(request.method==='POST'&&path==='/api/shared/merge'){const result=await historyMerge(db,await sharedBody(request),env.CAMPO_USER?.name||'Administrador',env.CAMPO_USER);await realtimePublish(env,'shared-merge');return json(result);}
  if(request.method==='GET'&&path==='/api/shared/live'){if(!env.CAMPO_REALTIME)throw sharedError('Canal em tempo real ainda não configurado.',503);if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket obrigatório.',{status:426,headers:{Upgrade:'websocket','Cache-Control':'no-store'}});return env.CAMPO_REALTIME.getByName('management').fetch(new Request('https://campo-realtime/connect',{headers:request.headers}));}
  if(request.method==='GET'&&path==='/api/shared/changes'){const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)throw sharedError('Cursor inválido.');const r=await db.prepare('SELECT * FROM shared_changes WHERE seq>? ORDER BY seq LIMIT 201').bind(after).all(),rows=r.results.slice(0,200);return json({changes:rows.map(r=>({seq:r.seq,tree:sharedView(r)})),next:rows.at(-1)?.seq||after,hasMore:r.results.length>200});}
  if(request.method==='GET'&&path==='/api/shared/photo'){const id=url.searchParams.get('id'),asset=url.searchParams.get('asset');if(!sharedId(id)||!sharedId(asset))throw sharedError('Foto inválida.');const row=await sharedRead(db,id);if(!row||row.deleted)throw sharedError('Árvore não encontrada.',404);const data=JSON.parse(row.data);if(!(data.photos||[]).some(p=>p.assetId===asset))throw sharedError('Foto não pertence a este cadastro.',404);const photo=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,asset).first();if(!photo)throw sharedError('Foto ainda não recebida.',404);return json({image:photo.image});}
  if(request.method==='GET'&&path==='/api/shared/tree'){const id=url.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const r=await sharedRead(db,id);if(!r)throw sharedError('Árvore não encontrada.',404);const out=sharedView(r);if(!r.deleted){const refs=out.photos.map(p=>p.assetId);const photos=refs.length?await db.prepare('SELECT asset_id,image FROM shared_photos WHERE tree_id=? AND asset_id IN ('+refs.map(()=>'?').join(',')+')').bind(id,...refs).all():{results:[]};const assets=new Map(photos.results.map(p=>[p.asset_id,p.image]));out.photos=out.photos.map(p=>({...p,original:assets.get(p.assetId)||'',sharedDerivative:true}));}return json({tree:out});}
  if(request.method==='POST'&&path==='/api/shared/save'){const body=await sharedBody(request);if(env.PRODUCTION_DATA_EPOCH&&Date.parse(body.record?.updatedAt)<Date.parse(env.PRODUCTION_DATA_EPOCH))throw sharedError('Cadastro de homologação encerrado. Atualize o aplicativo.',410);const actor=env.CAMPO_USER?.name||String(body.actor||'').trim().slice(0,120);if(!actor)throw sharedError('Informe o nome do inspetor.');const tree=await sharedSave(db,body,actor,false,env.CAMPO_USER);await realtimePublish(env,'shared-save');return json({tree});}
  if(request.method==='POST'&&path==='/api/shared/address'){const b=await sharedBody(request,1024);if(!sharedCoordinate(b.lat,90)||!sharedCoordinate(b.lon,180))throw sharedError('Coordenadas inválidas.');return json(await sharedAddress(db,b.lat,b.lon));}
  if(request.method==='POST'&&path==='/api/shared/deletion-request'){const b=await sharedBody(request,1300000);if(env.CAMPO_USER)b.actor=env.CAMPO_USER.name;const result=await sharedRequestDelete(db,b);await realtimePublish(env,'deletion-request');return json(result);}
  if(path.startsWith('/api/shared/admin/')){if(!isAdministrator(request,env))throw sharedError('Acesso restrito ao administrador.',403);
   if(path==='/api/shared/admin/import'&&request.method==='POST'){const b=await sharedBody(request,1500000);if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>20)throw sharedError('Importe de 1 a 20 linhas por lote.');const results=[];for(const item of b.rows){try{const tree=await sharedSave(db,item,'Administrador · importação',true);results.push({id:item.record?.id,ok:true,tree});}catch(e){results.push({id:item.record?.id,ok:false,error:e.message,status:e.status||500});}}if(results.some(r=>r.ok))await realtimePublish(env,'admin-import');return json({results});}
   if(path==='/api/shared/admin/deletions'&&request.method==='GET'){const r=await db.prepare('SELECT id,tree_id,tree_version,status,reason,actor,created_at,reviewed_at,reviewer_note,archive_status FROM shared_deletions ORDER BY created_at DESC LIMIT 200').all();return json({requests:r.results});}
   if(path==='/api/shared/admin/evidence'&&request.method==='GET'){const r=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(url.searchParams.get('id')||'').first();if(!r)throw sharedError('Evidência não encontrada.',404);const evidence=JSON.parse(r.evidence);if(!evidence.address){const a=await sharedAddress(db,evidence.lat,evidence.lon);if(a.address){evidence.address=a.address;evidence.addressPending=false;await db.prepare('UPDATE shared_deletions SET evidence=? WHERE id=?').bind(JSON.stringify(evidence),r.id).run();}}return json({request:{...r,evidence}});}
   if(path==='/api/shared/admin/archive-cleanup'&&request.method==='POST'){const b=await sharedBody(request,1000);return json({archiveStatus:await sharedArchiveCleanup(db,b.id,env)});}
   if(path==='/api/shared/admin/review'&&request.method==='POST'){const result=await sharedReview(db,await sharedBody(request,5000),env);await realtimePublish(env,'admin-review');return json(result);}
  }
  return json({error:'Rota compartilhada não encontrada.'},404);
 }catch(e){console.warn(JSON.stringify({event:'shared_error',path,status:e.status||503,message:e.status?e.message:'database_unavailable'}));return json({error:e.status?e.message:'Base compartilhada ocupada ou indisponível. Sua cópia continua salva no aparelho.'},e.status||503);}
}

// Version metadata is already immutable in shared_changes. Images are fetched only on demand.
async function historyRoot(db,id){
 if(!sharedId(id))throw sharedError('Árvore inválida.');
 for(let depth=0;depth<32;depth++){const link=await db.prepare('SELECT target_id FROM shared_merges WHERE source_id=?').bind(id).first();if(!link)return id;id=link.target_id;}
 throw sharedError('Vínculo histórico inválido.',409);
}
async function historyFamily(db,id){
 const root=await historyRoot(db,id),row=await sharedRead(db,root);
 if(row?.deleted)throw sharedError('Árvore removida da base ativa.',410);
 const links=await db.prepare('SELECT source_id FROM shared_merges WHERE target_id=? ORDER BY created_at').bind(root).all();
 return {root,ids:[root,...links.results.map(r=>r.source_id)],row};
}
function historyBaseData(t,id){
 const present=v=>v!==null&&v!==undefined&&v!=='',network=v=>present(v)&&Number(v)>=0,dap=Number(t.dap)>0?t.dap:'';
 const data={id,externalId:t.id,lat:Number(t.lat),lon:Number(t.lon),species:t.especieConf?'':t.especies||'',suggestedSpecies:t.especieConf?t.especies:'',speciesConfidence:t.especieConf||'',height:t.altura??'',dap,circ:dap?(Number(dap)*Math.PI).toFixed(1):'',pole:t.poste||'',span:t.vao||'',feeder:t.alimentador||'',note:t.observacao||'',poda:/^s/i.test(t.poda||'')?'sim':/^n/i.test(t.poda||'')?'nao':'',position:t.projecao==='SIM'?'Projeção':'',projection:t.projecao==='SIM'?'sim':t.projecao==='NÃO'?'nao':'',address:t.logradouro||'',photos:[],sourceLabel:t.fonte||'Levantamento VERA',sourceYear:t.ano||'',sourceDate:t.data||'',inspector:t.inspetor||'Levantamento original',updatedAt:null,createdAt:null,baseline:true};
 for(const k of ['mt','bt','at']){const v=t['dist'+k.toUpperCase()];data[k]=network(v);data[k+'Distance']=network(v)?v:'';}
 return data;
}
async function historyBaseline(db,id){
 const stored=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id=?').bind(id).first();if(stored)return {...stored,stored:true};
 if(!id.startsWith('vera-'))return null;
 const row=await db.prepare("SELECT t.data,t.generation FROM vera_trees t WHERE t.id=? AND t.generation=(SELECT value FROM vera_meta WHERE key='generation')").bind(id.slice(5)).first();if(!row)return null;
 const source=JSON.parse(row.data),data=historyBaseData(source,id),photo=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(source.id)).first();
 let image=null;if(photo&&photo.image.length<=480000&&VERA_IMAGE.test(photo.image)){image=photo.image;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image))),b=>b.toString(16).padStart(2,'0')).join('');data.photos=[{id:'base-photo',assetId:'base_'+hash,name:'Foto do levantamento original',phase:'before',receivedAt:null}];}
 return {tree_id:id,data:JSON.stringify(data),recorded_at:new Date().toISOString(),actor:data.sourceLabel,image,generation:row.generation,sourceData:row.data};
}
function historyBaselineStatements(db,baseline,operationId,gateId){
 if(!baseline||baseline.stored)return [];
 const gate='EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)';
 const queries=[db.prepare('INSERT OR IGNORE INTO shared_baselines(tree_id,data,recorded_at,actor) SELECT ?,?,?,? WHERE '+gate).bind(baseline.tree_id,baseline.data,baseline.recorded_at,baseline.actor,gateId,operationId)];
 if(baseline.image)queries.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(baseline.tree_id,JSON.parse(baseline.data).photos[0].assetId,baseline.image,gateId,operationId));
 return queries;
}
async function historyRecord(db,id){
 if(!sharedId(id))throw sharedError('ID inválido.');const row=await sharedRead(db,id);
 if(row){if(row.deleted)throw sharedError('Esta árvore já foi removida ou mesclada. Atualize o mapa.',409);return {row,record:sharedView(row),version:row.version};}
 const baseline=await historyBaseline(db,id);if(!baseline)throw sharedError('Sincronize esta árvore antes de mesclar.',409);
 return {row:null,baseline,record:{...JSON.parse(baseline.data),sharedVersion:0,baselineToken:baseline.generation},version:0};
}
async function historyList(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0)throw sharedError('Página inválida.');
 const marks='SELECT value FROM json_each(?)',ids=JSON.stringify(family.ids),rows=await db.prepare("SELECT 's:'||seq key,tree_id,data,version,deleted,updated_at,actor,'inspection' kind FROM shared_changes WHERE tree_id IN ("+marks+") UNION ALL SELECT 'l:'||seq,tree_id,data,NULL,0,local_version,actor,'local' FROM shared_local_history WHERE tree_id IN ("+marks+") ORDER BY updated_at DESC,key DESC LIMIT 21 OFFSET ?").bind(ids,ids,offset).all();
 const snapshots=rows.results.slice(0,20).map(r=>({key:r.key,sourceId:r.tree_id,version:r.version,at:r.updated_at,actor:r.actor,kind:r.deleted?'merged':r.kind,record:JSON.parse(r.data)}));
 if(rows.results.length<=20){const baselines=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id IN ('+marks+')').bind(ids).all();for(const b of baselines.results)snapshots.push({key:'b:'+b.tree_id,sourceId:b.tree_id,version:0,at:null,recordedAt:b.recorded_at,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});
  // Existing VERA inspections can still compare against their current imported original.
  for(const id of family.ids.filter(id=>id.startsWith('vera-')&&!baselines.results.some(b=>b.tree_id===id))){const b=await historyBaseline(db,id);if(b)snapshots.push({key:'v:'+id,sourceId:id,version:0,at:null,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});}
 }
 const current=await historyRecord(db,family.root);
 return {id:family.root,current:current.record,snapshots,nextOffset:rows.results.length>20?offset+20:null,linkedIds:family.ids};
}
async function historyPhoto(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),source=url.searchParams.get('tree'),key=url.searchParams.get('key'),asset=url.searchParams.get('asset');
 if(!family.ids.includes(source)||!sharedId(asset))throw sharedError('Foto não pertence ao histórico.',404);
 let snapshot;if(/^[sl]:\d+$/.test(key||'')){const table=key[0]==='s'?'shared_changes':'shared_local_history',row=await db.prepare('SELECT data FROM '+table+' WHERE tree_id=? AND seq=?').bind(source,Number(key.slice(2))).first();if(row)snapshot=JSON.parse(row.data);}
 else if(key==='b:'+source||key==='v:'+source){const baseline=await historyBaseline(db,source);if(baseline){snapshot=JSON.parse(baseline.data);if(baseline.image&&snapshot.photos.some(p=>p.assetId===asset))return {image:baseline.image};}}
 if(!snapshot?.photos?.some(p=>p.assetId===asset))throw sharedError('Foto não pertence a esta versão.',404);
 const row=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(source,asset).first();if(!row)throw sharedError('Foto histórica não recebida. Consulte a pasta original.',404);return {image:row.image};
}
async function historyImport(db,body,actor){
 const raw=body.record,data=sharedData(raw,actor);if(!Number.isFinite(Date.parse(raw.updatedAt)))throw sharedError('Versão local inválida.');
 const family=await historyFamily(db,data.id);if(!family.row)throw sharedError('Envie a versão atual antes do histórico local.',409);
 const previous=await db.prepare('SELECT seq FROM shared_local_history WHERE tree_id=? AND local_version=?').bind(data.id,data.updatedAt).first();
 const central=await db.prepare("SELECT seq FROM shared_changes WHERE tree_id=? AND json_extract(data,'$.updatedAt')=? LIMIT 1").bind(data.id,data.updatedAt).first();if(previous||central)return {preserved:true,alreadyStored:true};
 const uploads=body.uploads||[],photos=raw.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(photos)||photos.length>12)throw sharedError('Histórico com fotos acima do limite.');
 const map=new Map();for(const p of uploads){await sharedPhoto(p);map.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Foto histórica inválida.');const existing=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(data.id,p.assetId).first();if(!existing&&!map.has(p.assetId))throw sharedError('Foto histórica ainda não recebida.');if(existing&&map.has(p.assetId)&&existing.image!==map.get(p.assetId).image)throw sharedError('Identificador de foto já utilizado.',409);data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'Foto anterior').slice(0,180),receivedAt:p.receivedAt||null,phase:['before','after','current'].includes(p.phase)?p.phase:'current'});}
 const statements=[db.prepare('INSERT OR IGNORE INTO shared_local_history(tree_id,local_version,data,received_at,actor) VALUES(?,?,?,?,?)').bind(data.id,data.updatedAt,JSON.stringify(data),new Date().toISOString(),actor)];
 for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) VALUES(?,?,?)').bind(data.id,p.assetId,p.image));await db.batch(statements);return {preserved:true};
}
function historyCondition(part,alias){
 return part.row?{sql:'EXISTS(SELECT 1 FROM shared_trees '+alias+' WHERE '+alias+'.id=? AND '+alias+'.version=? AND '+alias+'.deleted=0 AND '+alias+'.pending IS NULL)',args:[part.record.id,part.version]}:{sql:"NOT EXISTS(SELECT 1 FROM shared_trees WHERE id=?) AND EXISTS(SELECT 1 FROM vera_trees v WHERE v.id=? AND v.generation=? AND v.data=? AND v.generation=(SELECT value FROM vera_meta WHERE key='generation'))",args:[part.record.id,part.record.id.slice(5),part.baseline.generation,part.baseline.sourceData]};
}
async function historyMerge(db,body,actor,identity){
 if(!sharedId(body.operationId)||body.confirm!==true||!sharedId(body.targetId)||!sharedId(body.sourceId)||body.targetId===body.sourceId)throw sharedError('Escolha dois cadastros distintos e confirme que são a mesma árvore.');
 const retried=await db.prepare('SELECT * FROM shared_merges WHERE operation_id=?').bind(body.operationId).first();
 if(retried){if(retried.source_id!==body.sourceId||retried.target_id!==await historyRoot(db,body.targetId))throw sharedError('Operação já usada para outra mesclagem.',409);return {tree:sharedView(await sharedRead(db,retried.target_id)),source:sharedView(await sharedRead(db,body.sourceId)),replayed:true};}
 const target=await historyRecord(db,body.targetId),source=await historyRecord(db,body.sourceId);
 for(const [part,version,token]of [[target,body.targetVersion,body.targetBaseline],[source,body.sourceVersion,body.sourceBaseline]]){if(!Number.isSafeInteger(version)||version!==part.version||!part.row&&token!==part.baseline.generation)throw sharedError('Uma árvore mudou. Reabra a comparação antes de confirmar.',409);if(part.row?.pending)throw sharedError('Resolva o pedido de exclusão antes de mesclar.',409);}
 const family=await historyFamily(db,target.record.id),other=await historyFamily(db,source.record.id);if(family.ids.length+other.ids.length>200)throw sharedError('Limite de vínculos históricos atingido. Solicite revisão administrativa.');
 const stamp=new Date().toISOString(),raw={...target.record,...body.values,id:target.record.id,lat:body.values?.lat??target.record.lat,lon:body.values?.lon??target.record.lon,updatedAt:stamp,createdAt:target.record.createdAt||stamp},data=sharedData(raw,actor);
 for(const k of ['createdBy','createdByUserId','createdByEmail','inspector'])if(target.record[k]!==undefined)data[k]=target.record[k];data.lastEditorUserId=identity?.id||null;data.lastEditorEmail=identity?.email||null;data.mergeOperation=body.operationId;if(Number(data.height)!==Number(target.record.height))data.heightMeasurement={method:'manual-merge',confirmedAt:stamp,actor};data.measurements={source:'reviewed-merge',sources:[target.record.id,source.record.id],confirmedAt:stamp};
 const uploads=body.uploads||[],refs=body.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(refs)||refs.length>12)throw sharedError('Use até 12 fotos atuais. As demais continuam no histórico.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);if(uploadMap.has(p.assetId))throw sharedError('Foto repetida.');uploadMap.set(p.assetId,p);}
 const copies=[],seen=new Set();data.photos=[];
 for(const ref of refs){if(!sharedId(ref.assetId)||!['before','after','current'].includes(ref.phase||'current'))throw sharedError('Foto inválida.');if(seen.has(ref.assetId))continue;seen.add(ref.assetId);
  let photo;if(ref.treeId){const part=[target,source].find(p=>p.record.id===ref.treeId),p=part?.record.photos?.find(p=>p.assetId===ref.assetId);if(!p)throw sharedError('Foto fora dos cadastros comparados.');photo={...p};if(ref.treeId!==target.record.id||!part.row){if(part.baseline?.image)copies.push({assetId:ref.assetId,image:part.baseline.image});else{const image=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(ref.treeId,ref.assetId).first();if(!image)throw sharedError('Foto não recebida. Sincronize antes de mesclar.');copies.push({assetId:ref.assetId,image:image.image});}}}
  else {const p=uploadMap.get(ref.assetId);if(!p)throw sharedError('Foto nova não recebida.');photo={id:ref.assetId,assetId:ref.assetId,name:String(ref.name||'Foto da atualização').slice(0,180),receivedAt:stamp};copies.push(p);}
  data.photos.push({...photo,id:ref.assetId,phase:ref.phase||'current'});
 }
 const a=historyCondition(target,'a'),b=historyCondition(source,'b'),guard=a.sql+' AND '+b.sql+' AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id IN (?,?) AND expires_at>unixepoch()*1000)',args=[...a.args,...b.args,target.record.id,source.record.id];
 const statements=[db.prepare('INSERT INTO shared_merges(source_id,target_id,operation_id,source_version,target_version,created_at,actor) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(source.record.id,target.record.id,body.operationId,source.version,target.version,stamp,actor,...args)];
 const gate='EXISTS(SELECT 1 FROM shared_merges WHERE operation_id=?)',gone={...source.record,mergedInto:target.record.id};delete gone.sharedVersion;
 for(const [part,value,deleted]of [[target,data,0],[source,gone,1]]){
  if(part.row)statements.push(db.prepare('UPDATE shared_trees SET data=?,version=version+1,deleted=?,updated_at=?,last_op=?,actor=? WHERE id=? AND '+gate).bind(JSON.stringify(value),deleted,stamp,body.operationId,actor,part.record.id,body.operationId));
  else statements.push(db.prepare('INSERT INTO shared_trees(id,data,version,deleted,updated_at,last_op,actor) SELECT ?,?,1,?,?,?,? WHERE '+gate).bind(part.record.id,JSON.stringify(value),deleted,stamp,body.operationId,actor,body.operationId));
 }
 for(const part of [target,source]){const baseline=part.baseline||await historyBaseline(db,part.record.id);statements.push(...historyBaselineStatements(db,baseline,body.operationId,target.record.id));}
 for(const p of copies)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(target.record.id,p.assetId,p.image,body.operationId));
 statements.push(db.prepare('UPDATE shared_merges SET target_id=? WHERE target_id=? AND operation_id<>? AND '+gate).bind(target.record.id,source.record.id,body.operationId,body.operationId));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a comparação. Nenhuma mesclagem foi aplicada; reabra os dados.',409);
 return {tree:sharedView(await sharedRead(db,target.record.id)),source:sharedView(await sharedRead(db,source.record.id)),preserved:true};
}

// Private, one-shot inventory requested through the Cloudflare control plane.
// Does not alter Drive files or inspection records.
async function runRepositoryInventory(env){
 const db=env.SHARED_DB,id='repository-inventory',job=await db.prepare('SELECT status FROM campo_maintenance WHERE id=?').bind(id).first();
 if(job?.status!=='inspect')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='inspect'").bind(id).run();if(!claim.meta?.changes)return;
 try{const inventory=await universalAdminRecords(env);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('review_required',JSON.stringify(inventory),id).run();}
 catch(e){const detail=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify({error:detail}),id).run();}
}

// No public route starts this job. A Cloudflare account administrator supplies the
// exact reviewed IDs and versions in D1; each item still uses normal deletion locks.
async function runAuthorizedRepositoryCleanup(env){
 const db=env.SHARED_DB,id='authorized-homologation-cleanup',job=await db.prepare('SELECT status,result FROM campo_maintenance WHERE id=?').bind(id).first();if(job?.status!=='approved')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='approved'").bind(id).run();if(!claim.meta?.changes)return;
 const state=JSON.parse(job.result);try{
 if(state.authorization!=='explicit_selected_ids'||!Array.isArray(state.records)||state.records.length<1||state.records.length>2)throw Error('Manifesto de manutenção inválido.');
 const current=await universalAdminRecords(env);for(const r of state.records){const c=current.records.find(x=>x.id===r.id);if(!c||c.adminClassification!=='homologacao'||c.updatedAt!==r.version||c.archiveVersion!==r.archiveVersion||c.adminLabelRevision!==r.labelRevision)throw Error('Cadastro ou classificação mudou. Revisão obrigatória antes de excluir.');}
 const result=await universalAdminDelete(env,{records:state.records});state.deletedIds=result.deletedIds;state.finishedAt=new Date().toISOString();await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('completed',JSON.stringify(state),id).run();
 }catch(e){state.error=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify(state),id).run();}
}

// Address search is explicitly submitted. Local layer suggestions never call this provider.
async function mapAddressSearch(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 let body;try{body=await sharedBody(request,2000);}catch{return json({error:'Pesquisa inválida.'},400);}
 const query=typeof body.query==='string'?body.query.trim().replace(/\s+/g,' '):'';
 if(query.length<3||query.length>160)return json({error:'Informe de 3 a 160 caracteres, incluindo cidade e estado.'},400);
 const db=env.SHARED_DB?.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;if(!db)return json({error:'Pesquisa online indisponível. Use as camadas salvas ou coordenadas.'},503);
 try{const key='photon:'+query.toLocaleLowerCase('pt-BR'),now=Date.now(),cached=await db.prepare('SELECT data FROM campo_place_cache WHERE cache_key=? AND expires_at>?').bind(key,now).first();if(cached)return json({...JSON.parse(cached.data),cached:true});
 const gate=await db.prepare("INSERT INTO campo_search_limit(id,next_at) VALUES('places',?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE campo_search_limit.next_at<=?").bind(now+1100,now).run();if(!gate.meta?.changes)return json({error:'Pesquisa ocupada. Aguarde um instante e toque em Buscar.'},429);
 const url=new URL(env.MAP_GEOCODER_URL||'https://photon.komoot.io/api/');if(url.protocol!=='https:'||url.username||url.password)return json({error:'Serviço de endereços não configurado corretamente.'},503);url.searchParams.set('q',query);url.searchParams.set('limit','6');url.searchParams.set('countrycode','BR');
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'CampoVegetacao/4.3 (explicit place search; mapeamento-arvores.pages.dev)'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Provider unavailable');
 const data=JSON.parse(await(await limitedBody(response,500000)).text());if(!Array.isArray(data.features))throw Error('Invalid provider');
 const results=data.features.slice(0,6).flatMap(f=>{const c=f.geometry?.coordinates,p=f.properties||{};if(f.geometry?.type!=='Point'||!Array.isArray(c)||!sharedCoordinate(c[1],90)||!sharedCoordinate(c[0],180))return [];const title=[p.name,p.street,p.housenumber].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,200)||'Endereço';const detail=[p.district,p.city,p.county,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,300);return [{title,detail,lat:c[1],lon:c[0]}];});const out={results,provider:'Photon',attribution:'© OpenStreetMap contributors · ODbL'};
 await db.batch([db.prepare('INSERT INTO campo_place_cache(cache_key,data,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').bind(key,JSON.stringify(out),now+7*86400000),db.prepare('DELETE FROM campo_place_cache WHERE expires_at<? OR cache_key IN (SELECT cache_key FROM campo_place_cache ORDER BY expires_at DESC LIMIT -1 OFFSET 1000)').bind(now)]);return json(out);
 }catch{return json({error:'Endereços indisponíveis agora. Use coordenadas ou a rede salva e tente novamente depois.'},502);}
}

// Administrative aggregation and history are checked on the server, not just hidden in the UI.
async function adminDb(env){if(!env.SHARED_DB)throw sharedError('Base central não configurada.',503);return env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;}
async function archiveCall(env,payload){
 if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)throw sharedError('Receptor Drive não configurado.',503);
 let r;try{r=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:AbortSignal.timeout(85000)});}catch(e){throw sharedError(e.name==='TimeoutError'||e.name==='AbortError'?'O Drive excedeu o tempo de resposta. Atualize a base para conferir os cadastros e retomar a limpeza pendente.':'Falha de conexão com o Drive. Atualize a base antes de retomar.',504);}
 let d;try{d=await r.json();}catch{throw sharedError('O receptor Drive retornou resposta inválida. Confira a implantação do Apps Script.',502);}
 if(!r.ok||!d.ok){const errors={CONFLICT:'Cadastro alterado. Atualize a lista antes de excluir.',BUSY:'Repositório Drive ocupado. Aguarde e atualize a base.',INVALID:'O receptor Drive recusou o formato da operação. Atualize a implantação do Apps Script.',AUTH:'O receptor Drive recusou a integração. Confira a configuração.'};throw sharedError(errors[d.code]||'Repositório Drive não confirmou a operação ('+String(d.code||r.status).replace(/[^A-Z0-9_]/g,'').slice(0,30)+'). Confira a execução no Apps Script.',d.code==='CONFLICT'?409:d.code==='BUSY'?429:502);}
 return d;
}
function mergeAdminUniverse(archive,shared){const map=new Map();for(const a of archive){map.set(a.id,{...a,repositorySources:['drive'],archiveVersion:a.updatedAt});}for(const row of shared){const s=sharedView(row),a=map.get(s.id);if(s.sharedDeleted){map.delete(s.id);continue;}const newest=!a||Date.parse(s.updatedAt)>=Date.parse(a.updatedAt)?s:a;map.set(s.id,{...a,...newest,repositorySources:a?['drive','shared']:['shared'],archiveVersion:a?.archiveVersion||null,sharedVersion:s.sharedVersion,sharedDataVersion:s.updatedAt,sharedUpdatedAt:s.sharedUpdatedAt,sharedActor:s.sharedActor,collectionInspector:s.createdBy||JSON.parse(row.first_data||'{}').inspector||JSON.parse(row.first_data||'{}').lastInspector||a?.inspector||s.inspector});}return [...map.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||a.id.localeCompare(b.id));}
async function adminArchiveInventory(env){let offset=0,revision;const archive=[],deleted=new Set(),pending=new Map(),seen=new Set();do{if(seen.has(offset))throw sharedError('Paginação do Drive inválida.',502);seen.add(offset);const d=await archiveCall(env,{action:'admin_list',offset,limit:200});if(!Array.isArray(d.records))throw sharedError('Atualize o receptor para listar o repositório.',502);if(revision!==undefined&&d.revision!==revision)throw sharedError('Repositório mudou durante a leitura. Atualize novamente.',409);revision=d.revision;archive.push(...d.records);for(const id of d.deletedIds||[])deleted.add(id);for(const r of d.pendingDeletes||[])if(sharedId(r.id)&&Number.isFinite(Date.parse(r.updatedAt)))pending.set(r.id,{...r,archiveCleanupPending:true,repositorySources:['drive'],archiveVersion:r.updatedAt});offset=d.nextOffset??null;}while(offset!==null);return {archive,deleted,revision,pending:[...pending.values()]};}
async function universalAdminRecords(env,inventory=null){const {archive,deleted,revision,pending}=inventory||await adminArchiveInventory(env),db=await adminDb(env),shared=await db.prepare('SELECT t.*,(SELECT c.data FROM shared_changes c WHERE c.tree_id=t.id ORDER BY c.seq LIMIT 1) first_data FROM shared_trees t').all();for(const row of shared.results)if(row.deleted)deleted.add(row.id);const labels=await db.prepare('SELECT tree_id,classification,revision,updated_at FROM campo_record_labels').all(),byId=new Map(labels.results.map(r=>[r.tree_id,r]));const rows=[...mergeAdminUniverse(archive,shared.results).filter(r=>!deleted.has(r.id)),...pending].map(r=>({...r,adminClassification:byId.get(r.id)?.classification||'',adminLabelRevision:byId.get(r.id)?.revision||0,adminLabelUpdatedAt:byId.get(r.id)?.updated_at||null}));return {records:rows,deletedIds:[...deleted],revision,total:rows.length,sources:{drive:archive.length,shared:shared.results.filter(r=>!r.deleted).length},scope:'all_users_all_dates',generatedAt:new Date().toISOString()};}
async function adminRecordLocked(db,id){return Boolean(await db.prepare('SELECT tree_id FROM campo_admin_locks WHERE tree_id=? AND expires_at>?').bind(id,Date.now()).first());}
async function universalAdminDelete(env,body){const list=body.records;if(!Array.isArray(list)||!list.length||list.length>20||new Set(list.map(r=>r.id)).size!==list.length||list.some(r=>!sharedId(r.id)||!Number.isFinite(Date.parse(r.version))||r.sharedVersion!=null&&(!Number.isSafeInteger(r.sharedVersion)||r.sharedVersion<1)))throw sharedError('Selecione de 1 a 20 cadastros válidos.');const db=await adminDb(env),op=crypto.randomUUID(),now=Date.now();
 try{const claims=await db.batch(list.map(r=>db.prepare('INSERT INTO campo_admin_locks(tree_id,operation_id,expires_at) VALUES(?,?,?) ON CONFLICT(tree_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at WHERE campo_admin_locks.expires_at<?').bind(r.id,op,now+120000,now)));if(claims.some(r=>!r.meta.changes))throw sharedError('Há uma operação em andamento nesses cadastros.',409);
 const placeholders=list.map(()=>'?').join(','),currentRows=await db.prepare('SELECT * FROM shared_trees WHERE id IN ('+placeholders+')').bind(...list.map(r=>r.id)).all(),currentById=new Map(currentRows.results.map(r=>[r.id,r])),currentLabels=await db.prepare('SELECT tree_id,revision FROM campo_record_labels WHERE tree_id IN ('+placeholders+')').bind(...list.map(r=>r.id)).all(),labelById=new Map(currentLabels.results.map(r=>[r.tree_id,r]));const central=[];for(const r of list){const row=currentById.get(r.id);if(row&&!row.deleted&&(r.sharedVersion!==row.version||r.sharedDataVersion&&JSON.parse(row.data).updatedAt!==r.sharedDataVersion))throw sharedError('Uma árvore foi alterada por outro usuário. Atualize antes de excluir.',409);if(r.labelRevision!==undefined){if(!Number.isSafeInteger(r.labelRevision)||r.labelRevision<0)throw sharedError('Classificação inválida.');const label=labelById.get(r.id);if((label?.revision||0)!==r.labelRevision)throw sharedError('A classificação de um cadastro mudou. Atualize e confira antes de excluir.',409);}central.push(row);}
 // Validate the Drive versions before any deletion. No date cutoff or device scope applies.
 const archiveSnapshot=await adminArchiveInventory(env),archiveMap=new Map([...archiveSnapshot.archive,...archiveSnapshot.pending].map(r=>[r.id,r]));const archived=[];for(const r of list){const a=archiveMap.get(r.id);if(a){if(a.updatedAt!==(r.archiveVersion||r.version))throw sharedError('Versão do Drive mudou. Atualize a lista antes de excluir.',409);archived.push({...r,archiveVersion:a.updatedAt});}}if(archived.length){const d=await archiveCall(env,{action:'admin_delete',records:archived.map(r=>({id:r.id,version:r.archiveVersion}))});if(archived.some(r=>!d.deletedIds?.includes(r.id)))throw sharedError('O Drive não confirmou toda a exclusão. Atualize e tente novamente.',502);}
 const stamp=new Date().toISOString();await db.batch(list.map((r,i)=>central[i]?db.prepare('UPDATE shared_trees SET deleted=1,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=?').bind(stamp,op,'Administrador',r.id,central[i].version):db.prepare('INSERT INTO shared_trees(id,data,version,deleted,updated_at,last_op,actor) VALUES(?,?,1,1,?,?,?)').bind(r.id,JSON.stringify({id:r.id,updatedAt:r.version,createdAt:stamp,photos:[],archiveOnly:true}),stamp,op,'Administrador')));
 await db.prepare('DELETE FROM shared_photos WHERE tree_id IN ('+placeholders+')').bind(...list.map(r=>r.id)).run();const archivedClause=archived.length?'tree_id IN ('+archived.map(()=>'?').join(',')+')':'0';await db.prepare("UPDATE shared_deletions SET status='approved',reviewed_at=?,reviewer_note='Exclusão administrativa direta',archive_status=CASE WHEN "+archivedClause+" THEN 'removed' ELSE 'not_requested' END WHERE tree_id IN ("+placeholders+") AND status='pending'").bind(stamp,...archived.map(r=>r.id),...list.map(r=>r.id)).run();return {deletedIds:list.map(r=>r.id)};
 }finally{await db.prepare('DELETE FROM campo_admin_locks WHERE operation_id=?').bind(op).run();}}
const adminAuditKeys=['lat','lon','inspector','feeder','height','dap','circ','position','pole','span','os','species','note','poda','projection','grouped','mt','bt','at','mtDistance','btDistance','atDistance','photos','area','access','team','plantIdentification','heightMeasurement','measurements'];
function auditPeriod(params){const month=params.get('month')||'',day=params.get('day')||'',actors=[...new Set(params.getAll('actor').map(v=>v.trim()).filter(Boolean))];if(month&&!/^\d{4}-\d{2}$/.test(month)||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||actors.length>80||actors.some(v=>v.length>120))throw sharedError('Filtro inválido.');const clauses=["kind<>'sync'"],args=[];if(month){clauses.push("strftime('%Y-%m',updated_at,'-5 hours')=?");args.push(month);}if(day){clauses.push("date(updated_at,'-5 hours')=?");args.push(day);}if(actors.length){clauses.push('lower(trim(actor)) IN ('+actors.map(()=>'lower(trim(?))').join(',')+')');args.push(...actors);}return {where:clauses.join(' AND '),args};}
async function adminAudit(db,params){const f=auditPeriod(params),filter=params.get('case')||'all',offset=Number(params.get('offset')||0);if(!['all','edit','cross','request','delete'].includes(filter)||!Number.isSafeInteger(offset)||offset<0)throw sharedError('Filtro de auditoria inválido.');const subset={all:'1=1',edit:"kind='edit'",cross:'cross_user=1',request:"kind='request'",delete:"kind='delete'"}[filter];const grouped=await db.prepare(`SELECT actor,SUM(kind='create') creations,SUM(kind='edit') edits,SUM(cross_user) crossEdits,SUM(kind='request') requests,COUNT(DISTINCT tree_id) trees,COUNT(DISTINCT CASE WHEN kind='edit' THEN tree_id END) editedTrees,COUNT(DISTINCT CASE WHEN kind='request' THEN tree_id END) requestTrees FROM campo_admin_history WHERE ${f.where} GROUP BY lower(trim(actor)) ORDER BY edits DESC,actor`).bind(...f.args).all();const counts=await db.prepare(`SELECT COUNT(*) events,COUNT(DISTINCT tree_id) historyTrees,MIN(updated_at) historySince,SUM(kind='edit') edits,SUM(cross_user) crossEdits,SUM(kind='request') requests,COUNT(DISTINCT CASE WHEN kind='edit' THEN tree_id END) editedTrees,COUNT(DISTINCT CASE WHEN kind='request' THEN tree_id END) requestTrees FROM campo_admin_history WHERE ${f.where}`).bind(...f.args).first();const rows=await db.prepare(`SELECT * FROM campo_admin_history WHERE ${f.where} AND ${subset} ORDER BY seq DESC LIMIT 101 OFFSET ?`).bind(...f.args,offset).all();const ids=filter==='all'?{results:[]}:await db.prepare(`SELECT DISTINCT tree_id FROM campo_admin_history WHERE ${f.where} AND ${subset}`).bind(...f.args).all();return {caseTrees:ids.results.map(r=>r.tree_id),summary:counts,users:grouped.results,events:rows.results.slice(0,100).map(r=>{const current=JSON.parse(r.data),old=r.previous_data?JSON.parse(r.previous_data):{};const fields=r.kind==='edit'?adminAuditKeys.filter(k=>JSON.stringify(current[k]??null)!==JSON.stringify(old[k]??null)):[];return {seq:r.seq,treeId:r.tree_id,kind:r.kind,actor:r.actor,previousActor:r.previous_editor,at:r.updated_at,crossUser:Boolean(r.cross_user),fields,changes:fields.map(k=>({field:k,before:k==='photos'?(old.photos?.length||0):typeof old[k]==='object'?JSON.stringify(old[k]).slice(0,500):old[k]??null,after:k==='photos'?(current.photos?.length||0):typeof current[k]==='object'?JSON.stringify(current[k]).slice(0,500):current[k]??null})),pole:current.pole,feeder:current.feeder,species:current.species,version:r.version};}),nextOffset:rows.results.length>100?offset+100:null,scope:'all_history',identity:'self_reported_names'};}
function presenceDevice(input,agent){
 const android=/Android(?:\s+([0-9.]+))?(?:;\s*([^;)]*))?/i.exec(agent);
 const ios=/\b(iPhone|iPad|iPod)\b/i.exec(agent);
 if(!android&&input?.platform!=='Android')return ios?{model:ios[1],system:'iOS',version:null}:null;
 const model=value=>{
  if(typeof value!=='string')return null;
  const clean=value.split(/\s+Build\//i)[0].trim();
  return clean.length<=80&&/^[\p{L}\p{N}][\p{L}\p{N} ._()+-]*$/u.test(clean)&&!/^(K|wv|Android|Mobile|Tablet|[a-z]{2}-[a-z]{2})$/i.test(clean)?clean:null;
 };
 const version=value=>typeof value==='string'&&/^[1-9]\d?(?:\.\d{1,3}){0,3}$/.test(value)?value.replace(/(?:\.0)+$/,''):null;
 const reduced=/Android 10; K(?:[;)])/i.test(agent);
 return {model:model(input?.model)||model(android?.[2]),system:'Android',version:version(input?.version)||(!reduced?version(android?.[1]):null)};
}
async function recordPresenceDevice(db,session,device){
 if(!device)return;
 try{
  await db.prepare(`INSERT INTO campo_presence_devices(session_id,model,system,version) VALUES(?,?,?,?)
   ON CONFLICT(session_id) DO UPDATE SET model=COALESCE(excluded.model,campo_presence_devices.model),
   system=excluded.system,version=COALESCE(excluded.version,campo_presence_devices.version)
   WHERE campo_presence_devices.system<>excluded.system OR
   (excluded.model IS NOT NULL AND campo_presence_devices.model IS NOT excluded.model) OR
   (excluded.version IS NOT NULL AND campo_presence_devices.version IS NOT excluded.version)`)
   .bind(session,device.model,device.system,device.version).run();
 }catch(error){if(!/no such table: (?:main\.)?campo_presence_devices/i.test(error.message))throw error;}
}
async function presenceEnabled(db){const row=await db.prepare("SELECT value FROM campo_admin_settings WHERE id='presence'").first();return row?.value==='true';}
async function presencePing(db,b){if(!sharedId(b.sessionId)||typeof b.token!=='string'||b.token.length<32||b.token.length>100||typeof b.name!=='string'||!b.name.trim()||b.name.length>120)throw sharedError('Nome e sessão válidos são obrigatórios.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token))),x=>x.toString(16).padStart(2,'0')).join('');const old=await db.prepare('SELECT token_hash,last_seen FROM campo_presence WHERE session_id=?').bind(b.sessionId).first();if(old&&old.token_hash!==hash)throw sharedError('Sessão de presença inválida.',403);const enabled=await presenceEnabled(db);if(!enabled||b.active===false){if(old)await db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0 WHERE session_id=? AND token_hash=?').bind(b.sessionId,hash).run();return {enabled,accepted:false};}if(old&&Date.now()-Date.parse(old.last_seen)<15000)return {enabled,accepted:true,throttled:true};const p=b.location,at=Date.now();let lat=null,lon=null,accuracy=null,locationAt=null;if(b.shareLocation===true&&p&&typeof p.lat==='number'&&typeof p.lon==='number'&&sharedCoordinate(p.lat,90)&&sharedCoordinate(p.lon,180)&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(Date.parse(p.timestamp))&&at-Date.parse(p.timestamp)>=-5000&&at-Date.parse(p.timestamp)<=60000){lat=p.lat;lon=p.lon;accuracy=p.accuracy;locationAt=p.timestamp;}const now=new Date(at).toISOString();await db.prepare('INSERT INTO campo_presence(session_id,token_hash,name,first_seen,last_seen,active,lat,lon,accuracy,location_at,sharing) VALUES(?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name,last_seen=excluded.last_seen,active=1,lat=excluded.lat,lon=excluded.lon,accuracy=excluded.accuracy,location_at=excluded.location_at,sharing=excluded.sharing WHERE campo_presence.token_hash=excluded.token_hash').bind(b.sessionId,hash,b.name.trim(),now,now,lat,lon,accuracy,locationAt,b.shareLocation===true?1:0).run();await db.prepare("DELETE FROM campo_presence WHERE julianday(last_seen)<julianday('now','-7 days')").run();return {enabled:true,accepted:true};}
async function adminControlAPI(request,env){try{const u=new URL(request.url),p=u.pathname,db=await adminDb(env);if(p==='/api/team/presence/config'&&request.method==='GET')return json({enabled:await presenceEnabled(db)});if(p==='/api/team/presence/ping'&&request.method==='POST'){const b=await sharedBody(request,3000);if(env.CAMPO_USER){b.name=env.CAMPO_USER.name;b.sessionId='u-'+env.CAMPO_DEVICE_SESSION.hash.slice(0,32);b.token=env.CAMPO_DEVICE_SESSION.token;}const result=await presencePing(db,b);if(env.CAMPO_USER&&result.accepted){await db.prepare('INSERT INTO campo_presence_identities(session_id,user_id,email) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET user_id=excluded.user_id,email=excluded.email').bind(b.sessionId,env.CAMPO_USER.id,env.CAMPO_USER.email).run();
 await recordPresenceDevice(db,b.sessionId,presenceDevice(b.device,request.headers.get('User-Agent')||''));
 }return json(result);}if(!isAdministrator(request,env))throw sharedError('Acesso restrito ao administrador.',403);
 if(p==='/api/admin/universe'&&request.method==='GET')return json(await universalAdminRecords(env));
 if(p==='/api/admin/universe/labels'&&request.method==='POST'){const result=await updateAdminLabels(env,await sharedBody(request,50000));await realtimePublish(env,'admin-labels');return json(result);}
 if(p==='/api/admin/universe/delete'&&request.method==='POST'){const result=await universalAdminDelete(env,await sharedBody(request,30000));await realtimePublish(env,'admin-delete');return json(result);}
 if(p==='/api/admin/audit'&&request.method==='GET')return json(await adminAudit(db,u.searchParams));
 if(p==='/api/admin/presence'&&request.method==='GET'){const rows=await db.prepare("SELECT p.session_id,p.name,p.first_seen,p.last_seen,p.active,i.user_id,i.email,CASE WHEN julianday(location_at)>=julianday('now','-2 hours') THEN lat ELSE NULL END lat,CASE WHEN julianday(location_at)>=julianday('now','-2 hours') THEN lon ELSE NULL END lon,accuracy,location_at,sharing FROM campo_presence p LEFT JOIN campo_presence_identities i ON i.session_id=p.session_id ORDER BY last_seen DESC").all();let devices=new Map();
 try{
  const result=await db.prepare('SELECT d.session_id,d.model,d.system,d.version FROM campo_presence_devices d JOIN campo_presence p ON d.session_id=p.session_id').all();
  devices=new Map(result.results.map(({session_id,...device})=>[session_id,device]));
 }catch(error){if(!/no such table: (?:main\.)?campo_presence_devices/i.test(error.message))throw error;}
 return json({enabled:await presenceEnabled(db),sessions:rows.results.map(row=>({...row,device:devices.get(row.session_id)||null})),identity:'self_reported_names',activeWindowSeconds:120});}
 if(p==='/api/admin/presence'&&request.method==='POST'){const b=await sharedBody(request,1000);if(typeof b.enabled!=='boolean')throw sharedError('Configuração inválida.');await db.prepare("INSERT INTO campo_admin_settings(id,value,updated_at) VALUES('presence',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(b.enabled),new Date().toISOString()).run();if(!b.enabled)await db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0').run();return json({enabled:b.enabled});}
 return json({error:'Rota administrativa não encontrada.'},404);
 }catch(e){if(!e.status)console.error(JSON.stringify({event:'admin_control_error',route:new URL(request.url).pathname,detail:String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,500)}));return json({error:e.status?e.message:'Falha no controle central. A operação não foi confirmada. Atualize a base e tente em lotes menores.'},e.status||503);}}

async function updateAdminLabels(env,body){const records=body.records,value=body.classification;if(!Array.isArray(records)||!records.length||records.length>20||new Set(records.map(r=>r.id)).size!==records.length||!['','homologacao','producao'].includes(value)||records.some(r=>!sharedId(r.id)||!Number.isSafeInteger(r.labelRevision)||r.labelRevision<0))throw sharedError('Selecione de 1 a 20 cadastros e uma classificação válida.');const db=await adminDb(env),op=crypto.randomUUID(),now=Date.now();try{const locks=await db.batch(records.map(r=>db.prepare('INSERT INTO campo_admin_locks(tree_id,operation_id,expires_at) VALUES(?,?,?) ON CONFLICT(tree_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at WHERE campo_admin_locks.expires_at<?').bind(r.id,op,now+120000,now)));if(locks.some(r=>!r.meta.changes))throw sharedError('Há uma operação em andamento. Tente novamente.',409);const inventory=await adminArchiveInventory(env),known=new Set(inventory.archive.map(r=>r.id)),shared=await db.prepare('SELECT id,deleted FROM shared_trees').all();for(const r of shared.results){if(r.deleted)known.delete(r.id);else known.add(r.id);}for(const id of inventory.deleted)known.delete(id);const labels=await db.prepare('SELECT tree_id,revision FROM campo_record_labels WHERE tree_id IN ('+records.map(()=>'?').join(',')+')').bind(...records.map(r=>r.id)).all(),byId=new Map(labels.results.map(r=>[r.tree_id,r]));for(const r of records){if(!known.has(r.id))throw sharedError('Cadastro não está mais na base ativa. Atualize antes de classificar.',409);const old=byId.get(r.id);if((old?.revision||0)!==r.labelRevision)throw sharedError('Classificação alterada em outra sessão. Atualize a lista.',409);}const stamp=new Date().toISOString();await db.batch(records.map(r=>db.prepare("INSERT INTO campo_record_labels(tree_id,classification,revision,updated_at,actor) VALUES(?,?,1,?,'Administrador') ON CONFLICT(tree_id) DO UPDATE SET classification=excluded.classification,revision=campo_record_labels.revision+1,updated_at=excluded.updated_at,actor=excluded.actor").bind(r.id,value,stamp)));return {labels:records.map(r=>({id:r.id,classification:value,revision:r.labelRevision+1,updatedAt:stamp}))};}finally{await db.prepare('DELETE FROM campo_admin_locks WHERE operation_id=?').bind(op).run();}}

// Desktop-only, read-only analytics. No inspection or photo cache is written on the device.
let controlArchiveState=null;
async function controlInventory(env,force=false){
 const endpoint=env.GOOGLE_SCRIPT_URL||'',now=Date.now();
 if(!controlArchiveState||controlArchiveState.endpoint!==endpoint)controlArchiveState={endpoint,inventory:null,at:0,expires:0,promise:null,error:''};
 const state=controlArchiveState;
 if(state.promise)return state.promise;
 if(!force&&state.expires>now)return state;
 state.promise=(async()=>{try{state.inventory=await adminArchiveInventory(env);state.at=Date.now();state.error='';state.expires=state.at+60000;}catch(e){state.error=e.message;state.expires=Date.now()+30000;}finally{state.promise=null;}return state;})();return state.promise;
}
function controlDay(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const date=Date.parse(v);return Number.isFinite(date)?new Date(date-5*3600000).toISOString().slice(0,10):'';}
function controlFilters(params){
 const f=Object.fromEntries(['month','day','q'].map(k=>[k,(params.get(k)||'').trim()]));for(const k of ['inspector','feeder','classification','state'])f[k]=[...new Set(params.getAll(k).map(v=>v.trim()).filter(Boolean))];
 if(f.month&&!/^\d{4}-\d{2}$/.test(f.month)||f.day&&!/^\d{4}-\d{2}-\d{2}$/.test(f.day)||Object.values(f).flat().some(v=>v.length>200)||[f.inspector,f.feeder].some(l=>l.length>200)||f.classification.some(v=>!['producao','homologacao','unknown'].includes(v))||f.state.some(v=>!['missing','identification','poda','request'].includes(v)))throw sharedError('Filtro inválido.');return f;
}
function controlProblems(r){return CampoInspectionRules.missing({...r,photos:r.photos?.map(p=>({...p,original:p.original||p.assetId||p.id||'referencia'}))||[]});}
function controlMatches(r,f){const day=controlDay(r.createdAt),name=(r.collectionInspector||r.inspector||'').trim();return !r.archiveCleanupPending&&(!f.month||day.startsWith(f.month))&&(!f.day||day===f.day)&&(!f.inspector.length||f.inspector.some(i=>name.toLocaleLowerCase('pt-BR')===i.toLocaleLowerCase('pt-BR')))&&(!f.feeder.length||f.feeder.includes(r.feeder))&&(!f.classification.length||f.classification.some(c=>c==='unknown'?!r.adminClassification:r.adminClassification===c))&&(!f.q||[r.id,r.pole,r.span,r.species,name,r.feeder,r.address,r.os,r.lat,r.lon].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(f.q.toLocaleLowerCase('pt-BR'))))&&(!f.state.length||f.state.some(s=>s==='missing'?controlProblems(r).length:s==='identification'?CampoInspectionRules.identificationPending(r):s==='poda'?r.poda==='sim':r.deletionRequest));}
function controlSummary(rows){
 const times=rows.map(r=>r.inspectionTiming?.collectionSeconds).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b),sum=times.reduce((a,b)=>a+b,0),count=rows.length;
 return {count,individual:rows.filter(r=>r.grouped!=='sim').length,grouped:rows.filter(r=>r.grouped==='sim').length,measured:times.length,unknown:count-times.length,mean:times.length?sum/times.length:null,median:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,hours:sum/3600,poda:rows.filter(r=>r.poda==='sim').length,identification:rows.filter(r=>CampoInspectionRules.identificationPending(r)).length,missing:rows.filter(r=>controlProblems(r).length).length,requests:rows.filter(r=>r.deletionRequest).length,photos:rows.reduce((n,r)=>n+(r.photos?.length||0),0)};
}
function controlGroup(rows,key){const groups=new Map();for(const r of rows){const name=String(key(r)||'Não informado');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}return [...groups].map(([name,list])=>({name,...controlSummary(list)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function controlMap(rows,params){
 const bbox=(params.get('bbox')||'').split(',').map(Number),zoom=Number(params.get('zoom')||10);if(params.has('bbox')&&(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]>bbox[2]||bbox[1]>bbox[3])||!Number.isFinite(zoom)||zoom<0||zoom>24)throw sharedError('Área do mapa inválida.');
 const points=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180)&&(!params.has('bbox')||(Number(r.lon)>=bbox[0]&&Number(r.lat)>=bbox[1]&&Number(r.lon)<=bbox[2]&&Number(r.lat)<=bbox[3])));
 if(points.length<=600)return {count:points.length,grouped:false,points:points.map(r=>({id:r.id,lat:Number(r.lat),lon:Number(r.lon),species:r.species,pole:r.pole,poda:r.poda}))};
 let size=64,groups;do{groups=new Map();for(const r of points){const lat=Number(r.lat),lon=Number(r.lon),s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180),scale=256*2**zoom,x=(lon+180)/360*scale,y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale,key=Math.floor(x/size)+':'+Math.floor(y/size);let g=groups.get(key);if(!g){g={id:'group:'+key,count:0,lat:0,lon:0,bounds:[lon,lat,lon,lat]};groups.set(key,g);}g.count++;g.lat+=lat;g.lon+=lon;g.bounds=[Math.min(g.bounds[0],lon),Math.min(g.bounds[1],lat),Math.max(g.bounds[2],lon),Math.max(g.bounds[3],lat)];}if(groups.size>600)size*=2;}while(groups.size>600);
 return {count:points.length,grouped:true,points:[...groups.values()].map(g=>({...g,lat:g.lat/g.count,lon:g.lon/g.count}))};
}
function controlRecord(r){return {...r,photos:(r.photos||[]).map(p=>({id:p.id,assetId:p.assetId,name:p.name,receivedAt:p.receivedAt})),missingFields:controlProblems(r).map(p=>p.label)};}
async function controlUniverse(env,force=false){const archive=await controlInventory(env,force),inventory=archive.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};const data=await universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});return {...data,archive:{available:Boolean(archive.inventory),at:archive.at?new Date(archive.at).toISOString():null,error:archive.error||null}};}
async function controlLiveUniverse(env){const inventory=controlArchiveState?.endpoint===env.GOOGLE_SCRIPT_URL&&controlArchiveState.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};return universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});}
function controlBounds(rows){let bounds=null;for(const r of rows){if(!sharedCoordinate(r.lat,90)||!sharedCoordinate(r.lon,180))continue;const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}return bounds;}
function controlCsvCell(value){let text=value===null||value===undefined?'':String(value);if(typeof value!=='number'&&/^[=+\-@]/.test(text))text="'"+text;return /[;"\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;}
function controlPhotoName(r){return (r.photos||[]).map(p=>p.name||p.id||p.assetId).filter(Boolean).join(' | ');}
function controlPhotoLink(r){const value=r.folderUrl||r.photoReference||r.googleReceipt?.folderUrl||'';try{const url=new URL(value);return url.protocol==='https:'?url.href:'';}catch{return '';}}
function controlCsvNumber(value){return value===null||value===undefined||value===''?'':Number.isFinite(Number(value))?Number(value):value;}
function controlExportCsv(rows,extras=false){const headers=['ID','ESPECIE','LONGITUDE','LATITUDE','ALTURA','DATA','POSTE','DT BT','DT MT','DT AT','FOTO','AREA','DAP','ACESSO','EQUIPE','OBSERVACAO','ALIMENTADOR'],values=r=>[r.externalId||r.id,r.species,controlCsvNumber(r.lon),controlCsvNumber(r.lat),controlCsvNumber(r.height),r.createdAt,r.pole,controlCsvNumber(r.btDistance),controlCsvNumber(r.mtDistance),controlCsvNumber(r.atDistance),controlPhotoName(r),r.area,controlCsvNumber(r.dap),r.access,r.team,r.note,r.feeder];if(extras)headers.push('ID DO VAO','CHAVE','LOGRADOURO','MUNICIPIO','PERIMETRO','LINK DA FOTO');const all=rows.map(r=>extras?[...values(r),r.span,r.key||r.chave||'',r.street||r.logradouro||r.address||'',r.municipality||r.municipio||'',r.perimeter||r.perimetro||'',controlPhotoLink(r)]:values(r));return '\uFEFF'+[headers,...all].map(row=>row.map(controlCsvCell).join(';')).join('\r\n')+'\r\n';}
async function controlAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 if(new URL(request.url).pathname==='/api/control/edit')return await controlEditAPI(request,env,await adminDb(env));
 if(request.method!=='GET')throw sharedError('Use GET para consultar o painel.',405);
 const u=new URL(request.url),p=u.pathname,db=await adminDb(env);
 if(p==='/api/control/live'){if(!env.CAMPO_REALTIME)throw sharedError('Canal em tempo real ainda não configurado.',503);if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket obrigatório.',{status:426,headers:{Upgrade:'websocket','Cache-Control':'no-store'}});return env.CAMPO_REALTIME.getByName('management').fetch(new Request('https://campo-realtime/connect',{headers:request.headers}));}
 if(p==='/api/control/revision'){const r=await db.prepare('SELECT COALESCE(MAX(seq),0) seq FROM shared_changes').first(),labels=await db.prepare('SELECT MAX(updated_at) stamp FROM campo_record_labels').first();return json({revision:r.seq+':'+(labels.stamp||''),intervalSeconds:10,version:'4.7.3',at:new Date().toISOString()});}
 if(p==='/api/control/span-quality')return await adminSpanChecks(env,db,await controlUniverse(env),u.searchParams);
 if(p==='/api/control/export'){const from=u.searchParams.get('from')||'',to=u.searchParams.get('to')||'',extras=u.searchParams.get('extras')==='1',filters=controlFilters(u.searchParams);if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to))throw sharedError('Período inválido.');const data=await controlUniverse(env);const rows=data.records.filter(r=>{if(!controlMatches(r,filters))return false;const day=controlDay(r.createdAt);return (!from||day>=from)&&(!to||day<=to);}).sort((a,b)=>String(a.externalId||a.id).localeCompare(String(b.externalId||b.id),'pt-BR',{numeric:true}));return new Response(controlExportCsv(rows,extras),{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="arbora-todas-as-bases.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Campo-Record-Count':String(rows.length)}});}
 if(p==='/api/control/map'){const data=await (u.searchParams.get('archive')==='1'?controlUniverse(env):controlLiveUniverse(env)),filters=controlFilters(u.searchParams),all=data.records.filter(r=>!r.archiveCleanupPending),rows=all.filter(r=>controlMatches(r,filters));return json({map:controlMap(rows,u.searchParams),bounds:controlBounds(rows),total:rows.length,available:all.length,filtered:Object.values(filters).some(v=>v.length>0),generatedAt:data.generatedAt});}
 if(p!=='/api/control/data'&&p!=='/api/control/tree')throw sharedError('Consulta não encontrada.',404);
 let data=p==='/api/control/tree'?await controlLiveUniverse(env):await controlUniverse(env,u.searchParams.get('refresh')==='1');
 if(p==='/api/control/tree'&&!data.records.some(r=>r.id===u.searchParams.get('id')))data=await controlUniverse(env);
 if(p==='/api/control/tree'){const id=u.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const record=data.records.find(r=>r.id===id&&!r.archiveCleanupPending);if(!record)throw sharedError('Cadastro não está mais na base ativa.',404);return json({record:controlRecord(record)});}
 const filters=controlFilters(u.searchParams),rows=data.records.filter(r=>controlMatches(r,filters)),page=Number(u.searchParams.get('page')||0);if(!Number.isSafeInteger(page)||page<0)throw sharedError('Página inválida.');
 const last=Math.max(0,Math.ceil(rows.length/50)-1),current=Math.min(page,last),all=data.records.filter(r=>!r.archiveCleanupPending),options={inspectors:[...new Set(all.map(r=>(r.collectionInspector||r.inspector||'').trim()).filter(Boolean))].sort(),feeders:[...new Set(all.map(r=>r.feeder).filter(Boolean))].sort()};
 const coords=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180));let bounds=null;for(const r of coords){const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}
 return json({summary:controlSummary(rows),daily:controlGroup(rows,r=>controlDay(r.createdAt)).sort((a,b)=>b.name.localeCompare(a.name)).slice(0,31),inspectors:controlGroup(rows,r=>r.collectionInspector||r.inspector).slice(0,100),feeders:controlGroup(rows,r=>r.feeder).slice(0,30),positions:controlGroup(rows,r=>r.position),records:rows.slice(current*50,(current+1)*50).map(controlRecord),page:current,pages:last+1,total:rows.length,options,map:controlMap(rows,u.searchParams),bounds,archive:data.archive,sources:data.sources,scope:data.scope,generatedAt:data.generatedAt});
 }catch(e){return json({error:e.status?e.message:'Painel temporariamente indisponível. Tente novamente.'},e.status||503);}}

// Administrative corrections reuse the central row and its immutable history.
const controlEditFields=['lat','lon','species','height','dap','circ','mt','bt','at','mtDistance','btDistance','atDistance','pole','span','feeder','poda','projection','position','grouped','treeSite','os','address','note','area','access','team','municipality','perimeter','key','street'];
async function controlEditSnapshot(db,env,id){
 if(!sharedId(id))throw sharedError('ID inválido.');
 const row=await sharedRead(db,id);
 if(row||id.startsWith('vera-'))return historyRecord(db,id);
 // Legacy records are checked against Drive again before their first central edit.
 const inventory=await adminArchiveInventory(env),record=inventory.archive.find(r=>r.id===id);
 if(!record||inventory.deleted.has(id)||inventory.pending.some(r=>r.id===id))throw sharedError('Cadastro não está mais disponível para edição.',409);
 const token=await authHash(JSON.stringify(record));
 return {row:null,record,version:0,archive:true,baseline:{tree_id:id,data:JSON.stringify(record),recorded_at:new Date().toISOString(),actor:record.inspector||'Inventário Drive',generation:token}};
}
async function controlEditAPI(request,env,db){
 const id=new URL(request.url).searchParams.get('id');
 if(request.method==='GET'){
  const part=await controlEditSnapshot(db,env,id);
  if(part.row?.pending||await adminRecordLocked(db,id))throw sharedError('Há uma revisão de exclusão em andamento. Resolva antes de editar.',409);
  return json({record:part.record,version:part.version,baselineToken:part.baseline?.generation||null});
 }
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 const body=await sharedBody(request),actor=env.CAMPO_USER?.name||'Administrador';
 if(!sharedId(body.id)||!sharedId(body.operationId)||!Number.isSafeInteger(body.version)||body.version<0||!body.values||Array.isArray(body.values)||typeof body.values!=='object'||Object.keys(body.values).some(k=>!controlEditFields.includes(k)||!['string','number','boolean'].includes(typeof body.values[k])))throw sharedError('Edição inválida. Reabra o cadastro.');
 const existing=await sharedRead(db,body.id);
 if(existing?.last_op===body.operationId&&!existing.deleted)return json({tree:sharedView(existing),replayed:true});
 const part=await controlEditSnapshot(db,env,body.id);
 if(part.version!==body.version||!part.row&&part.baseline.generation!==body.baselineToken||part.row?.pending)throw sharedError('Cadastro alterado. Suas alterações foram mantidas na tela; reabra a versão atual antes de salvar.',409);
 const stamp=new Date().toISOString(),checked=sharedData({...part.record,...body.values,id:body.id},actor),data={...part.record};
 for(const k of Object.keys(body.values))data[k]=checked[k];
 for(const k of ['sharedVersion','sharedDeleted','sharedUpdatedAt','sharedActor','deletionRequest','baselineToken','baseline'])delete data[k];
 data.updatedAt=stamp;data.lastInspector=actor;data.lastEditorUserId=env.CAMPO_USER?.id||null;data.lastEditorEmail=env.CAMPO_USER?.email||null;data.managementEdit={at:stamp,actor,fields:Object.keys(body.values)};
 if(Object.hasOwn(body.values,'height')&&Number(data.height)!==Number(part.record.height))data.heightMeasurement={method:'manual-management',confirmedAt:stamp,actor};
 // Original creation date, inspector, timing, measurements and other metadata stay intact.
 data.photos=[...(part.record.photos||[])];
 const uploads=body.uploads||[];
 if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie até 12 fotos.');
 const copies=[],seen=new Set(data.photos.map(p=>p.assetId));
 for(const p of uploads){
  await sharedPhoto(p);
  if(seen.has(p.assetId))continue;
  const old=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(body.id,p.assetId).first();
  if(old&&old.image!==p.image)throw sharedError('Identificador de foto já utilizado.',409);
  seen.add(p.assetId);copies.push(p);data.photos.push({id:p.assetId,assetId:p.assetId,name:String(p.name||'Foto anexada no PC').slice(0,180),receivedAt:stamp,phase:'current'});
 }
 if(data.photos.length>12&&data.photos.length>(part.record.photos||[]).length)throw sharedError('Limite de 12 fotos atuais por cadastro. As fotos existentes foram preservadas.');
 const condition=part.archive?{sql:'NOT EXISTS(SELECT 1 FROM shared_trees WHERE id=?)',args:[body.id]}:historyCondition(part,'editing');
 const guard=condition.sql+' AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=? AND expires_at>unixepoch()*1000)',args=[...condition.args,body.id];
 const first=part.row?db.prepare('UPDATE shared_trees SET data=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND '+guard).bind(JSON.stringify(data),stamp,body.operationId,actor,body.id,...args):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) SELECT ?,?,1,?,?,? WHERE '+guard).bind(body.id,JSON.stringify(data),stamp,body.operationId,actor,...args);
 const statements=[first,...historyBaselineStatements(db,part.baseline,body.operationId,body.id)];
 for(const p of copies)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(body.id,p.assetId,p.image,body.id,body.operationId));
 const result=await db.batch(statements);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a edição. Nenhuma alteração foi aplicada; reabra a versão atual.',409);
 await realtimePublish(env,'management-edit');
 return json({tree:sharedView(await sharedRead(db,body.id)),preserved:true});
}

// Base VERA corrigida: leitura restrita ao administrador; escrita só pelo envio local com VERA_SYNC_TOKEN.
const VERA_GENERATION=/^[a-z0-9-]{8,40}$/,VERA_ID=/^[A-Za-z0-9_-]{1,40}$/,VERA_IMAGE=/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i;
const veraMissingTable=e=>/no such table/i.test(String(e?.message||e));
// Só o necessário para a prévia de risco: nunca fotos, nem identificação de quem inspecionou além do nome já exibido no painel.
function veraLiveRecord(r,review){return {id:r.id,review:review||null,count:r.count??null,photoAsset:(r.photos||[]).find(p=>p.assetId)?.assetId||'',species:r.species||'',height:r.height??null,dap:r.dap??null,circ:r.circ??null,mt:r.mt===true,bt:r.bt===true,mtDistance:r.mtDistance??null,btDistance:r.btDistance??null,position:r.position||'',projection:r.projection||'',lat:r.lat??null,lon:r.lon??null,pole:r.pole||'',span:r.span||'',feeder:r.feeder||'',poda:r.poda||'',note:String(r.note||'').slice(0,300),createdAt:r.createdAt||null,updatedAt:r.updatedAt||null,actor:r.sharedActor||r.lastInspector||r.inspector||''};}
// Para o mapa do inspetor: só o que ele precisa para achar e atualizar a árvore. Clientes e prioridade ficam no painel.
function veraFieldRow(t){return {id:t.id,lat:t.lat,lon:t.lon,coordOriginal:t.coordOriginal,especies:t.especies,qtd:t.qtd,altura:t.altura,dap:t.dap,origemDap:t.origemDap,distMT:t.distMT,distBT:t.distBT,distAT:t.distAT,projecao:t.projecao,classe:t.classe,acao:t.acao,poste:t.poste,vao:t.vao,alimentador:t.alimentador,ano:t.ano,logradouro:t.logradouro,observacao:t.observacao,poda:t.poda,registro:t.registro,seq:t.seq,nArvores:t.nArvores,origemArvore:t.origemArvore,metodo:t.metodo,confianca:t.confianca,fonte:t.fonte,especieConf:t.especieConf};}
// Volta para a planilha: tudo que o campo cadastrou, sem as fotos, que vêm uma a uma por field-photo.
function veraExportRecord(r,review){return {id:r.id,externalId:r.externalId||'',lat:r.lat??null,lon:r.lon??null,species:r.species||'',height:r.height??null,dap:r.dap??null,circ:r.circ??null,position:r.position||'',pole:r.pole||'',span:r.span||'',feeder:r.feeder||'',os:r.os||'',poda:r.poda||'',projection:r.projection||'',grouped:r.grouped||'',treeSite:r.treeSite||'',mt:r.mt===true,bt:r.bt===true,at:r.at===true,mtDistance:r.mtDistance??null,btDistance:r.btDistance??null,atDistance:r.atDistance??null,note:r.note||'',address:r.address||'',inspector:r.collectionInspector||r.inspector||'',lastInspector:r.sharedActor||r.lastInspector||'',createdAt:r.createdAt||null,updatedAt:r.updatedAt||null,sharedVersion:r.sharedVersion??null,folderUrl:r.folderUrl||r.googleReceipt?.folderUrl||'',photos:(r.photos||[]).map(p=>p.assetId).filter(Boolean),review:review||null};}
async function veraMeta(db){const {results}=await db.prepare('SELECT key,value FROM vera_meta').all();return Object.fromEntries(results.map(r=>[r.key,r.value]));}
async function veraReviews(db){try{const {results}=await db.prepare('SELECT tree_id,verificacao,obs,actor,updated_at FROM vera_field_review').all();return results;}catch(e){if(veraMissingTable(e))return [];throw e;}}
const veraPhotoId=id=>id.replace(/-\d+$/,'');
async function veraField(u,db){
 if(u.pathname==='/api/vera/field-photo'){const id=u.searchParams.get('id')||'';if(!VERA_ID.test(id))throw sharedError('ID inválido.');const row=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(id)).first();if(!row)throw sharedError('Miniatura indisponível.',404);return json({image:row.image});}
 let meta;try{meta=await veraMeta(db);}catch(e){if(veraMissingTable(e))return json({generation:null,trees:[]});throw e;}
 const generation=meta.generation||null;if(generation&&u.searchParams.get('since')===generation)return json({generation,unchanged:true});
 const {results}=generation?await db.prepare('SELECT data FROM vera_trees WHERE generation=?').bind(generation).all():{results:[]};return json({generation,trees:results.map(r=>veraFieldRow(JSON.parse(r.data)))});
}
async function veraAPI(request,env){try{
 const u=new URL(request.url);
 // Inspetores também leem: o gateway de acesso já exigiu o login antes de chegar aqui.
 if(u.pathname==='/api/vera/field'||u.pathname==='/api/vera/field-photo'){if(request.method!=='GET')throw sharedError('Use GET.',405);return await veraField(u,await adminDb(env));}
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);const db=await adminDb(env);
 if(u.pathname==='/api/vera/review'){if(request.method!=='POST')throw sharedError('Use POST.',405);if(Number(request.headers.get('content-length')||0)>4096)throw sharedError('Solicitação grande demais.',413);let body;try{body=await request.json();}catch{throw sharedError('Solicitação inválida.');}const {id,verificacao,obs}=body||{};if(!sharedId(id))throw sharedError('ID inválido.');if(verificacao===''){await db.prepare('DELETE FROM vera_field_review WHERE tree_id=?').bind(id).run();return json({id,review:null});}if(!['CONFIRMADA','NÃO CONFIRMADA'].includes(verificacao))throw sharedError('Conferência inválida.');const review={tree_id:id,verificacao,obs:String(obs||'').slice(0,300),actor:String(env.CAMPO_USER?.name||env.CAMPO_USER?.username||'Administrador').slice(0,120),updated_at:new Date().toISOString()};await db.prepare('INSERT OR REPLACE INTO vera_field_review(tree_id,verificacao,obs,actor,updated_at) VALUES(?,?,?,?,?)').bind(review.tree_id,review.verificacao,review.obs,review.actor,review.updated_at).run();return json({id,review});}
 if(request.method!=='GET')throw sharedError('Use GET para consultar a base VERA.',405);let meta;
 try{meta=await veraMeta(db);}catch(e){if(veraMissingTable(e))return json({generation:null,updatedAt:null,total:0,trees:[]});throw e;}
 const generation=meta.generation||null;
 if(u.pathname==='/api/vera/meta'){const reviews=await veraReviews(db);return json({generation,updatedAt:meta.updatedAt||null,total:Number(meta.total||0),reviews:reviews.length+':'+reviews.reduce((m,r)=>r.updated_at>m?r.updated_at:m,'')});}
 if(u.pathname==='/api/vera/trees'){if(generation&&u.searchParams.get('since')===generation)return json({generation,unchanged:true});const {results}=generation?await db.prepare('SELECT data FROM vera_trees WHERE generation=?').bind(generation).all():{results:[]};return json({generation,updatedAt:meta.updatedAt||null,total:results.length,trees:results.map(r=>JSON.parse(r.data)),referencia:meta.referencia?JSON.parse(meta.referencia):null});}
 if(u.pathname==='/api/vera/live'){const data=await controlLiveUniverse(env),reviews=new Map((await veraReviews(db)).map(r=>[r.tree_id,r]));const links=await db.prepare('SELECT source_id,target_id FROM shared_merges').all();return json({merged:links.results.map(r=>({sourceId:r.source_id,targetId:r.target_id})),generatedAt:data.generatedAt,records:data.records.filter(r=>!r.archiveCleanupPending&&r.adminClassification!=='homologacao').map(r=>veraLiveRecord(r,reviews.get(r.id)))});}
 if(u.pathname==='/api/vera/photo'){const id=u.searchParams.get('id')||'';if(!VERA_ID.test(id))throw sharedError('ID inválido.');const row=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(id)).first();if(!row)throw sharedError('Miniatura indisponível.',404);return json({image:row.image});}
 throw sharedError('Consulta não encontrada.',404);
}catch(e){return json({error:e.status?e.message:'Base VERA temporariamente indisponível.'},e.status||503);}}
// Troca atômica: as linhas novas entram numa geração própria e o painel só passa a vê-las no commit.
async function veraSync(request,env){try{
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(!env.VERA_SYNC_TOKEN||env.VERA_SYNC_TOKEN.length<32)return json({error:'Envio VERA não configurado no Worker.'},503);
 if(!await equalSecret((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.VERA_SYNC_TOKEN))return json({error:'Token de envio inválido.'},401);
 if(Number(request.headers.get('content-length')||0)>9000000)return json({error:'Lote grande demais.'},413);
 let body;try{body=await request.json();}catch{return json({error:'Solicitação inválida.'},400);}
 const db=await adminDb(env),{action,generation}=body||{};
 if(action==='field-export'){const data=await controlLiveUniverse(env),reviews=new Map((await veraReviews(db)).map(r=>[r.tree_id,r]));return json({generatedAt:data.generatedAt,records:data.records.filter(r=>!r.archiveCleanupPending&&r.adminClassification!=='homologacao').map(r=>veraExportRecord(r,reviews.get(r.id))),deleted:data.deletedIds.filter(id=>id.startsWith('vera-'))});}
 if(action==='field-photo'){if(!sharedId(body.id)||!sharedId(body.asset))return json({error:'Foto inválida.'},400);const row=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(body.id,body.asset).first();if(!row)return json({error:'Foto não encontrada.'},404);return json({image:row.image});}
 if(action==='thumb-ids'){const {results}=await db.prepare('SELECT id FROM vera_thumbs').all();return json({ids:results.map(r=>r.id)});}
 if(action==='thumbs'){const items=body.items;if(!Array.isArray(items)||!items.length||items.length>40||!items.every(i=>VERA_ID.test(i?.id||'')&&typeof i.image==='string'&&i.image.length<300000&&VERA_IMAGE.test(i.image)))return json({error:'Miniaturas inválidas.'},400);await db.batch(items.map(i=>db.prepare('INSERT OR REPLACE INTO vera_thumbs(id,image) VALUES(?,?)').bind(i.id,i.image)));return json({saved:items.length});}
 if(!VERA_GENERATION.test(generation||''))return json({error:'Geração inválida.'},400);
 if(action==='rows'){const rows=body.rows;if(!Array.isArray(rows)||!rows.length||rows.length>500||!rows.every(r=>VERA_ID.test(r?.id||'')&&r.data&&typeof r.data==='object'))return json({error:'Linhas inválidas.'},400);const texts=rows.map(r=>JSON.stringify({...r.data,id:r.id}));if(texts.some(t=>t.length>16000))return json({error:'Linha grande demais.'},413);await db.batch(rows.map((r,i)=>db.prepare('INSERT OR REPLACE INTO vera_trees(generation,id,data) VALUES(?,?,?)').bind(generation,r.id,texts[i])));return json({saved:rows.length});}
 if(action==='commit'){const total=Number(body.total),found=await db.prepare('SELECT COUNT(*) n FROM vera_trees WHERE generation=?').bind(generation).first();if(!Number.isSafeInteger(total)||total<1||found.n!==total)return json({error:'Envio incompleto: '+found.n+' de '+body.total+' linhas.'},409);const set=(k,v)=>db.prepare('INSERT OR REPLACE INTO vera_meta(key,value) VALUES(?,?)').bind(k,String(v)),now=new Date().toISOString();const referencia=JSON.stringify(body.referencia&&typeof body.referencia==='object'?body.referencia:{});if(referencia.length>200000)return json({error:'Referência grande demais.'},413);await db.batch([set('generation',generation),set('updatedAt',now),set('total',total),set('referencia',referencia),db.prepare('DELETE FROM vera_trees WHERE generation<>?').bind(generation),db.prepare('DELETE FROM vera_thumbs WHERE id NOT IN (SELECT id FROM vera_trees WHERE generation=?)').bind(generation)]);return json({generation,total,updatedAt:now});}
 return json({error:'Ação desconhecida.'},400);
}catch(e){if(veraMissingTable(e))return json({error:'Aplique backend/vera-schema.sql no D1 antes do primeiro envio.'},503);return json({error:e.status?e.message:'Envio VERA temporariamente indisponível.'},e.status||503);}}

const VERA_PROGRESS_HISTORY='arbora:vera-progress:history-v1';
const VERA_PROGRESS_SGM='arbora:vera-progress:sgm-v1';
const VERA_PROGRESS_LIMIT=8000000;
const progressTxt=(value,size)=>typeof value==='string'&&value.length<=size;
const progressDay=value=>progressTxt(value,10)&&/^20\d\d-\d\d-\d\d$/.test(value)&&
 Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
function validVeraProgress(dataset,history){
 if(dataset?.version!==1||!Array.isArray(dataset.coverage)||dataset.coverage.length>100000||
  !Array.isArray(dataset.orders)||dataset.orders.length>20000)return false;
 if(!dataset.coverage.every(row=>Array.isArray(row)&&row.length===8&&progressDay(row[0])&&
  /^\d{1,20}$/.test(row[1])&&Number.isFinite(row[2])&&row[2]>0&&row[2]<=50000&&
  row.slice(3).every(value=>progressTxt(value,100))))return false;
 if(!dataset.orders.every(order=>order&&['id','number','feeder','block','team','inspector','link'].every(k=>progressTxt(order[k],100))&&
  order.id&&['executada','pendente','cancelada'].includes(order.status)&&(!order.day||progressDay(order.day))))return false;
 if(history)return Array.isArray(dataset.trees)&&dataset.trees.length<=100000&&dataset.trees.every(row=>
  Array.isArray(row)&&row.length===5&&progressDay(row[0])&&row.slice(1,4).every(value=>progressTxt(value,100))&&Number.isSafeInteger(row[4])&&row[4]>0);
 return Array.isArray(dataset.files)&&dataset.files.length===2&&dataset.files.every(file=>
  progressTxt(file?.name,100)&&progressTxt(file?.modified,30)&&Number.isFinite(Date.parse(file.modified)))&&
  progressTxt(dataset.catalog,100);
}
async function veraProgressWrite(request,env,history){
 const raw=await sharedBody(request,VERA_PROGRESS_LIMIT);
 if(!validVeraProgress(raw,history))throw sharedError('Formato inválido para o avanço VERA.');
 const store=env.LOGIN_GUARD,name=history?VERA_PROGRESS_HISTORY:VERA_PROGRESS_SGM;
 const previous=await store.getWithMetadata(name,'text');
 const text=JSON.stringify(raw);
 if(text===previous.value)return json({unchanged:true,updatedAt:previous.metadata?.updatedAt});
 if(!history&&previous.value){
  const before=JSON.parse(previous.value);
  for(const file of raw.files){
   const previousFile=before.files.find(old=>old.name===file.name);
   if(previousFile&&Date.parse(file.modified)<Date.parse(previousFile.modified))throw sharedError('O arquivo '+file.name+' é anterior ao último envio aceito.',409);
  }
 }
 const updatedAt=new Date().toISOString();
 await store.put(name,text,{metadata:{updatedAt}});
 return json({updatedAt,spans:raw.coverage.length,orders:raw.orders.length});
}
async function veraProgressAPI(request,env){
 try{
  if(!isAdministrator(request,env))throw sharedError('Acompanhamento VERA restrito ao administrador.',403);
  if(request.method==='POST')return await veraProgressWrite(request,env,true);
  if(request.method!=='GET')throw sharedError('Use GET ou POST.',405);
  const [history,sgm]=await Promise.all([env.LOGIN_GUARD.getWithMetadata(VERA_PROGRESS_HISTORY,'json'),env.LOGIN_GUARD.getWithMetadata(VERA_PROGRESS_SGM,'json')]);
  return json({history:history.value,historyUpdatedAt:history.metadata?.updatedAt||null,sgm:sgm.value,sgmUpdatedAt:sgm.metadata?.updatedAt||null});
 }catch(e){return json({error:e.status?e.message:'Avanço VERA temporariamente indisponível.'},e.status||503);}
}
async function veraProgressSync(request,env){
 try{
  if(request.method!=='POST')throw sharedError('Use POST.',405);
  if(!env.VERA_PROGRESS_SYNC_TOKEN||env.VERA_PROGRESS_SYNC_TOKEN.length<32)throw sharedError('Envio SGM ainda não configurado.',503);
  const token=(request.headers.get('Authorization')||'').replace(/^Bearer /,'');
  if(!await equalSecret(token,env.VERA_PROGRESS_SYNC_TOKEN))throw sharedError('Token de envio inválido.',401);
  return await veraProgressWrite(request,env,false);
 }catch(e){return json({error:e.status?e.message:'Envio SGM temporariamente indisponível.'},e.status||503);}
}

const CENTRAL_NAME=/^[a-z0-9_]{1,40}$/,CENTRAL_GENERATION=/^cen-[0-9]{8,20}$/,CENTRAL_BODY=/^[A-Za-z0-9+/]+={0,2}$/;
function centralMissingTable(e){return /no such table/i.test(String(e?.message||e));}
async function centralMeta(db){const {results}=await db.prepare('SELECT key,value FROM central_meta').all();return Object.fromEntries(results.map(r=>[r.key,r.value]));}
const SOLIC_TIPOS=new Set(['PD','AVULSA']),SOLIC_SITUACOES=new Set(['Rascunho','Enviada','Atendida','Cancelada']),SOLIC_ID=/^[a-f0-9-]{36}$/;
// Valida tudo no servidor: a tela só oferece material ativo, mas é aqui que a solicitação é gravada.
function solicitacaoValida(b){
 if(!b||typeof b!=='object')throw sharedError('Solicitação inválida.');
 if(!SOLIC_TIPOS.has(b.tipo))throw sharedError('Tipo inválido.');
 if(!SOLIC_SITUACOES.has(b.situacao))throw sharedError('Situação inválida.');
 if(b.tipo==='PD'&&!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(b.mesPd||''))throw sharedError('Informe o mês do plano de demanda.');
 if(typeof (b.obs??'')!=='string'||(b.obs||'').length>1000)throw sharedError('Observação longa demais.');
 if(!Array.isArray(b.itens)||!b.itens.length||b.itens.length>500)throw sharedError('Inclua de 1 a 500 itens.');
 const vistos=new Set(),itens=b.itens.map(i=>{const cod=Number(i?.cod),qtd=Number(i?.qtd);if(!Number.isSafeInteger(cod)||cod<=0)throw sharedError('Código de material inválido.');if(!Number.isFinite(qtd)||qtd<=0||qtd>1e8)throw sharedError('Quantidade inválida no material '+cod+'.');if(vistos.has(cod))throw sharedError('Material '+cod+' repetido.');vistos.add(cod);return {cod,desc:String(i.desc||'').slice(0,200),un:String(i.un||'').slice(0,40),qtd};});
 return {tipo:b.tipo,mesPd:b.tipo==='PD'?b.mesPd:null,situacao:b.situacao,obs:b.obs||'',itens};
}
async function centralSolicitacoes(request,db){
 if(request.method==='GET'){const {results}=await db.prepare('SELECT id,tipo,mes_pd,situacao,obs,itens,criado_em,atualizado_em FROM central_solicitacoes ORDER BY criado_em DESC LIMIT 500').all();return json({solicitacoes:results.map(r=>({id:r.id,tipo:r.tipo,mesPd:r.mes_pd,situacao:r.situacao,obs:r.obs,itens:JSON.parse(r.itens),criadoEm:r.criado_em,atualizadoEm:r.atualizado_em}))});}
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 if(Number(request.headers.get('content-length')||0)>400000)throw sharedError('Solicitação grande demais.',413);
 let body;try{body=await request.json();}catch{throw sharedError('Solicitação inválida.');}
 const s=solicitacaoValida(body),now=new Date().toISOString();
 if(body.id!=null){if(!SOLIC_ID.test(String(body.id)))throw sharedError('Solicitação inválida.');const out=await db.prepare('UPDATE central_solicitacoes SET tipo=?,mes_pd=?,situacao=?,obs=?,itens=?,atualizado_em=? WHERE id=?').bind(s.tipo,s.mesPd,s.situacao,s.obs,JSON.stringify(s.itens),now,body.id).run();if(!out.meta?.changes)throw sharedError('Solicitação não encontrada.',404);return json({id:body.id,atualizadoEm:now});}
 const id=crypto.randomUUID();await db.prepare('INSERT INTO central_solicitacoes(id,tipo,mes_pd,situacao,obs,itens,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?)').bind(id,s.tipo,s.mesPd,s.situacao,s.obs,JSON.stringify(s.itens),now,now).run();return json({id,criadoEm:now});
}
// Data marco e premissas editadas na tela: sobrevivem ao envio diário e valem em qualquer computador.
const PREM_CHAVE=/^[A-Za-z0-9_.\/ ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç-]{1,60}$/;
async function centralPremissas(request,db){
 if(request.method==='GET'){try{const {results}=await db.prepare('SELECT chave,valor,atualizado_em FROM central_premissas').all();return json({premissas:Object.fromEntries(results.map(r=>[r.chave,JSON.parse(r.valor)])),atualizadoEm:results.reduce((a,r)=>r.atualizado_em>a?r.atualizado_em:a,'')||null});}catch(e){if(centralMissingTable(e))return json({premissas:{},atualizadoEm:null});throw e;}}
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 if(Number(request.headers.get('content-length')||0)>40000)throw sharedError('Premissas grandes demais.',413);
 let body;try{body=await request.json();}catch{throw sharedError('Premissas inválidas.');}
 const p=body?.premissas;if(!p||typeof p!=='object'||Array.isArray(p))throw sharedError('Premissas inválidas.');const itens=Object.entries(p);if(!itens.length||itens.length>200)throw sharedError('Envie de 1 a 200 premissas.');
 for(const [k,v]of itens){if(!PREM_CHAVE.test(k))throw sharedError('Nome de premissa inválido.');if(v!==null&&!(typeof v==='number'&&Number.isFinite(v))&&!(typeof v==='string'&&v.length<=60))throw sharedError('Valor inválido em '+k+'.');}
 // A tabela nasce no primeiro salvamento: não depende de aplicar o esquema à mão.
 await db.prepare('CREATE TABLE IF NOT EXISTS central_premissas(chave TEXT PRIMARY KEY,valor TEXT NOT NULL,atualizado_em TEXT NOT NULL)').run();
 const now=new Date().toISOString();await db.batch(itens.map(([k,v])=>v===null||v===''?db.prepare('DELETE FROM central_premissas WHERE chave=?').bind(k):db.prepare('INSERT OR REPLACE INTO central_premissas(chave,valor,atualizado_em) VALUES(?,?,?)').bind(k,JSON.stringify(v),now)));
 return json({salvas:itens.length,atualizadoEm:now});
}
// Dados de gestão e orçamento: só administrador lê. Os arquivos vão comprimidos em partes e o navegador junta.
async function centralAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 const u=new URL(request.url),db=await adminDb(env);let meta;
 if(u.pathname==='/api/central/solicitacoes')return await centralSolicitacoes(request,db);
 if(u.pathname==='/api/central/premissas')return await centralPremissas(request,db);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 try{meta=await centralMeta(db);}catch(e){if(centralMissingTable(e))return json({generation:null,updatedAt:null,manifest:{}});throw e;}

 if(u.pathname==='/api/central/meta')return json({generation:meta.generation||null,updatedAt:meta.updatedAt||null,manifest:meta.manifest?JSON.parse(meta.manifest):{}});
 if(u.pathname==='/api/central/data'){const name=u.searchParams.get('name')||'',part=Number(u.searchParams.get('part')),generation=u.searchParams.get('generation')||'';if(!CENTRAL_NAME.test(name)||!Number.isSafeInteger(part)||part<0||part>999||!CENTRAL_GENERATION.test(generation))throw sharedError('Consulta inválida.');const row=await db.prepare('SELECT body FROM central_parts WHERE generation=? AND name=? AND part=?').bind(generation,name,part).first();if(!row)throw sharedError('Base atualizada: recarregue a página.',409);return json({body:row.body});}
 throw sharedError('Consulta não encontrada.',404);
}catch(e){return json({error:e.status?e.message:'Base temporariamente indisponível.'},e.status||503);}}
// Troca atômica: enquanto envia, o painel segue na geração anterior.
async function centralSync(request,env){try{
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(!env.VERA_SYNC_TOKEN||env.VERA_SYNC_TOKEN.length<32)return json({error:'Envio não configurado no Worker.'},503);
 if(!await equalSecret((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.VERA_SYNC_TOKEN))return json({error:'Token de envio inválido.'},401);
 if(Number(request.headers.get('content-length')||0)>2000000)return json({error:'Lote grande demais.'},413);
 let body;try{body=await request.json();}catch{return json({error:'Solicitação inválida.'},400);}
 const db=await adminDb(env),{action,generation}=body||{};
 if(!CENTRAL_GENERATION.test(generation||''))return json({error:'Geração inválida.'},400);
 if(action==='part'){const {name,part,data}=body;if(!CENTRAL_NAME.test(name||'')||!Number.isSafeInteger(part)||part<0||part>999||typeof data!=='string'||!data.length||data.length>1500000||!CENTRAL_BODY.test(data))return json({error:'Parte inválida.'},400);await db.prepare('INSERT OR REPLACE INTO central_parts(generation,name,part,body) VALUES(?,?,?,?)').bind(generation,name,part,data).run();return json({saved:true});}
 if(action==='commit'){
  const manifest=body.manifest;
  if(!manifest||typeof manifest!=='object'||!Object.keys(manifest).length||!Object.keys(manifest).every(k=>CENTRAL_NAME.test(k)&&Number.isSafeInteger(manifest[k]?.parts)&&manifest[k].parts>0))return json({error:'Manifesto inválido.'},400);
  const {results}=await db.prepare('SELECT name,COUNT(*) n FROM central_parts WHERE generation=? GROUP BY name').bind(generation).all(),found=Object.fromEntries(results.map(r=>[r.name,r.n]));
  for(const [k,v]of Object.entries(manifest))if(found[k]!==v.parts)return json({error:'Envio incompleto: '+k+'.'},409);
  // The operational refresh must retain the independently verified territorial references.
  // Copy inside the same transaction as the active generation switch and cleanup.
  const previous=await centralMeta(db),previousManifest=JSON.parse(previous.manifest||'{}'),preserve=[];
  for(const name of ['conjuntos_geo','postes_gis']){
   if(manifest[name]||!previousManifest[name])continue;
   const count=await db.prepare('SELECT COUNT(*) n FROM central_parts WHERE generation=? AND name=?').bind(previous.generation,name).first();
   if(count.n!==previousManifest[name].parts)return json({error:'Referência territorial incompleta: '+name+'.'},409);
   manifest[name]=previousManifest[name];
   if(previous.generation!==generation)preserve.push(db.prepare('INSERT OR REPLACE INTO central_parts(generation,name,part,body) SELECT ?,name,part,body FROM central_parts WHERE generation=? AND name=?').bind(generation,previous.generation,name));
  }
  const now=new Date().toISOString(),set=(k,v)=>db.prepare('INSERT OR REPLACE INTO central_meta(key,value) VALUES(?,?)').bind(k,String(v));
  await db.batch([...preserve,set('generation',generation),set('updatedAt',now),set('manifest',JSON.stringify(manifest)),db.prepare('DELETE FROM central_parts WHERE generation<>?').bind(generation)]);
  return json({generation,updatedAt:now});
 }
 return json({error:'Ação desconhecida.'},400);
}catch(e){if(centralMissingTable(e))return json({error:'Aplique backend/central-schema.sql no D1 antes do primeiro envio.'},503);return json({error:e.status?e.message:'Envio temporariamente indisponível.'},e.status||503);}}

const CYCLE_SEED='arbora:pruning-cycle:2026-11-22';
const CYCLE_SIZE=4500000;
const CYCLE_TABLE='CREATE TABLE IF NOT EXISTS campo_cycle_snapshot (name TEXT PRIMARY KEY, revision TEXT NOT NULL, changed TEXT NOT NULL, parts INTEGER NOT NULL, data TEXT)';
async function cicloPodaAPI(request,env){
 try{
  if(!isAdministrator(request,env))throw sharedError('Ciclo de poda restrito à gestão.',403);
  const db=await adminDb(env),url=new URL(request.url);
  let active;
  try{active=await db.prepare("SELECT revision,changed,parts FROM campo_cycle_snapshot WHERE name='active'").first();}
  catch(error){if(!centralMissingTable(error))throw error;}
  const seed=active?null:await env.LOGIN_GUARD?.get(CYCLE_SEED,'json');
  const current=active||(Number.isInteger(seed?.parts)&&seed.parts>0&&seed.parts<=20&&seed.revision?seed:null);
  if(request.method==='GET'){
   if(url.searchParams.get('meta')==='1')return json({revision:current?.revision||null,changed:current?.changed||null});
   if(!current)throw sharedError('Importe o Controle Man V1.xlsx para ativar o plano.',404);
   let archive;
   if(active){
    const {results}=await db.prepare("SELECT data FROM campo_cycle_snapshot WHERE revision=? AND name<>'active' ORDER BY name").bind(current.revision).all();
    archive=results.length===current.parts?new Blob(results.map(row=>Uint8Array.from(atob(row.data),char=>char.charCodeAt(0)))):null;
   }else{
    const parts=await Promise.all(Array.from({length:seed.parts},(_,i)=>env.LOGIN_GUARD.get(CYCLE_SEED+':'+i,'arrayBuffer')));
    if(parts.every(Boolean))archive=new Blob(parts);
   }
   if(!archive?.size||archive.size>CYCLE_SIZE)throw sharedError('Base de ciclo incompleta. Atualize e tente novamente.',409);
   return new Response(archive,{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Cycle-Revision':current.revision}});
  }
  if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
  if(request.headers.get('Content-Type')!=='application/gzip')throw sharedError('Envie a base em formato gzip.',415);
  const expected=url.searchParams.get('base')||'';
  if(expected!==(current?.revision||''))throw sharedError('Outra publicação atualizou o ciclo. Atualize a página antes de enviar.',409);
  let body;
  try{body=await limitedBody(request,CYCLE_SIZE);}
  catch{throw sharedError('Arquivo compactado excede 4,5 MB ou está vazio.',413);}
  let data;
  try{
   const compressed=new Response(body.stream().pipeThrough(new DecompressionStream('gzip')));
   data=JSON.parse(await(await limitedBody(compressed,20000000)).text());
  }catch{throw sharedError('Base de ciclo inválida ou excede 20 MB descompactada.');}
  if(!data.postes?.linhas?.length||data.checagem_excel?.length!==data.postes.linhas.length||
     !Array.isArray(data.arvores?.linhas)||!Array.isArray(data.execucoes)||!Number.isInteger(data.parametros?.inicio))
   throw sharedError('A base deve conter os postes, árvores, execuções, premissas e conferência.');
  await db.prepare(CYCLE_TABLE).run();
  const bytes=new Uint8Array(await body.arrayBuffer()), parts=[];
  const revision=crypto.randomUUID(),changed=new Date().toISOString();
  for(let offset=0;offset<bytes.length;offset+=240000){
   let raw='';const end=Math.min(offset+240000,bytes.length);
   for(let i=offset;i<end;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,Math.min(end,i+8192)));
   parts.push(btoa(raw));
  }
  // One transaction: readers see either the previous snapshot or all parts of the new one.
  const old=active?.revision||'';
  const guard="COALESCE((SELECT revision FROM campo_cycle_snapshot WHERE name='active'),'')=?";
  const batch=parts.map((part,i)=>db.prepare('INSERT INTO campo_cycle_snapshot SELECT ?,?,?,?,? WHERE '+guard)
    .bind(revision+':'+String(i).padStart(3,'0'),revision,changed,0,part,old));
  batch.push(db.prepare("DELETE FROM campo_cycle_snapshot WHERE name<>'active' AND revision<>? AND "+guard).bind(revision,old));
  batch.push(db.prepare("INSERT OR REPLACE INTO campo_cycle_snapshot SELECT 'active',?,?,?,NULL WHERE "+guard).bind(revision,changed,parts.length,old));
  const results=await db.batch(batch);
  if(!results.at(-1).meta?.changes)throw sharedError('Outra publicação atualizou o ciclo. Atualize a página antes de enviar.',409);
  return json({revision,changed,postes:data.postes.linhas.length,arvores:data.arvores.linhas.length,execucoes:data.execucoes.length});
 }catch(error){return json({error:error.status?error.message:'Base de ciclo temporariamente indisponível.'},error.status||503);}
}

// D1 authorizes each password-authenticated data request and revokes devices.
const CAMPO_AUTH_APP_ORIGIN='https://mapeamento-arvores.pages.dev';
const CAMPO_SESSION_COOKIE='__Host-campo-session',CAMPO_SESSION_LIFE=400*86400000;
function fieldAuthenticationRequired(env){return env.FIELD_AUTH_REQUIRED!=='false';}
function authDB(env){if(!env.SHARED_DB)throw sharedError('Autenticação central indisponível.',503);return env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;}
function authCookie(request,name){const found=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));return found.length===1?found[0].slice(name.length+1):'';}
function sessionCookie(name,value,age=34560000){return name+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Lax';}
async function authHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function authRandom(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
function authUser(row){return row?{id:row.id,email:row.email,name:row.name,role:row.role,username:row.username||''}:null;}
async function authenticatedOperator(request,env){const token=authCookie(request,CAMPO_SESSION_COOKIE);if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const db=authDB(env),hash=await authHash(token),row=await db.prepare('SELECT u.*,c.username,s.token_hash,s.last_seen,s.expires_at FROM campo_user_sessions s JOIN campo_users u ON u.id=s.user_id LEFT JOIN campo_user_credentials c ON c.user_id=u.id WHERE s.token_hash=? AND u.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id)').bind(hash).first();return row?{user:authUser(row),session:row,token}:null;}
async function campoAuthStatus(request,env,identity,admin){if(request.method!=='GET')return json({error:'Use GET.'},405);const required=fieldAuthenticationRequired(env),out=json({required,authenticated:Boolean(identity),user:identity?.user||null,admin:Boolean(admin)});if(identity&&Date.now()-identity.session.last_seen>3600000){const now=Date.now();await authDB(env).prepare('UPDATE campo_user_sessions SET last_seen=?,expires_at=? WHERE token_hash=?').bind(now,now+CAMPO_SESSION_LIFE,identity.session.token_hash).run();out.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,identity.token));}return out;}
async function campoAuthLogout(request,env,identity){if(request.method!=='POST')return json({error:'Use POST.'},405);if(identity)await authDB(env).prepare('DELETE FROM campo_user_sessions WHERE token_hash=?').bind(identity.session.token_hash).run();const r=json({ok:true});r.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,'',0));r.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));return r;}
function normalizedPhone(value){const raw=String(value||'').trim();if(!raw)return null;let digits=raw.replace(/\D/g,'');if(!raw.startsWith('+')&&[10,11].includes(digits.length))digits='55'+digits;if(!/^[1-9]\d{9,14}$/.test(digits))throw sharedError('Celular inválido. Informe DDD e número.');return '+'+digits;}
async function campoManageUsers(request,env,identity,bootstrapAdmin){
 if(!bootstrapAdmin&&identity?.user.role!=='admin')return json({error:'Acesso restrito ao administrador.'},403);const db=authDB(env),actor=identity?.user.id||'admin-password';
 if(request.method==='GET'){const rows=await db.prepare('SELECT u.id,u.email,u.name,u.phone,u.role,u.blocked,u.revision,u.created_at,u.updated_at,l.deleted_at,c.username,(c.user_id IS NOT NULL) passwordConfigured,(SELECT MAX(s.last_seen) FROM campo_user_sessions s WHERE s.user_id=u.id) last_seen FROM campo_users u LEFT JOIN campo_user_credentials c ON c.user_id=u.id LEFT JOIN campo_user_lifecycle l ON l.user_id=u.id ORDER BY (l.deleted_at IS NOT NULL), u.blocked,u.name').all();return json({users:rows.results,loginMethod:'username_password',phoneAuthentication:false});}
 if(request.method!=='POST')return json({error:'Use GET ou POST.'},405);
 try{
 const b=await sharedBody(request,5000);
 if(b.action==='delete')return await campoDeleteUser(db,b,actor);
 if(b.action==='revoke'){if(typeof b.id!=='string')throw sharedError('Usuário inválido.');await db.batch([db.prepare('DELETE FROM campo_user_sessions WHERE user_id=?').bind(b.id),db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'revoke_sessions',?,'{}')").bind(b.id,actor,new Date().toISOString())]);return json({ok:true});}
 const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),role=b.role,blocked=b.blocked===true?1:0,phone=normalizedPhone(b.phone),username=normalizedUsername(b.username);
 if(!name||name.length>100||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!['inspector','admin'].includes(role))throw sharedError('Informe nome, e-mail de contato válido e perfil.');
 const stamp=new Date().toISOString(),id=b.id||crypto.randomUUID();if(!sharedId(id))throw sharedError('Usuário inválido.');const old=b.id?await db.prepare('SELECT * FROM campo_users WHERE id=?').bind(id).first():null;
 const deleted=old?await db.prepare('SELECT user_id FROM campo_user_lifecycle WHERE user_id=?').bind(id).first():null;if(deleted&&b.action!=='restore')throw sharedError('Usuário excluído. Use Restaurar e defina uma nova senha.',409);if(!deleted&&b.action==='restore')throw sharedError('A conta não está excluída. Atualize a lista.',409);
 if(b.id&&(!old||b.revision!==old.revision))throw sharedError('Usuário alterado. Atualize a lista.',409);
 if(old&&old.email!==email)throw sharedError('Para mudar o e-mail de contato, cadastre uma nova conta e bloqueie a anterior.');
 const credential=old?await db.prepare('SELECT * FROM campo_user_credentials WHERE user_id=?').bind(id).first():null;
 if(!credential&&!b.password)throw sharedError('Defina a senha inicial do usuário.');const nextPassword=b.password?await campoPasswordRecord(b.password,env):{hash:credential.password_hash,salt:credential.salt};
 if(old?.role==='admin'&&!old.blocked&&(blocked||role!=='admin')){const n=await db.prepare("SELECT COUNT(*) n FROM campo_users WHERE role='admin' AND blocked=0 AND id<>?").bind(id).first();if(!n.n)throw sharedError('Cadastre outro administrador ativo antes de bloquear ou alterar o último administrador.',409);}
 const edit=old?db.prepare("UPDATE campo_users SET name=?,phone=?,role=?,blocked=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (role<>'admin' OR blocked=1 OR (?=0 AND ?='admin') OR EXISTS(SELECT 1 FROM campo_users other WHERE other.role='admin' AND other.blocked=0 AND other.id<>campo_users.id)) AND COALESCE((SELECT revision FROM campo_user_credentials WHERE user_id=campo_users.id),0)=?").bind(name,phone,role,blocked,stamp,id,b.revision,blocked,role,credential?.revision||0):db.prepare('INSERT INTO campo_users(id,email,name,phone,role,blocked,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,email,name,phone,role,blocked,stamp,stamp);
 const credentialEdit=db.prepare('INSERT INTO campo_user_credentials(user_id,username,password_hash,salt,revision,updated_at) SELECT ?,?,?,?,1,? WHERE changes()=1 ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,salt=excluded.salt,revision=campo_user_credentials.revision+1,updated_at=excluded.updated_at WHERE campo_user_credentials.revision=?').bind(id,username,nextPassword.hash,nextPassword.salt,stamp,credential?.revision||0);
 const revoke=blocked||old?.role!==role||Boolean(b.password)||Boolean(credential&&credential.username!==username),result=await db.batch([edit,credentialEdit,db.prepare('DELETE FROM campo_user_sessions WHERE user_id=? AND ?=1 AND EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,revoke?1:0,id,(old?.revision||0)+1,stamp),db.prepare('INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,actor,old?'update_user':'create_user',stamp,JSON.stringify({email,username,role,blocked:Boolean(blocked),passwordChanged:Boolean(b.password)}),id,(old?.revision||0)+1,stamp)]);
 if(!result[0].meta.changes||!result[1].meta.changes)throw sharedError('Usuário alterado. Atualize a lista.',409);
 if(deleted){await db.prepare('DELETE FROM campo_user_lifecycle WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,id,(old?.revision||0)+1,stamp).run();await db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'restore_user',?,'{}')").bind(id,actor,stamp).run();}
 if(blocked)await db.prepare('UPDATE campo_presence SET active=0 WHERE session_id IN (SELECT session_id FROM campo_presence_identities WHERE user_id=?)').bind(id).run();return json({ok:true,id,passwordChanged:Boolean(b.password)});
 }catch(e){return json({error:e.status?e.message:/UNIQUE|constraint/i.test(e.message)?'Usuário, e-mail ou celular já cadastrado. Revise a conta existente.':'Não foi possível salvar o usuário.'},e.status||400);}
}

// Account removal preserves inspection authorship; credentials and sessions are revoked.
async function campoDeleteUser(db,body,actor){
 if(!sharedId(body.id)||!Number.isSafeInteger(body.revision)||body.confirmation!=='EXCLUIR')throw sharedError('Confirme a exclusão do usuário selecionado.');
 const stamp=new Date().toISOString(),operation=crypto.randomUUID();
 const result=await db.batch([
  db.prepare("INSERT OR IGNORE INTO campo_user_lifecycle(user_id,deleted_at,deleted_by,operation_id) SELECT u.id,?,?,? FROM campo_users u WHERE u.id=? AND u.revision=? AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id) AND (u.role<>'admin' OR u.blocked=1 OR EXISTS(SELECT 1 FROM campo_users other WHERE other.id<>u.id AND other.role='admin' AND other.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=other.id)))").bind(stamp,actor,operation,body.id,body.revision),
  db.prepare('UPDATE campo_users SET blocked=1,revision=revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(stamp,body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_credentials WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0 WHERE session_id IN (SELECT session_id FROM campo_presence_identities WHERE user_id=?) AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT user_id,?,'delete_user',?,'{}' FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?").bind(actor,stamp,body.id,operation)
 ]);
 if(!result[0].meta.changes)throw sharedError('Não foi possível excluir: conta alterada, já excluída ou último administrador ativo. Atualize a lista.',409);
 return json({ok:true,deleted:true,id:body.id});
}

// Worker-native password hashing: per-user salt, PBKDF2 platform cap and secret HMAC pepper.
const CAMPO_PASSWORD_ITERATIONS=100000;
function normalizedUsername(value){const username=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username))throw sharedError('Usuário: use de 3 a 50 letras sem acento, números, ponto, hífen ou sublinhado.');return username;}
function validateCampoPassword(value){if(typeof value!=='string'||value.length<12||value.length>128||!value.trim())throw sharedError('Use uma senha de 12 a 128 caracteres. Uma frase com várias palavras facilita lembrar.');return value;}
async function campoPasswordHash(password,salt,env){
 const pepper=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const prepared=await crypto.subtle.sign('HMAC',pepper,new TextEncoder().encode('campo-password-v1\0'+password));
 const key=await crypto.subtle.importKey('raw',prepared,'PBKDF2',false,['deriveBits']);
 return b64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:CAMPO_PASSWORD_ITERATIONS},key,256)));
}
async function campoPasswordRecord(password,env){validateCampoPassword(password);const salt=b64(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await campoPasswordHash(password,salt,env)};}
async function checkCampoPassword(password,credential,env){const candidate=await campoPasswordHash(String(password||''),credential?.salt||'AAAAAAAAAAAAAAAAAAAAAA',env);return Boolean(credential)&&await equalSecret(candidate,credential.password_hash);}
async function campoPasswordRateLimit(request,env,login){
 const db=authDB(env),now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown',keys=[['password-ip:'+await authHash(ip),60000,10],['password-user:'+await authHash(login),900000,10]];
 for(const [key,life,limit]of keys){const row=await db.prepare('INSERT INTO campo_password_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count').bind(key,now+life,now,now).first();if(row.count>limit)throw sharedError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',429);}
 await db.prepare('DELETE FROM campo_password_limits WHERE key IN (SELECT key FROM campo_password_limits WHERE reset_at<? LIMIT 100)').bind(now).run();
}
async function campoCreateUserSession(db,row,env,expectedCredentialRevision,oldSession){
 const token=authRandom(),hash=await authHash(token),now=Date.now(),queries=[];
 if(oldSession)queries.push(db.prepare('DELETE FROM campo_user_sessions WHERE token_hash=?').bind(oldSession));
 const index=queries.length;
 queries.push(db.prepare('INSERT INTO campo_user_sessions(token_hash,user_id,created_at,last_seen,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.revision=? AND u.blocked=0 AND c.revision=? AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id))').bind(hash,row.id,now,now,now+CAMPO_SESSION_LIFE,row.id,row.revision,expectedCredentialRevision));
 queries.push(db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT ?,?,'login',?,'{\"method\":\"password\"}' WHERE EXISTS(SELECT 1 FROM campo_user_sessions WHERE token_hash=?)").bind(row.id,row.id,new Date(now).toISOString(),hash));
 const result=await db.batch(queries);if(!result[index].meta.changes)throw sharedError('Conta alterada ou bloqueada. Entre novamente.',401);
 const out=json({ok:true,user:authUser(row),admin:row.role==='admin'});out.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,token));return out;
}
async function campoPasswordLogin(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const b=await sharedBody(request,3000),login=String(b.username||'').trim().toLowerCase(),password=b.password;
 if(!login||login.length>254||typeof password!=='string'||password.length>128)return json({error:'Usuário ou senha incorretos.'},401);
 await campoPasswordRateLimit(request,env,login);const db=authDB(env),row=await db.prepare('SELECT u.*,c.username,c.password_hash,c.salt,c.revision credential_revision FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE (c.username=? COLLATE NOCASE OR u.email=? COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id)').bind(login,login).first();
 if(!await checkCampoPassword(password,row,env)||row.blocked)return json({error:'Usuário ou senha incorretos.'},401);
 return campoCreateUserSession(db,row,env,row.credential_revision,authCookie(request,CAMPO_SESSION_COOKIE)?await authHash(authCookie(request,CAMPO_SESSION_COOKIE)):null);
}
async function campoChangePassword(request,env,identity){
 if(request.method!=='POST')return json({error:'Use POST.'},405);if(!identity)return json({error:'Entre para alterar sua senha.'},401);
 const b=await sharedBody(request,3000),db=authDB(env);validateCampoPassword(b.newPassword);await campoPasswordRateLimit(request,env,identity.user.email);
 const old=await db.prepare('SELECT * FROM campo_user_credentials WHERE user_id=?').bind(identity.user.id).first();if(!await checkCampoPassword(b.currentPassword,old,env))return json({error:'Senha atual incorreta.'},400);
 const updated=await campoPasswordRecord(b.newPassword,env),stamp=new Date().toISOString();
 const result=await db.batch([db.prepare('UPDATE campo_user_credentials SET password_hash=?,salt=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(updated.hash,updated.salt,stamp,identity.user.id,old.revision),db.prepare('DELETE FROM campo_user_sessions WHERE user_id=?').bind(identity.user.id),db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'change_password',?,'{}')").bind(identity.user.id,identity.user.id,stamp)]);
 if(!result[0].meta.changes)throw sharedError('Senha alterada em outra sessão. Entre novamente.',409);
 const row=await db.prepare('SELECT u.*,c.username FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.blocked=0').bind(identity.user.id).first();if(!row)throw sharedError('Conta indisponível.',401);return campoCreateUserSession(db,row,env,old.revision+1,null);
}

// Public requests never authorize an account. Only an administrator can approve.
const CAMPO_REQUEST_RECEIVED='Solicitação recebida. Aguarde a liberação do administrador e o administrador definirá seu usuário e senha.';
async function campoRequestAccess(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const b=await sharedBody(request,3000),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),phone=normalizedPhone(b.phone);
 if(!name||name.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw sharedError('Informe seu nome e um e-mail válido.');
 const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown',guard='access-request:'+await authHash(ip)+':'+Math.floor(now/3600000),tries=Number(await env.LOGIN_GUARD.get(guard)||0);
 if(tries>=10)throw sharedError('Muitas solicitações. Aguarde antes de tentar novamente.',429);
 await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:7200});
 const db=authDB(env),stamp=new Date(now).toISOString();
 // Unique email + OR IGNORE: retries do not flood the inbox or revive rejected/blocked accounts.
 await db.prepare("INSERT OR IGNORE INTO campo_access_requests(id,email,name,phone,status,revision,created_at,updated_at) SELECT ?,?,?,?,'pending',1,?,? WHERE NOT EXISTS(SELECT 1 FROM campo_users WHERE email=? COLLATE NOCASE) AND (SELECT COUNT(*) FROM campo_access_requests)<5000").bind(crypto.randomUUID(),email,name,phone,stamp,stamp,email).run();
 // Same response for existing, blocked and unknown accounts; no account enumeration.
 return json({ok:true,message:CAMPO_REQUEST_RECEIVED},202);
}
async function campoManageAccessRequests(request,env,identity,bootstrapAdmin){
 if(!bootstrapAdmin&&identity?.user.role!=='admin')return json({error:'Acesso restrito ao administrador.'},403);
 const db=authDB(env),actor=identity?.user.id||'admin-password';
 if(request.method==='GET'){
  const u=new URL(request.url),offset=Number(u.searchParams.get('offset')||0),reviewed=u.searchParams.get('status')==='reviewed';
  if(!Number.isSafeInteger(offset)||offset<0||offset>5000)throw sharedError('Página inválida.');
  if(u.searchParams.get('summary')==='1'){const row=await db.prepare("SELECT COUNT(*) pending,(SELECT id FROM campo_access_requests WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 1) latestId FROM campo_access_requests WHERE status='pending'").first();return json({pending:row.pending||0,latestId:row.latestId||null});}
  const where=reviewed?"status<>'pending'":"status='pending'",rows=await db.prepare('SELECT id,email,name,phone,status,revision,created_at,updated_at,reviewed_at FROM campo_access_requests WHERE '+where+' ORDER BY created_at DESC,id LIMIT 50 OFFSET ?').bind(offset).all(),counts=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,(SELECT id FROM campo_access_requests WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 1) latestId FROM campo_access_requests").first();
  const pending=counts.pending||0,total=reviewed?counts.total-pending:pending;return json({requests:rows.results,pending,latestId:counts.latestId||null,total,offset,nextOffset:offset+50<total?offset+50:null});
 }
 if(request.method!=='POST')return json({error:'Use GET ou POST.'},405);
 const b=await sharedBody(request,2000);if(!sharedId(b.id)||!Number.isSafeInteger(b.revision)||!['approve','reject'].includes(b.action))throw sharedError('Solicitação inválida.');
 const current=await db.prepare('SELECT * FROM campo_access_requests WHERE id=?').bind(b.id).first();
 if(!current||current.status!=='pending'||current.revision!==b.revision)throw sharedError('Solicitação já analisada. Atualize a lista.',409);
 const stamp=new Date().toISOString(),decision=b.action==='approve'?'approved':'rejected',queries=[];
 if(decision==='approved'){
  const existing=await db.prepare('SELECT u.id,u.blocked,c.username FROM campo_users u LEFT JOIN campo_user_credentials c ON c.user_id=u.id WHERE email=? COLLATE NOCASE').bind(current.email).first();
  if(existing?.blocked)throw sharedError('Esta conta está bloqueada. Revise o cadastro de usuários antes de liberar.',409);
  // Existing active credentials are not changed by approving a request.
  if(existing&&!existing.username)throw sharedError('Defina o usuário e a senha desta conta no cadastro de usuários antes de aprovar.',409);
  if(!existing){
   const username=normalizedUsername(b.username),password=await campoPasswordRecord(b.password,env),id=crypto.randomUUID();
   if(current.phone&&await db.prepare('SELECT id FROM campo_users WHERE phone=?').bind(current.phone).first())throw sharedError('Celular já associado a outra conta. Revise o contato.',409);
   queries.push(db.prepare("INSERT INTO campo_users(id,email,name,phone,role,blocked,created_at,updated_at) SELECT ?,email,name,phone,'inspector',0,?,? FROM campo_access_requests WHERE id=? AND status='pending' AND revision=?").bind(id,stamp,stamp,b.id,b.revision));
   queries.push(db.prepare('INSERT INTO campo_user_credentials(user_id,username,password_hash,salt,revision,updated_at) SELECT ?,?,?,?,1,? WHERE changes()=1').bind(id,username,password.hash,password.salt,stamp));
  }
 }

 const index=queries.length;
 queries.push(db.prepare("UPDATE campo_access_requests SET status=?,revision=revision+1,updated_at=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='pending' AND revision=? AND (?='rejected' OR EXISTS(SELECT 1 FROM campo_users WHERE email=campo_access_requests.email COLLATE NOCASE AND blocked=0))").bind(decision,stamp,stamp,actor,b.id,b.revision,decision));
 queries.push(db.prepare('INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT (SELECT id FROM campo_users WHERE email=r.email COLLATE NOCASE),?,?,?,? FROM campo_access_requests r WHERE id=? AND revision=? AND status=? AND reviewed_by=? AND reviewed_at=?').bind(actor,'access_request_'+decision,stamp,JSON.stringify({requestId:b.id,email:current.email}),b.id,b.revision+1,decision,actor,stamp));
 let results;try{results=await db.batch(queries);}catch(e){if(/UNIQUE|constraint/i.test(e.message))throw sharedError('Usuário, e-mail ou celular já cadastrado. Atualize a lista e revise.',409);throw e;}if(!results[index].meta.changes)throw sharedError('A solicitação mudou. Atualize a lista antes de continuar.',409);
 return json({ok:true,status:decision});
}

// Published route geometry and the private MT package allow checking older records.
function spanRouteIndex(routes,wanted){
 const result=new Map();
 for(const route of routes){
  if(routeIsTest(route))continue;
  for(const span of route.spans||[]){
   const id=CampoSpanQuality.key(span.id);
   if(!wanted.has(id))continue;
   if(!result.has(id))result.set(id,new Map());
   const byFeeder=result.get(id),feeder=CampoSpanQuality.key(span.feeder||route.feeder);
   if(!byFeeder.has(feeder))byFeeder.set(feeder,{feeder,geometry:{type:'LineString',coordinates:span.line}});
  }
 }
 return new Map([...result].map(([id,byFeeder])=>[id,[...byFeeder.values()]]));
}
async function spanPrivateIndex(env,wanted){
 const index=new Map();
 if(!wanted.size||!env.LOGIN_GUARD)return index;
 try{
  const response=await routeGeometry(new Request('https://campo-internal/api/routes/geometry'),env,true);
  const reader=response.body.pipeThrough(new DecompressionStream('gzip')).pipeThrough(new TextDecoderStream()).getReader();
  let buffer='',feeders=null;
  function add(row){
   // The compact route package starts each row with a numeric or quoted span ID.
   const raw=row.slice(1,row.indexOf(','));
   const id=CampoSpanQuality.key(raw.startsWith('"')?raw.slice(1,-1):raw);
   if(!wanted.has(id))return;
   const fields=JSON.parse(row),xy=fields[10],line=[];
   for(let i=0;i<xy.length;i+=2)line.push([xy[i]/1e6,xy[i+1]/1e6]);
   if(!index.has(id))index.set(id,[]);
   index.get(id).push({feeder:feeders[fields[1]],geometry:{type:'LineString',coordinates:line}});
  }
  try{
   for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    buffer+=value;
    if(!feeders){
     const rows=buffer.indexOf('"rows":[');
     if(rows<0){if(buffer.length>500000)throw Error('Cabeçalho do pacote MT inválido.');continue;}
     feeders=JSON.parse(buffer.slice(0,rows)+'"rows":[]}').feeders;
     buffer=buffer.slice(rows+8);
    }
    // Each row ends with its flat coordinate array and the enclosing row bracket.
    let from=0,to;
    while((to=buffer.indexOf(']],',from))!==-1){add(buffer.slice(from,to+2));from=to+3;}
    buffer=buffer.slice(from);
    if(buffer.length>500000)throw Error('Linha do pacote MT inválida.');
   }
   if(feeders&&buffer.startsWith('[')&&buffer.endsWith(']]]}'))add(buffer.slice(0,-2));
  }finally{await reader.cancel();}
  return index;
 }catch{return new Map();}
}
async function spanCheckRecords(env,records,routes){
 const Q=CampoSpanQuality;
 const eligible=records.filter(record=>Q.key(record.span)&&sharedCoordinate(record.lat,90)&&sharedCoordinate(record.lon,180));
 const wanted=new Set(eligible.map(record=>Q.key(record.span)));
 const byRoute=spanRouteIndex(routes,wanted),checked=new Map(),pending=[];
 function add(record,candidates){
  const selected=Q.select(candidates||[],record.feeder);
  const found=Q.measure(record.lat,record.lon,selected?.geometry);
  if(!found)return false;
  checked.set(record.id,{...Q.reference(record,found.nearest),metres:found.metres});
  return true;
 }
 for(const record of eligible){
  const captured=Q.read(record);
  if(captured)checked.set(record.id,captured);
  else if(!(record.bt&&!record.mt||record.at&&!record.mt)&&!add(record,byRoute.get(Q.key(record.span))))pending.push(record);
 }
 const privateIndex=await spanPrivateIndex(env,new Set(pending.map(record=>Q.key(record.span))));
 for(const record of pending)add(record,privateIndex.get(Q.key(record.span)));
 return checked;
}
async function adminSpanChecks(env,db,data,params){
 const filters=controlFilters(params),rows=data.records.filter(record=>controlMatches(record,filters));
 const page=Number(params.get('page')||0);
 if(!Number.isSafeInteger(page)||page<0)throw sharedError('Página inválida.');
 let routes=[];
 try{
  const plans=await db.prepare("SELECT data FROM campo_routes WHERE COALESCE(json_extract(data,'$.deletedAt'),'')='' ORDER BY created_at DESC").all();
  routes=plans.results.map(row=>JSON.parse(row.data));
 }catch(error){if(!centralMissingTable(error))throw error;}
 const checked=await spanCheckRecords(env,rows,routes),alerts=rows.flatMap(record=>{
  const check=checked.get(record.id);
  return check?.metres>CampoSpanQuality.threshold?[{...check,id:record.id,feeder:record.feeder,species:record.species}]:[];
 }).sort((a,b)=>b.metres-a.metres);
 const last=Math.max(0,Math.ceil(alerts.length/50)-1),current=Math.min(page,last);
 return json({checked:checked.size,total:rows.length,count:alerts.length,items:alerts.slice(current*50,(current+1)*50),page:current,last});
}

// A viewer link grants read-only access and is independent of field and admin sessions.
const GERENCIAL_COOKIE='__Host-arbora-gerencial';
const GERENCIAL_TTL=8*3600;
const GERENCIAL_LINK_ID='gerencial_viewer_link_hash';
const gerencialToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);

async function gerencialLinkHash(db){
 const setting=await db.prepare('SELECT value FROM campo_admin_settings WHERE id=?').bind(GERENCIAL_LINK_ID).first();
 return setting?.value||null;
}
async function gerencialManageLink(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=authDB(env);
 if(request.method==='GET')return json({enabled:Boolean(await gerencialLinkHash(db))});
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const {action}=await sharedBody(request,256);
 if(action==='revoke'){
  await db.prepare('DELETE FROM campo_admin_settings WHERE id=?').bind(GERENCIAL_LINK_ID).run();
  return json({enabled:false});
 }
 if(action!=='rotate')throw sharedError('Ação de link inválida.');
 const token=authRandom(),hash=await authHash(token);
 await db.prepare('INSERT INTO campo_admin_settings(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(GERENCIAL_LINK_ID,hash,new Date().toISOString()).run();
 return json({enabled:true,fragment:'acesso='+token});
}
async function gerencialSession(request,db){
 const token=authCookie(request,GERENCIAL_COOKIE);
 if(!gerencialToken(token))return null;
 const linkHash=await gerencialLinkHash(db);
 if(!linkHash)return null;
 const hash=await authHash(linkHash+':'+token);
 const row=await db.prepare('SELECT id FROM campo_gerencial_acessos WHERE token_hash=? AND expira_em>?').bind(hash,Date.now()).first();
 return row?{hash}:null;
}
async function gerencialLogin(request,env,db){
 const {token:link}=await sharedBody(request,256);
 if(!gerencialToken(link))throw sharedError('Link gerencial inválido ou revogado.',401);
 const linkHash=await gerencialLinkHash(db);
 if(!linkHash||!await equalSecret(await authHash(link),linkHash))throw sharedError('Link gerencial inválido ou revogado.',401);
 if(await gerencialSession(request,db))return json({ok:true});
 const token=authRandom(),hash=await authHash(linkHash+':'+token);
 const ip=request.headers.get('CF-Connecting-IP');
 const network=ip&&env.ADMIN_SESSION_SECRET?b64(new Uint8Array(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode('arbora-gerencial:'+linkHash+':'+ip)))).slice(0,12):null;
 const label=network?'Link · rede '+network:'Link · rede indisponível';
 const now=Date.now(),stamp=new Date(now).toISOString();
 const inserted=await db.prepare('INSERT INTO campo_gerencial_acessos(email,entrou_em,expira_em,token_hash) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_admin_settings WHERE id=? AND value=?)')
  .bind(label,stamp,now+GERENCIAL_TTL*1000,hash,GERENCIAL_LINK_ID,linkHash).run();
 if(!inserted.meta?.changes)throw sharedError('Link gerencial inválido ou revogado.',401);
 const response=json({ok:true});
 response.headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,token,GERENCIAL_TTL));
 return response;
}
async function gerencialAudit(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const raw=new URL(request.url).searchParams.get('before');
 const before=raw===null?Number.MAX_SAFE_INTEGER:Number(raw);
 if(!Number.isSafeInteger(before)||before<=0)throw sharedError('Página inválida.');
 const {results}=await authDB(env).prepare('SELECT id,email,entrou_em,saiu_em FROM campo_gerencial_acessos WHERE id<? ORDER BY id DESC LIMIT 51').bind(before).all();
 const items=results.slice(0,50);
 return json({items,next:results.length>50?items.at(-1).id:null});
}
function gerencialActiveField(record){
 return !record.archiveCleanupPending&&record.adminClassification!=='homologacao';
}
function gerencialName(value){
 return String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
}
async function gerencialInspectors(db){
 const [setting,users]=await Promise.all([
  db.prepare('SELECT inspector_ids FROM campo_gerencial_vitrine WHERE id=1').first(),
  db.prepare("SELECT id,name FROM campo_users u WHERE role='inspector' AND blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle l WHERE l.user_id=u.id)").all()
 ]);
 const accounts=users.results;
 const defaults=['herlen','lucivaldo'].flatMap(name=>{
  const matches=accounts.filter(account=>gerencialName(account.name).split(/\s+/)[0]===name);
  return matches.length===1?[matches[0].id]:[];
 });
 const ids=new Set(setting?JSON.parse(setting.inspector_ids):defaults);
 return {accounts,enabled:accounts.filter(account=>ids.has(account.id))};
}
async function gerencialSelection(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=await adminDb(env),scope=await gerencialInspectors(db);
 if(request.method==='GET')return json(scope);
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const {ids}=await sharedBody(request,12000);
 if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!scope.accounts.some(account=>account.id===id)))throw sharedError('Selecione contas ativas de inspetores.');
 await db.prepare('INSERT INTO campo_gerencial_vitrine(id,inspector_ids) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET inspector_ids=excluded.inspector_ids').bind(JSON.stringify(ids)).run();
 return json({enabled:scope.accounts.filter(account=>ids.includes(account.id))});
}
async function gerencialTeams(db){
 const [teams,members,preference]=await Promise.all([
  db.prepare('SELECT id,nome AS name FROM campo_gerencial_equipes ORDER BY nome').all(),
  db.prepare('SELECT user_id AS userId,equipe_id AS teamId FROM campo_gerencial_equipe_membros').all(),
  db.prepare("SELECT value FROM campo_admin_settings WHERE id='gerencial_show_inspectors'").first()
 ]);
 return {teams:teams.results,members:members.results,showInspectorNames:preference?.value==='true'};
}
async function gerencialManageTeams(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=await adminDb(env);
 if(request.method==='GET')return json(await gerencialTeams(db));
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const input=await sharedBody(request,12000);
 if(input.action==='create'){
  const name=typeof input.name==='string'?input.name.trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR'):'';
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ./_-]{0,39}$/u.test(name))throw sharedError('Informe um código ou nome de equipe de até 40 caracteres.');
  const id=crypto.randomUUID();
  const result=await db.prepare('INSERT OR IGNORE INTO campo_gerencial_equipes(id,nome) VALUES(?,?)').bind(id,name).run();
  if(!result.meta?.changes)throw sharedError('Já existe uma equipe com esse nome.',409);
  return json({team:{id,name}},201);
 }
 if(input.action==='assign'){
  const {userId,teamId}=input;
  if(!CampoRoutes.identifier(userId)||(teamId!==null&&!CampoRoutes.identifier(teamId)))throw sharedError('Vínculo de equipe inválido.');
  const account=await db.prepare("SELECT id FROM campo_users u WHERE id=? AND role='inspector' AND blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle l WHERE l.user_id=u.id)").bind(userId).first();
  if(!account)throw sharedError('Selecione um inspetor ativo.',404);
  if(teamId===null)await db.prepare('DELETE FROM campo_gerencial_equipe_membros WHERE user_id=?').bind(userId).run();
  else{
   const found=await db.prepare('SELECT id FROM campo_gerencial_equipes WHERE id=?').bind(teamId).first();
   if(!found)throw sharedError('Equipe não encontrada.',404);
   await db.prepare('INSERT INTO campo_gerencial_equipe_membros(user_id,equipe_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET equipe_id=excluded.equipe_id').bind(userId,teamId).run();
  }
  return json({userId,teamId});
 }
 if(input.action==='visibility'&&typeof input.showInspectorNames==='boolean'){
  await db.prepare("INSERT INTO campo_admin_settings(id,value,updated_at) VALUES('gerencial_show_inspectors',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
   .bind(String(input.showInspectorNames),new Date().toISOString()).run();
  return json({showInspectorNames:input.showInspectorNames});
 }
 throw sharedError('Ação de equipe inválida.');
}
function gerencialTeamGroups(enabled,{teams,members,showInspectorNames}){
 const byTeam=new Map(teams.map(team=>[team.id,team])),assignments=new Map(members.map(member=>[member.userId,member.teamId]));
 const groups=new Map(),operators=new Map();
 let unassigned=0;
 for(const account of [...enabled].sort((a,b)=>a.id.localeCompare(b.id))){
  const team=byTeam.get(assignments.get(account.id));
  const id=team?.id||'unlinked-'+(++unassigned);
  if(!groups.has(id))groups.set(id,{id,label:team?.name||'Sem equipe '+unassigned,operatorCount:0});
  const group=groups.get(id);
  group.operatorCount++;
  if(showInspectorNames)(group.inspectors??=[]).push(account.name);
  operators.set(account.id,group);
 }
 for(const group of groups.values()){
  group.inspectors?.sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(showInspectorNames)group.label+=' · '+group.inspectors.join(', ');
  delete group.inspectors;
 }
 return {groups:[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true})),operators};
}
async function gerencialRouteSource(db,enabled){
 if(!enabled.length)return {routes:[],visits:[]};
 const scope=JSON.stringify(enabled.map(account=>account.id));
 try{
  const [plans,visits,returns]=await Promise.all([
   db.prepare('SELECT data FROM campo_routes WHERE assignee IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC').bind(scope).all(),
   db.prepare('SELECT v.data,v.received_at FROM campo_routes r JOIN campo_route_visits v ON v.route_id=r.id WHERE r.assignee IN (SELECT value FROM json_each(?)) ORDER BY v.received_at').bind(scope).all(),
   db.prepare('SELECT scope_id,data FROM campo_route_returns WHERE assignee IN (SELECT value FROM json_each(?))').bind(scope).all()
  ]);
  const returned=new Map(returns.results.map(row=>[row.scope_id,JSON.parse(row.data)]));
  return {
   routes:visibleRoutes(plans.results.map(row=>JSON.parse(row.data)).filter(route=>!route.deletedAt)).filter(route=>!routeIsTest({...route,returned:returned.get(route.campaign?.id||route.id)})),
   visits:visits.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at}))
  };
 }catch(error){
  if(centralMissingTable(error))return {routes:[],visits:[]};
  throw error;
 }
}
async function gerencialData(env){
 const db=await adminDb(env);
 const [{enabled,accounts},data,settings]=await Promise.all([gerencialInspectors(db),controlUniverse(env),gerencialTeams(db)]);
 const {groups,operators}=gerencialTeamGroups(enabled,settings);
 const source=await gerencialRouteSource(db,enabled);
 const byId=new Map(enabled.map(account=>[account.id,account]));
 const byName=new Map();
 for(const account of accounts){
  const name=gerencialName(account.name);
  byName.set(name,byName.has(name)?null:byId.get(account.id));
 }
 const scoped=data.records.filter(gerencialActiveField).flatMap(r=>{
  const name=gerencialName(r.collectionInspector||r.inspector);
  const operator=r.createdByUserId?byId.get(r.createdByUserId):byName.get(name);
  if(!operator)return [];
  return [{r,operator}];
 });
 const checked=await spanCheckRecords(env,scoped.map(row=>row.r),source.routes);
 const field=scoped.map(({r,operator})=>{
  const check=checked.get(r.id);
  return {
   inspector:operators.get(operator.id).id,day:controlDay(r.createdAt),seconds:r.inspectionTiming?.collectionSeconds,
   poda:r.poda,grouped:r.grouped,position:r.position,feeder:r.feeder,
   identification:CampoInspectionRules.identificationPending(r),missing:controlProblems(r).length>0,
   spanChecked:Boolean(check),...(check?.metres>CampoSpanQuality.threshold?{spanAlert:check}:{})
  };
 });
 const routes=gerencialCampaigns(source,byId).map(parts=>{
  const route=parts[0],id=route.campaign?.id||route.id,spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
  const visits=source.visits.filter(visit=>ids.has(visit.routeId)),planned=CampoRoutes.metres(spans),cover=CampoRoutes.coverage(spans,visits);
  const keys=CampoRoutes.keySections(spans,route.outlet),closed=keys.filter(section=>CampoRoutes.keyProgress(section,cover.bySpan).every(segment=>segment.closed));
  return {
   id,name:settings.showInspectorNames?(route.campaign?.name||route.name):[route.feeder,CampoRoutes.sectionLabel(route),controlDay(route.createdAt).split('-').reverse().join('/')].filter(Boolean).join(' · '),
   inspector:operators.get(route.assignee).id,feeder:route.feeder,revision:visits.at(-1)?.receivedAt||null,
   planned,confirmed:cover.metres,pending:Math.max(0,planned-cover.metres),keys:keys.length,closed:closed.length,
   daily:CampoRoutes.dailyCoverage(spans,visits),targets:CampoRoutes.schedule(route.plan,planned)
  };
 });
 return json({field,routes,groups,archiveAvailable:data.archive.available,updatedAt:data.generatedAt});
}
function gerencialCampaigns(source,byId){
 return CampoRoutes.campaignParts(source.routes.filter(route=>byId.has(route.assignee)));
}
async function gerencialVeraPositions(db){
 try{
  return (await db.prepare(`SELECT id,json_extract(data,'$.lat') AS lat,json_extract(data,'$.lon') AS lon
   FROM vera_trees WHERE generation=(SELECT value FROM vera_meta WHERE key='generation')`).all()).results;
 }catch(error){
  if(veraMissingTable(error))return null;
  throw error;
 }
}
async function gerencialTreePositions(env){
 const db=await adminDb(env);
 const [data,vera,merges]=await Promise.all([
  controlUniverse(env),gerencialVeraPositions(db),db.prepare('SELECT source_id FROM shared_merges').all()
 ]);
 const inactive=new Set([...data.deletedIds,...merges.results.map(row=>row.source_id)]);
 const field=new Map(data.records.filter(row=>gerencialActiveField(row)&&!inactive.has(row.id)).map(row=>[row.id,row]));
 const coordinates=row=>sharedCoordinate(row.lat,90)&&sharedCoordinate(row.lon,180)?[Number(row.lat),Number(row.lon)]:null;
 const baseline=(vera||[]).flatMap(row=>{
  const id='vera-'+row.id;
  if(inactive.has(id))return [];
  const updated=field.get(id);
  field.delete(id);
  const point=(updated&&coordinates(updated))||coordinates(row);
  return point?[point]:[];
 });
 return json({
  vera:baseline,field:[...field.values()].map(coordinates).filter(Boolean),
  veraAvailable:vera!==null,archiveAvailable:data.archive.available
 });
}
async function gerencialRouteMap(request,env){
 const params=new URL(request.url).searchParams,requested=[...new Set(params.getAll('id'))];
 if(!requested.length||requested.length>12||requested.some(id=>!CampoRoutes.identifier(id)))throw sharedError('Seleção de rotas inválida.');
 const db=await adminDb(env),{enabled}=await gerencialInspectors(db);
 const source=await gerencialRouteSource(db,enabled),byId=new Map(enabled.map(account=>[account.id,account]));
 const routes=new Map(gerencialCampaigns(source,byId).map(parts=>[parts[0].campaign?.id||parts[0].id,parts]));
 const views=requested.flatMap(id=>{
  const parts=routes.get(id);
  if(!parts)return [];
  const route=parts[0],spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
  const cover=CampoRoutes.coverage(spans,source.visits.filter(visit=>ids.has(visit.routeId)));
  const lines=CampoRoutes.mapLines(spans,cover.bySpan);
  const keys=CampoRoutes.keySections(spans,route.outlet).map(section=>({
   code:section.code,point:section.segments[0].start,
   pending:CampoRoutes.keyProgress(section,cover.bySpan).filter(segment=>!segment.closed).length
  }));
  return [{id,lines,keys,outlet:route.outlet}];
 });
 if(!views.length)throw sharedError('Rotas indisponíveis.',404);
 return json(params.has('batch')||requested.length>1?{routes:views}:views[0]);
}
async function gerencialAPI(request,env,path,admin){
 try{
  if(path==='/api/admin/gerencial/acessos'&&request.method==='GET')return await gerencialAudit(request,env,admin);
  if(path==='/api/admin/gerencial/equipes')return await gerencialManageTeams(request,env,admin);
  if(path==='/api/admin/gerencial/inspetores')return await gerencialSelection(request,env,admin);
  if(path==='/api/admin/gerencial/link')return await gerencialManageLink(request,env,admin);
  const db=authDB(env);
  if(path==='/api/gerencial/link-session'&&request.method==='POST')return await gerencialLogin(request,env,db);
  const viewer=await gerencialSession(request,db);
  if(path==='/api/gerencial/sair'&&request.method==='POST'){
   if(viewer)await db.prepare('UPDATE campo_gerencial_acessos SET token_hash=NULL,saiu_em=? WHERE token_hash=?').bind(new Date().toISOString(),viewer.hash).run();
   const response=json({ok:true});
   response.headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,'',0));
   return response;
  }
  if(request.method!=='GET')throw sharedError('Método não permitido.',405);
  if(path==='/api/gerencial/sessao')return json({authenticated:Boolean(viewer||admin),admin:Boolean(admin),viewer:Boolean(viewer)});
  if(!viewer&&!admin)throw sharedError('Abra o link compartilhado pela administração.',401);
  if(path==='/api/gerencial/dados')return await gerencialData(env);
  if(path==='/api/gerencial/arvores')return await gerencialTreePositions(env);
  if(path==='/api/gerencial/rota')return await gerencialRouteMap(request,env);
  return json({error:'Consulta não encontrada.'},404);
 }catch(error){
  return json({error:error.status?error.message:'Consulta gerencial temporariamente indisponível.'},error.status||503);
 }
}

const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);let diff=0;const xx=new Uint8Array(x),yy=new Uint8Array(y);for(let i=0;i<xx.length;i++)diff|=xx[i]^yy[i];return diff===0;}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issueSession(env){const payload=b64(encoder.encode(JSON.stringify({role:'admin',exp:Math.floor(Date.now()/1000)+28800,aud:env.APP_ORIGIN}))),sig=await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(sig));}
async function validSession(token,env){try{if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return false;const [payload,sig,extra]=token.split('.');if(extra||!payload||!sig)return false;const okay=await crypto.subtle.verify('HMAC',await sessionKey(env),unb64(sig),encoder.encode(payload));if(!okay)return false;const data=JSON.parse(new TextDecoder().decode(unb64(payload)));return data.role==='admin'&&data.aud===env.APP_ORIGIN&&data.exp>Math.floor(Date.now()/1000);}catch{return false;}}
export default {async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await runRepositoryInventory(env);await runAuthorizedRepositoryCleanup(env);})());},async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(['/api/auth/keys','/api/auth/evaluate','/api/auth/complete'].includes(path))return json({error:'O login por e-mail foi substituído por usuário e senha.'},410);
 const origin=request.headers.get('Origin'),url=new URL(request.url);const allowed=[env.APP_ORIGIN,...String(env.APP_ADDITIONAL_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)];const cors=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campo-Access','Vary':'Origin'}:{};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!allowed.includes(origin))return response({error:'Origem não autorizada.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<14||!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32||!env.LOGIN_GUARD)return response({error:'Configure administrador e LOGIN_GUARD no Worker.'},503);
 if(path==='/api/vera/progress/sync'){const out=await veraProgressSync(request,env);for(const [k,v]of Object.entries(cors))out.headers.set(k,v);return out;}
 if(path==='/api/vera/sync'){const out=await veraSync(request,env);for(const [k,v]of Object.entries(cors))out.headers.set(k,v);return out;}
 if(path==='/api/central/sync'){const out=await centralSync(request,env);for(const [k,v]of Object.entries(cors))out.headers.set(k,v);return out;}
 // The password is retained for initial administrator provisioning and recovery.
 if(url.pathname==='/api/admin/login'){
  if(request.method!=='POST')return response({error:'Use POST.'},405);if(Number(request.headers.get('content-length')||0)>2048)return response({error:'Solicitação grande demais.'},413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',hash=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(ip)))),bucket=Math.floor(Date.now()/60000),guard='login:'+hash+':'+bucket;const tries=Number(await env.LOGIN_GUARD.get(guard)||0);if(tries>=5)return response({error:'Muitas tentativas. Aguarde um minuto.'},429);try{await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:120});}catch{return response({error:'Aguarde alguns segundos antes de tentar entrar novamente.'},429);}
  let data;try{const raw=await request.text();if(raw.length>2048)return response({error:'Solicitação inválida.'},413);data=JSON.parse(raw);}catch{return response({error:'Solicitação inválida.'},400);}
  if(!await equalSecret(String(data.password||''),env.ADMIN_PASSWORD))return response({error:'Senha incorreta.'},401);const token=await issueSession(env),out=response({token,expiresIn:28800});out.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery',token,28800));return out;
 }
 if(path==='/api/admin/logout'){if(request.method!=='POST')return response({error:'Use POST.'},405);const out=response({ok:true});out.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));return out;}
 let identity=null;try{identity=await authenticatedOperator(request,env);}catch{if(fieldAuthenticationRequired(env))return response({error:'Autenticação central indisponível. Seus cadastros locais foram preservados.'},503);}
 const bootstrapAdmin=await validSession((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env)||await validSession(authCookie(request,'__Host-campo-admin-recovery'),env);
 let authResult=null;
 if(path.startsWith('/api/gerencial/')||path.startsWith('/api/admin/gerencial/')){
  const admin=bootstrapAdmin||identity?.user.role==='admin';
  const result=await gerencialAPI(request,env,path,admin);
  for(const [key,value] of Object.entries(cors))result.headers.set(key,value);
  return result;
 }
 try{if(path==='/api/auth/start')authResult=new Response(null,{status:303,headers:{Location:CAMPO_AUTH_APP_ORIGIN+'/?login=senha','Cache-Control':'no-store'}});
 else if(path==='/api/auth/login'){authResult=await campoPasswordLogin(request,env);if(authResult.ok)authResult.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));}
 else if(path==='/api/auth/password')authResult=await campoChangePassword(request,env,identity);
 else if(path==='/api/auth/status')authResult=await campoAuthStatus(request,env,identity,bootstrapAdmin||identity?.user.role==='admin');
 else if(path==='/api/auth/logout')authResult=await campoAuthLogout(request,env,identity);
 else if(path==='/api/auth/request-access')authResult=await campoRequestAccess(request,env);
 else if(path==='/api/admin/access-requests')authResult=await campoManageAccessRequests(request,env,identity,bootstrapAdmin);
 else if(path==='/api/admin/users')authResult=await campoManageUsers(request,env,identity,bootstrapAdmin);
 else if(path==='/api/access')authResult=response({admin:Boolean(bootstrapAdmin||identity?.user.role==='admin'),authenticated:Boolean(identity),user:identity?.user||null,required:fieldAuthenticationRequired(env)});
 }catch(e){authResult=response({error:e.status?e.message:'Não foi possível concluir a autenticação.'},e.status||503);}
 if(authResult){for(const [k,v]of Object.entries(cors))authResult.headers.set(k,v);return authResult;}
 if(fieldAuthenticationRequired(env)&&!identity&&!bootstrapAdmin)return response({error:'Entre com seu usuário e senha para acessar os dados compartilhados.',code:'AUTH_REQUIRED'},401);
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-'))headers.delete(key);headers.set('Origin',url.origin);
 const admin=bootstrapAdmin||identity?.user.role==='admin';headers.delete('Authorization');if(admin){headers.set('oai-authenticated-user-id','external-admin');headers.set('oai-authenticated-user-email',env.CAMPO_ADMIN_EMAIL||'administrador@campo.local');}
 const result=await internalApp.fetch(new Request(request,{headers}),{...env,CAMPO_ADMIN_EMAIL:env.CAMPO_ADMIN_EMAIL||'administrador@campo.local',CAMPO_USER:identity?.user||null,CAMPO_DEVICE_SESSION:identity?{hash:identity.session.token_hash,token:identity.token}:null});if(result.status===101)return result;const output=new Response(result.body,result);for(const [k,v]of Object.entries(cors))output.headers.set(k,v);output.headers.set('Cache-Control','no-store');return output;
}};
