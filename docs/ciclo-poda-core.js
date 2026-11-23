'use strict';
// Modelo do arquivo Ciclo_Poda.html e da aba Ciclo Poda de Controle Man V1.
const CP = (function () {
  const MS = 86400000, EPOCH = Date.UTC(1899, 11, 30);
  const ymd = s => { const d = new Date(EPOCH + Math.floor(s) * MS); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()]; };
  const DATE = (y, m, d) => Math.round((Date.UTC(y, m - 1, d) - EPOCH) / MS);       // =DATE() com estouro de mês/dia igual ao Excel
  const addMeses = (s, n) => { const [y, m, d] = ymd(s); return DATE(y, m + n, d); };   // =DATE(YEAR(d),MONTH(d)+n,DAY(d))
  const mesesEntre = (a, b) => { const [y0, m0, d0] = ymd(a), [y, m, d] = ymd(b); return (y - y0) * 12 + m - m0 - (d < d0 ? 1 : 0); };
  const hojeSerial = () => {
    const date = new Intl.DateTimeFormat('sv-SE', {timeZone:'America/Rio_Branco', year:'numeric', month:'2-digit', day:'2-digit'}).format();
    return DATE(...date.split('-').map(Number));
  };
  const fmt = s => { if (s == null || s === '' || isNaN(s)) return ''; const [y, m, d] = ymd(s); return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/' + y; };
  const isNum = v => Number.isFinite(v);

  function janelas(par, n) {
    const out = [];
    for (let k = 1; k <= n; k++) {
      const ini = addMeses(par.inicio, par.janela * (k - 1)), fim = addMeses(par.inicio, par.janela * k) - 1;
      out.push({ k, ini, fim, rotulo: `C${k} (${fmt(ini)} a ${fmt(fim)})` });
    }
    return out;
  }
  const idxJanela = (d, par) => (!isNum(d) ? null : (d < par.inicio ? 0 : 1 + Math.floor(mesesEntre(par.inicio, d) / par.janela)));
  const cicloAtual = (par, hoje) => Math.max(1, 1 + Math.floor(mesesEntre(par.inicio, hoje) / par.janela));

  // Calcula as colunas derivadas de um poste (J, O, P, Q, S, T, U, V, W, Y e Data Prevista C1..Cn)
  function calcula(p, par, hoje, nCiclos) {
    const faixa = /FAIXA/i.test(p.tipo || '');
    const speciesCycle = p.nvera > 0 && p.cicloExcel > 0 && isNum(p.cicloExcel) && p.origc === 'Espécie (VERA)';
    const J = speciesCycle ? p.cicloExcel : (faixa ? par.faixa : par.padrao);
    const origem = speciesCycle ? 'Espécie (VERA)' : (faixa ? 'Limpeza de faixa' : `Padrão ${par.padrao} meses`);
    const pend = p.status === 'PENDENTE';
    let P;
    if (pend) P = p.criacao;
    else if (isNum(p.execucao)) P = addMeses(p.execucao, J);
    else if (isNum(p.criacao)) P = addMeses(p.criacao, J);
    else P = null;
    const kUlt = idxJanela(p.execucao, par);
    const cicloUlt = kUlt == null ? 'Sem execução' : (kUlt === 0 ? 'Antes do marco' : 'C' + kUlt);
    const Q = isNum(P) ? Math.max(1, idxJanela(P, par)) : null;
    const cur = cicloAtual(par, hoje);
    const S = pend ? 'Pendente (OS aberta)' : (!isNum(P) ? 'Sem data' : (P < hoje ? 'Atrasada' : (Q === cur ? 'No ciclo atual' : 'Próximos ciclos')));
    const T = isNum(P) ? Math.floor(P) - hoje : null;
    const base = isNum(P) ? (P < par.inicio ? par.inicio : P) : null;
    const U = base != null ? addMeses(base, J) : null;
    const V = U != null ? Math.max(1, idxJanela(U, par)) : null;
    const W = V != null && Q != null ? (V - Q <= 1 ? 'Toda janela' : `Pula ${V - Q - 1} janela(s)`) : '';
    const m0 = base != null ? mesesEntre(par.inicio, base) : null;
    const prev = [];
    for (let k = 1; k <= nCiclos; k++) {
      if (m0 == null) { prev.push(null); continue; }
      const a = (k - 1) * par.janela, b = k * par.janela - 1;
      const jm = a > m0 ? Math.ceil((a - m0) / J) : 0;
      prev.push(m0 + jm * J <= b ? addMeses(base, jm * J) : null);
    }
    return { J, origem, P, Q, S, T, U, V, W, m0, prev, cicloUlt };
  }

  return { ymd, DATE, addMeses, mesesEntre, hojeSerial, fmt, isNum, janelas, idxJanela, cicloAtual, calcula };
})();


