'use strict';
window.CampoManagementEdit=(()=>{
 const fields=[['species','Espécie','text'],['height','Altura · m','number'],['dap','DAP · cm','number'],['circ','CAP · cm','number'],['mt','Rede MT presente','bool'],['mtDistance','Distância da copa à MT · cm','distance'],['bt','Rede BT presente','bool'],['btDistance','Distância da copa à BT · cm','distance'],['at','Rede AT presente','bool'],['atDistance','Distância da copa à AT · cm','distance'],['noNetwork','Sem rede próxima','bool'],['pole','ID do poste','text'],['span','ID do vão','text'],['feeder','Alimentador','text'],['lat','Latitude','coordinate'],['lon','Longitude','coordinate'],['poda','Necessita poda','choice'],['projection','Em projeção','choice'],['position','Posição em relação à rede','text'],['grouped','Vegetação agrupada','choice'],['treeSite','Local da árvore','site'],['os','OS','text'],['address','Endereço','text'],['note','Observação','note']];
 const dialog=document.createElement('dialog');dialog.id='managementEdit';dialog.className='tree-history-dialog';
 dialog.innerHTML='<form id="managementEditForm"><div class="dialog-head"><h2>Editar árvore e anexar fotos</h2><button type="button" id="managementEditClose">Voltar</button></div><p>Correção do mesmo cadastro. A data e o tempo do levantamento, as fotos anteriores e o histórico são preservados.</p><div id="managementEditFields" class="management-edit-fields"></div><p id="managementEditExisting"></p><label>Adicionar fotos do PC<input id="managementEditPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><p class="small">Até 12 fotos no cadastro, incluindo as existentes. Arquivos de até 20 MB são convertidos em cópias JPEG de até 1.280 px; guarde os originais no PC.</p><div id="managementEditPreviews" class="management-edit-previews"></div><p id="managementEditStatus" role="status" aria-live="polite"></p><div class="selection-actions"><button id="managementEditSave" type="submit">Salvar alterações</button><button id="managementEditReload" type="button">Reabrir versão atual</button></div></form>';
 document.body.append(dialog);const $=id=>document.getElementById(id),api=(...args)=>window.CampoControl.api(...args);
 let snapshot=null,uploads=[],busy=false,serial=0,retry=null,initial={};
 function disabled(value){for(const el of dialog.querySelectorAll('input,select,textarea,button'))el.disabled=value;}
 function format(r,f){const v=r[f[0]];if(v===undefined||v===null||v==='')return '';return f[2]==='distance'?String(Math.round(Number(v)*10000)/100):f[2]==='bool'?(v===true||v==='sim'?'sim':'nao'):String(v);}
 function mount(record,root){if(!window.CampoControl?.authorized()||root.querySelector('[data-management-edit]'))return;const b=document.createElement('button');b.type='button';b.dataset.managementEdit='';b.textContent='Editar árvore / anexar fotos do PC';b.onclick=()=>void open(record.id);root.append(b);}
 async function open(id,issues=[]){
  if(busy||!window.CampoControl.authorized())return;const token=++serial;snapshot=null;uploads=[];retry=null;initial={};$('managementEditSave').textContent='Salvar alterações';$('managementEditFields').textContent='';$('managementEditPreviews').textContent='';$('managementEditPhotos').value='';$('managementEditStatus').textContent='Carregando a versão atual…';disabled(true);$('managementEditClose').disabled=false;if(!dialog.open)dialog.showModal();
  try{const result=await api('/api/control/edit?id='+encodeURIComponent(id));if(token!==serial)return;snapshot=result;
   for(const f of fields){const label=document.createElement('label');label.textContent=f[1];let input;
    if(['bool','choice','site'].includes(f[2])){input=document.createElement('select');const options=f[2]==='site'?[['','Não informado'],['publico','Público — área pública'],['privado','Privado — dentro de terreno particular']]:[['','Não informado'],['sim','Sim'],['nao','Não']];for(const [v,t]of options)input.add(new Option(t,v));}
    else{input=document.createElement(f[2]==='note'?'textarea':'input');if(input.tagName==='INPUT'){input.type=['number','distance','coordinate'].includes(f[2])?'number':'text';if(input.type==='number'){input.step='any';if(f[2]!=='coordinate')input.min='0';else{input.min=f[0]==='lat'?'-90':'-180';input.max=f[0]==='lat'?'90':'180';input.required=true;}}}input.maxLength=f[2]==='note'?5000:1000;}
    input.dataset.editField=f[0];initial[f[0]]=format(result.record,f);input.value=initial[f[0]];label.append(input);$('managementEditFields').append(label);
   }
   const highlight=issues.flatMap(key=>({coordinates:['lat','lon'],trunk:['dap','circ'],photos:[],photoReview:[]})[key]||[key]);
   for(const key of highlight){
    const field=dialog.querySelector('[data-edit-field="'+key+'"]');
    field?.closest('label').classList.add('quality-focus');
   }
   if(issues.includes('photos')||issues.includes('photoReview'))$('managementEditPhotos').closest('label').classList.add('quality-focus');
   else $('managementEditPhotos').closest('label').classList.remove('quality-focus');
   $('managementEditExisting').textContent=(result.record.photos?.length||0)+' foto(s) existente(s), preservadas. Consulte-as no cadastro ou no histórico.';$('managementEditStatus').textContent='Altere os campos necessários e salve.';disabled(false);
  }catch(e){if(token===serial)$('managementEditStatus').textContent=e.message;}
 }
 async function photo(file){
  if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>20*1024*1024)throw Error('Use JPEG, PNG ou WebP de até 20 MB.');
  const url=URL.createObjectURL(file),img=new Image();
  try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('A foto demorou para abrir. Tente um arquivo menor.')),15000);img.onload=()=>{clearTimeout(timer);resolve();};img.onerror=()=>{clearTimeout(timer);reject(Error('Não foi possível abrir '+file.name));};img.src=url;});
   for(let size=1280;size>=320;size=Math.round(size*.75)){const scale=Math.min(1,size/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const image=canvas.toDataURL('image/jpeg',.76);if(image.length<470000){const bytes=Uint8Array.from(atob(image.split(',')[1]),c=>c.charCodeAt(0)),sha256=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');return {assetId:'p_'+sha256,sha256,image,name:file.name};}}
   throw Error('Reduza o tamanho da foto.');
  }finally{img.src='';URL.revokeObjectURL(url);}
 }
 function previews(){$('managementEditPreviews').textContent='';for(const p of uploads){const box=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),remove=document.createElement('button');img.src=p.image;img.alt=p.name;caption.textContent=p.name;remove.type='button';remove.textContent='Retirar anexo';remove.onclick=()=>{uploads=uploads.filter(v=>v!==p);previews();};box.append(img,caption,remove);$('managementEditPreviews').append(box);}}
 $('managementEditPhotos').onchange=async()=>{if(busy||!snapshot)return;const token=serial,files=[...$('managementEditPhotos').files];busy=true;disabled(true);$('managementEditStatus').textContent='Preparando fotos…';try{
  if((snapshot.record.photos?.length||0)+uploads.length+files.length>12)throw Error('O cadastro aceita até 12 fotos, incluindo as existentes.');
  const batch=[];for(const f of files){const p=await photo(f);if(token!==serial)return;if(![...uploads,...batch,...(snapshot.record.photos||[])].some(x=>x.assetId===p.assetId))batch.push(p);}
  uploads.push(...batch);previews();$('managementEditStatus').textContent=uploads.length+' foto(s) pronta(s). Clique em Salvar alterações para enviar.';
 }catch(e){if(token===serial)$('managementEditStatus').textContent=e.message;}finally{busy=false;if(token===serial){disabled(false);$('managementEditPhotos').value='';}}};
 $('managementEditFields').onchange=event=>{
  const key=event.target.dataset.editField;
  if(event.target.value!=='sim'||!['noNetwork','mt','bt','at'].includes(key))return;
  const value=id=>dialog.querySelector('[data-edit-field="'+id+'"]');
  if(key==='noNetwork'){
   for(const network of ['mt','bt','at']){value(network).value='nao';value(network+'Distance').value='';}
   value('position').value=value('projection').value='';
  }else value('noNetwork').value='nao';
 };
 $('managementEditForm').onsubmit=async event=>{
  event.preventDefault();if(busy||!snapshot||!window.CampoControl.authorized())return;
  const token=serial;
  if(!retry){const values={};for(const f of fields){const value=dialog.querySelector('[data-edit-field="'+f[0]+'"]').value;if(value!==initial[f[0]])values[f[0]]=f[2]==='distance'&&value!==''?Number(value)/100:f[2]==='bool'?value==='sim':value;}
   if(!Object.keys(values).length&&!uploads.length){$('managementEditStatus').textContent='Nenhuma alteração para salvar.';return;}
   retry={id:snapshot.record.id,version:snapshot.version,baselineToken:snapshot.baselineToken,operationId:crypto.randomUUID(),values,uploads};
  }
  busy=true;disabled(true);$('managementEditStatus').textContent='Salvando e preservando o histórico…';
  try{const result=await api('/api/control/edit',retry);if(token!==serial)return;retry=null;busy=false;dialog.close();void window.CampoControl.load();void window.CampoQualityAdmin?.refresh();void window.CampoParque?.refresh?.();if(result.tree.id.startsWith('vera-'))void window.CampoTreeHistory?.open(result.tree.id);else void window.CampoControl.openRecord(result.tree.id);
  }catch(e){if(token!==serial)return;$('managementEditStatus').textContent=e.message+(e.status>=400&&e.status<500?' Os campos e anexos foram mantidos.':' Não foi possível confirmar. Clique em Tentar novamente para conferir o mesmo envio, sem duplicar.');if(e.status>=400&&e.status<500)retry=null;
  }finally{busy=false;if(token===serial){disabled(Boolean(retry));$('managementEditClose').disabled=false;$('managementEditSave').disabled=false;$('managementEditSave').textContent=retry?'Tentar novamente':'Salvar alterações';}}
 };
 $('managementEditReload').onclick=()=>{if(snapshot&&!busy&&confirm('Reabrir descarta as alterações ainda não salvas desta tela. Continuar?'))void open(snapshot.record.id);};
 $('managementEditClose').onclick=()=>{if(!busy)dialog.close();};dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();});dialog.addEventListener('close',()=>{serial++;snapshot=null;uploads=[];retry=null;$('managementEditFields').textContent='';$('managementEditPreviews').textContent='';});
 return {mount,open,close:()=>{serial++;dialog.close();}};
})();
