const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {JSDOM}=require('jsdom');

const dom=new JSDOM('<main id="view"></main>',{url:'https://campo.test',runScripts:'outside-only'});
const context=dom.getInternalVMContext();
function load(name){vm.runInContext(fs.readFileSync('docs/'+name,'utf8'),context);}
load('central-core.js');
const C=vm.runInContext('Central',context);
C.views={};
C.dados.resumo={
  corteDec:'2026-11-14',fontes:[],
  orc:{ano:2026,sigcos:[{anual:1000,forecast:900}]}
};
C.dados.opex={n:2,c:{ano:[2026,2027],o:[500,800],f:[450,600]}};
C.dados.os_abertas={n:4,c:{
  tipo:['PODA','MANUTENÇÃO','INSPEÇÃO','MANUTENÇÃO'],
  alim:['A1','A2','A1','A1'],
  pri:['ALTA','MEDIA','ALTA','ALTA'],
  polo:['RBR','CZS','RBR','RBR'],expurgo:[false,false,false,true]
}};
load('central-sigora.js');
const el=dom.window.document.getElementById('view');
C.setGlobalFilters({polo:'RBR'});
C.views.inicio.render({alim:['A1'],pri:['ALTA']},el);
assert.equal(el.querySelectorAll('.sigora-chart progress').length,1);
assert.equal(el.querySelector('.sigora-chart progress').value,1);
assert.equal(el.querySelector('.sigora-chart progress').getAttribute('aria-label'),'PODA');
assert.ok(el.textContent.includes('O ARBORA fornece inspeções de vegetação'));
assert.ok(el.querySelector('a[href="gestao.html#resumo"]'));
C.views.inicio.render({alim:['A2']},el);
assert.equal(el.querySelectorAll('.sigora-chart progress').length,0);
C.views.cenarios.render({},el);
const comparison=()=>[...el.querySelectorAll('#sigoraComparison tr')].map(r=>[...r.cells].map(c=>c.textContent));
const capexB=el.querySelector('[data-sigora-scenario="1"] [name="capex-forecast"]');
function enter(field,value){field.value=value;field.dispatchEvent(new dom.window.Event('input',{bubbles:true}));}
assert.deepEqual(comparison()[1],['CAPEX · Margem','R$ 100','R$ 100','R$ 0']);
assert.deepEqual(comparison()[3],['OPEX · Margem','R$ 50','R$ 50','R$ 0']);
enter(capexB,'1200');
assert.deepEqual(comparison()[1],['CAPEX · Margem','R$ 100','R$ -200','R$ -300']);
C.views.cenarios.render({},el);
assert.equal(comparison()[1][2],'R$ -200');
el.querySelector('[data-sigora-reset="1"]').click();
assert.equal(comparison()[1][2],'R$ 100');
enter(el.querySelector('[data-sigora-scenario="1"] [name="capex-forecast"]'),'');
assert.equal(comparison()[1][2],'—');
assert.match(el.querySelector('#sigoraScenarioStatus').textContent,/Preencha/);
C.dados.resumo.orc.sigcos[0].forecast=null;
C.views.cenarios.render({},el);
assert.equal(comparison()[1][1],'—');
dom.window.close();
console.log('PASS SIGORA: recorte das OS, dados ausentes e cenários independentes.');
