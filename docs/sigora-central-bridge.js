'use strict';
// SIGORA V0.6: ponte de leitura do conjunto 'chaves' da Central.
// Sem acesso a rede, sem mutacao, sem inferencia de exposicao, sem inventar beneficio de OS.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraCentralBridge=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function adaptChaves(rows,meta={}){
  if(!Array.isArray(rows))throw Error('chaves deve ser lista');
  const out=[],rejected=[],seen=new Set();
  for(const r of rows){
   const id=typeof r?.chave==='string'?r.chave.trim():'';
   if(!id||seen.has(id)){rejected.push({id:id||null,reason:!id?'ID ausente':'ID duplicado'});continue;}
   seen.add(id);
   const issues=[];
   // Campos auditados no central-man.js: occ90, cli, chi12, decProj.
   const numeric={};
   for(const k of ['occ90','cli','chi12','decProj']){
    const v=r[k];
    if(v==null||v===''){numeric[k]=null;issues.push(k+':ausente');}
    else if(!finite(v)){numeric[k]=null;issues.push(k+':invalido');}
    else numeric[k]=v;
   }
   out.push({assetId:id,assetClass:'CHAVE',feeder:typeof r.alim==='string'?r.alim:null,
    observations:{occurrences90:numeric.occ90,customersDownstream:numeric.cli,customerHours12:numeric.chi12,decProjected:numeric.decProj},
    lineage:{sourceDataset:'chaves',sourceGeneration:meta.generation??null,fields:['chave','occ90','cli','chi12','decProj']},
    issues,
    predictionReady:false,
    reason:'Agregado occ90 sem janela individual, exposicao e identificacao de eventos; nao habilitar ajuste Poisson-Gamma.',
    interventionBenefit:null});
  }
  return {records:out,rejected,readOnly:true};
 }
 return Object.freeze({adaptChaves});
});
