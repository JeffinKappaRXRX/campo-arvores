'use strict';

const CycleConjuntos=(()=>{
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const display=value=>String(value??'').trim().toLocaleUpperCase('pt-BR');
 const label=(names,key)=>Object.hasOwn(names,key)?names[key]:'';
 const codes=value=>String(value??'').split(/[,;\/]+/).map(normalize).filter(Boolean);

 function indexReferences(rows,names){
  const key=new Map(),feeder=new Map();
  function add(index,value,name){
   for(const id of codes(value)){
    if(!index.has(id))index.set(id,new Set());
    index.get(id).add(name);
   }
  }
  for(const row of rows){
   const name=display(label(names,row.conj)||(!/^\d+$/.test(String(row.conj))?row.conj:''));
   if(!name)continue;
   add(key,row.chave,name);add(feeder,row.alim,name);
  }
  // A composite or duplicated identifier is usable only if all the results agree.
  function lookup(index,value){
   const matches=new Set();
   for(const id of codes(value))for(const name of index.get(id)||[])matches.add(name);
   return matches.size===1?[...matches][0]:'';
  }
  return {key:value=>lookup(key,value),feeder:value=>lookup(feeder,value)};
 }

 const epsilon=1e-9,bands=64;
 function prepareRing(points){
  if(!Array.isArray(points)||points.length<4||points.some(point=>!Array.isArray(point)||point.length<2))return null;
  let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
  for(const [x,y] of points){
   if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>180||Math.abs(y)>90)return null;
   west=Math.min(west,x);east=Math.max(east,x);south=Math.min(south,y);north=Math.max(north,y);
  }
  if(east===west||north===south)return null;
  const buckets=Array.from({length:bands},()=>[]);
  function band(y){return Math.max(0,Math.min(bands-1,Math.floor(bands*(y-south)/(north-south))));}
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const [ax,ay]=points[j], [bx,by]=points[i];
   if(ax===bx&&ay===by)continue;
   const segment=[ax,ay,bx,by];
   const first=band(Math.min(ay,by)-epsilon),last=band(Math.max(ay,by)+epsilon);
   for(let n=first;n<=last;n++)buckets[n].push(segment);
  }
  return {west,east,south,north,buckets,band};
 }
 // 0 outside, 1 on boundary, 2 inside.
 function ringState(ring,x,y){
  if(x<ring.west-epsilon||x>ring.east+epsilon||y<ring.south-epsilon||y>ring.north+epsilon)return 0;
  let inside=false;
  for(const [ax,ay,bx,by] of ring.buckets[ring.band(y)]){
   const cross=(x-ax)*(by-ay)-(y-ay)*(bx-ax);
   if(x>=Math.min(ax,bx)-epsilon&&x<=Math.max(ax,bx)+epsilon&&y>=Math.min(ay,by)-epsilon&&y<=Math.max(ay,by)+epsilon&&
    Math.abs(cross)<=epsilon*Math.hypot(bx-ax,by-ay))return 1;
   if((ay>y)!==(by>y)&&x<ax+(y-ay)*(bx-ax)/(by-ay))inside=!inside;
  }
  return inside?2:0;
 }

 function spatial(features,field,names={},source={}){
  const pieces=[],labels=new Set(),official=new Map(Object.values(names).map(name=>[normalize(name),display(name)])),byName=new Map(Object.entries(names).map(([code,name])=>[normalize(name),String(code)]));
  let skipped=0;
  for(const feature of features){
   const value=String(feature.properties?.[field]??'').trim();
   const name=display(feature.properties?.nome||label(names,value)||official.get(normalize(value))||(!/^\d+$/.test(value)?value:''));
   const code=String(feature.properties?.codigo||(/^\d+$/.test(value)?value:byName.get(normalize(name)))||'');
   const geometry=feature.geometry;
   const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
   if(!name||!polygons.length){skipped++;continue;}
   const before=pieces.length;
   for(const polygon of polygons){
    const rings=Array.isArray(polygon)?polygon.map(prepareRing):[];
    if(!rings.length||rings.some(ring=>!ring))continue;
    const [shell,...holes]=rings;
    pieces.push({name,code,shell,holes});labels.add(code||name);
   }
   if(pieces.length===before)skipped++;
  }
  if(!pieces.length)throw Error('O campo escolhido não identificou conjuntos em polígonos válidos.');
  function classify(point){
   if(!validPoint(point))return {status:point==null?'sem_coordenada':'coordenada_invalida',candidates:[]};
   const [y,x]=point,interior=new Map(),boundary=new Map();
   for(const {name,code,shell,holes} of pieces){
    const outer=ringState(shell,x,y);
    if(!outer)continue;
    let edge=outer===1,excluded=false;
    for(const hole of holes){
     const state=ringState(hole,x,y);
     if(state===2){excluded=true;break;}
     if(state===1)edge=true;
    }
    if(!excluded)(edge?boundary:interior).set(code||name,{code,name});
   }
   // A boundary shared by two official polygons stays explicitly ambiguous.
   const matches=new Map([...boundary,...interior]),candidates=[...matches.values()].sort((a,b)=>(a.code||a.name).localeCompare(b.code||b.name));
   return {status:candidates.length>1?'divisa_ambigua':candidates.length?'classificado':'fora_cobertura',
    ...(candidates.length===1?candidates[0]:{}),boundary:boundary.size>0,candidates,source};
  }
  return {lookup:point=>classify(point).name||'',classify,names:labels.size,polygons:pieces.length,skipped,source};
 }

 const number=value=>value==null||String(value).trim()===''?null:Number(String(value).replace(',','.'));
 function validPoint(point){return Array.isArray(point)&&point.length>=2&&point.every(Number.isFinite)&&Math.abs(point[0])<=90&&Math.abs(point[1])<=180&&!(point[0]===0&&point[1]===0);}
 function pointOf(row){
  if(validPoint(row?.point))return row.point;
  if(row?.geometry?.type==='Point'){const [lon,lat]=row.geometry.coordinates||[];if(validPoint([lat,lon]))return [lat,lon];}
  for(const [a,b]of [['lat','lon'],['latitude','longitude'],['latP','lonP'],['latA','lonA']]){
   const lat=number(row?.[a]),lon=number(row?.[b]);if(validPoint([lat,lon]))return [lat,lon];
  }
  return null;
 }
 const poleId=value=>normalize(value).replace(/^226-/,'');
 function locationIndex(rows){
  const poles=new Map();
  for(const row of rows){const id=poleId(row.posteGIS||row.poste||row.pole||row.id),point=pointOf(row);if(!id||!point)continue;
   if(!poles.has(id))poles.set(id,new Map());poles.get(id).set(point.join(','),point);
  }
  return {lookup(value){const points=[...(poles.get(poleId(value))?.values()||[])];return {point:points.length===1?points[0]:null,ambiguous:points.length>1};}};
 }
 function resolve(conjunto,territory,point,polygons){
  const result=polygons?.classify(point)||{status:'poligonos_indisponiveis',candidates:[]};
  const original=territory.conjOriginal??conjunto??'';
  const conflict=Boolean(result.name&&original&&normalize(original)!==normalize(result.name)&&String(original)!==result.code);
  return {conj:result.name||'',conjCode:result.code||'',conjName:result.name||'',conjStatus:result.status,
   conjCandidates:result.candidates,conjOriginal:original,conjConflict:conflict,conjSource:polygons?.source||null,
   method:result.name?'Polígono do conjunto':'',conjMethod:result.name?'Polígono do conjunto':''};
 }
 function classifyRow(row,polygons,locations){
  let point=pointOf(row),locationMethod=point?'Coordenada do registro':'';
  const rawCoordinate=['lat','lon','latitude','longitude','latP','lonP','latA','lonA'].some(key=>row[key]!=null&&String(row[key]).trim()!=='')||row.point!=null;
  let ambiguous=false;
  if(!point){const linked=locations?.lookup(row.posteGIS||row.poste||row.pole||row.id);point=linked?.point||null;ambiguous=Boolean(linked?.ambiguous);if(point)locationMethod='Vínculo exato pelo poste';}
  const result=resolve(row.conjOriginal??row.conj,row,point,polygons);
  if(!point)result.conjStatus=ambiguous?'poste_ambiguo':rawCoordinate?'coordenada_invalida':'sem_coordenada';
  return {...row,...result,point,locationMethod};
 }
 const preparedAreas=new WeakMap();
 function pointInArea(point,ring){
  if(!validPoint(point)||!Array.isArray(ring)||ring.length<3)return false;
  if(!preparedAreas.has(ring)){
   const closed=ring.map(vertex=>validPoint(vertex)?[vertex[1],vertex[0]]:[]);
   closed.push(closed[0]);
   preparedAreas.set(ring,prepareRing(closed));
  }
  const prepared=preparedAreas.get(ring);
  return Boolean(prepared&&ringState(prepared,point[1],point[0]));
 }
 function audit(rows){
  const statuses={},methods={};let classified=0,conflicts=0;
  for(const row of rows){const status=row.conjStatus||'nao_avaliado';statuses[status]=(statuses[status]||0)+1;if(row.conjCode||row.conjName)classified++;if(row.conjConflict)conflicts++;if(row.locationMethod)methods[row.locationMethod]=(methods[row.locationMethod]||0)+1;}
  return {total:rows.length,classified,unlocated:rows.length-classified,conflicts,statuses,methods};
 }
 return {spatial,indexReferences,resolve,classifyRow,pointOf,validPoint,locationIndex,pointInArea,audit};
})();
if(typeof module!=='undefined')module.exports=CycleConjuntos;
