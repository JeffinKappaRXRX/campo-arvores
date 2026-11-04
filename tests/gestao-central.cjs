const assert=require('node:assert');const fs=require('node:fs');const path=require('node:path');
// Toda tela da central tem entrada no painel de gestão, e as abas próprias do painel continuam lá.
const docs=path.join(__dirname,'../docs'),central=fs.readFileSync(path.join(docs,'central.html'),'utf8'),gestao=fs.readFileSync(path.join(docs,'gestao.html'),'utf8');
const hrefs=t=>[...t.matchAll(/href="([^"]+)"/g)].map(m=>m[1]);
const telas=hrefs(central).filter(h=>/^#[a-z0-9]+$/.test(h)).map(h=>h.slice(1)),painel=hrefs(gestao);
assert.ok(telas.length>=30,'lista de telas da central');
for(const t of telas)assert.ok(painel.includes('#c-'+t),'falta no painel: '+t);
for(const a of ['resumo','mapa','risco','cadastros','produtividade','auditoria','equipe']){assert.ok(painel.includes('#'+a),'aba do painel: '+a);assert.ok(gestao.includes('id="'+a+'"'),'seção do painel: '+a);}
assert.ok(!painel.some(h=>h.startsWith('central.html')),'o painel não sai para outra página');
const scripts=[...gestao.matchAll(/<script src="([^"]+)"/g)].map(m=>m[1]);assert.ok(scripts.indexOf('gestao-central.js')>scripts.indexOf('gestao.js'),'carrega depois do painel');
assert.ok(/id="quadroCentral"/.test(gestao)&&/id="areaCentral"[^>]*hidden/.test(gestao),'quadro começa oculto');
assert.ok(central.indexOf("embed=1")<central.indexOf('</head>'),'central embutida decidida antes de desenhar');
console.log('PASS telas da central dentro do painel de gestão');
