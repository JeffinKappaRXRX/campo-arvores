(function(root){
 'use strict';
 const labels={
  photos:'Fotos',photoReview:'Fotos a confirmar',pole:'Poste',span:'Vão',species:'Espécie',
  btDistance:'Distância da copa à BT',mtDistance:'Distância da copa à MT',atDistance:'Distância da copa à AT',
  coordinates:'Coordenadas',feeder:'Alimentador',height:'Altura',trunk:'DAP ou CAP',
  diameter:'Coerência entre DAP e CAP',poda:'Poda',projection:'Projeção',treeSite:'Área pública ou privada',
  network:'Redes e distâncias',duplicate:'Possível duplicidade',
  grouped:'Poda agrupada',position:'Posição em relação à rede'
 };
 const instructions={
  photos:'Fotografe a árvore e o tronco. Para ajudar na identificação, faça uma foto de folha, flor ou fruto, quando disponível.',
  photoReview:'Confirme se as fotos vinculadas correspondem a esta árvore e anexe fotos atuais se necessário.',
  pole:'Confirme o ID do poste ou do vão mais próximo, conforme a rede presente.',
  span:'Confira o ID do vão. Priorize MT se a rede estiver presente.',
  species:'Identifique a árvore. Fotografe folha, flor ou fruto se o nome continuar incerto.',
  btDistance:'Confira e informe a distância da copa à BT, em centímetros no app.',
  mtDistance:'Confira e informe a distância da copa à MT, em centímetros no app.',
  atDistance:'Confira e informe a distância da copa à AT, em centímetros no app.',
  coordinates:'Confirme a posição da árvore no mapa e ajuste as coordenadas junto ao tronco.',
  feeder:'Confirme o alimentador ou registre a localidade aplicável.',
  height:'Meça ou confira a altura da árvore, em metros.',
  trunk:'Meça DAP ou CAP do tronco, em centímetros.',
  diameter:'Confira DAP ou CAP em centímetros no mesmo tronco e na mesma altura. Revise unidade e digitação.',
  poda:'Confirme se a árvore precisa de poda.',
  projection:'Confirme se a árvore está em projeção sobre a rede.',
  treeSite:'Confira se o tronco está em área pública ou privada. Use referência cadastral ou confirme o limite em campo.',
  network:'Confirme quais redes existem no local, o tipo de vão e as distâncias da copa para as redes presentes.',
  duplicate:'Compare os pontos próximos e confirme se representam a mesma árvore.',
  grouped:'Confirme se o ponto representa árvore individual ou poda agrupada.',
  position:'Confira a posição da árvore em relação à rede.'
 };
 const normalize=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
 const missing=value=>value==null||String(value).trim()==='';
 const numeric=value=>!missing(value)&&Number.isFinite(Number(value));
 const pos=value=>numeric(value)&&Number(value)>0;
 const yes=value=>value===true||normalize(value)==='sim';
 const declaredSite=value=>({'publico':'publico','publica':'publico','area publica':'publico','privado':'privado','privada':'privado','area privada':'privado'})[normalize(value)]||'';
 const round=value=>Math.round(value*10)/10;
 const networks=['mt','bt','at'];
 const hasValue=value=>(typeof value==='number'||typeof value==='string')&&String(value).trim()!=='';
 function distanceNumber(value){
  if(!hasValue(value)||!/^(?:[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:e[+-]?\d+)?)$/i.test(String(value).trim()))return null;
  const number=Number(String(value).trim().replace(',','.'));
  return Number.isFinite(number)&&number>=0?number:null;
 }
 const sameDistance=(a,b)=>Math.abs(a-b)<=Math.max(Math.abs(a),Math.abs(b))*1e-9;
 const cm=value=>Number((value*100).toPrecision(12)).toLocaleString('pt-BR',{maximumFractionDigits:6})+' cm';
 function networkDistance(record,network){
  const field=network+'Distance',upper=network.toUpperCase(),raw=record[field],stored=distanceNumber(raw);
  const measurement=record.measurements?.networkDistances?.[network];
  const cleared=measurement?.source==='manual-management'&&!hasValue(raw)&&measurement.value===null;
  const sources=[];
  function add(raw,unit,source){
   const number=distanceNumber(raw);
   if(number!==null)sources.push({value:unit==='cm'?Number((number/100).toPrecision(12)):number,source});
  }
  if(!cleared&&['m','cm'].includes(measurement?.unit))add(measurement.value,measurement.unit,'metadados da medição');
  if(!cleared&&['m','cm'].includes(measurement?.inputUnit))add(measurement.inputValue,measurement.inputUnit,'unidade de entrada registrada');
  if(measurement?.source!=='manual-management'){
   add(record['dist'+upper],'m','base VERA (m)');
   add(record['Dist. '+upper+' (m)'],'m','coluna histórica em metros');
   const historical=Object.keys(record).find(key=>normalize(key).replace(/^\d+\s*\.\s*/,'')==='distancia '+network+' (metros)');
   if(historical)add(record[historical],'m','formulário antigo (m)');
  }
  const evidence=sources[0];
  const issue=(reason,change)=>({key:field,distance:true,reason,...(change&&{change})});
  const suggestion=reason=>issue(reason,{field,value:evidence.value,previous:stored,source:evidence.source});
  if(evidence&&sources.some(source=>!sameDistance(source.value,evidence.value)))return {value:stored,issue:issue('As fontes da medição divergem. Confira o valor e a unidade no levantamento original.')};
  if(stored===null){
   if(evidence&&!yes(record.noNetwork)&&(yes(record[network])||record[network]==null||missing(record[network])))
    return {value:evidence.value,issue:suggestion('A distância está disponível na origem com unidade identificada.')};
   if(evidence)return {value:null,issue:issue('A origem traz '+cm(evidence.value)+', mas o cadastro indica ausência da rede. Confira em campo.')};
   if(yes(record[network])||hasValue(raw))return {value:null,issue:issue(hasValue(raw)?'Distância inválida. Confira o valor na origem.':instructions[field])};
   return {value:null};
  }
  if(evidence&&!sameDistance(stored,evidence.value)){
   const scaled=sameDistance(stored/100,evidence.value)||sameDistance(stored*100,evidence.value);
   return {value:stored,issue:scaled&&yes(record[network])&&!yes(record.noNetwork)?
    suggestion('Diferença de escala de 100 vezes, confirmada pela unidade da origem.'):
    issue('O cadastro indica '+cm(stored)+' e a origem indica '+cm(evidence.value)+'. Confira a medição.')};
  }
  if(measurement?.source!=='manual-management'&&(stored>20||stored>0&&stored<.05)){
   const candidate=stored>20?stored/100:stored*100;
   return {value:stored,issue:issue('Valor registrado de '+cm(stored)+'. Confira se a medida correta é '+cm(candidate)+' antes de ajustar a unidade.')};
  }
  return {value:stored};
 }
 function inspect(record,duplicate=false){
  const Q=root.CampoRegistrationQuality;
  const issues=new Map(Q.issues(Q.mask(record)).map(key=>[key,{key,reason:instructions[key]}]));
  const mark=(key,reason=instructions[key],change)=>issues.set(key,change?{key,reason,change}:{key,reason});
  const {dap,circ}=record,hasDap=pos(dap),hasCap=pos(circ);
  const diameter=hasDap?Number(dap):hasCap?Number(circ)/Math.PI:0;
  const consistent=!(hasDap&&hasCap)||Math.abs(Number(circ)-Number(dap)*Math.PI)<=Math.max(1,Number(circ)*.07);
  if(!consistent)mark('diameter','DAP e CAP divergem entre si. '+instructions.diameter);
  else if(diameter>250||(!missing(dap)&&!hasDap)||(!missing(circ)&&!hasCap))mark('diameter','Medida fora do intervalo de triagem ou valor inválido. '+instructions.diameter);
  else if(!yes(record.grouped)&&hasDap&&missing(circ)&&round(Number(dap)*Math.PI)>0)mark('diameter','CAP calculado a partir do DAP preenchido.',{field:'circ',value:round(Number(dap)*Math.PI),input:Number(dap),source:'DAP'});
  else if(!yes(record.grouped)&&hasCap&&missing(dap)&&round(Number(circ)/Math.PI)>0)mark('diameter','DAP calculado a partir do CAP preenchido.',{field:'dap',value:round(Number(circ)/Math.PI),input:Number(circ),source:'CAP'});
  const legacySite=declaredSite(record.area),site=record.treeSite;
  if(!['publico','privado'].includes(site)&&legacySite)mark('treeSite','Classificação explícita já registrada no campo Área.',{field:'treeSite',value:legacySite,source:'Área'});
  else if(legacySite&&legacySite!==site)mark('treeSite','A classificação de local diverge do campo Área. '+instructions.treeSite);
  if(pos(record.height)&&Number(record.height)>60)mark('height','Altura acima de 60 m. Confira a medida e a unidade.');
  if(numeric(record.lat)&&numeric(record.lon)&&Number(record.lat)===0&&Number(record.lon)===0)mark('coordinates',instructions.coordinates);
  for(const network of networks){
   const {issue}=networkDistance(record,network);
   if(issue)issues.set(issue.key,issue);
   else if(distanceNumber(record[network+'Distance'])!==null)issues.delete(network+'Distance');
  }
  const hasNetwork=networks.some(key=>yes(record[key]));
  const audit=root.CampoInspectionRules.poleAudit(record);
  if(networks.some(key=>!yes(record[key])&&numeric(record[key+'Distance'])&&Number(record[key+'Distance'])>=0)||
    (yes(record.noNetwork)&&hasNetwork)||
    (audit&&audit.expected.some(key=>yes(record[key])===audit.absent.includes(key)))||
    (audit&&root.CampoInspectionRules.preferredSpanNetwork(record,audit)&&root.CampoInspectionRules.preferredSpanNetwork(record,audit)!==record.spanNetwork))mark('network');
  if(hasNetwork&&normalize(record.position)==='projecao'&&normalize(record.projection)==='nao')mark('projection','A posição indica projeção, mas a resposta de projeção foi marcada como não. '+instructions.projection);
  if(record.formValidation===1){
   if(!['sim','nao'].includes(normalize(record.grouped)))mark('grouped');
   if(hasNetwork&&!['projecao','lateral','abaixo da rede'].includes(normalize(record.position)))mark('position');
  }
  if(duplicate)mark('duplicate');
  return Array.from(issues.values());
 }
 function patch(issues){return Object.fromEntries(issues.filter(issue=>issue.change).map(({change})=>[change.field,change.value]));}
 function guidance(issues){return Array.from(new Set(issues.map(issue=>instructions[issue.key]).filter(Boolean))).join(' ');}
 root.CampoSuggestionRules={labels,inspect,patch,guidance,normalize,networkDistance};
 if(typeof module!=='undefined')module.exports=root.CampoSuggestionRules;
})(typeof globalThis!=='undefined'?globalThis:this);
