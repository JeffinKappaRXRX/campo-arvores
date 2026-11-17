'use strict';
const SigoraGerencial=(()=>{
 const norm=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const trecho=value=>{const match=norm(value).match(/^(?:T\s*)?([123])$/);return match?'T'+match[1]:'';};
 const rowsBy=(rows,key)=>{
  const out=new Map();
  for(const row of rows){const k=key(row);if(!k)continue;if(!out.has(k))out.set(k,[]);out.get(k).push(row);}
  return out;
 };
 const declared=value=>!['','0','NAO','FALSE','-','—','SEM OS'].includes(norm(value))&&!norm(value).startsWith('CRIAR OS');
 const orderIsInspection=o=>!o.expurgo&&/^INSPECAO(?:\s|$)/.test(norm(o.tipo));
 function inspections({keys,history,pending,executed,complete,toDay,now,cutoff}){
  const open=rowsBy(pending.filter(orderIsInspection),o=>norm(o.chave));
  const done=rowsBy(executed.filter(orderIsInspection),o=>norm(o.chave));
  const extra=rowsBy(history,k=>norm(k.chave));
  const groups=rowsBy(keys,k=>norm(k.chave)),result=[];
  for(const [id,duplicates] of groups){
   const k=duplicates[0],tr=trecho(k.trecho??k.tr);
   if(!tr)continue;
   const h=extra.get(id)?.[0]||{},osOpen=open.get(id)||[],osDone=done.get(id)||[];
   const evidence=[k.uInsp,k.dataUltimaInspecao,k.uInspData,h.uInsp,h.dataUltimaInspecao,...osDone.map(o=>o.dia)].map(toDay).filter(x=>Number.isInteger(x)&&x<=now);
   const last=evidence.length?Math.max(...evidence):null,mark=cutoff(k),inDate=last!=null&&last>=mark;
   const references=[k.numOSInspecao,k.num_os_inspecao,k.osInsp].filter(declared);
   const openConfirmed=osOpen.length>0;
   const hasOrder=openConfirmed||osDone.length>0||references.length>0;
   if(tr==='T3'&&!hasOrder)continue;
   const knownWithoutDate=osDone.some(o=>toDay(o.dia)==null)||(last==null&&(Number(k.qtdInsp)>0||Number(h.postesInsp)>0||Number(k.postesInsp)>0));
   let status;
   if(duplicates.length>1||!Number.isFinite(mark))status='Conferir dados';
   else if(inDate)status='Inspecionada';
   else if(openConfirmed)status='OS de inspeção aberta';
   else if(knownWithoutDate)status='Conferir dados';
   else if(references.length>0||!complete)status='Conferir dados';
   else status='Criar OS de inspeção';
   const count=inDate?(h.postesInsp??k.postesInsp):null;
   const covered=Number.isFinite(count)&&count>=0?count:null;
   const os=[...new Set(osOpen.map(o=>o.os).filter(Boolean))];
   result.push({...k,tr,last,mark,status,covered,os:os.join(', ')||((references[0]===true||references[0]===1)?'Referência no cadastro':references[0]||'')});
  }
  return result;
 }
 function progress(rows){
  const out={T1:{},T2:{},T3:{}};
  for(const [key,group] of Object.entries(out)){
   const rec=rows.filter(r=>r.tr===key);
   const count=status=>rec.filter(x=>x.status===status).length;
   const measured=rec.filter(r=>r.covered!=null);
   Object.assign(group,{key,total:rec.length,done:count('Inspecionada'),open:count('OS de inspeção aberta'),missing:count('Criar OS de inspeção'),review:count('Conferir dados'),structures:measured.reduce((n,r)=>n+r.covered,0),measured:measured.length,inventory:rec.some(r=>Number.isFinite(r.postes))?rec.reduce((n,r)=>n+(Number.isFinite(r.postes)?r.postes:0),0):null});
  }
  return Object.values(out);
 }
 function causes(rows,{year,month,conj,match}){
  const grouped=new Map(),totals=new Map();
  for(const row of rows){
   const conjunto=String(row.CONJUNTO??row.conj??'').trim(),cause=String(row.fam||'Causa não classificada');
   if(!conjunto||Number(row.ano)!==year||(month&&Number(row.mes)!==month)||!match(conj,conjunto)||!Number.isFinite(row.decCj))continue;
   const id=JSON.stringify([conjunto,cause]);
   if(!grouped.has(id))grouped.set(id,{conjunto,cause,dec:0});
   grouped.get(id).dec+=row.decCj;
   totals.set(conjunto,(totals.get(conjunto)||0)+row.decCj);
  }
  return [...grouped.values()].map(x=>({...x,share:totals.get(x.conjunto)>0?x.dec/totals.get(x.conjunto):null})).sort((a,b)=>a.conjunto.localeCompare(b.conjunto,'pt-BR',{numeric:true})||b.dec-a.dec);
 }
 return {inspections,progress,causes,norm};
})();
if(typeof module!=='undefined')module.exports=SigoraGerencial;
