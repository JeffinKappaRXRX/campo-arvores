const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context=vm.createContext({console,document:{getElementById:()=>null},Date,Map,Set,Blob,Response,TextEncoder,URL,URLSearchParams,indexedDB:{}});
const Central=vm.runInContext(fs.readFileSync('docs/central-core.js','utf8')+';Central',context);
const table=rows=>{const keys=[...new Set(rows.flatMap(Object.keys))],c={};for(const k of keys)c[k]=rows.map(r=>r[k]);return {n:rows.length,c};};
Central.dados.chaves=table([
 {chave:'C1',alim:'A1',plano:'P1',polo:'RBR',municipio:'Rio Branco'},
 {chave:'C2',alim:'A2',plano:'P2',polo:'CZS',municipio:'Cruzeiro do Sul'}
]);
Central.dados.os_abertas=table([{os:'1',chave:'C1'},{os:'2',chave:'C2'}]);
Central.dados.equipes=table([{eq:'E1',alim:'A1'},{eq:'E2',alim:'A2'}]);
Central.setGlobalFilters({plano:'P1',polo:'RBR',localidade:'Rio Branco'});
assert.deepEqual(Array.from(Central.linhas('chaves'),x=>x.chave),['C1']);
assert.deepEqual(Array.from(Central.linhas('os_abertas'),x=>x.os),['1'],'rows inherit dimensions by key');
assert.deepEqual(Array.from(Central.linhas('equipes'),x=>x.eq),['E1'],'rows inherit dimensions by feeder');
Central.setGlobalFilters({plano:'P2'});
assert.deepEqual(Array.from(Central.linhas('os_abertas'),x=>x.os),['2'],'changing plan changes every keyed dataset');
assert.equal(Central.linhasRaw('os_abertas').length,2,'option lists can still inspect the unfiltered source');
console.log('PASS central global filters: plan, polo and locality propagate by key or feeder without changing raw sources.');
