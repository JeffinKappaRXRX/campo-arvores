const assert=require('node:assert/strict');
const Geo=require('../docs/ciclo-conjuntos.js');
const limit=require('../docs/acre-limite.js');
const within=Geo.stateBoundary(limit);
const outside=[-7.261,-64.798],inside=[-9.967,-67.818],near=[-9.96708,-67.81808],elsewhere=[-9.974,-67.812];
assert.equal(within(inside),true);
assert.equal(within(outside),false,'Lábrea is outside the Acre state polygon');
assert.equal(within([-8.76,-67.39]),false,'Boca do Acre is also outside the Acre state polygon');
const registry=Geo.poleRegistry({schema:'sigora-postes-1',crs:'EPSG:4326',source:{layer:'13_Postes'},
 rows:[['42',...inside],['44',...outside]],ambiguous:['45']});
const positions={within,registry,anchor:true,poleRecord:true};
const corrected=Geo.classifyRow({id:'226-42',point:outside,lat:outside[0],lon:outside[1]},null,null,positions);
assert.deepEqual(corrected.point,inside);assert.deepEqual(corrected.originalPoint,outside);
assert.equal(corrected.lat,inside[0]);assert.equal(corrected.lon,inside[1]);assert.equal(corrected.locationStatus,'corrigido_gis');
assert.deepEqual(Geo.reconcile({id:'42',point:elsewhere},registry,positions).point,inside);
assert.deepEqual(Geo.reconcile({id:'42',point:near},registry,positions).point,near,'sub-15m differences preserve the supplied position');
assert.deepEqual(Geo.reconcile({id:'tree',posteGIS:'42',point:elsewhere},registry,{within}).point,elsewhere,'preserve a measured tree inside Acre');
assert.equal(Geo.reconcile({id:'42',point:outside},registry,{within}).point,null,'a work-order ID is never mistaken for a pole ID');
for(const [id,status] of [['43','fora_acre'],['44','poste_fora_acre'],['45','poste_ambiguo']]){
 const row=Geo.classifyRow({id,point:outside,lat:outside[0],lon:outside[1]},null,null,positions);
 assert.equal(row.point,null);assert.equal(row.lat,null);assert.equal(row.lon,null);assert.equal(row.conjStatus,status);
}
assert.equal(Geo.reconcile({id:'42'},registry,positions).locationStatus,'localizado_gis');
assert.throws(()=>Geo.poleRegistry({schema:'sigora-postes-1',crs:'EPSG:4326',rows:[['42',...inside],['42',...elsewhere]],ambiguous:[]}),/duplicadas/);
console.log('PASS coordinates: IBGE boundary, exact pole matching, original GPS preserved, suspect positions excluded.');
