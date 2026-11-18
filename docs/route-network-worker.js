'use strict';
importScripts('vendor/fflate.js','route-core.js');
const REVISION='campo-20261009-vera-20260803-v1';
const endpoint='/api/routes/geometry';
const zones=['','URBANO','RURAL'];
let pending;

async function cache(bytes){
 if(!self.indexedDB)return null;
 const db=await new Promise((resolve,reject)=>{
  const request=indexedDB.open('campo-route-geometry',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('packages');
  request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
 });
 try{return await new Promise((resolve,reject)=>{
  const tx=db.transaction('packages',bytes?'readwrite':'readonly'),store=tx.objectStore('packages');
  const op=bytes?store.put({revision:REVISION,bytes},'mt'):store.get('mt');
  tx.oncomplete=()=>resolve(op.result);tx.onabort=()=>reject(tx.error);
 });}finally{db.close();}
}
async function load(adminSession){
 const saved=await cache().catch(()=>null);
 let bytes=saved?.revision===REVISION?saved.bytes:null,data;
 function decode(bytes){
  const parsed=JSON.parse(fflate.strFromU8(fflate.gunzipSync(new Uint8Array(bytes))));
  if(!parsed.rows?.length||!parsed.feeders?.length)throw Error('Pacote de rotas MT sem dados.');
  return parsed;
 }
 if(bytes)try{data=decode(bytes);}catch{bytes=null;}
 if(!data){
  const response=await fetch(endpoint,{credentials:'same-origin',headers:adminSession?{Authorization:'Bearer '+adminSession}:{},cache:'no-store',signal:AbortSignal.timeout(90000)});
  if(!response.ok){const problem=await response.json().catch(()=>null);throw Error(problem?.error||'A rede MT central não respondeu.');}
  bytes=await response.arrayBuffer();data=decode(bytes);
  void cache(bytes).catch(()=>{});
 }
 const ids=new Map(),groups=new Map(),bbox=new Int32Array(data.rows.length*4);
 data.rows.forEach((row,i)=>{
  const [id,,,,,,,,,group,xy]=row;
  ids.set(String(id),i);
  if(group){if(!groups.has(group))groups.set(group,[]);groups.get(group).push(i);}
  let west=xy[0],east=xy[0],south=xy[1],north=xy[1];
  for(let n=2;n<xy.length;n+=2){west=Math.min(west,xy[n]);south=Math.min(south,xy[n+1]);east=Math.max(east,xy[n]);north=Math.max(north,xy[n+1]);}
  bbox.set([west,south,east,north],i*4);
 });
 return {...data,ids,groups,bbox};
}
function network(adminSession){return pending??=(load(adminSession).catch(error=>{pending=null;throw error;}));}
function coordinates(row){const xy=row[10],line=[];for(let i=0;i<xy.length;i+=2)line.push([xy[i]/1e6,xy[i+1]/1e6]);return line;}
function measured(row,line){return row[6]?row[6]/1000:line.slice(1).reduce((m,p,i)=>m+CampoRoutes.distance(line[i],p),0);}
function orderedPoles(row,line){
 const a=line[0],b=line.at(-1);
 return a[0]>b[0]||a[0]===b[0]&&a[1]>b[1]?[row[8],row[7]]:[row[7],row[8]];
}
function feature(data,row,withPeers=true){
 const [id,feeder,locality,zone,section,block,metres,a,b,group]=row,line=coordinates(row),poleOrder=orderedPoles(row,line);
 const parallel=withPeers&&group?data.groups.get(group).map(i=>data.rows[i]).filter(peer=>row[0]!==peer[0]&&peer[1]!==feeder).map(peer=>{
  const path=coordinates(peer),peerOrder=orderedPoles(peer,path);
  return {id:String(peer[0]),feeder:data.feeders[peer[1]],metres:measured(peer,path),flip:peerOrder[0]!==poleOrder[0],estimated:!peer[6]};
 }):[];
 return {type:'Feature',id:'route-mt:'+id,geometry:{type:'LineString',coordinates:line},properties:{Id:String(id),_class:'MT',_layer:'Vãos MT',
  _route_feeder:data.feeders[feeder],_route_locality:data.localities[locality],_route_zone:zones[zone],_route_section:String(section),_route_block:data.blocks[block],
  _route_metres:metres/1000,_route_poles:[a,b].filter(Boolean).map(String),_route_parallel:parallel}};
}
function routeFilter(data,{feeders=[],blocks=[],sections=[],zone='',bounds,featureId,context=false,zoom=12}){
 if(featureId){const index=data.ids.get(String(featureId).split(':').at(-1)),row=data.rows[index];return {features:row?[feature(data,row)]:[],total:row?1:0,missing:[]};}
 const allowedFeeders=new Set(feeders),allowedBlocks=new Set(blocks),allowedSections=new Set(sections.map(Number));
 const intersection=bounds?[bounds.west*1e6,bounds.south*1e6,bounds.east*1e6,bounds.north*1e6]:null;
 const found=new Set(),matches=[];
 let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity,cadastral=0,measuredCount=0;
 for(let i=0;i<data.rows.length;i++){
  const row=data.rows[i],code=data.blocks[row[5]],feeder=data.feeders[row[1]],offset=i*4,b=data.bbox;
  if(allowedFeeders.size&&!allowedFeeders.has(feeder)||allowedBlocks.size&&!allowedBlocks.has(code)||allowedSections.size&&!allowedSections.has(row[4])||zone&&zones[row[3]]!==zone)continue;
  if(intersection&&(b[offset+2]<intersection[0]||b[offset+3]<intersection[1]||b[offset]>intersection[2]||b[offset+1]>intersection[3]))continue;
  matches.push(row);found.add(code);
  west=Math.min(west,b[offset]);south=Math.min(south,b[offset+1]);east=Math.max(east,b[offset+2]);north=Math.max(north,b[offset+3]);
  if(row[6]){cadastral+=row[6];measuredCount++;}
 }
 const total=matches.length,extent=total?{west:west/1e6,south:south/1e6,east:east/1e6,north:north/1e6}:null;
 if(context){
  const limit=zoom>=15?16000:9000;
  if(total<=limit)return {features:matches.map(row=>feature(data,row,false)),total};
  // Keep each feeder represented at the regional scale, including the smallest.
  const groups=new Map();for(const row of matches){if(!groups.has(row[1]))groups.set(row[1],[]);groups.get(row[1]).push(row);}
  const features=[...groups.values()].flatMap(rows=>rows.filter((_,i)=>i%Math.ceil(total/limit)===0).map(row=>feature(data,row,false)));
  return {features,total};
 }
 const limit=10000,step=Math.max(1,Math.ceil(total/limit));
 return {features:matches.filter((_,i)=>i%step===0).map(row=>feature(data,row)),total,capped:total>limit,extent,
  reference:{count:total,measured:measuredCount,metres:cadastral/1000},missing:blocks.filter(code=>!found.has(code))};
}
self.onmessage=async({data:request})=>{
 try{
  const data=await network(request.adminSession);
  self.postMessage({id:request.id,data:request.action==='catalogue'?{feeders:data.feeders,count:data.rows.length}:routeFilter(data,request)});
 }catch(error){self.postMessage({id:request.id,error:error.message});}
};