// ===== Agregações da visão gerencial (porta da aba "Gerencial Ciclos") =====
CP.filtroTrecho = (tr, sel) => sel === 'Todos' ? true
  : sel === 'T1+T2' ? (tr === 'T1' || tr === 'T2')
  : sel === 'T1+T2+T3' ? (tr === 'T1' || tr === 'T2' || tr === 'T3')
  : tr === sel;
CP.gerencial = function (postes, execs, par, k, jan) {
  // postes: objetos já calculados com .calc e .fg (filtro gerencial 0/1)
  const J = jan[k - 1], r = { postes: 0, arv: 0, exec: 0, pend: 0, atras: 0, faixa: 0, polo: Object.create(null), conj: Object.create(null), mes: [] };
  for (let m = 1; m <= par.janela; m++) r.mes.push({ m, ini: CP.addMeses(J.ini, m - 1), fim: CP.addMeses(J.ini, m) - 1, postes: 0, arv: 0, exec: 0, polo: Object.create(null) });
  const nk = id => r.conj[id] || (r.conj[id] = { postes: 0, arv: 0, T1: 0, T2: 0, T3: 0, pend: 0, atras: 0, exec: 0, polo: '' });
  for (const p of postes) {
    if (!p.fg) continue;
    const dt = p.calc.prev[k - 1];
    if (!CP.isNum(dt)) continue;
    const a = p.arv || 0, cj = nk(p.conj || 'Sem conjunto');
    cj.polo = p.polo || 'Sem polo';
    r.postes++; r.arv += a; r.faixa += p.faixa || 0; r.polo[p.polo] = (r.polo[p.polo] || 0) + a;
    cj.postes++; cj.arv += a; if (cj[p.trecho] != null) cj[p.trecho] += a;
    if (p.status === 'PENDENTE') { r.pend += a; cj.pend += a; }
    if (p.calc.S === 'Atrasada' && p.calc.Q === k) { r.atras += a; cj.atras += a; }
    for (const M of r.mes) if (dt >= M.ini && dt <= M.fim) { M.postes++; M.arv += a; M.polo[p.polo] = (M.polo[p.polo] || 0) + a; }
  }
  for (const e of execs) {
    const p = e.p; if (!p || !p.fg) continue;
    if (e.dt >= J.ini && e.dt < J.fim + 1) {
      r.exec += e.q; nk(p.conj || 'Sem conjunto').exec += e.q;
      for (const M of r.mes) if (e.dt >= M.ini && e.dt < M.fim + 1) M.exec += e.q;
    }
  }
  return r;
};

