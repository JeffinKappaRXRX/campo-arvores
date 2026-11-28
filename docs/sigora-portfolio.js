'use strict';
// SIGORA V0.3: otimizacao exata de carteira pequena, multiobjetivo, SEM pesos arbitrarios.
// Retorna fronteira de Pareto; nao declara uma carteira unica "melhor" sem politica de desempate.
// Prototipo para cenarios anonimizados. Nao autoriza OS nem movimentacao financeira.
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.SigoraPortfolio=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
 const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
 const metrics=['riskReduction','decReduction','fecReduction'];
 const error=s=>{throw Error(s);};
 function validate(candidates,limits){
  if(!Array.isArray(candidates)||candidates.length>18)error('Lista deve conter ate 18 candidatos para busca exata.');
  if(!limits||!finite(limits.CAPEX)||!finite(limits.OPEX)||!finite(limits.crewHours))error('Limites CAPEX, OPEX e crewHours obrigatorios.');
  const ids=new Set();
  const normalized=candidates.map(c=>{
   if(!c||typeof c.id!=='string'||!c.id.trim()||ids.has(c.id))error('ID ausente ou duplicado.');
   ids.add(c.id);
   if(!['CAPEX','OPEX'].includes(c.budgetType))error('Classificacao orcamentaria invalida em '+c.id);
   if(!finite(c.cost)||!finite(c.crewHours)||metrics.some(k=>!finite(c[k])))error('Custo, horas ou beneficios invalidos em '+c.id);
   if(c.safetyBlocked===true||c.technicalFeasible===false)error('Candidato bloqueado: '+c.id);
   const materials=c.materials||{};
   if(typeof materials!=='object'||Array.isArray(materials)||Object.entries(materials).some(([k,v])=>!k||!finite(v)))error('Materiais invalidos em '+c.id);
   const dependencies=c.dependencies||[];
   if(!Array.isArray(dependencies)||dependencies.some(x=>typeof x!=='string'))error('Dependencias invalidas em '+c.id);
   return {...c,materials,dependencies};
  });
  for(const c of normalized)for(const dep of c.dependencies)if(!ids.has(dep)||dep===c.id)error('Dependencia inexistente ou circular imediata em '+c.id);
  const stock=limits.materials||{};
  if(typeof stock!=='object'||Array.isArray(stock)||Object.values(stock).some(x=>!finite(x)))error('Estoque invalido.');
  return {normalized,stock};
 }
 function dominates(a,b){
  const good=metrics.every(k=>a[k]>=b[k]-1e-9);
  const better=metrics.some(k=>a[k]>b[k]+1e-9);
  // Custos NAO sao objetivos aqui: sao restricoes. Sem politica de custo, carteira mais barata
  // com igual beneficio nao e automaticamente melhor; usar custos como desempate deterministico.
  return good&&(better||(metrics.every(k=>Math.abs(a[k]-b[k])<1e-9)&&a.totalCost<b.totalCost-1e-9));
 }
 function optimize(candidates,limits){
  const {normalized:c,stock}=validate(candidates,limits);
  const n=c.length,feasible=[],tol=1e-8;
  // Inclui carteira vazia, importante quando nenhuma alternativa e viavel.
  for(let mask=0;mask<2**n;mask++){
   let capex=0,opex=0,hours=0,ok=true;
   const materials={},groups=new Set(),ids=[],selected=new Set();
   const totals={riskReduction:0,decReduction:0,fecReduction:0};
   for(let i=0;i<n;i++)if(mask&(2**i)){
    const x=c[i];ids.push(x.id);selected.add(x.id);
    if(x.exclusiveGroup){if(groups.has(x.exclusiveGroup)){ok=false;break;}groups.add(x.exclusiveGroup);}
    if(x.budgetType==='CAPEX')capex+=x.cost;else opex+=x.cost;
    hours+=x.crewHours;
    for(const k of metrics)totals[k]+=x[k];
    for(const [k,v]of Object.entries(x.materials))materials[k]=(materials[k]||0)+v;
    if(capex>limits.CAPEX+tol||opex>limits.OPEX+tol||hours>limits.crewHours+tol){ok=false;break;}
    if(Object.entries(materials).some(([k,v])=>v>(stock[k]??0)+tol)){ok=false;break;}
   }
   if(!ok)continue;
   if(ids.some(id=>c.find(x=>x.id===id).dependencies.some(d=>!selected.has(d))))continue;
   feasible.push({ids,capex,opex,crewHours:hours,totalCost:capex+opex,...totals});
  }
  const frontier=feasible.filter(a=>!feasible.some(b=>a!==b&&dominates(b,a)))
   .sort((a,b)=>b.riskReduction-a.riskReduction||b.decReduction-a.decReduction||b.fecReduction-a.fecReduction||a.totalCost-b.totalCost||a.ids.join('|').localeCompare(b.ids.join('|')));
  return {status:'EXPERIMENTAL',method:'exact-pareto-enumeration-v0.3',calibrated:false,
   evaluatedPortfolios:2**n,feasiblePortfolios:feasible.length,frontier,
   warning:'Beneficios de entrada nao sao estimados por este modulo; validar origem, unidade, horizonte e incerteza. Fronteira nao e decisao automatica.'};
 }
 return Object.freeze({optimize,dominates});
});
