'use strict';
// Mesma fórmula de risco da análise VERA (analise_vera.py), para as inspeções novas do campo.
// tests/gestao-risco.cjs compara o resultado com o Python; qualquer mudança aqui precisa ser igual lá.
(()=>{
 const H_MT=9,H_BT=7,ESBELTEZ=80,FRAGEIS=['EUCALIPTO','EMBAÚBA','EMBAUBA','LEUCENA','BAMBU','BAMBÚ','PINHEIRO','PINUS','ACÁCIA','FLAMBOYANT','PAU-DE-BALSA','PAU DE BALSA','GUAPURUVU'],ALERTA=/crítico|inclinad|mort|decepad/i,PESO={T1:1,T2:.8},SOBE={'MÉDIO':'ALTO','BAIXO':'MÉDIO','SEM RISCO':'MÉDIO'};
 const rede=v=>{const n=num(v);return n<0?NaN:n;},num=v=>{if(v===null||v===undefined||v==='')return NaN;const n=Number(String(v).replace(',','.'));return Number.isFinite(n)?n:NaN;};
 const round=(v,d)=>{const f=10**d;return Math.round(v*f)/f;};
 // Entrada: altura, distâncias (m), DAP (cm), espécie, alerta, projeção, clientes, trecho, vendaval, clientesMax.
 function calcular(a){let h=num(a.altura);if(h<=0)h=NaN;if(h>40)h=round(h/10,1);const dmt=rede(a.distMT),dbt=rede(a.distBT),raio=Number.isFinite(h)?Math.min(6,Math.max(1.5,.25*h)):NaN;let d=num(a.distRede);if(!Number.isFinite(d)){const base=Number.isFinite(dmt)?dmt:Number.isFinite(dbt)?dbt:1;d=base+raio;}
  const alcanca=(alt)=>Number.isFinite(h)&&Number.isFinite(d)&&h*h>=d*d+alt*alt,alcancaMT=alcanca(H_MT),alcancaBT=alcanca(H_BT),copa=dmt<=.5||dbt<=.3;
  const dap=num(a.dap),altaFina=Boolean(a.dapMedido)&&dap>0&&Number.isFinite(h)&&h/(dap/100)>=ESBELTEZ,especie=String(a.especie||'').toUpperCase(),fragil=FRAGEIS.some(e=>especie.includes(e)),alerta=ALERTA.test(String(a.alerta||''));
  const prob=Math.max(0,Math.min(100,(alcancaMT?40:0)+(!alcancaMT&&alcancaBT?25:0)+(copa?20:0)+(dmt>.5&&dmt<=1.5?10:0)+(altaFina?15:0)+(fragil?10:0)+(h>=15?10:0)+(alerta?15:0)+(a.projecao==='SIM'?10:0)));
  const clientes=num(a.clientes)||0,maximo=Math.max(num(a.clientesMax)||0,1);let impacto=Math.sqrt(clientes/maximo)*(PESO[a.trecho]??.6)*(a.vendaval==='Sim'?1.15:1);impacto=round(Math.max(0,Math.min(1,impacto)),3);
  const prioridade=round(prob*(.4+.6*impacto),1),real=alcancaMT||alcancaBT||copa,calculada=!real?'SEM RISCO':prioridade>=60?'CRÍTICO':prioridade>=40?'ALTO':prioridade>=25?'MÉDIO':'BAIXO',forte=calculada==='CRÍTICO'||calculada==='ALTO';
  // Foto que não sustenta manda revisar em campo; foto que confirma sobe um nível.
  let classe=calculada;if(a.verificacao==='NÃO CONFIRMADA'&&forte)classe='REVISAR EM CAMPO';else if(a.verificacao==='CONFIRMADA'&&a.elevar!==false)classe=SOBE[calculada]||calculada;
  let acao=real?'Monitorar no ciclo':'Sem ação';if(classe==='CRÍTICO'||classe==='ALTO'){if(forte&&alcancaMT&&(altaFina||fragil||ALERTA.test(String(a.obsAcao??a.alerta??''))||h>=15))acao='Supressão (com compensação SEMEIA)';else acao=copa||alcancaMT?'Poda de redução/afastamento':'Poda de limpeza';}
  const motivo=[];if(alcancaMT)motivo.push('alcança a MT se cair ('+h+' m a '+round(d,1)+' m da rede)');else if(alcancaBT)motivo.push('alcança a BT se cair ('+h+' m)');if(copa)motivo.push('copa encostada na rede');if(altaFina)motivo.push('alta e fina');if(fragil)motivo.push('espécie de queda/quebra frequente');if(alerta)motivo.push('alerta na observação do campo');
  return {classeCalculada:calculada,altura:Number.isFinite(h)?h:null,distRede:Number.isFinite(d)?round(d,1):null,prob,impacto,prioridade,classe,acao,alcancaMT:alcancaMT?'SIM':'NÃO',motivo:motivo.join('; ')};}
 const plain=s=>String(s||'').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g,'').trim();
 const nomes=s=>plain(s).split(/[,;/]/).map(x=>x.trim()).filter(Boolean);
 const metros=(a,b)=>{const y=(a.lat-b.lat)*111320,x=(a.lon-b.lon)*111320*Math.cos(a.lat*Math.PI/180);return Math.hypot(x,y);};
 // Possível duplicata: mesma espécie a poucos metros. Árvores diferentes lado a lado não são marcadas.
 function duplicatas(novas,base,limite=15){const cell=.0005,grid=new Map(),key=(la,lo)=>Math.floor(la/cell)+':'+Math.floor(lo/cell);for(const b of base)for(const p of b.pontos){const k=key(p.lat,p.lon);if(!grid.has(k))grid.set(k,[]);grid.get(k).push({...p,id:b.id,especies:nomes(b.especies)});}
  const out=new Map();for(const n of novas){if(!Number.isFinite(n.lat)||!Number.isFinite(n.lon))continue;const esp=nomes(n.especies),ci=Math.floor(n.lat/cell),cj=Math.floor(n.lon/cell);let melhor=null;for(let i=ci-1;i<=ci+1;i++)for(let j=cj-1;j<=cj+1;j++)for(const c of grid.get(i+':'+j)||[]){if(c.id===n.id||!c.especies.some(e=>esp.includes(e)))continue;const m=metros(n,c);if(m<=limite&&(!melhor||m<melhor.m))melhor={id:c.id,m:Math.round(m)};}if(melhor)out.set(n.id,melhor);}return out;}
 const api={calcular,duplicatas};if(typeof module!=='undefined')module.exports=api;if(typeof window!=='undefined')window.CampoRisco=api;
})();
