const assert=require('node:assert/strict');
const M=require('../docs/manejo-core');
const G=require('../docs/sigora-gerencial-core');
const d=M.day, now=d('2026-11-16');
const params={ref:d('2026-11-04'),now,lead:60,months:6};
assert.equal(M.pruningForecast({lev:d('2026-10-01'),taxa:1.6},{ult:d('2026-11-12')},params).due,d('2026-11-12')+366-60);
assert.equal(M.pruningForecast({lev:d('2026-11-14'),diasToque:90,taxa:1.6},{ult:d('2026-11-12')},params).due,params.ref+30);
assert.equal(M.pruningForecast({lev:d('2026-10-01')},{ult:d('2026-11-12')},params).due,null);
assert.equal(M.iso(M.pruningForecast(null,{ult:d('2026-05-31'),base:d('2026-05-30'),ciclo:90},params).due),'2026-11-30');
assert.equal(M.pruningForecast(null,{base:d('2026-05-30')},params).due,null);
assert.equal(M.pruningForecast(null,{ult:d('2026-12-30')},params).last,null);
const args={
 keys:[{chave:'A',trecho:1,postes:40},{chave:'B',trecho:1,postes:50},{chave:'C',trecho:2,postes:30,uInsp:d('2026-11-01')},{chave:'D',trecho:2,postes:20},{chave:'E',trecho:3},{chave:'F',trecho:3},{chave:'G',trecho:2,osInsp:'123D'},{chave:'H',trecho:1,osInsp:'CRIAR OS DE INSPEÇÃO'}],
 history:[{chave:'C',postesInsp:26}],
 pending:[{chave:'B',tipo:'INSPEÇÃO',os:'OS-B'},{chave:'E',tipo:'INSPEÇÃO',os:'OS-E'},{chave:'D',tipo:'PODA'}],
 executed:[{chave:'D',tipo:'INSPEÇÃO',dia:d('2026-11-03')}],now,cutoff:()=>d('2026-10-01'),toDay:x=>Number.isInteger(x)?x:null,complete:true
};
const rows=G.inspections(args),get=id=>rows.find(x=>x.chave===id);
assert.equal(get('A').status,'Criar OS de inspeção');
assert.equal(get('B').status,'OS de inspeção aberta');
assert.equal(get('C').covered,26);
assert.equal(get('D').status,'Inspecionada');
assert.equal(get('E').status,'OS de inspeção aberta');
assert.equal(get('F'),undefined);
assert.equal(get('G').status,'Conferir dados');
assert.equal(get('H').status,'Criar OS de inspeção');
assert.equal(G.inspections({...args,complete:false})[0].status,'Conferir dados');
assert.deepEqual(G.progress(rows).map(({key,total,done,missing})=>[key,total,done,missing]),[['T1',3,0,2],['T2',3,2,0],['T3',1,0,0]]);
const dec=G.causes([{CONJUNTO:'1',ano:2026,mes:10,fam:'Vegetação',decCj:2},{CONJUNTO:'1',ano:2026,mes:10,fam:'Falha de material',decCj:1},{CONJUNTO:'1',ano:2026,mes:9,fam:'Outro',decCj:10},{CONJUNTO:'2',ano:2026,mes:10,fam:'Vegetação',decCj:9}],{year:2026,month:10,conj:'1',match:(a,b)=>a===b});
assert.equal(dec[0].cause,'Vegetação');
assert.equal(dec[0].share,2/3);
assert.equal(dec.length,2);
console.log('PASS gestão: ciclo de poda, última execução por poste, T1/T2/T3, lacunas e participação no DEC por conjunto.');
