const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');
const M=require('../docs/carteira-simulador-core');
const row=(os,seq,chave,recurso,values={})=>({
 os,seq,chave,recurso,tipo:'MANUTENÇÃO',mat:30,mo:70,lv:1,minLv:60,minLm:120,alim:'A1',...values
});
const rows=[
 row('OS-1',1,'C1','CAPEX 31563'),
 row('OS-2',2,'C2','CAPEX 31563'),
 row('OS-3',3,'C3','OPEX MANUT. PROGRAMADA',{lv:0}),
 row('OS-4',4,'C4','PODA RURAL (TERCEIRA)',{tipo:'PODA'}),
 row('OS-5',5,'C5','RECURSO DESCONHECIDO'),
 row('OS-6',6,'C6','CAPEX 31563',{mat:null}),
 row('OS-7',7,'C7','CAPEX 31563',{minLv:null}),
 row('OS-8',8,'C8','CAPEX 31563',{lv:null}),
 row('OS-9',9,'C9','CAPEX 31563',{tipo:'INSPEÇÃO'}),
 row('OS-10',10,'C10','CAPEX 31563',{expurgo:true}),
 row('OS-11',11,'C11','CAPEX 31563'),
 row('OS-11',12,'C11','OPEX MANUT. PROGRAMADA')
];
const keys=[{chave:'C2',decProj:10},{chave:'C1',decProj:1}];
const limits={capex:100,opex:100,poda:100,viva:2,morta:1};
const pool=M.candidates(rows,keys);
assert.equal(pool.ordem.length,9);
assert.equal(pool.ordem.filter(item=>item.reasons.length).length,5);
const a=M.simulate(pool.ordem,limits);
const b=M.simulate(pool.dec,limits);
assert.equal(a.selected,2);
assert.equal(b.selected,2);
assert.deepEqual(a.used,{capex:10000,opex:0,poda:10000,viva:120,morta:0});
assert.equal(a.decisions[0].status,'Selecionada');
assert.match(a.decisions[1].issues.join(),/Saldo insuficiente/);
assert.match(a.decisions[2].issues.join(),/Horas insuficientes/);
assert.equal(pool.dec[0].id,'OS-2');
assert.equal(b.decisions[0].status,'Selecionada');
assert.equal(M.simulate(pool.ordem,{...limits,viva:.99}).selected,0);
assert.equal(M.candidates([row('OS-12',12,'C12','CAPEX 31563',{mat:0,mo:0})],[]).ordem[0].resource,0);

(async()=>{
 const dom=new JSDOM('<main id="view"></main>',{url:'https://campo.test',runScripts:'outside-only'});
 const w=dom.window,context=dom.getInternalVMContext();
 const load=file=>vm.runInContext(fs.readFileSync('docs/'+file,'utf8'),context);
 load('central-core.js');
 const C=vm.runInContext('Central',context);
 const asTable=list=>({n:list.length,c:Object.fromEntries([...new Set(list.flatMap(Object.keys))].map(key=>[key,list.map(r=>r[key]??null)]))});
 C.views={};
 C.dados.os_abertas=asTable(rows);
 C.dados.chaves=asTable(keys);
 load('carteira-simulador-core.js');
 load('central-carteira-simulador.js');
 const el=w.document.getElementById('view');
 C.views.simular.render({alim:['A1']},el);
 const text=()=>el.querySelector('#carteiraStatus').textContent;
 const form=index=>el.querySelector('[data-carteira-scenario="'+index+'"]');
 assert.match(text(),/Preencha/);
 assert.equal(el.querySelector('[data-csv]'),null);
 for(const [key,value] of Object.entries(limits)){
  const field=form(0).elements.namedItem(key);
  field.value=value;
  field.dispatchEvent(new w.Event('input',{bubbles:true}));
 }
 el.querySelector('#carteiraCopy').click();
 assert.match(text(),/atualizada/);
 assert.match(el.querySelector('#carteiraTotals').rows[0].textContent,/OS selecionadas220/);
 assert.ok(el.querySelector('[data-csv]'));
 const mode=form(1).elements.policy;
 mode.value='dec';mode.dispatchEvent(new w.Event('input',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,200));
 const select=el.querySelector('#carteiraDecision');
 select.value='b';select.dispatchEvent(new w.Event('change',{bubbles:true}));
 assert.equal(el.querySelector('#carteiraAudit tbody').rows.length,2);
 assert.match(el.querySelector('#carteiraAudit tbody').textContent,/OS-2/);
 assert.doesNotMatch(el.querySelector('#carteiraAudit tbody').textContent,/OS-1/);
 dom.window.close();
 console.log('PASS carteira simulada: limites, classificação, duplicatas, controles e comparação.');
})().catch(error=>{console.error(error);process.exitCode=1;});
