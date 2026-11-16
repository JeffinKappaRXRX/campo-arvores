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
   return (!F.planoGlobal||norm(r.plano)===norm(F.planoGlobal))&&(!F.poloGlobal||norm(r.polo)===norm(F.poloGlobal))&&
    (!F.localidadeGlobal||norm(r.mun)===norm(F.localidadeGlobal))&&em(F.polo,r.polo)&&em(F.conj,r.conj)&&em(F.alim,r.alim)&&em(F.trP,r.trecho)&&
    (!F.chave||norm(r.chave).includes(norm(F.chave)));
  }
  function matches(r){
   const status={'Fora do prazo':'Fora do prazo','Vence em breve':'Urgente','No prazo':'Dentro do prazo','Sem prazo calculável':'Sem dados'}[r.status]||'Sem dados';
   return geographic(r)&&em(F.cycleRisk,r.classe)&&em(F.cycleProjection,r.projection||'unknown')&&em(F.cyclePoda,r.poda||'unknown')&&em(F.prazoP,status)&&(!F.mes||r.deadline?.startsWith(F.mes))&&
    (!F.buscaT||norm([r.id,r.post,r.poste,r.especie,r.alim,r.chave,r.mun,r.log,r.os,r.classe,r.caption].join(' ')).includes(norm(F.buscaT)));
  }
  return {enrich,geographic,matches};
 }
 function parentData(){try{return parent!==window?parent.CampoParque?.unifiedSnapshot?.()||null:null;}catch{return null;}}
 const projection=v=>v===true||v===1||['SIM','1'].includes(norm(v))?'sim':v===false||v===0||['NAO','0'].includes(norm(v))?'nao':'';
 function prepare(F){
  const source=C.dados.resumo?.hoje,now=today(),{enrich,geographic,matches}=context(F),live=parentData(),active=live?.trees||[];
  const byId=new Map(active.map(r=>[String(r.id),r])),retired=new Set(live?.mergedIds||[]),represented=new Set();
  const catalog=raw('vera_prev').filter(r=>!retired.has('vera-'+r.id)).map(r=>({...r,poste:post(r.poste)}));
  const historic=raw('parque_postes').map(p=>({...p,id:post(p.id)}));
  // An explicit VERA ID is the only automatic link between the two tree sources.
  const consolidated=M.build({trees:catalog,posts:historic,keys:raw('chaves'),reference:source,date:now,lead:C.prem('antecedencia'),months:C.prem('mesesNaoVera'),urgent:C.prem('urgente'),observedCycle:true});
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
  return {rows:rows.filter(matches),source,now,live,point,networkFeeders:()=>raw('chaves').map(enrich).filter(geographic).flatMap(r=>String(r.alim||'').split(', ')).filter(Boolean),other:r=>matches(enrich(r))};
 }
 function popup(r){
  const lines=[r.especie,r.trecho,r.alim,r.chave,r.status,r.deadline?'Próxima poda estimada: '+isoBR(r.deadline):'',r.lastPrune?'Última poda: '+isoBR(r.lastPrune):'',r.basis,r.classe,r.action,r.restriction];
  const root=document.createElement('div'),title=document.createElement('strong');title.textContent=r.kind+' '+r.id;root.append(title);
  for(const line of lines.filter(Boolean)){const div=document.createElement('div');div.textContent=line;root.append(div);}
  if(parent!==window&&(r.recordId||r.layer==='vera')){const button=document.createElement('button');button.type='button';button.textContent='Abrir árvore e fotos';button.onclick=()=>openRecord(r);root.append(button);}
  return root;
 }
 function openRecord(r){if(parent===window)return;if(r.recordId)void parent.CampoControl?.openRecord(r.recordId);else parent.CampoParque?.openTree(r.detailId);}
 function list(container,rows,source,now,show){
  const cycle=rows.filter(r=>r.layer!=='campo'||r.poda==='sim');
  const count=cycle.filter(r=>point(r)).length;
  container.innerHTML='<h3>Plano de poda por ciclo</h3><p class="nota">Consolidado de '+esc(isoBR(source))+' · posição em '+esc(isoBR(now))+'. '+num(count)+' no mapa · '+num(cycle.length-count)+' sem coordenada. A prioridade é da previsão VERA. Para postes sem essa previsão, o prazo usa a última poda e o ciclo histórico em dias quando disponível. A alternativa usa a data-base do poste com a premissa de '+num(C.prem('mesesNaoVera'))+' meses. Casos sem prazo entram para conferência.</p><div id="cycleTable"></div><p class="nota"><a href="#manejo">Cronograma T1/T2, capacidade de poda e listas DEOP e LM/DCMD</a></p>';
  tabela($('cycleTable'),[{t:'Origem',k:'kind'},{t:'ID',k:'id'},{t:'Poste',k:'post'},{t:'Espécie',k:'especie'},{t:'Alimentador',k:'alim'},{t:'Chave',k:'chave'},{t:'Trecho',k:'trecho'},{t:'Risco',k:'classe'},{t:'Última poda',k:'lastPrune',f:isoBR},{t:'Ciclo histórico (dias)',k:'cycleDays'},{t:'Prazo estimado',k:'deadline',f:isoBR},{t:'Situação',k:'status'},{t:'Motivo do prazo',k:'basis'},{t:'Equipe indicada',k:'equipe'},{t:'Restrições',k:'restriction'},{t:'Latitude',k:'lat'},{t:'Longitude',k:'lon'}],cycle,{pagina:25,csv:'plano_poda_ciclo',clique:r=>{if(point(r))show(r);else if(r.recordId)openRecord(r);}});
 }
 C.opExtra={...C.opExtra,cycleRisk:['Risco da árvore',()=>['CRÍTICO','ALTO','REVISAR EM CAMPO','MÉDIO','BAIXO','SEM RISCO']],cycleProjection:['Projeção',()=>[['sim','Em projeção'],['nao','Fora de projeção'],['unknown','A conferir']]],cyclePoda:['Necessita poda',()=>[['sim','Sim'],['nao','Não'],['unknown','A conferir']]]};
 C.cycleMap={prepare,popup,list,point};
})();
