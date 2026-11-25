'use strict';
(()=>{
 const $=id=>document.getElementById(id),Q=window.CampoRegistrationQuality;
 const nav=$('fieldCorrectionsNav'),panel=$('fieldCorrections'),status=$('fieldCorrectionsStatus'),container=$('fieldCorrectionsItems');
 if(!panel)return;
 const pageSize=20;
 let owner=null,items=[],page=0,generation=0,request=null,closing=null,marker=null,googleMarker=null;
 const userId=()=>{const account=window.CampoAccount?.current();return account?.role==='inspector'?account.id:null;};
 const cacheKey=id=>'arbora-corrections-v1:'+id;
 const active=()=>owner&&owner===userId();
 function button(label,run){
  const el=document.createElement('button');el.type='button';el.className='secondary';el.textContent=label;el.onclick=run;return el;
 }
 function line(parent,text){
  if(!text)return;
  const p=document.createElement('p');p.textContent=text;parent.append(p);
 }
 function paint(){
  nav.hidden=!active();
  nav.textContent='Correções recebidas'+(items.length?' · '+items.length:'');
  container.replaceChildren();
  if(!active())return;
  const pages=Math.max(1,Math.ceil(items.length/pageSize));page=Math.min(page,pages-1);
  $('fieldCorrectionsPages').hidden=pages===1;
  $('fieldCorrectionsPrevious').disabled=page===0;$('fieldCorrectionsNext').disabled=page+1>=pages;
  $('fieldCorrectionsPage').textContent='Página '+(page+1)+' de '+pages;
  for(const item of items.slice(page*pageSize,(page+1)*pageSize)){
   const article=document.createElement('article'),title=document.createElement('h3'),actions=document.createElement('div');
   article.className='field-correction';title.textContent=(item.species||'Árvore')+' · '+item.treeId;article.append(title);
   line(article,[item.feeder,item.pole&&'Poste '+item.pole,item.span&&'Vão '+item.span,item.address].filter(Boolean).join(' · '));
   line(article,'Corrigir: '+item.issues.map(key=>Q.labels[key]).join(' · '));
   if(item.note)line(article,'Orientação da gestão: '+item.note);
   actions.className='route-buttons';
   actions.append(button('Localizar no mapa',()=>locate(item)),button('Abrir para corrigir',()=>void open(item)));
   const conclude=button(item.id===closing?'Confirmando…':'Concluir retorno',()=>void complete(item));
   conclude.disabled=Boolean(closing);actions.append(conclude);
   article.append(actions);container.append(article);
  }
  if(!items.length)line(container,'Nenhuma correção pendente.');
 }
 async function api(path,body){
  const response=await fetch('/api/corrections'+path,{method:body?'POST':'GET',cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout?.(15000),
   headers:body?{'Content-Type':'application/json'}:undefined,body:body?JSON.stringify(body):undefined});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(result.error||'Não foi possível atualizar as correções.');
  return result;
 }
 async function refresh(){
  if(!active())return;
  if(!navigator.onLine||!window.CampoAccount?.verified()){
   status.textContent='Offline · lista salva neste aparelho. Novos despachos e confirmações precisam de conexão.';
   return;
  }
  if(request)return request;
  const token=generation,account=owner;
  const pending=(async()=>{
   try{
    const result=await api('');
    if(token!==generation||!active())return;
    items=result.items;paint();status.textContent=items.length?items.length+' ponto(s) para voltar a campo.':'Lista atualizada.';
    await req('meta','readwrite',store=>store.put(items,cacheKey(account)));
   }catch(error){if(token===generation&&active())status.textContent=error.message+' A última lista continua disponível.';}
  })();
  request=pending;
  try{await pending;}finally{if(request===pending)request=null;}
 }
 async function updateAccount(){
  const account=userId();
  if(owner===account&&account){void refresh();return;}
  const token=++generation;
  owner=account;items=[];page=0;request=null;closing=null;
  clearMarker();status.textContent='';paint();
  if(!account){if(!panel.hidden)view('inspect');return;}
  try{
   const cached=await req('meta','readonly',store=>store.get(cacheKey(account)));
   if(token!==generation||!active())return;
   items=Array.isArray(cached)?cached:[];paint();await refresh();
  }catch(error){if(token===generation&&active())status.textContent=error.message;}
 }
 function clearMarker(){
  marker?.remove();marker=null;
  googleMarker?.setMap(null);googleMarker=null;
 }
 function locate(item){
  if(!active())return;
  view('inspect');
  if($('inspect').hidden)return;
  setMapFullscreen(true);
  const point=[item.lat,item.lon];
  setTimeout(()=>{
   if(!active())return;
   clearMarker();
   if($('basemap').value==='google'&&googleMap){
    const position={lat:item.lat,lng:item.lon};
    googleMarker=new google.maps.Marker({map:googleMap,position,title:'Retorno · '+item.treeId,clickable:false});
    googleMap.setCenter(position);googleMap.setZoom(18);
   }
   else if(fieldMap){
    marker=L.circleMarker(point,{radius:9,color:'#fff',weight:2,fillColor:'#fbad34',fillOpacity:.92,interactive:false}).addTo(fieldMap);
    fieldMap.invalidateSize();fieldMap.setView(point,18);
   }
   tell('Retorno · árvore '+item.treeId+' · '+item.issues.map(key=>Q.labels[key]).join(' · '));
  },70);
 }
 async function open(item){
  if(!active())return;
  const before=editing;
  await editSharedTree(item.treeId);
  if(active()&&editing===item.treeId&&!$('inspect').hidden){
   const instructions='Retorno a campo · '+item.issues.map(key=>Q.labels[key]).join(' · ')+(item.note?' — '+item.note:'');
   tell(instructions);
   if(item.issues.includes('photos')||item.issues.includes('photoReview'))$('takePhoto').scrollIntoView({block:'center'});
  }else if(active()&&before===editing&&navigator.onLine){
   status.textContent=$('message').textContent||'Não foi possível abrir o cadastro. Atualize a lista e tente novamente.';
  }
 }
 async function complete(item){
  if(!active()||closing)return;
  if(!navigator.onLine||!window.CampoAccount?.verified()){status.textContent='Conecte-se para sincronizar e confirmar a correção.';return;}
  if(!confirm('Confirmar que a correção da árvore '+item.treeId+' foi salva?'))return;
  const token=generation;
  closing=item.id;paint();status.textContent='Sincronizando e conferindo a correção…';
  try{
   await sharedCycle();
   if(token!==generation||!active())return;
   await api('/complete',{id:item.id});
   if(token!==generation||!active())return;
   if(request)await request;
   items=items.filter(candidate=>candidate.id!==item.id);clearMarker();paint();
   await req('meta','readwrite',store=>store.put(items,cacheKey(owner))).catch(()=>{});
   status.textContent='Correção da árvore '+item.treeId+' concluída.';
  }catch(error){if(token===generation&&active())status.textContent=error.message;}
  finally{if(token===generation){closing=null;paint();}}
 }
 $('fieldCorrectionsReload').onclick=()=>void refresh();
 $('fieldCorrectionsPrevious').onclick=()=>{page--;paint();};
 $('fieldCorrectionsNext').onclick=()=>{page++;paint();};
 nav.addEventListener('click',()=>void refresh());
 window.addEventListener('campo-account-changed',()=>void updateAccount());
 window.addEventListener('online',()=>void updateAccount());
 window.addEventListener('offline',()=>void refresh());
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)void updateAccount();});
 setInterval(()=>{if(!document.hidden)void updateAccount();},60000);
 window.CampoFieldCorrections={includes:id=>Boolean(active()&&items.some(item=>item.treeId===id))};
 void updateAccount();
})();