CP.norm = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
CP.postId = value => CP.norm(value).replace(/^226-/,'');
CP.treeId = value => String(value ?? '').trim().replace(/^vera-/i,'');
CP.location = (lat,lon) => Number.isFinite(lat) && Number.isFinite(lon) && lat !== 0 && lon !== 0 && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? [lat,lon] : null;
CP.postPoint = post => CP.location(post.latP,post.lonP) || CP.location(post.lat,post.lon) || CP.location(post.latA,post.lonA);
CP.service = post => /FAIXA/.test(CP.norm(post.cat+' '+post.tipo)) && !(post.arv>0) ? 'faixa' : 'poste';
CP.decode = block => {
  if (!Array.isArray(block?.campos) || !Array.isArray(block.linhas) || !block.dic || !block.campos.includes('id')) throw Error('Tabela inválida na base de ciclo.');
  return block.linhas.map(row => {
    if (!Array.isArray(row) || row.length !== block.campos.length) throw Error('Linha incompleta na base de ciclo.');
    return Object.fromEntries(block.campos.map((key,i)=>[key,Object.hasOwn(block.dic,key)?block.dic[key][row[i]]:row[i]]));
  });
};
CP.source = data => {
  const par=data?.parametros;
  if (!par || !Number.isInteger(par.inicio) || par.inicio<30000 || par.inicio>90000 ||
      !['janela','padrao','faixa'].every(key=>Number.isInteger(par[key]) && par[key]>0 && par[key]<=120) ||
      !Array.isArray(data.execucoes) || !Array.isArray(data.checagem_excel)) throw Error('A base de ciclo está incompleta ou tem parâmetros inválidos.');
  const postes=CP.decode(data.postes), arvores=CP.decode(data.arvores);
  if (!postes.length || data.checagem_excel.length!==postes.length) throw Error('A base de postes e os resultados de conferência precisam ter a mesma quantidade de linhas.');
  postes.forEach(p=>{p.cicloExcel=p.ciclo;p.point=CP.postPoint(p);});
  const index=new Map(postes.map(p=>[CP.postId(p.id),p]));
  return {postes,arvores,index,execs:data.execucoes.map(([id,dt,q])=>({p:index.get(CP.postId(id)),dt,q})),par,check:data.checagem_excel,
    source:data.fonte||{},generated:data.gerado_em,classes:data.classes||[]};
};
CP.overlay = (source,snapshot) => {
  const reference=new Map((source?.arvores||[]).map(row=>[CP.treeId(row.id),row]));
  if(!snapshot?.catalogReady)return [...reference.values()].map(row=>({...row,origin:'excel'}));
  return (snapshot.trees||[]).map(entry=>{
    const raw=entry.raw||{}, field=entry.origem==='Campo (prévia)', live=Boolean(entry.raw||entry.campoId);
    const link=raw.externalId||(/^vera-/i.test(entry.id)||!field?entry.id:'');
    const base=link?reference.get(CP.treeId(link)):null;
    const row={...base,id:entry.id,origin:field?'campo':'vera',live,recordId:entry.campoId||raw.id,
      esp:entry.especies||raw.species||base?.esp,classe:entry.classe||base?.classe,alim:entry.alimentador||raw.feeder||base?.alim,
      trecho:entry.trecho||base?.trecho,chave:entry.chave||base?.chave,polo:entry.polo||base?.polo,conj:entry.conjunto||entry.conj||base?.conj,posteGIS:entry.poste||raw.pole||base?.posteGIS,
      lat:entry.lat??base?.lat,lon:entry.lon??base?.lon,altura:entry.altura??raw.height??base?.altura,dap:entry.dap??base?.dap,
      acao:entry.acao||base?.acao,motivo:entry.motivo||base?.motivo,poda:raw.poda,site:raw.treeSite};
    return row;
  });
};
CP.structureSources = (rows, orders=[]) => {
  const latest=CP.latestPruningOrders(orders);
  const posts=new Map();
  for(const row of rows){
    const id=CP.postId(row.id);
    if(!id)continue;
    const ss=Number(row.nSS)||0,os=(Number(row.nEx)||0)+(Number(row.nAb)||0)+(Number(row.nSem)||0);
    const order=latest.get(id),osOpen=Math.max((Number(row.nAb)||0)+(Number(row.nSem)||0),order?1:0);
    if(!ss&&!os&&!order)continue;
    const execucao=CP.centralDate(row.ult);
    const criada=CP.centralDate(order?.criada)??(CP.norm(row.baseF)==='CRIACAO DA OS'?CP.centralDate(row.base):null);
    posts.set(id,{id:'226-'+id,vera:row.vera,ss,ssOpen:row.ssAb||0,ssWithoutOS:row.ssSem||0,os:Math.max(os,order?1:0),osOpen,arvE:row.arvE,cat:row.cat,execucao,
      criacao:criada,tipo:order?.desc||order?.tipo||(execucao!=null?'PODA':''),statusSGM:order?.status||(osOpen?'':execucao!=null?'EXECUTADA':''),
      status:osOpen?'PENDENTE':'',orderId:order?.os,equipe:order?.eqProg||row.eq,
      polo:row.polo||order?.polo,conj:row.conj||order?.conj,alim:row.alim||order?.alim,chave:row.chave||order?.chave,
      trecho:CP.segment(row.tr)||CP.segment(order?.tr),perim:CP.perimeter(row.per)||CP.perimeter(order?.per),
      point:CP.location(Number(row.lat),Number(row.lon))||CP.location(Number(order?.lat),Number(order?.lon))});
  }
  return posts;
};

