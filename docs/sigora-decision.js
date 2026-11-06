'use strict';
// SIGORA: núcleo de decisão por restrições e dominância, sem pesos configuráveis.
// Protótipo determinístico. Benefícios devem vir de modelos validados, não de notas subjetivas.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraDecision=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function assess(item){
  if(!item||typeof item.id!=='string'||!item.id.trim())throw Error('ID obrigatório.');
  const reasons=[],missing=[];
  if(item.safetyBlocked===true)reasons.push('Bloqueio de segurança');
  if(item.technicalFeasible===false)reasons.push('Alternativa tecnicamente inviável');
  if(item.materialAvailable===false)reasons.push('Material indisponível');
  if(item.crewAvailable===false)reasons.push('Equipe indisponível');
  for(const k of ['cost','expectedRiskReduction','expectedDecReduction','expectedFecReduction'])if(!finite(item[k]))missing.push(k);
  if(!['CAPEX','OPEX'].includes(item.budgetType))missing.push('budgetType');
  return {id:item.id,eligible:!reasons.length&&!missing.length,status:reasons.length?'BLOCKED':missing.length?'INSUFFICIENT_DATA':'ELIGIBLE',reasons,missing};
 }
 function dominates(a,b){
  const benefits=['expectedRiskReduction','expectedDecReduction','expectedFecReduction'];
  return a.cost<=b.cost&&benefits.every(k=>a[k]>=b[k])&&(a.cost<b.cost||benefits.some(k=>a[k]>b[k]));
 }
 function frontier(items){
  if(!Array.isArray(items))throw Error('Lista inválida');
  const seen=new Set(),evaluated=items.map(x=>{const a=assess(x);if(seen.has(a.id))throw Error('ID duplicado: '+a.id);seen.add(a.id);return {...a,item:x};});
  const eligible=evaluated.filter(x=>x.eligible);
  return {nondominated:eligible.filter(a=>!eligible.some(b=>a!==b&&dominates(b.item,a.item))).map(x=>x.id),
   dominated:eligible.filter(a=>eligible.some(b=>a!==b&&dominates(b.item,a.item))).map(x=>x.id),
   blocked:evaluated.filter(x=>!x.eligible).map(({id,status,reasons,missing})=>({id,status,reasons,missing}))};
 }
 return Object.freeze({assess,dominates,frontier});
});
