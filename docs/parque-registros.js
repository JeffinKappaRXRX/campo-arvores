/* Regras compartilhadas pelo parque administrativo e pela consulta gerencial. */
globalThis.CampoParqueRegistros=(()=>{
 const CAMPO='Campo (prévia)',riscoCore=globalThis.CampoRisco;
 const VERA='Base VERA';
 const filters=[['origem','Origem'],['classe','Classe de risco'],['ano','Ano'],['trecho','Trecho'],['alimentador','Alimentador'],['especie','Espécie'],['acao','Ação sugerida'],['verificacao','Conferência pela foto'],['duplicata','Possível duplicata']];
 const species=t=>String(t.especies||'').split(',').map(s=>s.trim()).filter(Boolean);
 function matches(tree,values,query=''){
  for(const [key] of filters){
   const value=values[key];
   if(!value)continue;
   if(key==='classe'&&value==='CRÍTICO + ALTO'){
    if(!['CRÍTICO','ALTO'].includes(tree.classe))return false;
   }else if(key==='especie'){
    if(!species(tree).includes(value))return false;
   }else if(String(tree[key]??'')!==value)return false;
  }
  const q=query.toLocaleLowerCase('pt-BR');
  return !q||[tree.id,tree.chave,tree.alimentador,tree.especies,tree.poste,tree.vao]
   .some(value=>String(value??'').toLocaleLowerCase('pt-BR').includes(q));
 }
 const baseTree=t=>({...t,origem:t.fonte||VERA});
 const position=t=>Number.isFinite(Number(t.lat))&&Number.isFinite(Number(t.lon))&&t.lat!==null&&t.lat!=='';
 function liveTree(r,referencia){const year=Date.parse(r.createdAt),info=referencia?.alimentadores?.[r.feeder]||{},lat=Number(r.lat),lon=Number(r.lon),dap=Number(r.dap)>0?Number(r.dap):Number(r.circ)>0?Number(r.circ)/Math.PI:null,risco=riscoCore.calcular({altura:r.height,distMT:r.mtDistance,distBT:r.btDistance,dap,dapMedido:dap!==null,especie:r.species,alerta:r.note,verificacao:r.review?.verificacao,projecao:/proje|abaixo/i.test(r.position)?'SIM':'',clientes:info.clientes||0,trecho:info.trecho,vendaval:info.vendaval,clientesMax:referencia?.clientesMax});return {...risco,raw:r,qtd:r.count,photoAsset:r.photoAsset,conferencia:r.review,id:r.id,origem:CAMPO,ano:Number.isFinite(year)?new Date(year).getFullYear():'',especies:r.species,poste:r.pole,vao:r.span,alimentador:r.feeder,trecho:info.trecho||'',clientes:info.clientes||0,clientesEstimado:true,semReferencia:!referencia?.alimentadores?.[r.feeder],verificacao:r.review?.verificacao||'NÃO CONFERIDA',dap,origemDap:dap===null?'Sem medição':'Medido em campo',lat:Number.isFinite(lat)&&r.lat!==null&&r.lat!==''?lat:null,lon:Number.isFinite(lon)&&r.lon!==null&&r.lon!==''?lon:null,data:Number.isFinite(year)?new Date(year).toLocaleDateString('pt-BR',{timeZone:'America/Rio_Branco'}):'',obsFoto:r.review?.obs||r.note};}
 const originalPoint=t=>{const m=/(-?\d+[.,]\d+)\s*;\s*(-?\d+[.,]\d+)/.exec(String(t.coordOriginal||''));return m?{lat:Number(m[1].replace(',','.')),lon:Number(m[2].replace(',','.'))}:null;};
 const baseId=id=>id.startsWith('vera-')?id.slice(5):'';
 function comCampo(b,t,referencia){const r=t.raw,valor=v=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v)),distMT=r.mt&&valor(r.mtDistance)?r.mtDistance:null,distBT=r.bt&&valor(r.btDistance)?r.btDistance:null,medida=distMT!==null||distBT!==null,verificacao=r.review?.verificacao||(['NÃO CONFIRMADA','SEM PROJEÇÃO NA FOTO'].includes(b.verificacao)?'NÃO CONFERIDA':b.verificacao),original=String(b.observacao||''),texto=String(r.note||''),nota=original&&texto.startsWith(original)?texto.slice(original.length).replace(/^[\s;,.-]+/,''):texto,ano=Number(b.ano),dapNovo=t.dap!==null&&!(Number(b.dap)>0&&Math.abs(t.dap-Number(b.dap))<.06),dap=dapNovo?t.dap:b.dap,dapMedido=dapNovo||!/^(Média|Sem)/.test(b.origemDap||''),especie=r.species||(b.especieConf?'':b.especies),projecao=r.projection==='sim'?'SIM':r.projection==='nao'?'':b.projecao==='SIM'?'SIM':'',risco=riscoCore.calcular({altura:valor(r.height)?r.height:b.altura,distMT,distBT,distRede:medida?null:b.distRede,dap,dapMedido,especie,alerta:ano===2026?[b.obsFoto,nota].filter(Boolean).join('; '):nota,obsAcao:[b.obsFoto,nota,r.review?.obs].filter(Boolean).join('; '),verificacao,elevar:ano===2025,projecao,clientes:b.clientes,trecho:b.trecho,vendaval:b.vendaval,clientesMax:referencia?.clientesMax});return {...b,...risco,campoId:t.id,raw:r,conferencia:r.review,photoAsset:r.photoAsset,especies:r.species||b.especies,especieConf:r.species?'':b.especieConf,dap,origemDap:dapNovo?'Medido em campo (app)':b.origemDap,lat:t.lat??b.lat,lon:t.lon??b.lon,poste:r.pole||b.poste,vao:r.span||b.vao,alimentador:r.feeder||b.alimentador,verificacao,obsFoto:r.review?.obs||nota||b.obsFoto,atualizadoEm:r.updatedAt,atualizadoPor:r.actor};}
 function merge(base,live,mergedIds,referencia){const activeBase=base.filter(t=>!mergedIds.has('vera-'+t.id)),ids=new Set(activeBase.map(t=>t.id)),campo=new Map(live.filter(t=>ids.has(baseId(t.id))).map(t=>[baseId(t.id),t])),novas=live.filter(t=>!ids.has(baseId(t.id))),atual=activeBase.map(b=>campo.has(b.id)?comCampo(b,campo.get(b.id),referencia):b),pool=[...atual.filter(position).map(t=>({id:t.id,especies:t.especies,pontos:[{lat:Number(t.lat),lon:Number(t.lon)},originalPoint(t)].filter(Boolean)})),...novas.filter(position).map(t=>({id:t.id,especies:t.especies,pontos:[{lat:t.lat,lon:t.lon}]}))],found=riscoCore.duplicatas(novas,pool);for(const t of novas){const d=found.get(t.id);t.duplicataDe=d?.id;t.duplicataM=d?.m;t.duplicata=d?'Sim':'';}return [...atual,...novas];}
 return {liveTree,merge,baseTree,matches,filters,species};
})();
