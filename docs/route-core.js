'use strict';
const CampoRoutes=(()=>{
 const FULL=10000;
 const text=(value,max=100)=>String(value??'').trim().slice(0,max);
 const key=value=>text(value,100).toUpperCase();
 const codes=value=>[...new Set(String(value??'').toUpperCase().split(/[\s,;]+/).filter(Boolean))];
 const sections=values=>[...new Set(values.map(v=>key(v).replace(/^T/,'').trim()).filter(v=>['1','2','3'].includes(v)))].sort();
 const sectionLabel=route=>(route.sections||[route.section]).map(s=>'T'+s).join(' + ');
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
  return {id,metres,feeder:key(raw.feeder),locality:key(raw.locality),block:key(raw.block),zone:key(raw.zone),section:key(raw.section).replace(/^T/,'').trim(),
   ...(raw.estimated?{estimated:true}:{}),line:inverted?[...line].reverse():line,reverse:Boolean(raw.reverse)!==inverted};
 }
 const first=s=>s.line[s.reverse?s.line.length-1:0],last=s=>s.line[s.reverse?0:s.line.length-1];
 function feature(f){
  const p=Object.fromEntries(Object.entries(f.properties||{}).map(([k,v])=>[k.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,''),v]));
  if(f.geometry?.type!=='LineString')throw Error('Selecione um vão de linha da rede MT.');
  const layer=key(f.properties?._class||f.properties?._layer);
  if(layer&&!/(^MT$|VAO.*MT|REDE.*MT)/.test(layer))throw Error('Selecione um vão de MT.');
  const numeric=v=>Number(String(v??'').trim().replace(',','.'));
  const recorded=[p.redecompm,p.comprimentoatual,p.comprimentom,p.comprimento,p.extensaom,p.extensao,numeric(p.redecompkm)*1000,p.routemetres].map(numeric).find(value=>value>0);
  const line=f.geometry.coordinates;
  const estimated=!(recorded>0);
  const metres=estimated?line.slice(1).reduce((total,point,i)=>total+distance(line[i],point),0):recorded;
  const rawZone=key(p.routezone??p.zona??p.urbanorural);
  const zone=['U','URBANA'].includes(rawZone)?'URBANO':rawZone==='R'?'RURAL':rawZone;
  return span({id:p.id??p.idvao??p.idvaomt??p.gisid,metres,line,estimated,feeder:p.routefeeder??p.alimentador??p.feeder,
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
 function streetDirections(destination,origin){
  const coords=([lon,lat])=>lat.toFixed(6)+','+lon.toFixed(6);
  const options=new URLSearchParams({api:'1',destination:coords(destination),travelmode:'driving'});
  if(origin)options.set('origin',coords(origin));else options.set('dir_action','navigate');
  return 'https://www.google.com/maps/dir/?'+options;
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
   const pending=groups.get(group).slice(),ends=new Map();
   const coordinate=p=>p.map(n=>n.toFixed(5)).join(',');
   for(const s of pending)for(const p of [first(s),last(s)]){
    const key=coordinate(p);ends.set(key,(ends.get(key)||0)+1);
   }
   if(!start){
    const i=pending.findIndex(s=>ends.get(coordinate(first(s)))===1||ends.get(coordinate(last(s)))===1);
    const s=pending.splice(Math.max(0,i),1)[0];
    const reverse=ends.get(coordinate(first(s)))!==1&&ends.get(coordinate(last(s)))===1;
    const initial={...s,reverse:s.reverse!==reverse};
    result.push(initial);start=last(initial);
   }
   while(pending.length){
    let nearest=Infinity,index=0,reverse=false;
    for(const [i,s] of pending.entries()){
     const a=distance(start,first(s)),b=distance(start,last(s));
     if(Math.min(a,b)<nearest){nearest=Math.min(a,b);index=i;reverse=b<a;}
    }
    const s=pending.splice(index,1)[0],next={...s,reverse:s.reverse!==reverse};
    result.push(next);start=last(next);
   }
  }
  return result;
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
  const lengths=new Map(spans.map(s=>[s.id,s.metres])), bySpan=new Map();
  for(const visit of visits.filter(filter))for(const {spanId,start,end} of visit.ranges){
   if(!lengths.has(spanId))continue;
   if(!bySpan.has(spanId))bySpan.set(spanId,[]);
   bySpan.get(spanId).push([start,end]);
  }
  let metres=0;
  for(const [id,items] of bySpan){
   const joined=merge(items);bySpan.set(id,joined);
   metres+=joined.reduce((sum,[a,b])=>sum+(b-a)*lengths.get(id)/FULL,0);
  }
  return {bySpan,metres};
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
 return {FULL,metres,mapLines,pendingColor,confirmedColor,haloColor,streetDirections,routeParts,text,key,codes,sections,sectionLabel,identifier,distance,first,last,span,feature,order,merge,remaining,coverage,portion,trailMetres,phase,day};
})();
if(typeof module!=='undefined')module.exports=CampoRoutes;
