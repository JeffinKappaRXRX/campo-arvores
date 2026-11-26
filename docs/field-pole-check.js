'use strict';
window.CampoFieldPoleCheck=(()=>{
 const keys=['mt','bt','at'],pole=$('pole'),span=$('span'),spanNetwork=$('spanNetwork');
 const clean=value=>String(value??'').trim().toUpperCase();
 const desktop=document.documentElement.classList.contains('gestao-cadastro');
 const notes=new Map();
 let reference=null,lastLookup='',request=null,serial=0;
 for(const key of keys){
  const label=document.createElement('label'),box=document.createElement('input');
  label.hidden=true;label.className='pole-network-note';box.type='checkbox';
  label.append(box,document.createTextNode(key.toUpperCase()+' consta no poste · não existe no campo'));
  $(key).closest('.network').append(label);
  notes.set(key,{label,box});
  box.onchange=()=>{
   if(box.checked){$(key).checked=false;$(key+'Distance').value='';}
   refreshNetworks();scheduleDraft();
  };
  $(key).addEventListener('change',()=>{if($(key).checked)box.checked=false;});
 }
 const known=()=>reference?.pole===clean(pole.value)?reference.links:{};
 function audit(){
  const expected=keys.filter(key=>Object.hasOwn(known(),key));
  return expected.length?{pole:clean(pole.value),expected,absent:expected.filter(key=>notes.get(key).box.checked)}:null;
 }
 function inferred(id){
  if(!clean(id))return '';
  const matches=keys.filter(key=>known()[key]?.some(knownId=>clean(knownId)===clean(id)));
  return matches.length===1?matches[0]:'';
 }
 function paint(){
  const links=known();
  for(const [key,{label,box}] of notes){
   label.hidden=!Object.hasOwn(links,key);
   if(!Object.hasOwn(links,key))box.checked=false;
  }
  const detected=inferred(span.value);
  if(detected)spanNetwork.value=detected;
  $('spanNetworkField').hidden=!span.value.trim();
  spanNetwork.disabled=Boolean(detected);
  if(typeof renderCompletion==='function')renderCompletion();
 }
 function receive(message){
  if(message.action!=='inspection-pole')return false;
  if(request?.id!==message.requestId)return true;
  const {finish,pole:expected}=request;request=null;
  if(expected===clean(pole.value)&&message.links&&typeof message.links==='object'){
   reference={pole:expected,links:Object.fromEntries(keys.filter(key=>Array.isArray(message.links[key])).map(key=>[key,message.links[key]]))};
   paint();
  }
  finish();
  return true;
 }
 function lookup(point){
  const id=clean(pole.value);
  if(!id)return;
  const source=desktop?'management':packageReady&&packageWorker?packageConfig?.indexPath||'local':'';
  if(!source)return;
  const signature=source+':'+id;
  if(lastLookup===signature&&!point)return request?.done;
  request?.finish();
  lastLookup=signature;
  let finish;
  const done=new Promise(resolve=>{finish=resolve;});
  const requestId='pole-'+(++serial);
  const timer=setTimeout(()=>{
   if(request?.id===requestId)request=null;
   finish();
  },1600);
  request={id:requestId,pole:id,done,finish:()=>{clearTimeout(timer);finish();}};
  const payload={action:'inspection-pole',requestId,pole:id,point};
  if(desktop)parent.postMessage({source:'arbora-gestao-cadastro',type:'pole-lookup',...payload},location.origin);
  else packageWorker.postMessage(payload);
  return done;
 }
 function restore(saved){
  request?.finish();request=null;lastLookup='';
  const check=CampoInspectionRules.poleAudit({pole:pole.value,poleAudit:saved});
  reference=check?{pole:check.pole,links:Object.fromEntries(check.expected.map(key=>[key,[]]))}:null;
  for(const [key,{box}] of notes)box.checked=Boolean(check?.absent.includes(key));
  paint();
 }
 pole.addEventListener('input',()=>{
  if(reference&&reference.pole!==clean(pole.value))restore(null);
 });
 pole.addEventListener('blur',()=>lookup());
 span.addEventListener('input',()=>{spanNetwork.value='';paint();});
 for(const key of keys)$(key).addEventListener('change',paint);
 $('noNetwork').addEventListener('change',paint);
 function selectSpan(value,network){
  span.value=String(value);
  spanNetwork.value=network;
  paint();
 }
 async function prepare(){
  const pending=lookup();
  if(!pending)return;
  let timer;
  await Promise.race([pending,new Promise(resolve=>{timer=setTimeout(resolve,350);})]);
  clearTimeout(timer);
 }
 return {audit,receive,lookup,restore,selectSpan,prepare,spanType:(id,type)=>inferred(id)||type};
})();
