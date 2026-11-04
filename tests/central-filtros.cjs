const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');
// Filtro de várias opções: vazio é tudo, a linha passa em qualquer opção marcada e valor numérico compara como texto.
const src=fs.readFileSync(path.join(__dirname,'../docs/central-core.js'),'utf8'),ctx={Date,Intl,console};vm.createContext(ctx);vm.runInContext(src+';this.Central=Central;',ctx);
const {em,tem,um,bin,lista}=ctx.Central;
for(const vazio of ['',null,undefined,[]]){assert.equal(em(vazio,'x'),true);assert.equal(bin(vazio,false),true);assert.equal(um(vazio),'');assert.equal(lista(vazio).length,0);}
assert.equal(em(['T1','T2'],'T2'),true);assert.equal(em(['T1','T2'],'T3'),false);assert.equal(em('T1','T1'),true);assert.equal(em('T1','T2'),false);
assert.equal(em(['2025','2026'],2026),true);assert.equal(em(['0'],0),true);assert.equal(em(['x'],null),false);assert.equal(em(['TAQ-01C1'],'TAQ-01C1, SFR-01C7'),true);assert.equal(em(['TAQ-01C2'],'TAQ-01C1, SFR-01C7'),false);
assert.equal(tem(['URGENTE','ALTA'],'ALTA'),true);assert.equal(tem(['URGENTE'],'ALTA'),false);assert.equal(tem('ALTA','ALTA'),true);assert.equal(tem('','ALTA'),false);
assert.equal(um(['17308']),'17308');assert.equal(um(['17308','17307']),'');assert.equal(um('17308'),'17308');
assert.equal(bin(['1'],true),true);assert.equal(bin(['1'],false),false);assert.equal(bin(['0'],false),true);assert.equal(bin(['1','0'],false),true);assert.equal(bin(['LV'],true,'LV','LM'),true);assert.equal(bin(['LM'],true,'LV','LM'),false);
console.log('PASS filtro de várias opções da central');
