'use strict';
(()=>{
 const C=Central,M=CampoSimulaCarteira,{esc,num}=C;
 const policies={ordem:'Ordem publicada da carteira',dec:'Maior DEC projetado por chave'};
 const memory=[{policy:'ordem'},{policy:'ordem'}];
 const cash=value=>value==null?'—':'R$ '+num(value,2);
 const hours=value=>value==null?'—':num(value/60,2)+' h';
 const topLink=(route,label)=>'<a class="button-link" href="#'+route+'">'+label+'</a>';
 function renderForm(index){
  const config=memory[index];
  return '<form class="panel" data-carteira-scenario="'+index+'"><h3>Cenário '+(index?'B':'A')+'</h3>'+
   '<label>Critério de ordenação<select name="policy">'+Object.entries(policies).map(([k,v])=>'<option value="'+k+'"'+(config.policy===k?' selected':'')+'>'+v+'</option>').join('')+'</select></label>'+
   '<div class="sigora-scenario-fields">'+Object.entries(M.bounds).map(([key,label])=>'<label>'+label+'<input name="'+key+'" type="number" required min="0" max="10000000000" step="0.01" value="'+esc(config[key]??'')+'" placeholder="Informe o limite"></label>').join('')+'</div><div class="sigora-actions"><button type="button" data-carteira-demand>Usar demanda elegível como limite</button></div></form>';
 }
 function scenarioTotals(result){
  if(!result)return [null,null,null,null,null,null];
  const {used}=result;
  return [result.selected,used.capex/100,used.opex/100,used.poda/100,used.viva,used.morta];
 }
 function csvSafe(value){
  if(typeof value==='number')return String(value).replace('.',',');
  return String(value??'').replace(/^[\x00-\x1f\s]*[=+@-]/,s=>"'"+s);
 }
 function decisionText(decision){
  return decision?.status||'Sem simulação';
 }
 C.views.simular={
  mod:'man',eyebrow:'MANUTENÇÃO',titulo:'Simular carteira de OS',precisa:['os_abertas'],filtros:['alim','chave','pri','recurso'],
  render(filters,el){
   const rows=C.linhas('os_abertas').filter(r=>C.em(filters.alim,r.alim)&&C.keyMatches(filters.chave,r.chave)&&C.em(filters.pri,r.pri)&&C.em(filters.recurso,r.recurso));
   const pool=M.candidates(rows,C.linhasRaw('chaves'));
   const demand={capex:0,opex:0,poda:0,viva:0,morta:0};
   for(const item of pool.ordem){
    if(item.reasons.length)continue;
    demand[item.band]+=item.resource/100;
    demand[item.team]+=item.duration/60;
   }
   el.innerHTML='<section class="sigora-hero"><span class="eyebrow">CARTEIRA OPERACIONAL</span><h2>O que cabe nos recursos disponíveis?</h2><p>Compare a seleção das OS da base central para o mesmo recorte. Informe zero para um recurso indisponível.</p>'+
    '<div class="sigora-actions">'+topLink('carteira','Abrir carteira publicada')+topLink('cenarios','Comparar orçamento anual')+'</div></section>'+
    '<div class="sigora-layout">'+renderForm(0)+renderForm(1)+'</div>'+
    '<section class="panel"><div class="panel-head"><div><h3>Comparação de execução</h3><p class="sigora-muted">'+num(pool.ordem.length)+' OS no recorte · '+num(pool.ordem.filter(x=>x.reasons.length).length)+' para conferência</p></div>'+
    '<button type="button" id="carteiraCopy">Copiar limites de A para B</button></div><p id="carteiraStatus" role="status" class="sigora-muted"></p><div class="table-wrap"><table><thead><tr><th scope="col">Indicador</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Variação B − A</th></tr></thead><tbody id="carteiraTotals"></tbody></table></div></section>'+
    '<section class="panel"><div class="panel-head"><div><h3>Auditoria por OS</h3><p class="sigora-muted">O custo estimado soma material e mão de obra. O DEC projetado é referência da chave para ordenar as OS. A simulação usa os saldos a cada seleção e fica nesta sessão.</p></div>'+
    '<label>Mostrar<select id="carteiraDecision"><option value="all">Todas as OS</option><option value="a">Selecionadas em A</option><option value="b">Selecionadas em B</option><option value="review">Conferir dados</option></select></label></div><div id="carteiraAudit"></div></section>';
   const form=[...el.querySelectorAll('[data-carteira-scenario]')],decision=el.querySelector('#carteiraDecision'),auditTable=el.querySelector('#carteiraAudit');
   const rowIndex=new Map(pool.ordem.map((item,i)=>[item,i]));
   let results=[],timer,dirty=false;
   function audit(){
    const filter=decision.value;
    const display=pool.ordem.map(item=>({item,a:results[0]?.get(item),b:results[1]?.get(item)})).filter(({item,a,b})=>
     filter==='all'||(filter==='a'&&a?.status==='Selecionada')||(filter==='b'&&b?.status==='Selecionada')||(filter==='review'&&item.reasons.length));
    C.tabela(auditTable,[
     {t:'Ordem',k:x=>x.item.rank,n:1},{t:'OS',k:x=>csvSafe(x.item.id),h:(v,x)=>'<button type="button" class="quiet" data-carteira-detail="'+rowIndex.get(x.item)+'">'+esc(x.item.id||'Sem ID')+'</button>'},
     {t:'Alimentador',k:x=>csvSafe(x.item.row.alim),h:(v,x)=>esc(x.item.row.alim||'—')},
     {t:'Recurso',k:x=>csvSafe(x.item.row.recurso),h:(v,x)=>esc(x.item.row.recurso||'—')},
     {t:'Custo estimado (R$)',k:x=>x.item.resource==null?null:x.item.resource/100,n:1,f:cash},
     {t:'Equipe',k:x=>x.item.team},
     {t:'Duração (h)',k:x=>x.item.duration==null?null:x.item.duration/60,n:1,f:v=>num(v,2)},
     {t:'DEC projetado da chave (min)',k:x=>x.item.dec,n:1,f:v=>num(v,2)},
     {t:'Cenário A',k:x=>decisionText(x.a)},
     {t:'Motivo A',k:x=>(x.a?.issues||x.item.reasons).join(' · '),q:1},
     {t:'Cenário B',k:x=>decisionText(x.b)},
     {t:'Motivo B',k:x=>(x.b?.issues||x.item.reasons).join(' · '),q:1}
    ], display, {pagina:25,csv:!dirty&&results.some(Boolean)?'sigora_carteira_simulada':''});
   }
   auditTable.onclick=e=>{
    const button=e.target.closest('[data-carteira-detail]');
    if(!button)return;
    const item=pool.ordem[Number(button.dataset.carteiraDetail)];
    const {row}=item;
    const fields=[[
     'Origem',row.origem||'Ordens abertas do consolidado central'
    ],['Serviço',row.classe||row.tipo],['Chave e alimentador',[row.chave,row.alim].filter(Boolean).join(' · ')],
    ['Prioridade publicada',row.pri],['Classificação do recurso',row.recurso],['Confiança da classificação',row.conf],
    ['Material / mão de obra',cash(row.mat)+' / '+cash(row.mo)],['Horas previstas',hours(item.duration)],
    ['DEC projetado da chave',item.dec==null?'—':num(item.dec,2)+' min'],
    ...results.map((map,i)=>{const outcome=map?.get(item);return ['Cenário '+(i?'B':'A'),outcome?[outcome.status,...outcome.issues].join(' · '):'Sem simulação'];})];
    C.abre('AUDITORIA DA CARTEIRA',item.id||'OS sem identificador',fields.map(([label,value])=>'<p><strong>'+esc(label)+'</strong> · '+esc(value||'—')+'</p>').join(''));
   };
   function calculate(){
    if(!el.contains(form[0]))return;
    dirty=false;
    const runs=form.map(f=>{
     if(!f.checkValidity()||!C.dados.os_abertas)return null;
     const mode=f.elements.policy.value;
     const limits=Object.fromEntries(Object.keys(M.bounds).map(k=>[k,f.elements.namedItem(k).valueAsNumber]));
     return {mode,...M.simulate(pool[mode],limits)};
    });
    results=runs.map(result=>result?new Map(pool[result.mode].map((item,i)=>[item,result.decisions[i]])):null);
    const [a,b]=runs.map(scenarioTotals);
    const labels=['OS selecionadas','CAPEX estimado','OPEX de manutenção estimado','Poda e faixa estimadas','Linha viva utilizada','Linha morta utilizada'];
    const formats=[num,cash,cash,cash,hours,hours];
    el.querySelector('#carteiraTotals').innerHTML=labels.map((label,i)=>{
     const format=formats[i],diff=a[i]==null||b[i]==null?null:b[i]-a[i];
     return '<tr><th scope="row">'+label+'</th><td>'+format(a[i])+'</td><td>'+format(b[i])+'</td><td>'+format(diff)+'</td></tr>';
    }).join('');
    el.querySelector('#carteiraStatus').textContent=!C.dados.os_abertas?'A geração atual da base ainda não contém ordens de serviço.':runs.every(Boolean)?'Comparação atualizada.':'Preencha todos os limites do cenário para calcular.';
    audit();
   }
   const queue=()=>{
    dirty=true;
    el.querySelector('#carteiraStatus').textContent='Recalculando…';
    const exportButton=el.querySelector('#carteiraAudit [data-csv]');
    if(exportButton)exportButton.disabled=true;
    clearTimeout(timer);
    timer=setTimeout(calculate,150);
   };
   form.forEach((f,i)=>{
    f.onsubmit=e=>e.preventDefault();
    f.querySelector('[data-carteira-demand]').onclick=()=>{
     for(const key of Object.keys(M.bounds)){
      const value=(Math.ceil(demand[key]*100-1e-7)/100).toFixed(2);
      memory[i][key]=value;
      f.elements.namedItem(key).value=value;
     }
     clearTimeout(timer);
     calculate();
    };
    f.oninput=e=>{if(e.target.name){memory[i][e.target.name]=e.target.value;queue();}};
   });
   el.querySelector('#carteiraCopy').onclick=()=>{
    for(const key of Object.keys(M.bounds)){
     const value=form[0].elements.namedItem(key).value;
     memory[1][key]=value;
     form[1].elements.namedItem(key).value=value;
    }
    clearTimeout(timer);
    calculate();
   };
   decision.onchange=audit;
   calculate();
  }
 };
})();
