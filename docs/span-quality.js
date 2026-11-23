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
