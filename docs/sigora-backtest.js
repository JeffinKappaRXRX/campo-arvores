'use strict';
// SIGORA V0.5: backtesting temporal por origem de dados, sem vazamento futuro.
// Nao mistura horizontes, classes nem observacoes sem periodo de observacao.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraBacktest=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const day=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Data invalida');const t=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(t)||new Date(t).toISOString().slice(0,10)!==s)throw Error('Data invalida');return t/86400000;};
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function evaluate(rows){
  if(!Array.isArray(rows)||!rows.length)throw Error('Observacoes obrigatorias.');
  const seen=new Set();let n=0,brier=0,mae=0,expected=0,actual=0,events=0;
  const byClass=new Map();
  for(const r of rows){
   if(!r||typeof r.assetId!=='string'||!r.assetId||typeof r.assetClass!=='string'||!r.assetClass)throw Error('Ativo/classe invalido.');
   const cutoff=day(r.cutoff),end=day(r.horizonEnd),trainingEnd=day(r.trainingEnd),observedThrough=day(r.observedThrough);
   if(trainingEnd>cutoff||end<=cutoff||observedThrough<end)throw Error('Vazamento temporal ou horizonte incompleto.');
   const key=r.assetId+'|'+r.cutoff+'|'+r.horizonEnd;
   if(seen.has(key))throw Error('Observacao duplicada');seen.add(key);
   if(!finite(r.predictedEvents)||!finite(r.observedEvents)||!Number.isSafeInteger(r.observedEvents)||!finite(r.probabilityAtLeastOne)||r.probabilityAtLeastOne>1)throw Error('Metricas invalidas.');
   const y=Number(r.observedEvents>0),p=r.probabilityAtLeastOne,err=Math.abs(r.predictedEvents-r.observedEvents);
   brier+=(p-y)**2;mae+=err;expected+=r.predictedEvents;actual+=r.observedEvents;events+=y;n++;
   const g=byClass.get(r.assetClass)||{n:0,brier:0,mae:0,expected:0,actual:0};
   g.n++;g.brier+=(p-y)**2;g.mae+=err;g.expected+=r.predictedEvents;g.actual+=r.observedEvents;byClass.set(r.assetClass,g);
  }
  const groups={};for(const [name,g]of byClass)groups[name]={count:g.n,brier:g.brier/g.n,mae:g.mae/g.n,expectedEvents:g.expected,observedEvents:g.actual};
  return {count:n,brier:brier/n,mae:mae/n,expectedEvents:expected,observedEvents:actual,eventRate:events/n,byClass:groups,
   status:'RETROSPECTIVE_EVALUATION',warning:'Metricas retrospectivas nao estabelecem calibracao prospectiva nem efeito causal de intervencoes.'};
 }
 return Object.freeze({evaluate});
});
