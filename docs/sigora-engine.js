'use strict';
// SIGORA V0.1: motor de priorização experimental, isolado e sem acesso a dados de produção.
// Pesos são premissas demonstrativas, NÃO calibradas nem homologadas.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraEngine=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const WEIGHTS=Object.freeze({occurrences90:0.25,decMinutes90:0.25,customers:0.20,loadingPct:0.15,vegetationRisk:0.15});
 const LIMITS=Object.freeze({occurrences90:12,decMinutes90:120,customers:1000,loadingPct:100,vegetationRisk:1});
 const fields=Object.keys(WEIGHTS);
 function valid(v){return typeof v==='number'&&Number.isFinite(v)&&v>=0;}
 function clamp01(v){return Math.max(0,Math.min(1,v));}
 function score(record,weights=WEIGHTS){
  if(!record||typeof record!=='object'||!String(record.id||'').trim())throw Error('Identificador do ativo/trecho obrigatório.');
  if(!weights||fields.some(k=>!valid(weights[k]))||fields.some(k=>weights[k]>1)||Math.abs(fields.reduce((s,k)=>s+weights[k],0)-1)>1e-9)throw Error('Pesos inválidos: informar cinco pesos não negativos cuja soma seja 1.');
  const details=[],missing=[],invalid=[];
  let knownWeight=0,observed=0;
  for(const key of fields){
   const value=record[key];
   if(value===null||value===undefined||value===''){missing.push(key);continue;}
   if(!valid(value)||(key==='vegetationRisk'&&value>1)){invalid.push(key);continue;}
   const normalized=clamp01(value/LIMITS[key]),contribution=weights[key]*normalized;
   knownWeight+=weights[key];observed+=contribution;
   details.push({field:key,value,normalized,weight:weights[key],contribution});
  }
  const coverage=knownWeight;
  // Intervalo conservador: variáveis desconhecidas podem contribuir de zero ao máximo de seu peso.
  const lower=observed*100,upper=(observed+1-knownWeight)*100;
  return {id:String(record.id),status:invalid.length?'INVALID':missing.length?'INCOMPLETE':'COMPLETE',
   score:invalid.length?null:Math.round(lower*100)/100,
   scoreUpper:invalid.length?null:Math.round(upper*100)/100,
   coverage:Math.round(coverage*10000)/10000,missing,invalid,details,
   method:'weighted-normalized-v0.1',calibrated:false,
   note:'Índice experimental de triagem; não é probabilidade de falha, nem estimativa de DEC evitado.'};
 }
 function rank(records,weights){
  if(!Array.isArray(records))throw Error('Lista de ativos inválida.');
  const ids=new Set();
  return records.map(r=>{const s=score(r,weights);if(ids.has(s.id))throw Error('Identificador duplicado: '+s.id);ids.add(s.id);return s;})
   .sort((a,b)=>(a.status==='INVALID')-(b.status==='INVALID')||((b.score??-1)-(a.score??-1))||a.id.localeCompare(b.id));
 }
 return Object.freeze({score,rank,WEIGHTS,LIMITS});
});
