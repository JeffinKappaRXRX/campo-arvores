'use strict';
const CampoSimulaCarteira=(()=>{
 const bounds={
  capex:'Limite CAPEX (R$)',opex:'Limite OPEX de manutenção (R$)',poda:'Limite Poda e faixa (R$)',
  viva:'Disponibilidade de linha viva (h)',morta:'Disponibilidade de linha morta (h)'
 };
 const resources={capex:'CAPEX',opex:'OPEX de manutenção',poda:'Poda e faixa'};
 const numeric=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const norm=v=>String(v??'').trim().toUpperCase();
 function bucket(recurso){
  const s=norm(recurso);
  if(/^CAPEX(?:\s|$)/.test(s))return 'capex';
  if(/^OPEX(?:\s|$)/.test(s))return 'opex';
  if(/^PODA (?:URBANA|RURAL)(?:\s|$)/.test(s))return 'poda';
  return null;
 }
 function candidates(rows,keys){
  const byKey=new Map(keys.filter(k=>k.chave&&numeric(k.decProj)).map(k=>[norm(k.chave),k.decProj]));
  const pool=new Map();
  for(const row of rows){
   if(row.expurgo||norm(row.tipo)==='INSPEÇÃO')continue;
   const id=String(row.os??'').trim();
   const band=bucket(row.recurso);
   const cents=numeric(row.mat)&&numeric(row.mo)?Math.round((row.mat+row.mo)*100):null;
   const resource=Number.isSafeInteger(cents)?cents:null;
   const alive=row.lv===1||row.lv===true;
   const team=alive?'viva':row.lv===0||row.lv===false?'morta':null;
   const duration=team?(alive?row.minLv:row.minLm):null;
   const rank=numeric(row.seq)&&row.seq>0?row.seq:null;
   const reasons=[];
   if(!id)reasons.push('Identificador da OS ausente');
   if(rank==null)reasons.push('Sem ordem definida na carteira');
   if(!band)reasons.push('Recurso sem classificação reconhecida');
   if(resource==null)reasons.push('Custo incompleto');
   if(!team||!numeric(duration)||duration<=0)reasons.push('Equipe ou duração sem estimativa válida');
   const mapped={id,rank,band,resource,team,duration,reasons,row,dec:byKey.get(norm(row.chave))??null};
   const group=id||Symbol();
   if(pool.has(group)){
    const first=pool.get(group);
    if(!first.reasons.includes('OS duplicada no recorte'))first.reasons.push('OS duplicada no recorte');
   }else pool.set(group,mapped);
  }
  // A ordem publicada sempre desempata, inclusive quando falta DEC na chave.
  const sorted=[...pool.values()].sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity)||a.id.localeCompare(b.id,'pt-BR',{numeric:true}));
  return {
   ordem:sorted,
   dec:[...sorted].sort((a,b)=>(b.dec??-1)-(a.dec??-1))
  };
 }
 function simulate(pool,limits){
  const used={capex:0,opex:0,poda:0,viva:0,morta:0};
  const caps=Object.fromEntries(Object.keys(used).map(key=>[key,key==='viva'||key==='morta'?limits[key]*60:Math.round(limits[key]*100)]));
  let selected=0,review=0;
  const decisions=pool.map(item=>{
   const issues=[...item.reasons];
   if(issues.length){review++;return {status:'Conferir dados',issues};}
   if(item.resource>caps[item.band]-used[item.band])issues.push('Saldo insuficiente de '+resources[item.band]);
   if(item.duration>caps[item.team]-used[item.team]+1e-7)issues.push('Horas insuficientes de linha '+item.team);
   if(issues.length)return {status:'Fora dos limites',issues};
   selected++;
   used[item.band]+=item.resource;
   used[item.team]+=item.duration;
   return {status:'Selecionada',issues:['Cabe nos saldos ao chegar à sua vez']};
  });
  return {selected,review,used,decisions};
 }
 return {bounds,resources,candidates,simulate};
})();
if(typeof module!=='undefined')module.exports=CampoSimulaCarteira;
