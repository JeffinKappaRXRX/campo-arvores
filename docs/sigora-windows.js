'use strict';
// SIGORA V0.8 — agregacao de eventos por janelas com exposicao EXPLICITA.
// Nao deduz disponibilidade ou exposicao de um ativo a partir de zero ocorrencias.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraWindows=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const day=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error('Data ISO invalida');const n=Date.parse(s+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==s)throw Error('Data ISO invalida');return n/86400000;};
 function aggregate(events,assets,window){
  if(!Array.isArray(events)||!Array.isArray(assets))throw Error('Entradas invalidas');
  const start=day(window?.start),end=day(window?.end);
  if(end<start)throw Error('Janela invertida');
  const length=end-start+1,ids=new Set(),out=[],rejected=[];
  const counts=new Map();
  const seenEvents=new Set();
  for(const e of events){
   if(typeof e?.eventId!=='string'||!e.eventId||seenEvents.has(e.eventId))throw Error('ID de evento ausente ou duplicado');
   seenEvents.add(e.eventId);
   const d=day(e.date);
   if(d>=start&&d<=end){
    if(typeof e.assetId!=='string'||!e.assetId)throw Error('Ativo de evento invalido');
    counts.set(e.assetId,(counts.get(e.assetId)||0)+1);
   }
  }
  for(const a of assets){
   const id=a?.assetId;
   if(typeof id!=='string'||!id||ids.has(id)){rejected.push({assetId:id??null,reason:'Ativo ausente ou duplicado'});continue;}
   ids.add(id);
   if(typeof a.assetClass!=='string'||!a.assetClass){rejected.push({assetId:id,reason:'Classe ausente'});continue;}
   if(!Number.isInteger(a.exposureDays)||a.exposureDays<1||a.exposureDays>length){rejected.push({assetId:id,reason:'Exposicao nao comprovada ou fora da janela'});continue;}
   if(typeof a.exposureEvidence!=='string'||!a.exposureEvidence.trim()){rejected.push({assetId:id,reason:'Evidencia de exposicao ausente'});continue;}
   out.push({assetId:id,assetClass:a.assetClass,windowStart:window.start,windowEnd:window.end,
    exposureDays:a.exposureDays,events:counts.get(id)||0,
    exposureEvidence:a.exposureEvidence,sourceSystem:a.sourceSystem??null,
    sourceRecordId:a.sourceRecordId??null});
  }
  const unknownAssets=[...counts.keys()].filter(id=>!ids.has(id));
  return {observations:out,rejected,unknownAssets,windowDays:length,
   note:'Somente ativos com exposicao comprovada sao incluidos; eventos desconhecidos sao reportados.'};
 }
 return Object.freeze({aggregate});
});
