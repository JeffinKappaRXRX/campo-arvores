const assert=require('node:assert/strict');
const T=require('../docs/carteira-territorial-core.js');

const asset={asset:'cruzeta',chave:'QA',trecho:'T2'};
assert.equal(T.classify(asset,{cli:120}).mode,'avaliacao','small footprint alone does not establish radial topology');
assert.equal(T.classify(asset,{cli:399},{radial:1}).mode,'radial');
assert.equal(T.classify(asset,{cli:400},{radial:1}).mode,'avaliacao');
const transfer={manobra:1,radial:0,na:'NA1',cli:850,transf:500};
assert.equal(T.classify(asset,{cli:850,na:['OTHER']},transfer).mode,'avaliacao');
assert.equal(T.classify(asset,{cli:850,na:['NA1']},transfer).mode,'manobra');
assert.equal(T.classify(asset,{cli:900,na:['NA1']},transfer).mode,'avaliacao','use conservative residual when sources differ');
assert.equal(T.classify(asset,{cli:850,na:['NA1']},{...transfer,transf:900}).residual,null);
assert.equal(T.classify({...asset,trecho:'T3',perim:'U'},{cli:120},{radial:1}).mode,'radial','urban T3 demand gate is for pruning');
assert.equal(T.classify({asset:'poda',trecho:'T3',perim:'U',voltage:'BT'}).mode,'situacional');
assert.equal(T.classify({asset:'poda',trecho:'T3',perim:'U',voltage:'BT',situational:true}).mode,'bt');
assert.match(T.classify({asset:'poda',trecho:'T3',perim:'R'}).reviewReason,/T3 rural/);
const mt={asset:'poda',voltage:'MT',kv:13.8,distIT:1.5,mtDistance:2,moLM:2,teamIT:'Linha Morta'};
assert.match(T.classify(mt).deop,/revisar/);
assert.match(T.classify({...mt,mtMeasured:2}).deop,/avaliar apoio DEOP/);
assert.match(T.classify({...mt,mtMeasured:2,teamIT:'Linha Viva / Desligamento'}).deop,/linha viva ou desligamento/);

const cut='2026-11-15', code='17306';
const dec=T.decSummary({hoje:cut,corteDec:cut,conjuntos:{[code]:'Taquari'},conjDec:{[code]:{dec:33,dec27:35}}},[
 {ano:2025,mes:11,CONJUNTO:code,decCj:4},
 {ano:2025,mes:12,CONJUNTO:code,decCj:3},
 {ano:2026,mes:10,CONJUNTO:code,decCj:8,fam:'Vegetação',ger:'GERENCIÁVEL',TIPO_OCORR:'N'},
 {ano:2026,mes:11,CONJUNTO:code,decCj:2,fam:'Poda programada',ger:'GERENCIÁVEL',TIPO_OCORR:'P'},
 {ano:2026,mes:12,CONJUNTO:code,decCj:99,fam:'Fora do corte',ger:'GERENCIÁVEL',TIPO_OCORR:'N'}
 ],2026).get('TAQUARI');
assert.deepEqual([dec.cutoff,dec.ytd,dec.remainder,dec.projected,dec.currentLimit,dec.next,dec.nextLimit],[cut,33,5,38,37,35,34]);
assert.deepEqual(dec.causes.map(c=>c.cause),['VEGETACAO']);
const base={team:'Linha morta',resource:'OPEX MANUT. PROGRAMADA',pool:'QA|Linha morta',mode:'radial',score:90,mo:40,mat:20,hours:3};
const result=T.optimize([{id:'A',...base},{id:'B',...base,score:80},{id:'C',...base,impacts:[{}]},{id:'D',...base,mat:null}],{[base.resource]:{mo:60,mat:100}},{[base.pool]:12});
assert.deepEqual([...result.selected],['A']);
assert.match(result.rows.find(row=>row.id==='C').reason,/COI/);
assert.match(result.rows.find(row=>row.id==='D').reason,/pendentes/);
console.log('PASS carteira territorial: evidência radial e de NA, T3, triagem DEOP, DEC apurado/projetado e limites de orçamento.');
