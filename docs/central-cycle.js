'use strict';
(()=>{
 const C=Central,M=CampoManejo,{linhasRaw:raw,esc,num,isoBR,em,tabela,$}=C;
 const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
 const post=v=>norm(v).replace(/^226-/,'');
 const trecho=v=>{const t=norm(v).replace(/^T\s*/,'');return /^[123]$/.test(t)?'T'+t:'';};
 const point=r=>r.lat!=null&&r.lon!=null&&r.lat!==''&&r.lon!==''&&Number.isFinite(Number(r.lat))&&Number.isFinite(Number(r.lon))&&Math.abs(r.lat)<=90&&Math.abs(r.lon)<=180;
 const today=()=>M.today();
 const rowsWith=(rows,key)=>{const out=new Map();for(const r of rows){const k=key(r);if(!k)continue;const a=out.get(k)||[];a.push(r);out.set(k,a);}return out;};
 const only=(rows,key)=>{const v=new Set((rows||[]).map(key).filter(Boolean));return v.size===1?v.values().next().value:'';};
 function context(F){
  const keys=raw('chaves'),posts=raw('parque_postes'),byKey=rowsWith(keys,r=>norm(r.chave)),byFeeder=new Map(),byPost=rowsWith(posts,r=>post(r.id));
  for(const k of keys)for(const f of String(k.alim||'').split(', ')){const id=norm(f);if(id){const a=byFeeder.get(id)||[];a.push(k);byFeeder.set(id,a);}}
  function enrich(row){
   const p=(byPost.get(post(row.post||row.poste||row.pole))||[]).find(r=>!row.alim||!r.alim||norm(r.alim)===norm(row.alim))||{};
   const key=row.chave||p.chave,feeder=row.alim||row.feeder||p.alim;
   const ks=(key&&byKey.get(norm(key)))||byFeeder.get(norm(feeder))||[];
   return {...row,chave:key||'',alim:feeder||'',polo:row.polo||p.polo||only(ks,k=>k.polo),
    conj:row.conj||p.conj||only(ks,k=>k.conj),mun:row.mun||p.mun||only(ks,k=>k.mun||k.municipio||k.localidade),
    plano:row.plano||p.plano||only(ks,k=>k.plano||k.planoConsolidado),
    trecho:trecho(row.trecho||row.trT||row.tr)||trecho(p.tr)||trecho(only(ks,k=>k.trecho))||'Sem trecho'};
  }
  function geographic(r){
   const global=(filter,value)=>!filter||Array.isArray(filter)&&!filter.length||[].concat(filter).some(choice=>norm(choice)===norm(value));
   return global(F.planoGlobal,r.plano)&&global(F.poloGlobal,r.polo)&&global(F.localidadeGlobal,r.mun)&&em(F.polo,r.polo)&&em(F.conj,r.conj)&&em(F.alim,r.alim)&&em(F.trP,r.trecho)&&
    C.keyMatches(F.chave,r.chave);
  }
  function matches(r,ignoreMonth=false){
   const status={'OS pendente':'OS pendente','Fora do prazo':'Fora do prazo','Vence em breve':'Urgente','No prazo':'Dentro do prazo','Sem prazo calculável':'Sem dados'}[r.status]||'Sem dados';
   return geographic(r)&&em(F.cycleRisk,r.classe)&&em(F.cycleProjection,r.projection||'unknown')&&em(F.cyclePoda,r.poda||'unknown')&&em(F.cycleStage,status)&&(ignoreMonth||!F.mes||String((F.cycleDate==='executada'?r.lastPrune:F.cycleDate==='abertura'?r.created:r.deadline)||'').startsWith(F.mes))&&
    (!F.buscaT||norm([r.id,r.post,r.poste,r.especie,r.alim,r.chave,r.mun,r.log,r.os,r.classe,r.caption].join(' ')).includes(norm(F.buscaT)));
  }
  return {enrich,geographic,matches};
 }
 function parentData(){try{return parent!==window?parent.CampoParque?.unifiedSnapshot?.()||null:null;}catch{return null;}}
 const projection=v=>v===true||v===1||['SIM','1'].includes(norm(v))?'sim':v===false||v===0||['NAO','0'].includes(norm(v))?'nao':'';
 function pruningRecords(now){
  const historicById=new Map(raw('parque_postes').map(p=>[post(p.id),{...p,id:post(p.id)}]));
  const todayDay=M.day(now);
  const pruningHistory=new Map();
  for(const [id,record] of historicById){
   const dates=String(record.datas||'').split(';').filter(Boolean).map(v=>/^\d{4}-/.test(v)?M.day(v.slice(0,10)):Number(v));
   const last=typeof record.ult==='string'&&/^\d{4}-/.test(record.ult)?M.day(record.ult.slice(0,10)):record.ult;
   if(Number.isInteger(last))dates.push(last);
   record.ult=Number.isInteger(last)&&last<=todayDay?last:null;
   pruningHistory.set(id,new Set(dates.filter(d=>Number.isInteger(d)&&d<=todayDay)));
  }
  for(const order of raw('os_exec')){
   const id=post(order.poste);
   if(!id||order.expurgo||norm(order.tipo)!=='PODA'||!Number.isInteger(order.dia)||order.dia>todayDay)continue;
   if(!pruningHistory.has(id))pruningHistory.set(id,new Set());
   pruningHistory.get(id).add(order.dia);
   const existing=historicById.get(id);
   if(!existing)historicById.set(id,{...order,id,ult:order.dia,cat:'OS executada'});
   else if(existing.ult==null||order.dia>existing.ult)existing.ult=order.dia;
  }
  for(const [id,dates] of pruningHistory){
   const record=historicById.get(id);
   for(const day of dates)if(record.ult==null||day>record.ult)record.ult=day;
  }
  return {historicById,pruningHistory};
 }
 function prepare(F){
  const source=C.dados.resumo?.hoje,now=today(),{enrich,geographic,matches}=context(F),live=parentData(),active=live?.trees||[];
  const byId=new Map(active.map(r=>[String(r.id),r])),retired=new Set(live?.mergedIds||[]),represented=new Set();
  const catalog=raw('vera_prev').filter(r=>!retired.has('vera-'+r.id)).map(r=>({...r,poste:post(r.poste)}));
  const {historicById,pruningHistory}=pruningRecords(now);
  const historic=[...historicById.values()];
  // An explicit VERA ID is the only automatic link between the two tree sources.
  const consolidated=M.build({trees:catalog,posts:historic,keys:raw('chaves'),reference:source,date:now,lead:C.prem('antecedencia'),months:6,urgent:C.prem('urgente'),managedCycle:true,observedCycle:true,clearance:1.6});
  const rows=consolidated.map(r=>{
   if(r.estimated)return enrich({...r,layer:r.cat==='Só SS'?'ss':r.cat==='OS executada'?'nv':'ab'});
   const current=byId.get(r.id)||byId.get('vera-'+r.id);
   if(current)represented.add(String(current.id));
   return enrich({...r,layer:'vera',lat:current?.lat??r.lat,lon:current?.lon??r.lon,
    especie:current?.especies||r.especie,classe:current?.classe||r.classe,projection:current?.raw?.projection||projection(current?.projecao??r.proj),poda:String(current?.raw?.poda||current?.poda||'').toLowerCase().replace('não','nao'),recordId:current?.campoId||current?.raw?.id||'',detailId:current?.id||r.id});
  });
  for(const t of active){
   if(represented.has(String(t.id)))continue;
   const inspection=t.origem==='Campo (prévia)'||Boolean(t.raw&&!t.campoId);
   rows.push(enrich({id:t.id,rowId:(inspection?'field:':'vera:')+t.id,kind:inspection?'Inspeção de campo':'Árvore VERA',layer:inspection?'campo':'vera',
    post:t.poste,alim:t.alimentador,chave:t.chave,mun:t.municipio,trecho:t.trecho,lat:t.lat,lon:t.lon,classe:t.classe,especie:t.especies,
    status:'Sem prazo calculável',basis:'Sem previsão de crescimento vinculada',lastPrune:'',recordId:t.raw?.id,detailId:t.id,quantity:1,
    action:t.acao,projection:t.raw?.projection||projection(t.projecao),poda:String(t.raw?.poda||t.poda||'').toLowerCase().replace('não','nao')}));
  }
  const byPost=new Map();
  for(const row of rows){
   const id=post(row.post);
   if(id&&row.deadline&&(!byPost.has(id)||row.deadline<byPost.get(id).deadline))byPost.set(id,row);
  }
  const orders=new Set();
  for(const order of raw('os_abertas')){
   const id=String(order.os??'').trim();
   if(order.expurgo||norm(order.tipo)!=='PODA'||(id&&orders.has(id)))continue;
   if(id)orders.add(id);
   const poste=post(order.poste),linked=byPost.get(poste),structure=historicById.get(poste)||{};
   rows.push(enrich({...order,id:id||'Sem número',rowId:'os:'+id+'-'+rows.length,post:poste,kind:'OS de poda pendente',layer:'pend',
    lat:order.lat??linked?.lat??structure.lat,lon:order.lon??linked?.lon??structure.lon,lastPrune:linked?.lastPrune||M.iso(structure.ult),
    deadline:linked?.deadline,created:Number.isInteger(order.criada)?M.iso(order.criada):(/^\d{4}-\d{2}-\d{2}/.test(String(order.criada))?String(order.criada).slice(0,10):''),days:linked?.days,status:'OS pendente',poda:'sim',action:order.status,
    basis:linked?'Prazo do ciclo vinculado ao poste. A OS segue pendente.':'OS em aberto no consolidado; sem prazo de ciclo confirmado.'}));
  }
  for(const row of rows){
   const dates=pruningHistory.get(post(row.post));
   if(dates?.size)row.pruningHistory=[...dates].sort((a,b)=>b-a).map(M.iso);
  }
  return {rows:rows.filter(r=>matches(r)),calendarRows:F.mes?rows.filter(r=>matches(r,true)):null,source,now,live,point,networkFeeders:()=>raw('chaves').map(enrich).filter(geographic).flatMap(r=>String(r.alim||'').split(', ')).filter(Boolean),other:r=>matches(enrich(r))};
 }
 function popup(r){
  const lines=[r.post?'Poste: '+r.post:'',r.especie,r.trecho,r.alim,r.chave,r.status,r.created?'Abertura da OS: '+isoBR(r.created):'',r.deadline?'Próxima poda estimada: '+isoBR(r.deadline):'',r.lastPrune?'Última poda: '+isoBR(r.lastPrune):'',r.pruningHistory?.length?'Podas no poste: '+r.pruningHistory.map(isoBR).join(', '):'',r.basis,r.classe,r.action,r.restriction];
  const root=document.createElement('div'),title=document.createElement('strong');title.textContent=r.kind+' '+r.id;root.append(title);
  for(const line of lines.filter(Boolean)){const div=document.createElement('div');div.textContent=line;root.append(div);}
  if(parent!==window&&(r.recordId||r.layer==='vera')){const button=document.createElement('button');button.type='button';button.textContent='Abrir árvore e fotos';button.onclick=()=>openRecord(r);root.append(button);}
  return root;
 }
 function openRecord(r){if(parent===window)return;if(r.recordId)void parent.CampoControl?.openRecord(r.recordId);else parent.CampoParque?.openTree(r.detailId);}
 function list(container,calendar,rows,calendarRows,source,now,show,month,setMonth){
  const cycle=rows.filter(r=>r.layer!=='campo'||r.poda==='sim');
  const forecasts=cycle.filter(r=>r.layer!=='pend');
  const count=cycle.filter(point).length,closed=forecasts.filter(r=>r.days!=null&&r.days<0).length;
  const pending=cycle.length-forecasts.length,missing=forecasts.filter(r=>!r.deadline).length;
  const buckets=new Map();
  for(const row of calendarRows){if(row.layer!=='pend'&&(row.layer!=='campo'||row.poda==='sim')&&row.deadline&&row.days>=0){const m=row.deadline.slice(0,7);buckets.set(m,(buckets.get(m)||0)+1);}}
  const monthStart=M.day(now.slice(0,7)+'-01');
  const yearMonths=Array.from({length:12},(_,i)=>{const m=M.iso(M.addMonths(monthStart,i)).slice(0,7);return [m,buckets.get(m)||0];});
  const label=m=>new Intl.DateTimeFormat('pt-BR',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(m+'-02T00:00:00Z'));
  const calendars=yearMonths.slice(0,12).map(([m,n])=>'<button type="button" data-cycle-month="'+m+'" aria-pressed="'+(m===month)+'"'+(n===0?' disabled':'')+'>'+esc(label(m))+' <strong>'+num(n)+'</strong></button>').join('');
  calendar.innerHTML=C.kpis([
    ['Previsões vencidas',num(closed),'Revisar para programar'],
    ['OS de poda pendentes',num(pending),'Ordens abertas do consolidado'],
    ['Sem previsão',num(missing),'Itens para conferência'],
    ['Com ponto no mapa',num(count),num(cycle.length-count)+' sem coordenada, mantidos na lista']
   ])+'<div class="panel-head"><div><h3>Calendário de poda</h3><p class="nota">Consolidado de '+esc(isoBR(source))+' · posição em '+esc(isoBR(now))+'. O calendário conta alvos do ciclo. Uma OS pendente aparece separadamente.</p></div></div>'+
   (calendars||month?'<div class="sigora-calendar">'+(month?'<button type="button" data-cycle-month="">Limpar mês</button>':'')+calendars+'</div>':'<p class="nota">Sem previsões futuras neste recorte. Consulte as pendências na tabela.</p>')+
   '<p class="nota">VERA após poda: 1,6 m presumido, crescimento da espécie e antecedência configurada. Sem VERA: seis meses após a última poda executada.</p>';
  container.innerHTML='<h3>Postes, árvores e ordens de poda</h3><p class="nota">Abra um ID para conferir as datas e localizar o ponto.</p><div id="cycleDetail" class="sigora-cycle-detail" aria-live="polite"></div><div id="cycleTable"></div>';
  calendar.querySelectorAll('[data-cycle-month]').forEach(button=>button.onclick=()=>setMonth(button.dataset.cycleMonth));
  const inspect=r=>{
   const detail=container.querySelector('#cycleDetail');
   detail.replaceChildren(popup(r));
   if(point(r))show(r);
  };
  tabela($('cycleTable'),[{t:'ID / OS',k:'id',h:(v,r)=>'<button type="button" class="quiet" data-cycle-row="'+esc(r.rowId)+'">'+esc(v)+'</button>'},{t:'Origem',k:'kind'},{t:'Poste',k:'post'},{t:'Espécie',k:'especie'},{t:'Alimentador',k:'alim'},{t:'Trecho',k:'trecho'},{t:'Última poda',k:'lastPrune',f:isoBR},{t:'Abertura da OS',k:'created',f:isoBR},{t:'Próxima poda',k:'deadline',f:isoBR},{t:'Situação',k:'status'},{t:'Regra ou pendência',k:'basis',q:1},{t:'Equipe',k:'equipe'}],cycle,{pagina:25,csv:'plano_poda_ciclo'});
  const index=new Map(cycle.map(row=>[row.rowId,row]));
  container.querySelector('#cycleTable').onclick=e=>{const button=e.target.closest('[data-cycle-row]');if(button)inspect(index.get(button.dataset.cycleRow));};
 }
 C.opExtra={...C.opExtra,cycleDate:['Data usada no filtro de mês',()=>[['prevista','Próxima poda'],['executada','Última poda executada'],['abertura','Abertura da OS']]],cycleStage:['Situação da poda',()=>['OS pendente','Fora do prazo','Urgente','Dentro do prazo','Sem dados']],cycleRisk:['Risco da árvore',()=>['CRÍTICO','ALTO','REVISAR EM CAMPO','MÉDIO','BAIXO','SEM RISCO']],cycleProjection:['Projeção',()=>[['sim','Em projeção'],['nao','Fora de projeção'],['unknown','A conferir']]],cyclePoda:['Necessita poda',()=>[['sim','Sim'],['nao','Não'],['unknown','A conferir']]]};
 C.cycleMap={prepare,popup,list,point,post,pruningRecords};
})();
