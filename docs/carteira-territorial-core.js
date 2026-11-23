'use strict';

const CarteiraTerritorial = (() => {
 const norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const number = value => value != null && String(value).trim() && Number.isFinite(Number(value)) ? Number(value) : null;
 const positive = value => number(value) >= 0 && number(value) !== null ? number(value) : null;
 const pole = value => ({'RIO BRANCO':'RBR','BRASILEIA':'BRA','CRUZEIRO DO SUL':'CZS'}[norm(value)]||norm(value));
 const part = (value, total) => total > 0 ? value / total : 0;
 const sum = (list, pick) => list.reduce((total, row) => total + (pick(row) || 0), 0);
 const limit = {
  'ACRELANDIA':[37,34,30],'ALTO ALEGRE':[24,22,20],'CRUZEIRO DO SUL':[53,53,52],
  'EPITACIOLANDIA':[54,49,44],'FEIJO':[56,55,53],'FLORESTA':[36,33,30],'JORDAO':[44,44,44],
  'MARECHAL THAUMATURGO':[75,72,68],'PORTO WALTER':[60,60,60],'SANTA ROSA':[39,39,38],
  'SAO FRANCISCO':[16,14,13],'SENA MADUREIRA':[51,49,45],'TANGARA':[31,29,27],
  'TAQUARI':[37,34,30],'TARAUACA':[57,56,54]
 };
 const types = {poda:'Poda',faixa:'Limpeza de faixa',cruzeta:'Cruzeta',isolador:'Isolador',
  quente:'Ponto quente',poste:'Poste',condutor:'Condutor',chave:'Chave / proteção',trafo:'Transformador',estrutura:'Outra estrutura'};
 const modes = {viva:'Linha viva · T1/T2',radial:'Radial · <400 clientes',manobra:'Com manobra · <400 residuais',
  bt:'DEOP · Poda BT',rural:'T3 rural · Florestcon/LF',situacional:'T3 urbano · situacional',
  avaliacao:'Avaliação operacional'};
 const perimeter=value=>({R:'RURAL',U:'URBANO',URBANA:'URBANO'}[norm(value)]||norm(value));
 const flag=value=>value===1||value===true||value==='1';
 function family(value) {
  const text = norm(value);
  if (/FAIXA/.test(text)) return 'faixa';
  if (/VEGET|ARVORE|GALHO|PODA/.test(text)) return 'poda';
  if (/PONTO QUENTE|TERMOGRAF|AQUECIMENTO|CONECTOR|JUMPER|CONEXAO|^CONECT/.test(text)) return 'quente';
  if (/CRUZETA|ESTRUTURA N[1-4]|^CRZ/.test(text)) return 'cruzeta';
  if (/ISOLADOR|^ISO/.test(text)) return 'isolador';
  if (/CONDUTOR|^COND/.test(text)) return 'condutor';
  if (/POSTE/.test(text)) return 'poste';
  if (/CHAVE|RELIGADOR|DISJUNTOR|FUSIVEL|^CHV|PARARAIO|PARA.RAIO/.test(text)) return 'chave';
  if (/TRANSFORMADOR|TRAFO/.test(text)) return 'trafo';
  return 'estrutura';
 }
 function pointIn(point, ring) {
  if (!point || ring.length < 3) return false;
  const [y,x] = point;
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
   const [a,b]=ring[j], [c,d]=ring[i];
   if (Math.abs((x-b)*(c-a)-(y-a)*(d-b))<1e-11&&x>=Math.min(b,d)&&x<=Math.max(b,d)&&y>=Math.min(a,c)&&y<=Math.max(a,c)) return true;
   if ((a>y)!==(c>y) && x<(d-b)*(y-a)/(c-a)+b) inside=!inside;
  }
  return inside;
 }
 function distance(a,b) {
  const rad=Math.PI/180, x=(b[1]-a[1])*rad*Math.cos((a[0]+b[0])*rad/2), y=(b[0]-a[0])*rad;
  return Math.hypot(x,y)*6371.0088;
 }
 function route(items, manual=false) {
  const distinct=new Map();
  for (const item of items) if (item.point) {
   const key=item.point.join(',');
   if (!distinct.has(key)) distinct.set(key,item);
  }
  const stops=[...distinct.values()];
  if (stops.length<2 || manual) return measure(stops);
  const pending=stops.slice(1), path=[stops[0]];
  while (pending.length) {
   const from=path.at(-1).point;
   let best=0;
   for (let i=1;i<pending.length;i++) if(distance(from,pending[i].point)<distance(from,pending[best].point)) best=i;
   path.push(pending.splice(best,1)[0]);
  }
  for (let pass=0;pass<4;pass++) {
   let improved=false;
   for (let i=1;i<path.length-1;i++) for (let j=i+1;j<path.length;j++) {
    const [a,b,c,d]=[path[i-1].point,path[i].point,path[j].point,path[j+1]?.point];
    if (distance(a,c)+(d?distance(b,d):0)+.00001<distance(a,b)+(d?distance(c,d):0)) {
     path.splice(i,j-i+1,...path.slice(i,j+1).reverse());improved=true;
    }
   }
   if(!improved)break;
  }
  return measure(path);
 }
 function roadOrder(matrix) {
  const n=matrix.length;
  if(!n||matrix.some(row=>row.length!==n))return null;
  const cost=(a,b)=>positive(matrix[a][b])??Infinity;
  function length(route) {
   let total=0;
   for(let i=1;i<route.length;i++)total+=cost(route[i-1],route[i]);
   return total;
  }
  let best=null, bestCost=Infinity;
  for(let first=0;first<n;first++){
   const pending=new Set(Array.from({length:n},(_,i)=>i));pending.delete(first);
   const path=[first];
   while(pending.size){
    let next=null,min=Infinity;
    for(const i of pending){
     const v=cost(path.at(-1),i);
     if(v<min){min=v;next=i;}
    }
    if(next===null)break;
    path.push(next);pending.delete(next);
   }
   if(pending.size)continue;
   let total=length(path);
   for(let pass=0;pass<3;pass++){
    let moved=false;
    for(let i=0;i<path.length-1;i++)for(let j=i+1;j<path.length;j++){
     const candidate=path.slice(0,i).concat(path.slice(i,j+1).reverse(),path.slice(j+1));
     const time=length(candidate);
     if(time+.1<total){path.splice(0,path.length,...candidate);total=time;moved=true;}
    }
    if(!moved)break;
   }
   if(total<bestCost){bestCost=total;best=path;}
  }
  return best;
 }
 function measure(stops) {
  let km=0;
  for(let i=1;i<stops.length;i++) km+=distance(stops[i-1].point,stops[i].point);
  return {stops,km};
 }
 function decSummary(meta={}, monthly=[], referenceYear=new Date().getFullYear()) {
  const codes=meta.conjuntos||{}, records=meta.conjDec||{}, limits=meta.limites||{};
  const year=Number(String(meta.hoje??'').slice(0,4))||referenceYear;
  const cutText=String(meta.corteDec||meta.hoje||'');
  const cut=Number(cutText.slice(5,7))||12;
  const monthDays=new Date(Date.UTC(year,cut,0)).getUTCDate();
  const day=Number(cutText.slice(8,10))||monthDays;
  const unelapsed=Math.max(0,(monthDays-day)/monthDays);
  const firstRemaining=unelapsed>0?cut:cut+1;
  const names=new Map(Object.keys(limit).map(name=>[name,{name,months:[],record:{},limits:{}}]));
  function register(code, name) {
   const key=norm(name||codes[code]||limits[code]?.nome||code);
   if(!key||/^\d+$/.test(key))return null;
   if(!names.has(key))names.set(key,{name,months:[],record:{},limits:{}});
   const item=names.get(key);
   if(name)item.name=name;
   return item;
  }
  for(const [code, row] of Object.entries(limits)) {const item=register(code,row.nome);if(item)item.limits=row.dec||{};}
  for(const [code,row] of Object.entries(records)) {const item=register(code);if(item)item.record=row;}
  for(const row of monthly) {
   const item=register(String(row.CONJUNTO??row.conj),row.nomeConj||'');
   if(item&&number(row.decCj)!==null)item.months.push(row);
  }
  for (const [key,item] of names) {
   const current=item.months.filter(row=>Number(row.ano)===year&&Number(row.mes)<=cut);
   const historic=item.months.filter(row=>Number(row.ano)===year-1);
   const historicMonths=new Set(historic.map(row=>Number(row.mes)));
   const required=Array.from({length:13-firstRemaining},(_,i)=>firstRemaining+i);
   const completeSeason=required.every(month=>historicMonths.has(month));
   const ytd=positive(item.record.dec)??(current.length?sum(current,row=>Number(row.decCj)):null);
   const remainder=completeSeason?sum(historic.filter(row=>Number(row.mes)>=firstRemaining),row=>Number(row.decCj)*(Number(row.mes)===cut?unelapsed:1)):null;
   const projected=ytd===null?null:remainder!==null?ytd+remainder:positive(item.record.decAno);
   const prior2=item.months.filter(row=>Number(row.ano)===year-2);
   const historicTotal=historicMonths.size===12?sum(historic,row=>Number(row.decCj)):null;
   const prior2Total=new Set(prior2.map(row=>Number(row.mes))).size===12?sum(prior2,row=>Number(row.decCj)):null;
   const blended=projected!=null&&historicTotal!=null&&prior2Total!=null?.5*projected+.3*historicTotal+.2*prior2Total:null;
   const next=blended??(year+1===2027?positive(item.record.dec27):null)??projected;
   const currentLimit=limit[key]?.[year-2026]??positive(item.limits[year]);
   const nextLimit=limit[key]?.[year+1-2026]??positive(item.limits[year+1]);
   const causes=new Map();
   for (const row of current) {
    if (norm(row.TIPO_OCORR)==='P'||/NAO GERENCIAVEL/.test(norm(row.ger))) continue;
    const cause=norm(row.fam||row.causa)||'SEM CLASSIFICAÇÃO';
    const data=causes.get(cause)||{cause,kind:family(cause),dec:0};
    data.dec+=Number(row.decCj);causes.set(cause,data);
   }
   Object.assign(item,{year,cut,cutoff:cutText.slice(0,10),ytd,projected,remainder,next,currentLimit,nextLimit,causes:[...causes.values()].sort((a,b)=>b.dec-a.dec),
    gap:projected!==null&&currentLimit!=null?projected-currentLimit:null,
    nextGap:next!==null&&nextLimit!=null?next-nextLimit:null,
    projectionSource:remainder!==null?(!required.length?'Ano fechado':'Sazonalidade do ano anterior'):projected!==null?'Anualizado da base central':'Dados insuficientes',
    nextSource:next===null?'Dados insuficientes':blended!==null?'50% fechamento + 30% ano anterior + 20% dois anos antes':year+1===2027&&positive(item.record.dec27)!==null?'Projeção da base central':'Cenário de repetição do fechamento'});
  }
  return names;
 }
 function classify(row,key={},program={}) {
  const pruning=row.asset==='poda'||row.asset==='faixa';
  const t=norm(row.trecho), zone=perimeter(row.perim), rural=zone==='RURAL';
  const lm=positive(row.moLM), lv=positive(row.moLV);
  const studiedClients=positive(program.cli);
  const clientCounts=[studiedClients,positive(key.cli),positive(row.clients)].filter(value=>value!==null);
  const clients=clientCounts.length?Math.max(...clientCounts):null;
  const listedNA=new Set((Array.isArray(key.na)?key.na:[]).map(norm));
  const studiedNA=norm(program.na);
  const matchedNA=studiedNA&&listedNA.has(studiedNA);
  const transfer=flag(program.manobra)&&matchedNA?positive(program.transf):null;
  const residual=transfer>0&&studiedClients!==null&&transfer<=studiedClients?clients-transfer:null;
  const radial=flag(program.radial)&&!flag(program.manobra)&&!key.isNA&&clients!==null&&clients<400;
  const volt=norm(row.voltage||row.tensao||row.tipo);
  const modeBT=pruning&&/\bBT\b/.test(volt)&&!/\bMT\b/.test(volt);
  const kv=positive(row.kv), clearance=kv>=10&&kv<15?1.38:kv>=30&&kv<36?1.58:null;
  const mtDistance=positive(row.mtDistance), limitIT=positive(row.distIT);
  const minimum=clearance===null?null:Math.max(clearance,limitIT||0);
  const teamIT=norm(row.teamIT);
  let deop='';
  if(pruning){
   if(modeBT)deop='BT · triagem DEOP';
   else if(/VIVA|DESLIG/.test(teamIT)||lv>0&&!(lm>0))deop='MT · linha viva ou desligamento em avaliação';
   else if(minimum===null||mtDistance===null)deop='MT · faltam distância ou tensão';
   else if(mtDistance<=minimum)deop='MT · dentro do limite registrado';
   else if(lm>0&&!(lv>0)&&limitIT>0&&/^LINHA MORTA/.test(teamIT)&&positive(row.mtMeasured)!==null)deop='MT · avaliar apoio DEOP com MO LM e medição';
   else deop='MT · revisar medida, MO e IT 0265';
  }
  const situational=Boolean(row.situational);
  let mode='avaliacao';
  if(pruning&&t==='T3'&&zone==='URBANO'&&!situational) mode='situacional';
  else if (modeBT) mode='bt';
  else if((t==='T1'||t==='T2')&&(row.lv||lv>0)&&(!(lm>0)||Boolean(row.lv))) mode='viva';
  else if(radial&&row.chave) mode='radial';
  else if(residual!==null&&residual<400&&row.chave&&!key.isNA) mode='manobra';
  else if(pruning&&t==='T3'&&rural) mode='rural';
  const ruralCrew=pruning&&t==='T3'&&rural&&mode!=='bt';
  const team=ruralCrew?'Florestcon/LF':({viva:'Linha viva',bt:'DEOP BT',radial:'Linha morta',manobra:'Linha morta'})[mode]||'';
  const reviewReason=mode==='rural'&&row.asset!=='faixa'?'Validar modalidade e condições para T3 rural':
   mode==='avaliacao'&&flag(program.manobra)&&!matchedNA?'Conferir NA do estudo com a hierarquia trifásica':
   mode==='avaliacao'&&clients!==null&&clients<400?'Confirmar topologia radial no estudo':'';
  return {mode,team,clients,residual,deop,transfer,na:matchedNA?program.na:'',reviewReason};
 }
 function score(row,dec,today) {
  const date=number(row.due), days=date===null?null:date-today;
  const urgent=/URGENT|EMERGENC/.test(norm(row.pri||row.groupStatus));
  const deadline=days===null?(urgent?18:0):days<=0?28+Math.min(12,-days/10):Math.max(0,28-days/5);
  const risk=norm(row.risk||row.classe);
  const growth=Math.min(15,(positive(row.growth)||0)*7)+({CRITICO:12,ALTO:8,MEDIO:4,BAIXO:1}[risk]||0);
  const exposure=Math.min(20,Math.log10(1+(row.clients||0))*6);
  const pressure=Math.max(part(dec?.projected,dec?.currentLimit),part(dec?.next,dec?.nextLimit));
  const causes=(dec?.causes||[]).filter(c=>c.kind===row.asset||(row.asset==='faixa'&&c.kind==='poda'));
  const historical=Math.min(16,40*part(sum(causes,c=>c.dec),dec?.ytd));
  const segment=row.trecho==='T1'?9:row.trecho==='T2'?6:0;
  const components={prazo:deadline,crescimento:Math.min(22,growth),clientes:exposure,conjunto:Math.min(15,pressure*12),
   causa:historical,trecho:segment,ganho:Math.min(10,Math.log1p((positive(row.ganho)||0)*3)*4),essencial:Math.min(12,(row.impacts||[]).length*5)};
  return {score:Math.min(100,Math.round(sum(Object.values(components),v=>v))),components};
 }
 function impactIndex(orgs, hierarchy=new Map()) {
  const index=new Map();
  for(const org of orgs) {
   const direct=norm(org.chave), related=direct?[direct,...(hierarchy.get(direct)?.parents||[])]:[];
   for(const key of new Set(related)) {
    if(!index.has(key))index.set(key,[]);
    index.get(key).push(org);
   }
  }
  return index;
 }
 function budgetKey(value) {
  const text=norm(value);
  if(/OPEX|^PODA RURAL|^PODA URBANA|^DEOP BT/.test(text))return 'OPEX';
  if(/CAPEX/.test(text))return 'CAPEX';
  return '';
 }
 function budgets(meta={},overrides={}) {
  const output={...overrides};
  for(const [name,row] of Object.entries(meta.recursos2027||{})) {
   const key=norm(name);
   if(!budgetKey(key))continue;
   output[key]={mat:positive(row.mat),mo:positive(row.serv)};
  }
  return {...output,...overrides};
 }
 function optimize(rows,budget,capacity) {
  const ranked=[...rows].sort((a,b)=>b.score-a.score||String(a.id).localeCompare(String(b.id),'pt-BR',{numeric:true}));
  function review(row) {
   if(row.mode==='situacional')return 'T3 urbano · requer demanda registrada';
   if(row.reviewReason)return row.reviewReason;
   if(!row.team)return 'Revisão operacional';
   if(row.impacts?.length&&['radial','manobra'].includes(row.mode))return 'Órgão essencial · validar impacto com o COI';
   const money=budget[row.resource];
   if(!money||!budgetKey(row.resource))return 'Recurso/orçamento 2027 pendente';
   if(row.mo==null||row.mat==null||row.hours==null||row.hours<=0)return 'Custos ou duração pendentes';
   if(money.mo==null||money.mat==null)return 'Dotação de serviço/material pendente';
   if(capacity[row.pool]==null)return 'Capacidade da equipe pendente';
   return '';
  }
  const reasons=new Map(ranked.map(row=>[row.id,review(row)]));
  const available=ranked.filter(row=>!reasons.get(row.id));
  function choose(order) {
   const selected=new Set(), spend={}, hours={};
   let value=0;
   for(const row of order) {
    const cap=budget[row.resource], used=spend[row.resource]||{mo:0,mat:0};
    if(used.mo+row.mo>cap.mo+1e-6||used.mat+row.mat>cap.mat+1e-6||(hours[row.pool]||0)+row.hours>capacity[row.pool]+1e-6)continue;
    spend[row.resource]={mo:used.mo+row.mo,mat:used.mat+row.mat};hours[row.pool]=(hours[row.pool]||0)+row.hours;
    selected.add(row.id);value+=row.score;
   }
   return {selected,spend,hours,value};
  }
  const share=(row,constraint)=>({
   service:part(row.mo,budget[row.resource].mo),material:part(row.mat,budget[row.resource].mat),
   capacity:part(row.hours,capacity[row.pool])
  })[constraint];
  const combined=row=>['service','material','capacity'].reduce((total,key)=>total+share(row,key),0);
  const orderBy=(usage,power)=>[...available].sort((a,b)=>b.score/(.00001+usage(b))**power-a.score/(.00001+usage(a))**power||b.score-a.score);
  const options=[choose(available),...([.5,1,1.5].map(power=>choose(orderBy(combined,power))))];
  for(const key of ['service','material','capacity'])options.push(choose(orderBy(row=>share(row,key),1)));
  const best=options.reduce((prev,next)=>next.value>prev.value?next:prev);
  const eligible=new Set(available.map(row=>row.id)), workload={};
  for(const row of ranked)if(row.pool&&row.hours>0)workload[row.pool]=(workload[row.pool]||0)+row.hours;
  return {...best,workload,rows:ranked.map(row=>{
   const used=best.spend[row.resource]||{mo:0,mat:0}, cap=budget[row.resource];
   let reason=reasons.get(row.id);
   if (eligible.has(row.id)&&!best.selected.has(row.id)) reason=[
    used.mo+row.mo>cap.mo+1e-6?'serviço':'', used.mat+row.mat>cap.mat+1e-6?'material':'',
    (best.hours[row.pool]||0)+row.hours>capacity[row.pool]+1e-6?'equipe':''
   ].filter(Boolean).join(' / ')||'Prioridade relativa';
   return {...row,planned:best.selected.has(row.id),reason,review:!eligible.has(row.id)};
  })};
 }
 return {norm,number,positive,pole,perimeter,types,modes,family,pointIn,distance,route,roadOrder,decSummary,classify,score,impactIndex,budgetKey,budgets,optimize};
})();
if(typeof module!=='undefined')module.exports=CarteiraTerritorial;
