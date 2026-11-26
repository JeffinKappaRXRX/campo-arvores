(function(root){
 'use strict';
 const networkKeys=['mt','bt','at'];
 const positions=['Projeção','Lateral','Abaixo da rede'];
 const text=value=>String(value??'').trim();
 const numeric=value=>(typeof value==='number'||typeof value==='string')&&text(value)!==''&&Number.isFinite(Number(value));
 const positive=value=>numeric(value)&&Number(value)>0;
 const yes=value=>value===true||value==='sim';
 const answered=value=>value==='sim'||value==='nao';
 const selectedNetworks=r=>networkKeys.filter(key=>yes(r[key]));
 function missing(r){
  const out=[];
  const add=(field,label)=>out.push({field,label});
  if(!text(r.inspector))add('inspector','Inspetor');
  if(!text(r.feeder))add('feeder','Alimentador / localidade');
  if(!numeric(r.lat)||Math.abs(Number(r.lat))>90)add('lat','Latitude válida');
  if(!numeric(r.lon)||Math.abs(Number(r.lon))>180)add('lon','Longitude válida');
  if(!String(r.id||r.editing||'').startsWith('vera-')&&!r.photos?.some(p=>typeof p?.original==='string'&&text(p.original)))
   add('photos','Ao menos uma foto');
  if(!positive(r.height))add('height','Altura da árvore');
  const network=selectedNetworks(r);
  if(network.length&&!text(r.pole)&&!text(r.span))add('pole','ID do poste ou do vão');
  for(const key of network){
   const distance=r[key+'Distance'];
   if(!numeric(distance)||Number(distance)<0)add(key+'Distance','Distância copa → '+key.toUpperCase());
  }
  return out;
 }
 function formMissing(r){
  const out=missing(r),network=selectedNetworks(r);
  const add=(field,label)=>out.push({field,label});
  if(!network.length&&!yes(r.noNetwork))add('noNetwork','Rede MT, BT, AT ou sem rede próxima');
  if(network.length&&yes(r.noNetwork))add('noNetwork','Marque as redes presentes ou sem rede próxima');
  if(!answered(r.grouped))add('grouped','Poda agrupada');
  if(r.grouped!=='sim'&&!positive(r.dap)&&!positive(r.circ))add('dap','DAP ou CAP');
  if(!text(r.species))add('species','Espécie ou “Não identificada”');
  if(!answered(r.poda))add('poda','Necessidade de poda');
  if(!['publico','privado'].includes(r.treeSite))add('treeSite','Local público ou privado');
  if(network.length){
   if(!positions.includes(r.position))add('position','Posição em relação à rede');
   if(!answered(r.projection))add('projection','Árvore em projeção');
   else if(r.position==='Projeção'&&r.projection!=='sim')add('projection','Projeção incompatível com a posição');
  }
  return out;
 }
 function unknownSpecies(r){return !text(r.species)||/^(árvore|arvore|não identificad[ao]|nao identificad[ao]|desconhecid[ao])$/i.test(text(r.species));}
 function identificationPending(r){return !r.deletedRemote&&(unknownSpecies(r)||['queued','error','suggested'].includes(r.plantIdentification?.status));}
 const savedMissing=r=>r.formValidation===1?formMissing(r):missing(r);
 root.CampoInspectionRules={missing,formMissing,savedMissing,unknownSpecies,identificationPending};
 if(typeof module!=='undefined')module.exports=root.CampoInspectionRules;
})(typeof globalThis!=='undefined'?globalThis:this);
