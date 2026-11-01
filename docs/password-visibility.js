'use strict';
// Reveals only the value entered in this field. Stored password hashes are never read.
(()=>{
 let sequence=0;
 function reset(root=document){for(const input of root.querySelectorAll('input[data-password-visibility],#accountLoginPassword')){input.type='password';const button=document.getElementById(input.dataset.passwordVisibility||(input.id==='accountLoginPassword'?'accountLoginShow':''));if(button){button.textContent='Mostrar senha';button.setAttribute('aria-pressed','false');}}}
 function decorate(root=document){for(const input of root.querySelectorAll('input[type="password"]')){
  if(input.id==='accountLoginPassword'||input.dataset.passwordVisibility)continue;
  if(!input.id)input.id='campo-secret-'+(++sequence);const button=document.createElement('button');button.type='button';button.className='secondary password-visibility-button';button.id='reveal-'+input.id;button.textContent='Mostrar senha';button.setAttribute('aria-controls',input.id);button.setAttribute('aria-pressed','false');input.dataset.passwordVisibility=button.id;
  button.onclick=event=>{event.preventDefault();const visible=input.type==='password';input.type=visible?'text':'password';button.textContent=visible?'Ocultar senha':'Mostrar senha';button.setAttribute('aria-pressed',String(visible));};input.after(button);
 }}
 decorate();new MutationObserver(records=>{if(records.some(r=>[...r.addedNodes].some(n=>n.nodeType===1)))decorate();}).observe(document.body,{subtree:true,childList:true});
 document.addEventListener('close',event=>reset(event.target),true);document.addEventListener('submit',event=>{if(event.target?.querySelectorAll)reset(event.target);},true);window.addEventListener('pagehide',()=>reset());window.CampoPasswordVisibility={refresh:decorate,reset};
})();
