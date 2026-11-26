(function(root){
 'use strict';
 const labels={
  photos:'Sem fotos',pole:'ID do poste',span:'ID do vão MT',species:'Nome da árvore',
  btDistance:'Distância da copa à BT',mtDistance:'Distância da copa à MT',atDistance:'Distância da copa à AT',
  coordinates:'Coordenadas',feeder:'Alimentador',height:'Altura da árvore',trunk:'DAP ou CAP',
  poda:'Necessidade de poda',projection:'Árvore em projeção',treeSite:'Área pública ou privada',
  photoReview:'Fotos a confirmar',field:'Revisão em campo'
 };
 const keys=Object.keys(labels).filter(key=>key!=='field');
 const bits=Object.fromEntries(keys.map((key,index)=>[key,1<<index]));
 const text=value=>String(value??'').trim();
 const numeric=value=>(typeof value==='number'||typeof value==='string')&&text(value)!==''&&Number.isFinite(Number(value));
 const within=(value,max)=>numeric(value)&&Math.abs(Number(value))<=max;
 const positive=value=>numeric(value)&&Number(value)>0;
 const yes=value=>value===true||text(value).toLowerCase()==='sim';
 const assessed=value=>['sim','nao','não'].includes(text(value).toLowerCase());
 function photos(record){
  if(record.archivedPhotoEvidence===true||(Array.isArray(record.photos)?record.photos:[]).some(p=>p&&(p.assetId||p.original||p.annotated||p.originalUrl||p.georreferencedUrl)))return 'present';
  // A folder or an imported link can exist without a photograph.
  const direct=record.photoReference;
  if(/^https:\/\/[^\s]+\.(?:jpe?g|png|webp|heic)(?:[?#][^\s]*)?$/i.test(text(direct)))return 'present';
  if(record.archivedPhotoEvidence==='unknown'||text(direct)||!Array.isArray(record.photos)&&text(record.folderUrl||record.googleReceipt?.folderUrl))return 'unknown';
  return 'missing';
 }
 function mask(record){
  let result=0;
  const add=key=>{result|=bits[key];};
  const state=photos(record);
  if(state==='missing')add('photos');
  else if(state==='unknown')add('photoReview');
  const network=['mt','bt','at'].filter(key=>yes(record[key]));
  if(record.formValidation===1){
   if(network.length&&!text(record.pole)&&!text(record.span))add('pole');
  }else{
   if(network.length&&!text(record.pole))add('pole');
   if(network.includes('mt')&&!text(record.span))add('span');
  }
  for(const key of network){
   const distance=record[key+'Distance'];
   if(!numeric(distance)||Number(distance)<0)add(key+'Distance');
  }
  if(root.CampoInspectionRules.unknownSpecies(record))add('species');
  if(!within(record.lat,90)||!within(record.lon,180))add('coordinates');
  if(!text(record.feeder))add('feeder');
  if(!positive(record.height))add('height');
  if(!(record.formValidation===1&&yes(record.grouped))&&!positive(record.dap)&&!positive(record.circ))add('trunk');
  if(!assessed(record.poda))add('poda');
  if(!yes(record.noNetwork)&&!assessed(record.projection))add('projection');
  if(!['publico','privado'].includes(record.treeSite))add('treeSite');
  return result;
 }
 const issues=value=>keys.filter(key=>Boolean(value&bits[key]));
 const has=(value,key)=>Boolean(value&bits[key]);
 function summary(values){
  const counts=Object.fromEntries(keys.map(key=>[key,0]));
  let total=0,flagged=0;
  for(const value of values){
   total++;
   if(value)flagged++;
   for(const key of keys)if(has(value,key))counts[key]++;
  }
  return {total,flagged,counts,rate:total?counts.photos/total:0};
 }
 root.CampoRegistrationQuality={labels,keys,photos,mask,issues,has,summary};
 if(typeof module!=='undefined')module.exports=root.CampoRegistrationQuality;
})(typeof globalThis!=='undefined'?globalThis:this);
