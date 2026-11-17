'use strict';
(()=>{
 const C=Central,M=SigoraGerencial,{esc,num,pct,mi,brl,kpis,painel,tabela,em,isoBR,linhasRaw:raw,linhas:L,$}=C;
 const labels=['Criar OS de inspeção','OS de inspeção aberta','Conferir dados','Inspecionada'];
 const statusColors={Inspecionada:'bom','OS de inspeção aberta':'aten','Criar OS de inspeção':'crit','Conferir dados':'neut'};
 const act=(route,label)=>'<a class="button-link" href="#'+route+'">'+esc(label)+'</a>';
 const toDay=value=>Number.isInteger(value)?value:typeof value==='string'&&/^\d{4}-\d{2}-\d{2}/.test(value)?CampoManejo.day(value.slice(0,10)):null;
 const summarize=(rows,key)=>rows.length&&rows.every(row=>Number.isFinite(row[key]))?rows.reduce((a,row)=>a+row[key],0):null;
 const money=x=>x==null?'—':mi(x);
 const name=(R,key)=>R.conjuntos?.[key]||key||'Sem conjunto';
 const metricValue=(value,unit)=>value==null?'—':num(value,1)+(unit?' '+unit:'');
 C.opExtra={...C.opExtra,sigoraInspection:['Situação da inspeção',()=>labels]};
 C.views.gerencial={
  mod:'man',eyebrow:'SIGORA · MANUTENÇÃO',titulo:'Reunião de manutenção',precisa:['chaves','avanco','os_abertas','os_exec','opex','equipes','dec_mes'],
  filtros:['polo','conj','alim','trP','sigoraInspection','mes','chave'],
  render(F,el){
   const R=C.dados.resumo||{},same=(row,dim)=>em(F[dim],row[dim]);
   const keys=L('chaves').filter(row=>['polo','conj','alim'].every(key=>same(row,key))&&(!F.chave||M.norm(row.chave).includes(M.norm(F.chave))));
   const inspections=M.inspections({
    keys,history:raw('avanco'),pending:raw('os_abertas'),executed:raw('os_exec'),complete:Boolean(C.dados.os_abertas&&C.dados.os_exec),toDay,now:CampoManejo.day(CampoManejo.today()),
    cutoff:key=>toDay(C.prem('marco.'+key.frente)||C.prem('marcoInsp'))??Infinity
   }).filter(row=>em(F.trP,row.tr));
   const actions=inspections.filter(row=>em(F.sigoraInspection,row.status));
   const groups=M.progress(inspections);
   const cutoff=String(R.corteDec||R.hoje||'').slice(0,10);
   const year=Number((F.mes||cutoff).slice(0,4)),month=F.mes?Number(F.mes.slice(5,7)):0;
   const causes=M.causes(raw('dec_mes'),{year,month,conj:F.conj,match:em});
   const budget=C.sigoraBudget();
   const teamMonth=month||raw('equipes').reduce((max,row)=>Math.max(max,Number(row.mes)||0),0);
   const samePolo=row=>(!F.poloGlobal||M.norm(row.polo)===M.norm(F.poloGlobal))&&em(F.polo,row.polo);
   const teams=raw('equipes').filter(row=>row.eq&&samePolo(row)&&Number(row.mes)===teamMonth&&(!row.ano||Number(row.ano)===year));
   const teamRows=C.agrupa(teams,row=>row.eq,(a,x)=>{
    a.eq=x.eq;a.polo=x.polo;a.tipo=x.tipo;
    for(const field of ['dias','man','poda','insp','prog','progExec','horas'])if(Number.isFinite(x[field]))C.add(a,field,x[field]);
   });
   const planned=summarize(teams,'prog'),done=summarize(teams,'progExec'),critical=groups.reduce((n,r)=>n+r.missing,0);
   const topCauses=causes.filter((row,i)=>i===0||causes[i-1].conjunto!==row.conjunto).sort((a,b)=>(b.share??0)-(a.share??0));
   const actionMissing=inspections.filter(x=>x.status==='Criar OS de inspeção').sort((a,b)=>a.tr.localeCompare(b.tr)||((b.decProj??-1)-(a.decProj??-1))||String(a.chave).localeCompare(String(b.chave)));
   const progressCards=groups.map(g=>'<div class="sigora-progress-card"><strong>'+g.key+'</strong><span>'+num(g.done)+' de '+num(g.total)+' chaves</span><progress aria-label="Avanço '+g.key+'" value="'+g.done+'" max="'+Math.max(g.total,1)+'"></progress><small>'+num(g.open)+' com OS · '+num(g.missing)+' para criar · '+num(g.review)+' a conferir</small></div>').join('');
   el.innerHTML='<section class="sigora-hero"><span class="eyebrow">PAUTA DE REUNIÃO</span><h2>Onde atacar agora</h2><p>Veja o que falta inspecionar, as causas que mais pesam no DEC de cada conjunto e os recursos para planejar a execução.</p>'+
    '<div class="sigora-actions">'+act('simular','Simular carteira')+act('mapa','Abrir mapa de poda')+act('marcos','Conferir premissas')+'</div></section>'+
    '<nav class="sigora-calendar" aria-label="Seções da reunião">'+[['sigoraBudgetMeeting','Orçamento'],['sigoraProgressMeeting','Avanço T1/T2/T3'],['sigoraCauseMeeting','Causas por conjunto'],['sigoraTeamsMeeting','Equipes']].map(([id,title])=>'<button type="button" data-meeting-section="'+id+'">'+title+'</button>').join('')+'</nav>'+
    kpis([
     ['Chaves sem OS de inspeção',num(critical),'No recorte T1/T2/T3'],
     ['Equipes no recorte mensal',teamMonth&&C.dados.equipes?num(teamRows.length):'—',teamMonth?'Registro do mês '+String(teamMonth).padStart(2,'0'):'Sem mês disponível na base'],
     ['Aderência registrada',pct(planned>0&&done!=null?done/planned:null),done==null?'Programação sem referência completa':num(done)+' concluídas de '+num(planned)+' programadas'],
     ['Corte do DEC',isoBR(cutoff),'Consolidado de '+isoBR(R.hoje)]
    ])+
    '<div class="sigora-layout">'+painel('Criar OS primeiro','T1, T2 E T3 · DEC PROJETADO DESEMPATA NO TRECHO','sigoraTopActions')+
    painel('Causa dominante por conjunto','MAIOR PARCELA DO DEC NO PRÓPRIO CONJUNTO','sigoraFocus')+'</div>'+
    painel('Orçamento disponível para planejar','TODA A BASE · VALORES DO CONSOLIDADO','sigoraBudgetMeeting')+
    '<div class="sigora-progress-grid">'+progressCards+'</div>'+painel('Avanço da inspeção por trecho','MARCO POR FRENTE OU MARCO GERAL','sigoraProgressMeeting')+
    painel('Pendências e rastreio por chave','LISTA DO RECORTE · EXPORTÁVEL','sigoraActionsMeeting')+
    painel('Causas por conjunto','DEC DO CONJUNTO POR CAUSA','sigoraCauseMeeting')+
    painel('Equipes e avanço da programação','PRODUÇÃO E APRESENTAÇÃO REGISTRADAS','sigoraTeamsMeeting');
   el.querySelectorAll('[data-meeting-section]').forEach(button=>button.onclick=()=>$(button.dataset.meetingSection).scrollIntoView({block:'start'}));
   const status=(value)=>C.sit(value,statusColors[value]);
   tabela($('sigoraTopActions'),[
    {t:'Trecho',k:'tr'},{t:'Chave',k:'chave'},{t:'Conjunto',k:x=>name(R,x.conj)},{t:'Alimentador',k:'alim'},{t:'DEC proj. da chave (min)',k:'decProj',n:1,f:v=>num(v,1)}
   ],actionMissing,{pagina:6});
   tabela($('sigoraFocus'),[
    {t:'Conjunto',k:x=>name(R,x.conjunto)},{t:'Causa',k:'cause',q:1},{t:'% do DEC do conjunto',k:'share',n:1,f:pct}
   ],topCauses,{pagina:6});
   tabela($('sigoraBudgetMeeting'),[
    {t:'Bolsa',k:'title'},{t:'Ano',k:()=>budget.year},{t:'Orçado',k:'planned',n:1,f:money},{t:'Realizado até o corte',k:'actual',n:1,f:money},
    {t:'Saldo do orçamento',k:x=>x.planned==null||x.actual==null?null:x.planned-x.actual,n:1,f:money},{t:'Projeção de fechamento',k:'forecast',n:1,f:money},
    {t:'Margem projetada',k:x=>x.planned==null||x.forecast==null?null:x.planned-x.forecast,n:1,f:money},{t:'Fonte',k:'source'}
   ],budget.lines,{pagina:5});
   $('sigoraBudgetMeeting').insertAdjacentHTML('beforeend','<p class="nota">Saldo do orçamento = orçado menos realizado até o corte. Margem projetada = orçado menos a projeção de fechamento. Para alocar OS, confira o saldo autorizado no financeiro. '+act('cenarios','Comparar cenários CAPEX/OPEX')+'</p>');
   tabela($('sigoraProgressMeeting'),[
    {t:'Trecho',k:'key'},{t:'Chaves no recorte',k:'total',n:1},{t:'Inspecionadas',k:'done',n:1},{t:'Avanço',k:r=>r.total?r.done/r.total:null,n:1,f:pct},
    {t:'OS já aberta',k:'open',n:1},{t:'Falta criar OS',k:'missing',n:1},{t:'Conferir dados',k:'review',n:1},{t:'Estruturas no cadastro',k:'inventory',n:1,f:num},{t:'Estruturas apontadas',k:x=>x.measured?x.structures:null,n:1,f:num},{t:'Chaves com contagem',k:'measured',n:1}
   ],groups,{pagina:5});
   $('sigoraProgressMeeting').insertAdjacentHTML('beforeend','<p class="nota">T1 e T2 incluem todas as chaves classificadas no recorte. T3 inclui chaves com OS de inspeção registrada. O avanço usa chaves com inspeção comprovada desde o marco. A coluna de estruturas apontadas soma apenas as chaves com contagem informada no consolidado.</p>');
   tabela($('sigoraActionsMeeting'),[
    {t:'Trecho',k:'tr'},{t:'Chave',k:'chave'},{t:'Polo',k:'polo'},{t:'Conjunto',k:x=>name(R,x.conj)},{t:'Alimentador',k:'alim'},
    {t:'Situação',k:'status',h:status},{t:'OS de inspeção',k:'os'},{t:'Data marco',k:x=>Number.isFinite(x.mark)?C.iso(x.mark):'',f:isoBR},
    {t:'Última inspeção',k:x=>x.last==null?'':C.iso(x.last),f:isoBR},{t:'Estruturas apontadas',k:'covered',n:1,f:num}
   ],actions.sort((a,b)=>labels.indexOf(a.status)-labels.indexOf(b.status)||a.tr.localeCompare(b.tr)),{pagina:20,csv:'sigora_avanco_inspecoes'});
   tabela($('sigoraCauseMeeting'),[
    {t:'Conjunto',k:x=>name(R,x.conjunto)},{t:'Causa',k:'cause',q:1},{t:'DEC no conjunto (h)',k:'dec',n:1,f:v=>num(v,2)},{t:'% do DEC do conjunto',k:'share',n:1,f:pct}
   ],causes,{pagina:16,csv:'sigora_causas_por_conjunto'});
   $('sigoraCauseMeeting').insertAdjacentHTML('beforeend','<p class="nota">Período: '+esc(F.mes?isoBR(F.mes+'-01').slice(3):String(year||'—'))+'. O DEC por causa está consolidado por conjunto. Os filtros de polo, alimentador, trecho e chave se aplicam à inspeção, conforme a origem dos dados.</p>');
   tabela($('sigoraTeamsMeeting'),[
    {t:'Equipe',k:'eq'},{t:'Polo',k:'polo'},{t:'Tipo',k:'tipo'},{t:'Dias registrados',k:'dias',n:1,f:num},{t:'Horas registradas',k:'horas',n:1,f:v=>metricValue(v,'h')},
    {t:'Manutenção',k:'man',n:1,f:num},{t:'Poda',k:'poda',n:1,f:num},{t:'Inspeção',k:'insp',n:1,f:num},{t:'Programadas',k:'prog',n:1,f:num},
    {t:'Concluídas da programação',k:'progExec',n:1,f:num},{t:'Aderência',k:x=>x.prog>0&&x.progExec!=null?x.progExec/x.prog:null,n:1,f:pct}
   ],teamRows,{pagina:12,csv:'sigora_equipes_reuniao'});
   $('sigoraTeamsMeeting').insertAdjacentHTML('beforeend','<p class="nota">Equipes por polo e mês. Horas registradas são histórico. Preencha as horas disponíveis no '+act('simular','simulador de carteira')+'.</p>');
  }
 };
})();
