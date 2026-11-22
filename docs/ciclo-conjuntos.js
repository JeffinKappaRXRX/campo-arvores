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
  if(points.length<4)return null;
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

 function spatial(features,field,names){
  const pieces=[],labels=new Set(),official=new Map(Object.values(names).map(name=>[normalize(name),display(name)]));
  let skipped=0;
  for(const feature of features){
   const value=String(feature.properties?.[field]??'').trim();
   const name=display(label(names,value)||official.get(normalize(value))||(!/^\d+$/.test(value)?value:''));
   const geometry=feature.geometry;
   const polygons=geometry?.type==='Polygon'?[geometry.coordinates]:geometry?.type==='MultiPolygon'?geometry.coordinates:[];
   if(!name||!polygons.length){skipped++;continue;}
   const before=pieces.length;
   for(const polygon of polygons){
    const rings=polygon.map(prepareRing);
    if(!rings.length||rings.some(ring=>!ring))continue;
    const [shell,...holes]=rings;
    pieces.push({name,shell,holes});labels.add(name);
   }
   if(pieces.length===before)skipped++;
  }
  if(!pieces.length)throw Error('O campo escolhido não identificou conjuntos em polígonos válidos.');
  function lookup(point){
   if(!point)return '';
   const [y,x]=point,interior=new Set(),boundary=new Set();
   for(const {name,shell,holes} of pieces){
    const outer=ringState(shell,x,y);
    if(!outer)continue;
    let edge=outer===1,excluded=false;
    for(const hole of holes){
     const state=ringState(hole,x,y);
     if(state===2){excluded=true;break;}
     if(state===1)edge=true;
    }
    if(!excluded)(edge?boundary:interior).add(name);
   }
   const matches=interior.size?interior:boundary;
   return matches.size===1?[...matches][0]:'';
  }
  return {lookup,names:labels.size,polygons:pieces.length,skipped};
 }

 function resolve(conjunto,territory,point,polygons,references){
  if(conjunto)return {conj:conjunto,method:'Cadastro ou poste'};
  const area=polygons?.lookup(point);
  if(area)return {conj:area,method:'Polígono do conjunto'};
  const key=references?.key(territory.chave);
  if(key)return {conj:key,method:'Chave da rede'};
  const feeder=references?.feeder(territory.alim);
  return feeder?{conj:feeder,method:'Alimentador da rede'}:{conj:'',method:''};
 }

 return {spatial,indexReferences,resolve};
})();
if(typeof module!=='undefined')module.exports=CycleConjuntos;