// O consolidado usa dias desde 01/01/2020; o ciclo trabalha com datas seriais do Excel.
const CENTRAL_DATE = CP.DATE(2020,1,1);
CP.centralDate = day => Number.isInteger(day) && day>=0 && day<20000 ? CENTRAL_DATE+day : null;
CP.perimeter = value => ({R:'RURAL',RURAL:'RURAL',U:'URBANO',URBANO:'URBANO',URBANA:'URBANO'})[CP.norm(value)]||'';
CP.segment = value => {
  const number=CP.norm(value).replace(/^T\s*/,'');
  return /^[1-3]$/.test(number)?'T'+number:'';
};
CP.territory = (row,names,linked={}) => {
  const name=String(row.conj||linked.conj||'').trim();
  const conjunto=names[name]||(!/^\d+$/.test(name)?name:linked.conj);
  return {conj:conjunto&&!/^\d+$/.test(String(conjunto))?String(conjunto).toLocaleUpperCase('pt-BR'):'',
    perim:CP.perimeter(row.perim)||CP.perimeter(linked.perim),trecho:CP.segment(row.trecho)||CP.segment(linked.trecho),
    polo:CP.norm(row.polo||linked.polo),alim:CP.norm(row.alim||linked.alim),chave:row.chave||linked.chave||''};
};
CP.latestPruningOrders = rows => {
  const index=new Map();
  for(const order of rows){
    if(CP.norm(order.tipo)!=='PODA'||order.expurgo||!/^\d+$/.test(CP.postId(order.poste)))continue;
    const id=CP.postId(order.poste),previous=index.get(id);
    if(!previous||(order.criada??-1)>(previous.criada??-1)||order.criada===previous.criada&&Number(order.os)>Number(previous.os))index.set(id,order);
  }
  return index;
};
CP.statuses = row => {
  const statuses=new Set([row.groupStatus,row.post?.groupStatus].filter(Boolean));
  const structure=row.post||row;
  if(structure.ssWithoutOS>0)statuses.add('SS aberta sem OS');
  if(structure.ssOpen>0)statuses.add('SS aberta');
  if(structure.osOpen>0||structure.status==='PENDENTE')statuses.add('Pendente (OS aberta)');
  return statuses;
};
CP.centralPlan = (posts,names,updatedAt) => {
  const postes=[...posts.values()].map(row=>({...row,...CP.territory(row,names),nvera:row.vera,arv:row.arvE,cycleQtyBasis:'Estimativa do Parque de Poda'}));
  const index=new Map(postes.map(row=>[CP.postId(row.id),row]));
  // Mesmas janelas do arquivo de referência. O consolidado fornece as datas observadas por poste.
  return {postes,index,arvores:[],execs:[],check:[],classes:[],estimated:true,
    par:{inicio:CP.DATE(2026,10,2),janela:6,padrao:6,faixa:12},source:{local:'Parque de Poda / SGM',modificado:updatedAt}};
};

if(typeof module!=='undefined')module.exports=CP;
