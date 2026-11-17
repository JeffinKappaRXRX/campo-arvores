'use strict';
(() => {
  const C = Central;
  const {esc, num, brl, mi, kpis, isoBR} = C;
  const nav = (route, label) => '<a class="button-link" href="#'+route+'">'+esc(label)+'</a>';
  const list = links => '<ul class="sigora-link-grid">'+links.map(([route,label])=>'<li><a href="'+route+'">'+esc(label)+' →</a></li>').join('')+'</ul>';
  function sum(rows, key) {
    if (!rows.length || rows.some(r => !Number.isFinite(r[key]))) return null;
    return rows.reduce((total, row) => total + row[key], 0);
  }
  function budget() {
    const orc = C.dados.resumo?.orc;
    const opex = C.linhasRaw('opex').filter(r => r.ano === orc?.ano);
    return {year:orc?.ano, lines:[
      {key:'capex', title:'CAPEX', source:'Obras por SIGCO', planned:sum(orc?.sigcos||[],'anual'), forecast:sum(orc?.sigcos||[],'forecast')},
      {key:'opex', title:'OPEX', source:'OPEX por frente · SIACO', planned:sum(opex,'o'), forecast:sum(opex,'f')}
    ]};
  }
  function maintenance(filters) {
    return C.linhas('os_abertas').filter(row=>!row.expurgo && row.tipo!=='INSPEÇÃO' && C.em(filters.alim,row.alim) && C.em(filters.pri,row.pri));
  }
  function bars(rows) {
    const groups=C.agrupa(rows,r=>r.tipo||'Sem tipo').sort((a,b)=>b._n-a._n).slice(0,6);
    if (!groups.length) return '<p class="sigora-muted">Sem ordens de serviço para o recorte.</p>';
    return '<div class="sigora-chart">'+groups.map(g=>'<div class="sigora-chart-row"><span>'+esc(g._k)+'</span><strong>'+num(g._n)+'</strong><progress value="'+g._n+'" max="'+groups[0]._n+'" aria-label="'+esc(g._k)+'"></progress></div>').join('')+'</div>';
  }
  function forecastRow(line) {
    const margin=line.planned==null||line.forecast==null?null:line.planned-line.forecast;
    return '<tr><th scope="row">'+line.title+'</th><td>'+mi(line.planned)+'</td><td>'+mi(line.forecast)+'</td><td>'+mi(margin)+'</td></tr>';
  }
  function updateVegetation() {
    const element=document.getElementById('sigoraVegetationStatus');
    if (!element || parent===window) return;
    const snapshot=parent.CampoParque?.unifiedSnapshot?.();
    if (!snapshot) return;
    const fieldRecords=new Set(snapshot.trees.map(tree=>tree.raw?.id).filter(Boolean));
    element.textContent=fieldRecords.size
      ? num(fieldRecords.size)+' registros de campo disponíveis no mapa unificado. Contagem de toda a base de vegetação.'
      : 'Aguardando registros de campo no mapa unificado.';
  }
  if (parent!==window) parent.addEventListener('campo-unified-data',updateVegetation);

  C.views.inicio = {
    mod:'man', eyebrow:'SIGORA', titulo:'Visão geral da distribuição',
    precisa:['os_abertas','opex'], filtros:['alim','pri'],
    render(filters, el) {
      const rows=maintenance(filters);
      const vegetation=rows.filter(r=>r.tipo==='PODA'||r.tipo==='LIMPEZA DE FAIXA');
      const pending=C.rotina(C.dados.resumo?.fontes).filter(source=>source.pendente);
      const data=budget();
      const hasOrders=Boolean(C.dados.os_abertas);
      el.innerHTML =
        '<section class="sigora-hero"><span class="eyebrow">MANUTENÇÃO E ORÇAMENTO</span><h2>Da carteira à programação</h2><p>Acompanhe as ordens de serviço, o orçamento e os dados de vegetação que apoiam a manutenção da rede.</p>'+
        '<div class="sigora-actions">'+nav('carteira','Abrir carteira')+nav('programacao','Ver programação')+nav('cenarios','Comparar cenários')+'</div></section>'+
        kpis([
          ['OS abertas no recorte',num(hasOrders?rows.length:null),'Sem inspeções e registros de expurgo'],
          ['OS de poda e limpeza',num(hasOrders?vegetation.length:null),'Dentro das OS do recorte'],
          ['Alimentadores nas OS',num(hasOrders?C.unicos(rows.flatMap(r=>String(r.alim||'').split(',').map(id=>id.trim()))).length:null),'Códigos distintos das ordens de serviço'],
          ['Fontes a revisar',num(pending.length),'Consolidado · corte DEC '+isoBR(C.dados.resumo?.corteDec)]
        ])+
        '<div class="sigora-layout"><section class="panel"><h3>Ordens abertas por tipo</h3>'+bars(rows)+'</section>'+
        '<section class="panel"><h3>Orçamento consolidado'+(data.year?' · '+esc(data.year):'')+'</h3><p class="sigora-muted">Totais do ano para toda a base. Os filtros desta tela se aplicam às OS.</p>'+
        '<div class="table-wrap"><table><thead><tr><th scope="col">Recurso</th><th scope="col">Orçado</th><th scope="col">Projeção</th><th scope="col">Margem</th></tr></thead><tbody>'+data.lines.map(forecastRow).join('')+'</tbody></table></div>'+
        list([['#sigco','Obras por SIGCO'],['#opex','OPEX por frente'],['#cenarios','Comparar cenários']])+'</section>'+
        '<section class="panel"><h3>Manutenção da rede</h3>'+list([['#monitor','Monitor do dia'],['#bioperacional','Painel operacional'],['#cartprog','Carteira de programação'],['#dec','DEC por conjunto']])+'</section>'+
        '<section class="panel"><h3>Vegetação e qualidade dos dados</h3><p class="sigora-muted">O ARBORA fornece inspeções de vegetação. O VERA e o histórico de poda complementam o planejamento no SIGORA.</p><p id="sigoraVegetationStatus" class="sigora-muted" role="status"></p>'+
        list([['gestao.html#resumo','Conferir inspeções e cadastros'],['#mapa','Explorar mapa unificado'],['#manejo','Abrir planejamento de poda'],['#fontes','Conferir fontes e premissas']])+'</section></div>';
      updateVegetation();
    }
  };

  const scenarios=[{},{}];
  function scenarioForm(index, lines) {
    const values=scenarios[index];
    return '<form class="panel" data-sigora-scenario="'+index+'"><h3>Cenário '+(index===0?'A':'B')+'</h3><div class="sigora-scenario-fields">'+
      lines.flatMap(line=>[['planned','Limite'],['forecast','Projeção']].map(([field,label])=>{
        const name=line.key+'-'+field;
        return '<label>'+label+' '+line.title+' (R$)<input name="'+name+'" type="number" min="0" step="0.01" value="'+esc(values[name]??line[field]??'')+'" required></label>';
      })).join('')+'</div><div class="sigora-actions"><button type="button" data-sigora-reset="'+index+'">Restaurar dados da base</button></div></form>';
  }
  function scenarioValue(form,name) {
    const field=form.elements.namedItem(name);
    return field.value!==''&&field.validity.valid?field.valueAsNumber:null;
  }
  const delta=(a,b)=>a==null||b==null?null:b-a;
  const margin=(limit,forecast)=>limit==null||forecast==null?null:limit-forecast;
  function budgetCell(value, signed) {
    const style=signed&&value!=null?(value<0?'sigora-negative':value>0?'sigora-positive':''):'';
    return '<td class="'+style+'">'+brl(value)+'</td>';
  }
  C.views.cenarios={
    mod:'orc',eyebrow:'ORÇAMENTO',titulo:'Cenários CAPEX e OPEX',precisa:['opex'],filtros:[],
    render(_filters, el) {
      const data=budget();
      el.innerHTML='<section class="sigora-hero"><span class="eyebrow">SIMULAÇÃO ORÇAMENTÁRIA</span><h2>Compare limites e projeções</h2>'+
        '<p>Os dois cenários começam com os valores disponíveis no consolidado'+(data.year?' de '+esc(data.year):'')+'. Ajuste as premissas em reais para ver o efeito na margem.</p></section>'+
        '<div class="sigora-layout">'+data.lines.map(line=>'<section class="panel"><h3>'+line.title+'</h3><p class="sigora-muted">Origem: '+line.source+'</p><p>Orçado: <strong>'+brl(line.planned)+'</strong> · Projeção: <strong>'+brl(line.forecast)+'</strong></p></section>').join('')+'</div>'+
        '<div class="sigora-layout">'+scenarioForm(0,data.lines)+scenarioForm(1,data.lines)+'</div>'+
        '<section class="panel sigora-scenario-results"><h3>Comparação de cenários</h3><p class="sigora-muted">Margem = limite menos projeção. A variação da margem é B menos A. Ajustes valem nesta sessão.</p>'+
        '<div class="table-wrap"><table><thead><tr><th scope="col">Indicador</th><th scope="col">A</th><th scope="col">B</th><th scope="col">Variação</th></tr></thead><tbody id="sigoraComparison"></tbody></table></div><p role="status" id="sigoraScenarioStatus"></p></section>';
      const forms=[...el.querySelectorAll('[data-sigora-scenario]')];
      const update=()=>{
        const rows=data.lines.flatMap(({title,key})=>{
          const limits=forms.map(form=>scenarioValue(form,key+'-planned'));
          const forecasts=forms.map(form=>scenarioValue(form,key+'-forecast'));
          const margins=limits.map((limit,i)=>margin(limit,forecasts[i]));
          return [[title+' · Projeção',forecasts,false],[title+' · Margem',margins,true]];
        });
        el.querySelector('#sigoraComparison').innerHTML=rows.map(([label,[a,b],signed])=>'<tr><th scope="row">'+esc(label)+'</th>'+budgetCell(a,signed)+budgetCell(b,signed)+budgetCell(delta(a,b),signed)+'</tr>').join('');
        const incomplete=forms.some(form=>[...form.querySelectorAll('input')].some(field=>!field.validity.valid));
        el.querySelector('#sigoraScenarioStatus').textContent=incomplete?'Preencha os valores em aberto com números válidos e não negativos.':'';
      };
      forms.forEach((form,index)=>{
        form.addEventListener('submit',e=>e.preventDefault());
        form.addEventListener('input',e=>{scenarios[index][e.target.name]=e.target.value;update();});
        form.querySelector('[data-sigora-reset]').addEventListener('click',()=>{
          scenarios[index]={};
          for(const line of data.lines) {
            for(const key of ['planned','forecast']) form.elements.namedItem(line.key+'-'+key).value=line[key]??'';
          }
          update();
        });
      });
      update();
    }
  };
})();
