'use strict';
(()=>{
 const $=id=>document.getElementById(id),panel=$('adminQuality'),body=$('adminQualityRows');
 const status=$('adminQualityStatus'),previous=$('adminQualityPrevious'),next=$('adminQualityNext');
 let controller,page=0,signature='';
 async function refresh(force=false){
  if(!panel.open||!window.CampoControl?.authorized())return;
  const params=window.CampoControl.mapParams();
  params.set('page',String(page));
  const query=params.toString();
  if(!force&&query===signature)return;
  signature=query;
  controller?.abort();
  const active=new AbortController();
  controller=active;
  previous.disabled=next.disabled=true;
  body.replaceChildren();
  status.textContent='Conferindo localização dos cadastros…';
  try{
   const data=await window.CampoControl.api('/api/control/span-quality?'+params,undefined,active.signal);
   if(active.signal.aborted)return;
   page=data.page;
   for(const item of data.items){
    const row=body.insertRow();
    for(const value of [item.species||'Árvore',item.feeder||'—',item.span,CampoSpanQuality.format(item.metres)+' m'])row.insertCell().textContent=value;
    const actions=row.insertCell(),open=document.createElement('button'),locate=document.createElement('button');
    open.type=locate.type='button';
    open.textContent='Abrir cadastro';locate.textContent='Ver no mapa';
    open.onclick=()=>void window.CampoControl.openRecord(item.id);
    locate.onclick=()=>{location.hash='mapa';window.CampoControlMap?.locate(item);};
    actions.append(open,' ',locate);
   }
   status.textContent=data.count+' com alerta · '+data.checked+' avaliados · '+(data.total-data.checked)+' sem distância verificada'+(data.last?' · Página '+(page+1)+' de '+(data.last+1):'');
   previous.disabled=page===0;next.disabled=page>=data.last;
  }catch(error){if(!active.signal.aborted){status.textContent=error.message;signature='';}}
 }
 panel.addEventListener('toggle',()=>{if(panel.open){page=0;void refresh(true);}else{controller?.abort();signature='';}});
 $('adminQualityReload').onclick=()=>{page=0;void refresh(true);};
 previous.onclick=()=>{page--;void refresh();};
 next.onclick=()=>{page++;void refresh();};
 window.addEventListener('campo-control-logout',()=>{controller?.abort();body.replaceChildren();status.textContent='';panel.open=false;signature='';});
 window.CampoAdminSpanQuality={refresh:()=>void refresh()};
})();
