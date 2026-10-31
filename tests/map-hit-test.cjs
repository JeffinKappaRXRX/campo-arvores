const assert=require('node:assert/strict'),hit=require('../docs/map-hit-test.js');
const point={id:'poste',geometry:{type:'Point',coordinates:[10,10]}},line={id:'vao',geometry:{type:'LineString',coordinates:[[0,10],[100,10]]}},project=c=>({x:c[0],y:c[1]});
assert.equal(hit.closest([line,point],[10,10],project).id,'poste');
assert.equal(hit.closest([line,point],[60,11],project).id,'vao');
assert.equal(hit.closest([line,point],[80,60],project),null);
const multi={id:'mt',geometry:{type:'MultiLineString',coordinates:[[[200,200],[250,200]],[[300,300],[350,300]]]}};assert.equal(hit.closest([multi],[330,302],project).id,'mt');
assert.equal(hit.closest([],[-67,-10],c=>hit.project(c,18)),null);
const p=hit.project([-67,-10],18);assert(Number.isFinite(p.x)&&Number.isFinite(p.y));assert.equal(hit.project([null,0],18),null);
console.log('PASS: pole over span, nearby spans, empty background, multipart MT, bounded pixel tolerance and map projection.');
