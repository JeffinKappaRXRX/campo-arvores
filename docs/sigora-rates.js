'use strict';
// SIGORA V0.4 — estimador empirico de taxa de ocorrencias por exposicao.
// Modelo Poisson-Gamma com pooling por classe. Nao infere causalidade nem eficacia de intervencao.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraRates=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const positive=x=>typeof x==='number'&&Number.isFinite(x)&&x>0;
 const count=x=>Number.isSafeInteger(x)&&x>=0;
 function fit(records,options={}){
  if(!Array.isArray(records)||!records.length)throw Error('Historico obrigatorio.');
  const priorExposure=options.priorExposure??180;
  if(!positive(priorExposure))throw Error('Exposicao a priori invalida.');
  const groups=new Map(),seen=new Set();
  for(const r of records){
   if(!r||typeof r.assetId!=='string'||!r.assetId||seen.has(r.assetId))throw Error('Ativo ausente ou duplicado.');
   seen.add(r.assetId);
   if(typeof r.assetClass!=='string'||!r.assetClass||!positive(r.exposureDays)||!count(r.events))throw Error('Registro invalido.');
   const g=groups.get(r.assetClass)||{events:0,days:0,assets:0};
   g.events+=r.events;g.days+=r.exposureDays;g.assets++;groups.set(r.assetClass,g);
  }
  const globalEvents=records.reduce((s,r)=>s+r.events,0),globalDays=records.reduce((s,r)=>s+r.exposureDays,0);
  const globalRate=globalEvents/globalDays;
  const classes={};
  for(const [name,g]of groups){
   // Pooling suaviza classes com amostra pequena sem zerar risco de ativos sem ocorrencias.
   classes[name]={ratePerDay:(g.events+globalRate*priorExposure)/(g.days+priorExposure),assets:g.assets,events:g.events,exposureDays:g.days};
  }
  return {classes,globalRate,priorExposure,model:'poisson-gamma-exposure-v0.4',validated:false};
 }
 function predict(model,asset,horizonDays=90){
  if(!positive(horizonDays)||!asset||!positive(asset.exposureDays)||!count(asset.events))throw Error('Dados de predicao invalidos.');
  const c=model?.classes?.[asset.assetClass];if(!c)throw Error('Classe desconhecida: sem extrapolacao automatica.');
  const shape=c.ratePerDay*model.priorExposure+asset.events;
  const rate=model.priorExposure+asset.exposureDays;
  const expected=shape/rate*horizonDays;
  // Probabilidade preditiva de ao menos uma ocorrencia sob mistura Gamma-Poisson.
  const probability=shape===0?0:1-Math.pow(rate/(rate+horizonDays),shape);
  return {assetId:asset.assetId??null,horizonDays,expectedEvents:expected,probabilityAtLeastOne:probability,
   model:model.model,validated:false,
   warning:'Taxa empirica nao demonstra causa, DEC/FEC evitavel nem beneficio de manutencao.'};
 }
 return Object.freeze({fit,predict});
});
