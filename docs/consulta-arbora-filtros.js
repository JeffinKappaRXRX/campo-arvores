'use strict';
globalThis.CampoConsultaFiltros=(()=>{
 const text=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toUpperCase();
 const yesNo=value=>({SIM:'sim',NAO:'nao'}[text(value)]||'');
 const compare=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true,sensitivity:'base'});
 const period=(day,from,through)=>!from&&!through||Boolean(day)&&(!from||day>=from)&&(!through||day<=through);
 function apply(rows,{from,through,inspectors}){
  return rows.filter(row=>period(row.day,from,through)&&(!inspectors.length||inspectors.includes(row.inspector)));
 }
 function summary(rows){
  const times=rows.map(row=>row.seconds).filter(time=>Number.isFinite(time)&&time>0).sort((a,b)=>a-b);
  const sum=times.reduce((total,time)=>total+time,0),measured=times.length;
  return {
   count:rows.length,grouped:rows.filter(row=>yesNo(row.grouped)==='sim').length,missing:rows.filter(row=>row.missing).length,poda:rows.filter(row=>yesNo(row.poda)==='sim').length,
   identification:rows.filter(row=>row.identification).length,measured,
   mean:measured?sum/measured:null,median:measured?(times[Math.floor((measured-1)/2)]+times[Math.floor(measured/2)])/2:null,hours:sum/3600
  };
 }
 function group(rows,property){
  const groups=new Map();
  for(const row of rows){
   const name=row[property]||'Não informado',id=text(name);
   if(!groups.has(id))groups.set(id,{name,rows:[]});
   groups.get(id).rows.push(row);
  }
  return [...groups.values()].map(group=>({name:group.name,...summary(group.rows)})).sort((a,b)=>b.count-a.count||compare(a.name,b.name));
 }
 function routeSummary(routes,{from,through,inspectors},today){
  const asOf=through&&through<today?through:today;
  const rows=new Map();
  for(const route of routes){
   if(inspectors.length&&!inspectors.includes(route.inspector))continue;
   const work=route.daily.filter(day=>period(day.day,from,through));
   const due=route.targets.filter(day=>period(day.day,from,through)).reduce((sum,day)=>sum+day.metres,0);
   if(!work.length&&!due)continue;
   const done=work.reduce((sum,day)=>sum+day.metres+day.sharedMetres,0);
   const expected=route.targets.filter(day=>day.day<=asOf).reduce((sum,day)=>sum+day.metres,0);
   const achieved=route.daily.filter(day=>day.day<=asOf).reduce((sum,day)=>sum+day.metres+day.sharedMetres,0);
   const id=text(route.inspector);
   if(!rows.has(id))rows.set(id,{name:route.inspector,due:0,done:0,credited:0,shared:0,track:0,days:new Set(),lag:0,expected:0});
   const row=rows.get(id);
   row.due+=due;
   row.done+=done;
   row.credited+=Math.min(done,due);
   row.expected+=expected;
   row.shared+=work.reduce((sum,day)=>sum+day.sharedMetres,0);
   row.track+=work.reduce((sum,day)=>sum+day.track,0);
   if(expected>achieved+.01)row.lag++;
   for(const day of work)row.days.add(day.day);
  }
  return [...rows.values()].sort((a,b)=>compare(a.name,b.name));
 }
 return {apply,summary,group,compare,period,routeSummary};
})();
