const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const M=require('../docs/manejo-core.js');
const core=vm.runInNewContext(fs.readFileSync('docs/central-core.js','utf8')+'\nCentral;',{});
const keys=[{chave:'C1',polo:'RBR',conj:1,alim:'A1',plano:'P1',mun:'Rio Branco',trecho:1},{chave:'C2',polo:'CZS',conj:2,alim:'A2',plano:'P2',mun:'Cruzeiro do Sul',trecho:2}];
const data={chaves:keys,parque_postes:[
 {id:'226-101',chave:'C1',alim:'A1',lat:-9.9,lon:-67.8,tr:1,cat:'OS executada'},
 {id:'102',chave:'C2',alim:'A2',lat:-7.6,lon:-72.7,tr:2,cat:'OS executada',ult:M.day('2026-01-01'),base:M.day('2026-01-01'),ciclo:365},
 {id:'103',chave:'C2',alim:'A2',tr:2,cat:'Só SS',base:M.day('2026-01-31'),baseF:'Abertura da SS'}
],vera_prev:[
 {id:'v1',poste:'101',chave:'C1',alim:'A1',lat:-9.9,lon:-67.8,diasToque:30,proj:1},
 {id:'retired',poste:'101',chave:'C1',alim:'A1',lat:-9.9,lon:-67.8,diasToque:20}
]};
const mapData={trees:[
 {id:'v1',campoId:'vera-v1',raw:{id:'vera-v1'},especies:'Oiti editado',lat:-9.91,lon:-67.81,classe:'ALTO'},
 {id:'live-2',raw:{id:'live-2',poda:'sim',projection:'sim'},origem:'Campo (prévia)',alimentador:'A2',lat:-7.61,lon:-72.71,classe:'ALTO'},
 {id:'v-extra',especies:'Árvore sem previsão',alimentador:'A1',lat:-9.92,lon:-67.82}
],mergedIds:['vera-retired']};
const Central={dados:{resumo:{hoje:'2026-11-04'}},linhasRaw:n=>data[n]||[],prem:n=>({antecedencia:60,mesesNaoVera:6,urgente:30}[n]),keyMatches:core.keyMatches,
 em:(f,v)=>!f||!f.length||[].concat(f).map(String).includes(String(v))};
vm.runInNewContext(fs.readFileSync('docs/central-cycle.js','utf8'),{Central,CampoManejo:{...M,today:()=> '2026-11-16'},parent:{CampoParque:{unifiedSnapshot:()=>mapData}},window:{}});
const model=F=>Central.cycleMap.prepare(F),all=model({}),find=id=>all.rows.find(r=>r.id===id);
assert.equal(find('v1').lat,-9.91);
assert.equal(find('v1').recordId,'vera-v1');
assert.equal(find('v1').deadline,'2026-10-05');
assert.equal(find('v1').status,'Fora do prazo');
assert.equal(find('v1').projection,'sim');
assert.equal(find('101'),undefined,'post already represented by its VERA tree');
assert.equal(find('retired'),undefined,'merged tree removed from the map and cycle');
assert.equal(find('v-extra').status,'Sem prazo calculável');
assert.equal(find('102').deadline,'2027-01-01','observed 365-day cycle uses last pruning');
assert.equal(find('103').deadline,'2026-07-31','fallback calendar month clamps end of month');
assert.equal(all.point(find('103')),false,'missing coordinates remain in the filtered list');
assert.equal(find('live-2').trecho,'T2');
const ids=F=>Array.from(model(F).rows,r=>r.id).sort();
assert.deepEqual(ids({planoGlobal:'P1',trP:['T1'],cycleStage:['Fora do prazo']}),['v1']);
assert.deepEqual(ids({planoGlobal:[],poloGlobal:[],localidadeGlobal:[]}),ids({}),'cleared multiple global filters keep all matching rows');
assert.deepEqual(ids({trP:['T2'],cyclePoda:['sim'],cycleProjection:['sim']}),['live-2']);
assert.deepEqual(ids({alim:['A2'],mes:'2027-01'}),['102']);
assert.deepEqual(ids({buscaT:'oiti editado',cycleRisk:['ALTO']}),['v1']);
assert.deepEqual(Array.from(model({chave:'C2',trP:['T2']}).networkFeeders()),['A2']);
console.log('PASS unified cycle: observed/fallback dates, live precedence, deduplication, global and local filters, missing coordinates and network feeder selection.');
