'use strict';
globalThis.CampoConsultaFiltros=(()=>{
 const fieldSource='Campo (prévia)';
 const text=value=>String(value??'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toUpperCase();
 const key=value=>text(value).replace(/[^A-Z0-9]/g,'');
 const section=value=>{const part=key(value).replace(/^TRECHO/,'').replace(/^T/,'');return /^[123]$/.test(part)?'T'+part:'';};
 const yesNo=value=>({SIM:'sim',NAO:'nao'}[text(value)]||'');
 const compare=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true,sensitivity:'base'});
 const period=(day,from,through)=>!from&&!through||Boolean(day)&&(!from||day>=from)&&(!through||day<=through);
 const selected=(values,value,normalize=text)=>!values.length||values.some(item=>normalize(item)===normalize(value));
 function keys(value){
  return [...new Set(String(value||'').split(/[^\p{L}\p{N}_-]+/u).map(key).filter(Boolean))];
 }
 function prepare(data){
  const fieldById=new Map(data.field.map(row=>[row.id,row]));
  const park=data.park.map(tree=>{
   const field=fieldById.get(tree.campoId||(tree.origem===fieldSource?tree.id:''));
   const source=tree.origem===fieldSource?'campo':'vera';
   return {
    ...tree,field,source,ref:source+':'+tree.id,feeder:tree.alimentador||field?.feeder,
    section:section(tree.trecho),day:field?.day||tree.day,inspector:field?.inspector,pruning:yesNo(field?.poda||tree.poda),
    keys:keys([tree.chave,field?.key].filter(Boolean).join(' ')),
    index:[tree.id,field?.id,tree.especies,field?.species,tree.poste,field?.pole,tree.vao,field?.span,tree.chave,field?.key,tree.alimentador,field?.feeder,field?.inspector,field?.os].map(text).join(' ')
   };
  });
  const values=(rows,get,normalize=text)=>[...new Map(rows.map(get).filter(Boolean).sort(compare).map(value=>[normalize(value),value])).values()];
  return {
   park,byRef:new Map(park.map(tree=>[tree.ref,tree])),
   inspectors:values([...data.field,...data.routes],row=>row.inspector),
   feeders:values(park,row=>row.feeder,key),
   sections:values(park,row=>row.section),
   risks:values(park,row=>row.classe)
  };
 }
 function apply(prepared,filter){
  const {from,through,source,inspectors,feeders,sections,risks,pruning}=filter;
  const codes=keys(filter.keys),terms=text(filter.query).split(/\s+/).filter(Boolean);
  const park=prepared.park.filter(tree=>
   period(tree.day,from,through)&&(!source||tree.source===source)&&selected(inspectors,tree.inspector)&&
   selected(feeders,tree.feeder,key)&&selected(sections,tree.section)&&selected(risks,tree.classe)&&
   (!pruning||tree.pruning===pruning)&&(!codes.length||codes.some(code=>tree.keys.includes(code)))&&
   terms.every(term=>tree.index.includes(term))
  );
  const field=[...new Map(park.filter(tree=>tree.field).map(tree=>[tree.field.id,tree.field])).values()];
  return {park,field};
 }
 function summary(rows){
  const times=rows.map(row=>row.seconds).filter(time=>Number.isFinite(time)&&time>0).sort((a,b)=>a-b);
  const sum=times.reduce((total,time)=>total+time,0),measured=times.length;
  return {
   count:rows.length,poda:rows.filter(row=>yesNo(row.poda)==='sim').length,
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
   if(!selected(inspectors,route.inspector))continue;
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
 return {prepare,apply,summary,group,compare,routeSummary,keys};
})();
