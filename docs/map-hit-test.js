/* Hit-test only features already loaded for the visible map; never scan the GPKG. */
(function(root){'use strict';
function segmentDistance(p,a,b){const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy,t=den?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/den)):0;return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);}
function closest(features,tap,project){
 const p=project(tap);if(!p||![p.x,p.y].every(Number.isFinite))return null;let best=null;
 for(const feature of features){let distance=Infinity,point=false;
  function visit(g){if(!g)return;const c=g.coordinates;
   if(g.type==='Point'){const q=project(c);if(q){const d=Math.hypot(p.x-q.x,p.y-q.y);if(d<distance){distance=d;point=true;}}}
   else if(g.type==='MultiPoint')for(const v of c||[])visit({type:'Point',coordinates:v});
   else if(g.type==='LineString'){let previous=null;for(const v of c||[]){const q=project(v);if(q&&previous){const d=segmentDistance(p,previous,q);if(d<distance){distance=d;point=false;}}previous=q;}}
   else if(g.type==='MultiLineString'||g.type==='Polygon')for(const v of c||[])visit({type:'LineString',coordinates:v});
   else if(g.type==='MultiPolygon')for(const v of c||[])visit({type:'Polygon',coordinates:v});
   else if(g.type==='GeometryCollection')for(const v of g.geometries||[])visit(v);
  }visit(feature.geometry);
  if(!Number.isFinite(distance)||distance>(point?18:12))continue;
  if(!best||distance<best.distance-1||Math.abs(distance-best.distance)<=1&&point&&!best.point)best={feature,distance,point};
 }
 return best?.feature||null;
}
function project(coordinate,zoom){if(!Array.isArray(coordinate)||coordinate.length<2||!coordinate.slice(0,2).every(Number.isFinite))return null;const n=256*2**zoom,lat=Math.max(-85,Math.min(85,coordinate[1]))*Math.PI/180;return {x:(coordinate[0]+180)/360*n,y:(1-Math.asinh(Math.tan(lat))/Math.PI)/2*n};}
root.CampoNetworkHit={closest,project};if(typeof module!=='undefined')module.exports=root.CampoNetworkHit;
})(typeof globalThis!=='undefined'?globalThis:this);
