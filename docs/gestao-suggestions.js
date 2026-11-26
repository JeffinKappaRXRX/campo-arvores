'use strict';
(()=>{
 const $=id=>document.getElementById(id),panel=$('suggestions'),S=window.CampoSuggestionRules;
 if(!panel)return;
 const selection=new Map(),analysis=new Map(),approved=new Map(),errors=new Map();
 const path='/api/control/suggestions',limit=5;
 let page=0,data=null,query=null,job=null,searchTimer;
 const api=(url,body,signal)=>window.CampoControl.api(url,body,signal);
 const active=()=>window.CampoControl?.authorized();
 const status=text=>$('suggestStatus').textContent=text;
 const rows=$('suggestRows');
 function button(label,callback){
  const element=document.createElement('button');
  element.type='button';element.textContent=label;element.onclick=callback;return element;
 }
 function detail(element,value){
  const small=document.createElement('small');small.className='registration-detail';small.textContent=value;element.append(small);
 }
 function text(row,value){const cell=row.insertCell();cell.textContent=value;return cell;}
 function picked(id){return [...$(id).selectedOptions].map(option=>option.value);}
 function filters(){
  const p=new URLSearchParams({page:String(page),status:$('suggestFilter').value});
  for(const [id,key] of [['suggestFrom','from'],['suggestTo','to'],['suggestSource','source'],['suggestQuery','q']]){
   const v=$(id).value.trim();if(v)p.set(key,v);
  }
  for(const [id,key] of [['suggestInspector','inspector'],['suggestFeeder','feeder'],['suggestIssues','issue']])
   for(const v of picked(id))p.append(key,v);
  return p;
 }
 for(const [key,label] of Object.entries(S.labels))$('suggestIssues').add(new Option(label,key));
 function options(id,values){
  const select=$(id),selected=new Set(picked(id));
  const merged=[...new Set([...values,...selected])];
  select.replaceChildren(...merged.map(value=>new Option(value,value,false,selected.has(value))));
 }
 function matches(snapshot,item){return snapshot?.version===item.version&&snapshot.token===item.token;}
 function reviewFor(item){const candidate=analysis.get(item.id);return matches(candidate,item)?candidate:null;}
 function approval(item){const candidate=approved.get(item.id);return matches(candidate,item)?candidate:null;}
 function selectUI(){
  const selected=[...selection.values()],current=new Set(data?.items.map(item=>item.id)),other=selected.filter(item=>!current.has(item.id)).length;
  $('suggestSelection').textContent=selected.length+' selecionado(s)'+(other?' · '+other+' fora desta página':'');
  for(const check of rows.querySelectorAll('input[type=checkbox]')){check.checked=selection.has(check.value);check.disabled=Boolean(job);}
  $('suggestSelectPage').disabled=Boolean(job)||!data?.items.length;
  $('suggestSelectAll').disabled=Boolean(job)||!data?.total;
  $('suggestClear').disabled=Boolean(job)||!selected.length;
  $('suggestApply').disabled=Boolean(job)||!selected.some(item=>item.canApply||item.editable&&approval(item));
  $('suggestPhotos').disabled=Boolean(job)||!selected.some(item=>item.hasPhoto);
  $('suggestReturn').disabled=Boolean(job)||!selected.some(item=>item.canDispatch);
  $('suggestStop').hidden=!job;
  $('suggestStop').disabled=!job||job.stop;
 }
 function showPhotoAI(cell,item){
  const result=reviewFor(item);
  if(result?.issue){detail(cell,result.issue);}
  if(result?.choices?.length){
   const signatures=document.createElement('ul');
   const chosen=approval(item);
   for(const choice of result.choices){
    const li=document.createElement('li');
    li.textContent=choice.name+(choice.score==null?'':' · afinidade '+choice.score.toLocaleString('pt-BR',{style:'percent',maximumFractionDigits:1}));
    if(item.editable)li.append(button(chosen?.name===choice.name?'Retirar aprovação':'Aprovar',()=>{
     if(job)return;
     if(chosen?.name===choice.name)approved.delete(item.id);else{
      approved.set(item.id,{version:item.version,token:item.token,name:choice.name});
      selection.set(item.id,item);
     }
     paint();
    }));
    signatures.append(li);
   }
   cell.append(signatures);
   if(chosen)detail(cell,'Aprovada · '+chosen.name);
  }else if(item.hasPhoto&&!result)detail(cell,'Foto disponível para análise');
  else if(!item.hasPhoto)detail(cell,'Sem foto disponível pelo painel');
 }
 const site=value=>({publico:'Público',privado:'Privado'})[value]||'Não informado';
 function printChange(issue){
  const change=issue.change;
  if(change.field==='treeSite')return site(change.value)+' · fonte '+change.source;
  return (change.field==='dap'?'DAP':'CAP')+' '+Number(change.value).toLocaleString('pt-BR')+' cm · calculado pelo '+change.source;
 }
 function paint(){
  if(!data)return;
  const {items,total,pages,counts}=data;
  $('suggestPrevious').disabled=page===0;$('suggestNext').disabled=page+1>=pages;
  $('suggestPageInfo').textContent='Página '+(page+1)+' de '+pages;
  $('suggestCounts').textContent=total.toLocaleString('pt-BR')+' no filtro · '+counts.apply+' com ajuste disponível · '+counts.review+' para conferir · '+counts.clean+' sem inconsistência detectada'+
   (!data.archive?' · Drive indisponível':'')+(!data.vera?' · VERA indisponível':'');
  rows.replaceChildren();
  for(const item of items){
   if(selection.has(item.id))selection.set(item.id,item);
   const row=rows.insertRow(),check=document.createElement('input');
   check.type='checkbox';check.value=item.id;check.setAttribute('aria-label','Selecionar '+item.id);
   check.onchange=()=>{if(check.checked)selection.set(item.id,item);else selection.delete(item.id);selectUI();};text(row,'').append(check);
   const point=text(row,item.species||'Árvore sem identificação');
   detail(point,[item.id,item.feeder,item.pole&&'Poste '+item.pole,item.span&&'Vão '+item.span].filter(Boolean).join(' · '));
   detail(point,[item.origin==='vera'?'VERA':'Campo / Drive',item.inspector,item.day?.split('-').reverse().join('/')].filter(Boolean).join(' · '));
   const issues=text(row,'');
   if(item.issues.length){
    const list=document.createElement('ul');
    for(const issue of item.issues){
     const line=document.createElement('li');line.textContent=S.labels[issue.key]+'. '+issue.reason;
     if(issue.change)detail(line,printChange(issue));
     list.append(line);
    }
    issues.append(list);
   }else issues.textContent='Nenhuma inconsistência detectada';
   const current=text(row,'DAP '+(item.dap===''?'—':item.dap+' cm')+' · CAP '+(item.circ===''?'—':item.circ+' cm'));
   detail(current,site(item.treeSite));showPhotoAI(current,item);
   const cell=text(row,'');cell.className='suggest-row-actions';
   cell.append(button('Abrir ficha',()=>{
    if(item.origin==='vera'&&item.version===0)window.CampoParque?.openTree(item.id.slice(5));
    else void window.CampoControl.openRecord(item.id);
   }),button('Editar cadastro',()=>void window.CampoManagementEdit.open(item.id,item.issues.map(a=>a.key))));
   if(item.coordinates)cell.append(button('Localizar',()=>window.CampoControlMap?.locateInspection({id:item.id,species:item.species,lat:item.coordinates[0],lon:item.coordinates[1]})));
   if(item.hasPhoto)cell.append(button('Analisar foto',()=>void identify([item])));
   if(item.canApply||approval(item))cell.append(button('Aplicar',()=>void apply([item])));
   if(item.canDispatch)cell.append(button('Voltar a campo',()=>openReturn([item])));
   if(item.task?.status==='pending')detail(cell,'Em campo · '+(item.task.operator||'Inspetor'));
   if(errors.has(item.id))detail(cell,errors.get(item.id));
  }
  if(!items.length){const cell=text(rows.insertRow(),'Nenhum cadastro corresponde aos filtros.');cell.colSpan=5;}
  selectUI();
 }
 async function refresh(){
  if(!active()||!panel.open)return;
  query?.abort();
  const request=new AbortController();query=request;
  $('suggestCounts').textContent='Conferindo cadastros…';
  try{
   const result=await api(path+'?'+filters(),undefined,request.signal);
   if(request!==query||request.signal.aborted||!active())return;
   data=result;page=result.page;
   options('suggestInspector',result.options.inspectors);options('suggestFeeder',result.options.feeders);paint();
  }catch(error){if(!request.signal.aborted)$('suggestCounts').textContent=error.message;}
 }
 function filterChanged(){page=0;void refresh();}
 async function selectAll(){
  if(job||!active())return;
  const p=filters();p.set('format','selection');
  const running=start();
  try{
   status('Buscando os IDs de todo o filtro…');
   const answer=await api(path+'?'+p,undefined,running.controller.signal);
   if(running.stop||running.controller.signal.aborted||!active())return;
   for(const item of answer.items)selection.set(item.id,item);
   status(answer.items.length+' registros do filtro incluídos na seleção.');
  }catch(error){if(!running.stop)status(error.message);}
  finally{end(running);}
 }
 function start(){
  const running={stop:false,controller:new AbortController()};
  job=running;selectUI();return running;
 }
 function end(running){
  if(job!==running)return;
  job=null;
  if(data)paint();else selectUI();
 }
 async function post(url,body){
  try{return await api(url,body);}catch(error){if(error.status||!active())throw error;return api(url,body);}
 }
 async function apply(items){
  if(job||!active())return;
  const eligible=items.filter(item=>item.editable&&(item.canApply||approval(item)));
  if(!eligible.length)return;
  const ai=eligible.filter(approval).length;
  if(!confirm('Aplicar ajustes a '+eligible.length+' cadastro(s)'+(ai?', incluindo '+ai+' identificação(ões) aprovadas':'')+'?'))return;
  const running=start();
  let applied=0,failures=0,unchanged=0;
  try{
   for(let i=0;i<eligible.length&&!running.stop&&active();i+=limit){
    status('Aplicando '+Math.min(i+limit,eligible.length)+' de '+eligible.length+'…');
    const batch=eligible.slice(i,i+limit).map(item=>({id:item.id,version:item.version,token:item.token,operationId:crypto.randomUUID(),species:approval(item)?.name}));
    const result=await post(path,{items:batch});
    for(const item of result.results){
     if(item.status==='failed'){errors.set(item.id,item.message);failures++;continue;}
     errors.delete(item.id);selection.delete(item.id);approved.delete(item.id);
     if(item.status==='applied')applied++;else unchanged++;
    }
   }
   status(applied+' aplicado(s) · '+failures+' com erro · '+unchanged+' sem ajuste'+(running.stop?' · Processamento interrompido.':'.'));
  }catch(error){status(applied+' aplicado(s) · '+error.message);}
  finally{end(running);void refresh();}
 }
 async function compactPhoto(path,signal){
  const {image}=await api(path,undefined,signal);
  if(!/^data:image\/(?:jpe?g|png|webp);base64,[a-z0-9+/=]+$/i.test(image))throw Error('Foto indisponível no painel.');
  const file=await (await fetch(image,{signal})).blob(),bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1200/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  try{
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Foto inválida.')),'image/jpeg',.82));
  }finally{bitmap.close();canvas.width=canvas.height=0;}
 }
 function choice(result){
  const {scientificNameWithoutAuthor,scientificName,commonNames}=result.species||{};
  const name=[commonNames?.[0],scientificNameWithoutAuthor||scientificName].filter(Boolean).join(' · ').trim().slice(0,160);
  return name?{name,score:Number.isFinite(result.score)?result.score:null}:null;
 }
 async function identifyOne(item,signal){
  const form=new FormData(),paths=item.photos;
  for(const path of paths){
   try{
    const blob=await compactPhoto(path,signal);
    form.append('images',blob,'arvore.jpg');form.append('organs','auto');
   }catch(error){if(signal.aborted||error.status===401||error.status===403)throw error;}
  }
  if(!form.has('images'))return {issue:'Foto indisponível para análise. Revise o vínculo ou solicite uma foto de campo.'};
  const response=await fetch('/api/plant/identify',{method:'POST',body:form,credentials:'same-origin',signal});
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error(result.error||'A identificação falhou.'),{status:response.status});
  const choices=(result.results||[]).map(choice).filter(Boolean).slice(0,3);
  return choices.length?{choices}:{issue:'Espécie inconclusiva. Confira a identificação em campo.'};
 }
 async function identify(items){
  if(job||!active())return;
  const eligible=items.filter(item=>item.hasPhoto&&!reviewFor(item)?.choices?.length);
  if(!eligible.length){status('Os registros selecionados já foram analisados ou estão sem foto disponível.');return;}
  const running=start();
  let complete=0,failed=0,problem='';
  try{
   const visible=new Set(data?.items.map(item=>item.id));
   for(const item of eligible){
    if(running.stop||!active())break;
    status('Analisando '+(complete+failed+1)+' de '+eligible.length+' · '+item.id);
    const snapshot={version:item.version,token:item.token};
    try{
     const result=await identifyOne(item,running.controller.signal);
     if(running.stop||!active())break;
     analysis.set(item.id,{...snapshot,...result});complete++;
     if(visible.has(item.id))paint();
    }catch(error){
     if(running.stop||!active())break;
     if([401,403,429,502,503].includes(error.status)){problem=error.message;break;}
     analysis.set(item.id,{...snapshot,issue:error.message});failed++;
    }
   }
   status(complete+' analisado(s) · '+failed+' com erro'+(problem?' · '+problem:running.stop?' · Processamento interrompido.':'. Revise os resultados antes de aplicar.'));
  }finally{end(running);}
 }
 async function dispatchBatch(batch,body){
  const payload={...body,ids:batch.map(item=>item.id),details:Object.fromEntries(batch.map(item=>[item.id,extraGuidance(item).slice(0,400)]))};
  try{return await post('/api/control/corrections',payload);}
  catch(error){
   if(error.status!==409)throw error;
   if(batch.length===1){errors.set(batch[0].id,error.message);return {sent:0,conflicts:[batch[0].id]};}
   const result={sent:0,alreadyPending:0,conflicts:[]};
   for(const item of batch){
    const single=await dispatchBatch([item],body);
    result.sent+=single.sent;result.alreadyPending+=single.alreadyPending||0;result.conflicts.push(...(single.conflicts||[]));
   }
   return result;
  }
 }
 const dialog=$('suggestReturnDialog');
 let dispatch=[];
 function openReturn(items){
  if(job||!active())return;
  dispatch=items.filter(item=>item.canDispatch);
  if(!dispatch.length)return;
  const operators=data?.operators||[],select=$('suggestAssignee'),unknown=dispatch.some(item=>!item.assignee);
  if(!operators.length){status('Nenhum inspetor ativo disponível para receber o retorno.');return;}
  select.replaceChildren(new Option(unknown?'Escolha um inspetor para os pontos sem responsável':'Manter inspetor original',''),...operators.map(user=>new Option(user.name,user.id)));
  select.required=unknown;
  $('suggestNote').value='';
  $('suggestDispatchSummary').textContent=dispatch.length+' ponto(s). Cada ficha receberá uma orientação conforme os campos a conferir.';
  $('suggestDispatchExample').textContent=dispatch.length===1?'Orientação sugerida · '+(guidance(dispatch[0])||'Confira em campo os dados e as medidas da árvore.'):'';
  dialog.showModal();
 }
 function extraGuidance(item){
  const result=reviewFor(item),lead=result?.choices?.[0]?.name;
  const duplicate=(item.flags||item.issues?.map(a=>a.key)||[]).includes('duplicate');
  return [
   lead?'Confira se a espécie pode ser '+lead+'. A identificação por foto requer confirmação.':'',
   duplicate?'Compare os pontos muito próximos para confirmar se representam a mesma árvore.':''
  ].filter(Boolean).join(' ');
 }
 function guidance(item){
  const flags=item.issues||item.flags?.map(key=>({key}))||[];
  const notes=S.guidance(flags);
  return [extraGuidance(item),notes||(!item.hasIssues?'Confira em campo se a identificação, a localização e as medidas ainda correspondem a esta árvore.':'')].filter(Boolean).join(' ');
 }
 $('suggestDispatchForm').onsubmit=async event=>{
  event.preventDefault();
  if(job||!active())return;
  const selected=dispatch,assignee=$('suggestAssignee').value,note=$('suggestNote').value;
  dialog.close();
  const running=start();
  let sent=0,failed=0,pending=0;
  try{
   for(let i=0;i<selected.length&&!running.stop&&active();i+=limit){
    status('Despachando '+Math.min(i+limit,selected.length)+' de '+selected.length+'…');
    const batch=selected.slice(i,i+limit);
    const result=await dispatchBatch(batch,{
     action:'dispatch',suggestions:true,operationId:crypto.randomUUID(),assignee,note,fallbackOnly:selected.some(item=>!item.assignee)
    });
    const conflicts=new Set(result.conflicts||[]);
    pending+=result.alreadyPending||0;sent+=result.sent;failed+=conflicts.size;
    for(const item of batch)if(conflicts.has(item.id)){if(!errors.has(item.id))errors.set(item.id,'O ponto mudou antes do despacho. Atualize e confira.');}
    else{selection.delete(item.id);errors.delete(item.id);}
   }
   status(sent+' enviado(s) · '+pending+' já em campo · '+failed+' com conflito'+(running.stop?' · Processamento interrompido.':'.'));
  }catch(error){status(sent+' enviado(s) · '+error.message);}
  finally{end(running);void refresh();}
 };
 $('suggestDispatchClose').onclick=()=>dialog.close();
 $('suggestSelectPage').onclick=()=>{for(const item of data?.items||[])selection.set(item.id,item);selectUI();};
 $('suggestSelectAll').onclick=()=>void selectAll();
 $('suggestClear').onclick=()=>{selection.clear();selectUI();};
 $('suggestApply').onclick=()=>void apply([...selection.values()]);
 $('suggestPhotos').onclick=()=>void identify([...selection.values()]);
 $('suggestReturn').onclick=()=>openReturn([...selection.values()]);
 $('suggestStop').onclick=()=>{if(job){job.stop=true;job.controller.abort();selectUI();}};
 $('suggestPrevious').onclick=()=>{if(page>0){page--;void refresh();}};
 $('suggestNext').onclick=()=>{if(page+1<data?.pages){page++;void refresh();}};
 $('suggestReload').onclick=()=>void refresh();
 $('suggestFilters').onsubmit=event=>{event.preventDefault();filterChanged();};
 $('suggestFilters').onreset=()=>setTimeout(filterChanged,0);
 for(const id of ['suggestFrom','suggestTo','suggestSource','suggestInspector','suggestIssues','suggestFeeder','suggestFilter'])$(id).onchange=filterChanged;
 $('suggestQuery').oninput=()=>{clearTimeout(searchTimer);searchTimer=setTimeout(filterChanged,300);};
 function reveal(){if(location.hash==='#suggestions'&&active())panel.open=true;}
 window.addEventListener('hashchange',reveal);
 new MutationObserver(reveal).observe($('workspace'),{attributes:true,attributeFilter:['hidden']});
 panel.addEventListener('toggle',()=>{if(panel.open)void refresh();else query?.abort();});
 window.addEventListener('campo-control-logout',()=>{
  query?.abort();if(job){job.stop=true;job.controller.abort();job=null;}
  if(dialog.open)dialog.close();panel.open=false;data=null;selection.clear();analysis.clear();approved.clear();errors.clear();rows.replaceChildren();status('');selectUI();
 });
 selectUI();reveal();
})();
