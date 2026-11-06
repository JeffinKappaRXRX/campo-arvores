'use strict';
// Adaptador de dados SIGORA: explicitamente SEM dados reais e SEM API de producao.
// Exige contrato estrito para evitar joins silenciosos e confusao de unidades.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraDataContract=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const date=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 function validateObservation(row){
  const issues=[];
  if(!row||typeof row!=='object')return {valid:false,issues:['Linha ausente']};
  for(const k of ['assetId','assetClass','sourceSystem','sourceRecordId'])if(typeof row[k]!=='string'||!row[k].trim())issues.push(k+' obrigatorio');
  if(!date(row.windowStart)||!date(row.windowEnd)||row.windowEnd<row.windowStart)issues.push('Janela temporal invalida');
  if(!Number.isSafeInteger(row.events)||row.events<0)issues.push('Contagem de eventos invalida');
  if(!finite(row.exposureDays)||row.exposureDays===0)issues.push('Exposicao invalida');
  if(date(row.windowStart)&&date(row.windowEnd)&&finite(row.exposureDays)){
   const days=(Date.parse(row.windowEnd+'T00:00:00Z')-Date.parse(row.windowStart+'T00:00:00Z'))/86400000+1;
   if(row.exposureDays>days+1e-9)issues.push('Exposicao maior que janela');
  }
  return {valid:issues.length===0,issues};
 }
 function validateBatch(rows){
  if(!Array.isArray(rows))throw Error('Lote invalido');
  const keys=new Set(),rejected=[],accepted=[];
  for(const row of rows){
   const check=validateObservation(row);
   const key=[row?.sourceSystem,row?.sourceRecordId].join('|');
   if(keys.has(key))check.issues.push('Registro de origem duplicado');
   keys.add(key);
   (check.issues.length?rejected:accepted).push(check.issues.length?{row,issues:check.issues}:row);
  }
  return {accepted,rejected,complete:rejected.length===0};
 }
 return Object.freeze({validateObservation,validateBatch});
});
