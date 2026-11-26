'use strict';
const CampoVeraProgress=(()=>{
 const FULL=10000;
 const targets=[[2026,269000],[2027,368600],[2028,368600]];
 const dayPattern=/^(20\d{2})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
 const upper=value=>String(value||'').trim().toUpperCase();
 const key=(feeder,block)=>feeder+' / '+block;
 function combineOrders(history,sgm){
  const byId=new Map((history.orders||[]).map(order=>[order.id,order]));
  for(const order of sgm.orders||[]){
   const old=byId.get(order.id);
   byId.set(order.id,old?{...order,inspector:order.inspector||old.inspector,team:order.team||old.team}:order);
  }
  return [...byId.values()];
 }
 function ledger(history={},sgm={},snapshot={}){
  const meta=new Map(),events=[];
  function add(row,source,canonical=true,start=0,end=FULL){
   const [day,rawId,metres,feeder,block,section,zone,order]=row;
   const id=String(rawId??'').trim();
   if(!dayPattern.test(day)||!id||!(metres>0)||!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>FULL||start>=end)return;
   if(!meta.has(id)||canonical)meta.set(id,{metres,feeder:upper(feeder),block:upper(block),section:String(section||''),zone:upper(zone)});
   events.push({day,id,source,start,end,order});
  }
  for(const row of history.coverage||[])add(row,'VERA');
  for(const row of sgm.coverage||[])add(row,'SGM');
  const routes=new Map((snapshot.routes||[]).filter(route=>!route.homologation&&!route.deletedAt&&
   !['homologacao','gestao_homologacao'].includes(route.returned?.reasonCode)).map(route=>[route.id,new Map(route.spans.map(span=>[span.id,span]))]));
  const routeSpans=new Map();
  for(const spans of routes.values())for(const [id,span] of spans)routeSpans.set(id,span);
  for(const visit of snapshot.visits||[]){
   const spans=routes.get(visit.routeId);
   if(!spans)continue;
   for(const {spanId,start,end} of visit.ranges||[]){
    const span=spans.get(spanId);
    if(!span)continue;
    add([visit.day,spanId,span.metres,span.feeder,span.block,span.section,span.zone],'ARBORA',false,start,end);
    for(const peer of span.parallel||[]){
     const related=routeSpans.get(peer.id)||meta.get(String(peer.id))||peer;
     const a=peer.flip?FULL-end:start,b=peer.flip?FULL-start:end;
     add([visit.day,peer.id,related.metres,related.feeder,related.block,related.section,related.zone],'ARBORA',false,a,b);
    }
   }
  }
  events.sort((a,b)=>a.day.localeCompare(b.day)||Number(b.source==='VERA')-Number(a.source==='VERA'));
  const routesOnly=events.filter(event=>event.source==='ARBORA');
  return {credited:credit(events,meta),routesOnly:credit(routesOnly,meta),events,trees:history.trees||[],orders:combineOrders(history,sgm)};
 }
 function credit(events,meta){
  const ranges=new Map(),credited=[];
  for(const event of events){
   const scope=(event.day<'2026'?'historic':'plan')+'|'+event.id;
   const old=ranges.get(scope)||[];
   const merged=CampoRoutes.merge([...old,[event.start,event.end]]);
   const sum=items=>items.reduce((n,[a,b])=>n+b-a,0);
   const length=sum(merged)-sum(old);
   if(length<=0)continue;
   ranges.set(scope,merged);
   const span=meta.get(event.id);
   credited.push({...event,...span,metres:span.metres*length/FULL});
  }
  return credited;
 }
 function select(data,options){
  const {period,field,feeder='',section='',zone=''}=options;
  const year=period.slice(0,4),month=period.slice(0,7);
  const matches=(f,s,z)=>(!feeder||f===feeder)&&(!section||(section==='12'?['1','2'].includes(s):s===section))&&(!zone||z===zone);
  const bucket=day=>field==='day'?(day.startsWith(month)?day:''):(day.startsWith(year)?day.slice(0,7):'');
  const rows=new Map();
  const get=when=>{
   if(!rows.has(when))rows.set(when,{when,metres:0,trees:0,spans:new Set(),keys:new Set(),sources:new Map()});
   return rows.get(when);
  };
  const feeders=new Map();
  for(const row of data.credited){
   const when=bucket(row.day);
   if(!when||!matches(row.feeder,row.section,row.zone))continue;
   const entry=get(when);
   entry.metres+=row.metres;
   entry.spans.add(row.id);
   if(row.block)entry.keys.add(key(row.feeder,row.block));
   entry.sources.set(row.source,(entry.sources.get(row.source)||0)+row.metres);
   const label=row.feeder||'Sem alimentador';
   if(!feeders.has(label))feeders.set(label,{feeder:label,metres:0,routeMetres:0,spans:new Set(),keys:new Set()});
   const item=feeders.get(label);
   item.metres+=row.metres;item.spans.add(row.id);
   if(row.block)item.keys.add(row.block);
  }
  let routeMetres=0,netRouteMetres=0;
  for(const row of rows.values())netRouteMetres+=row.sources.get('ARBORA')||0;
  for(const row of data.routesOnly){
   if(!bucket(row.day)||!matches(row.feeder,row.section,row.zone))continue;
   const label=row.feeder||'Sem alimentador';
   if(!feeders.has(label))feeders.set(label,{feeder:label,metres:0,routeMetres:0,spans:new Set(),keys:new Set()});
   feeders.get(label).routeMetres+=row.metres;
   routeMetres+=row.metres;
  }
  for(const [day,f,s,z,count] of data.trees){
   const when=bucket(day);
   if(when&&matches(f,s,z))get(when).trees+=count;
  }
  let metres=0,trees=0;
  const periods=[...rows.values()].sort((a,b)=>a.when.localeCompare(b.when)).map(row=>{
   metres+=row.metres;trees+=row.trees;
   return {...row,accumulated:metres,accumulatedTrees:trees};
  });
  const orders=data.orders.filter(order=>(!feeder||order.feeder===feeder)&&(order.status==='pendente'||bucket(order.day)));
  return {periods,feeders:[...feeders.values()].sort((a,b)=>b.metres-a.metres),metres,routeMetres,netRouteMetres,trees,orders};
 }
 function annual(data,asOf){
  let available=0,earlier=0,plan=0;
  const byYear=new Map();
  for(const row of data.credited){
   if(row.day>asOf||!['1','2','3'].includes(row.section))continue;
   const year=Number(row.day.slice(0,4));
   if(year<2026)continue;
   if(!byYear.has(year))byYear.set(year,{total:0,eligible2026:0});
   const sum=byYear.get(year);
   sum.total+=row.metres;
   if(['1','2'].includes(row.section))sum.eligible2026+=row.metres;
  }
  return targets.map(([year,target])=>{
   const sums=byYear.get(year)||{total:0,eligible2026:0};
   const realised=year===2026?sums.eligible2026:sums.total;
   const advance=Math.min(target,available);
   const credited=Math.min(target,available+realised);
   available+=sums.total-credited;
   earlier+=sums.total;plan+=target;
   return {year,target,realised,advance,pending:target-credited,carry:available,cumulativeMetres:earlier,cumulativeTarget:plan};
  });
 }
 function parkCatalogue(catalogue){
  const {ids,metres,groupIds,groups}=catalogue;
  const totals=groups.map(([feeder,section])=>({feeder,section,total:0,spans:0}));
  for(let i=0;i<ids.length;i++){
   const group=totals[groupIds[i]];
   group.total+=metres[i];
   group.spans++;
  }
  return {ids,metres,groupIds,totals};
 }
 function parkCoverage(data,catalogue,asOf){
  const {ids,metres,groupIds,totals}=catalogue;
  const coverage=totals.map(group=>({...group,done:0,complete:0,partial:0}));
  const ranges=new Map();
  for(const event of data.events){
   if(event.day>asOf)break;
   if(!ranges.has(event.id))ranges.set(event.id,[]);
   ranges.get(event.id).push([event.start,event.end]);
  }
  function spanIndex(id){
   let low=0,high=ids.length;
   while(low<high){
    const mid=Math.floor((low+high)/2);
    if(ids[mid]<id)low=mid+1;
    else high=mid;
   }
   return ids[low]===id?low:-1;
  }
  for(const [id,visits] of ranges){
   const index=spanIndex(id);
   if(index===-1)continue;
   const length=CampoRoutes.merge(visits).reduce((sum,[start,end])=>sum+end-start,0);
   const group=coverage[groupIds[index]];
   group.done+=metres[index]*length/FULL;
   if(length===FULL)group.complete++;
   else group.partial++;
  }
  return coverage;
 }
 function parkReport(coverage,feeder=''){
  const keys=['1','2','3',''];
  const empty=section=>({section,total:0,done:0,spans:0,complete:0,partial:0});
  const sections=new Map(keys.map(section=>[section,empty(section)])),total=empty('total');
  for(const group of coverage){
   if(feeder&&group.feeder!==feeder)continue;
   const section=sections.get(group.section);
   for(const metric of ['total','done','spans','complete','partial']){
    section[metric]+=group[metric];
    total[metric]+=group[metric];
   }
  }
  return [...sections.values(),total].map(group=>({...group,done:Math.min(group.done,group.total),
   pending:Math.max(0,group.total-group.done),progress:group.total?Math.min(1,group.done/group.total):null}));
 }
 return {ledger,select,annual,parkCatalogue,parkCoverage,parkReport,targets};
})();
if(typeof module!=='undefined')module.exports=CampoVeraProgress;
