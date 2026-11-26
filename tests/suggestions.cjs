'use strict';
const assert=require('node:assert/strict');
require('../docs/inspection-rules.js');
require('../docs/registration-quality.js');
const S=require('../docs/suggestion-rules.js');
const full={
 id:'case-1',lat:-9.97,lon:-67.81,photos:[{assetId:'foto-1'}],inspector:'QA',feeder:'RBR-QA',pole:'P-1',
 species:'Mangueira',noNetwork:true,grouped:'nao',formValidation:1,height:9,dap:30,circ:94.2,treeSite:'publico',poda:'nao'
};
assert.deepEqual(S.inspect(full),[]);
assert.deepEqual(S.patch(S.inspect({...full,circ:''})),{circ:94.2});
assert.deepEqual(S.patch(S.inspect({...full,dap:'',circ:94.2})),{dap:30});
assert.deepEqual(S.patch(S.inspect({...full,dap:30,circ:31})),{});
assert(S.inspect({...full,dap:30,circ:31}).some(f=>f.key==='diameter'));
assert(S.inspect({...full,dap:300,circ:''}).some(f=>f.key==='diameter'&&!f.change));
assert.deepEqual(S.patch(S.inspect({...full,treeSite:'',area:'Área Privada'})),{treeSite:'privado'});
assert.deepEqual(S.patch(S.inspect({...full,treeSite:'',area:'Área Urbana'})),{});
assert(S.inspect({...full,area:'Área Privada'}).some(f=>f.key==='treeSite'&&!f.change));
assert(S.inspect({...full,mt:false,mtDistance:1.1}).some(f=>f.key==='network'));
assert(S.inspect({...full,lat:0,lon:0}).some(f=>f.key==='coordinates'));
assert(S.inspect(full,true).some(f=>f.key==='duplicate'));
assert.match(S.guidance(S.inspect({...full,treeSite:'',circ:3})),/área pública ou privada/);
console.log('PASS sugestões: conversão DAP/CAP, inconsistências, área explícita, rede, coordenadas, duplicidade e orientação.');
