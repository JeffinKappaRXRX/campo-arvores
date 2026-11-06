'use strict';
// SIGORA V0.7 — extracao temporal controlada da base 'ocorr'.
// Dia na Central = deslocamento inteiro desde 2020-01-01 UTC.
// Nao atribui automaticamente ocorrencias a ativos com chave vazia.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraEvents=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const BASE=Date.UTC(2020,0,1),DAY=86400000;
 const iso=n=>new Date(BASE+n*DAY).toISOString().slice(0,10);
 function extract(rows,options={}){
  if(!Array.isArray(rows))throw Error('Ocorrencias devem ser lista');
  const cutoff=options.cutoffDay;
  if(!Number.isSafeInteger(cutoff)||cutoff<0)throw Error('Corte temporal obrigatorio em dias da Central');
  const accepted=[],rejected=[],seen=new Set();
  for(let i=0;i<rows.length;i++){
   const r=rows[i],key=typeof r?.chave==='string'?r.chave.trim():'';
   if(!key||!Number.isSafeInteger(r?.dia)||r.dia<0){rejected.push({index:i,reason:'Chave ou dia invalido'});continue;}
   if(r.dia>cutoff){rejected.push({index:i,reason:'Evento posterior ao corte'});continue;}
   // A base nao garante ID unico de evento; nao remover linhas semelhantes.
   // Identidade de linha por posicao + geracao: permite auditoria, nao deduplicacao entre cargas.
   const eventId=String(options.generation??'unknown')+':ocorr:'+i;
   if(seen.has(eventId))throw Error('Colisao interna');seen.add(eventId);
   accepted.push({eventId,assetId:key,date:iso(r.dia),day:r.dia,
    eventType:r.tipo??null,causeFamily:r.fam??null,
    decHours:typeof r.dec==='number'&&Number.isFinite(r.dec)&&r.dec>=0?r.dec:null,
    source:{dataset:'ocorr',generation:options.generation??null,rowIndex:i},
    note:'Vinculo pela chave informada; conferir cobertura topologica e classificacao de ocorrencia.'});
  }
  return {accepted,rejected,cutoffDate:iso(cutoff),readOnly:true,
   limitations:['Identificador de evento sintetico por posicao','Sem exposicao de ativo','Sem confirmacao de eventos unicos','Sem inferencia causal']};
 }
 return Object.freeze({extract});
});
