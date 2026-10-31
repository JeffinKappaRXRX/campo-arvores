'use strict';
let readyZip=null,zipBusy=false;
function bindRecordActions(){
 $('recordlist').querySelectorAll('[data-sync-record]').forEach(b=>b.onclick=()=>syncGooglePending(b.dataset.syncRecord));
 $('recordlist').querySelectorAll('[data-zip-record]').forEach(b=>b.onclick=()=>{const r=records.find(r=>r.id===b.dataset.zipRecord);if(r)exportRecordsZip([r]);});
}
function exportRecordsZip(list){
 if(zipBusy){tell('Um ZIP já está sendo preparado. Aguarde.');return;}
 if(!list.length){$('zipFeedback').textContent='Salve uma inspeção antes de exportar.';return;}
 zipBusy=true;$('exportPhotoZip').disabled=true;$('shareZip').disabled=true;
 $('zipFeedback').textContent='Preparando ZIP com '+list.length+' inspeção(ões), fotos, Excel e KML…';
 const worker=new Worker('photo-export-worker.js');
 const finish=()=>{worker.terminate();zipBusy=false;$('exportPhotoZip').disabled=false;};
 worker.onmessage=e=>{try{if(e.data.error)throw Error(e.data.error);
  const name=list.length===1?'campo-arvore-'+stableId(list[0].id)+'.zip':'campo-todas-inspecoes-'+new Date().toISOString().slice(0,10)+'.zip';
  readyZip=new File([e.data.bytes],name,{type:'application/zip'});download(e.data.bytes,'application/zip',name);if(typeof noteZipBackup==='function')noteZipBackup(list).catch(()=>{});
  $('shareZip').disabled=false;
  $('zipFeedback').textContent='ZIP baixado. Procure '+name+' em Downloads ou no destino escolhido. Toque em Compartilhar último ZIP para escolher WhatsApp ou outro app. O envio ao Drive continua independente.';
 }catch(err){$('zipFeedback').textContent='Não foi possível exportar: '+err.message;}finally{finish();}};
 worker.onerror=()=>{$('zipFeedback').textContent='Falha ao preparar ZIP. Os registros continuam salvos; tente exportar uma inspeção por vez.';finish();};
 worker.postMessage({records:structuredClone(list)});
}
$('exportPhotoZip').onclick=()=>exportRecordsZip(records);
$('shareZip').onclick=async()=>{if(!readyZip)return;try{
 if(navigator.canShare?.({files:[readyZip]})&&navigator.share){await navigator.share({files:[readyZip],title:'Inspeções de árvores'});$('zipFeedback').textContent='ZIP entregue ao aplicativo escolhido. Isso não confirma sincronização com o Drive.';}
 else{$('zipFeedback').textContent='Este navegador não compartilha ZIP diretamente. Abra Downloads e envie o arquivo como documento pelo WhatsApp.';}
 }catch(e){if(e.name!=='AbortError')$('zipFeedback').textContent='Não foi possível compartilhar. Use o ZIP já baixado em Downloads.';}};
$('openSharepoint').onclick=()=>{const value=$('sharepoint').value.trim();if(!value){tell('Informe o link da pasta de destino nas configurações da Administração. A sincronização já usa o destino definido no servidor.');return;}try{const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password)throw Error('Link inválido');window.open(url.href,'_blank','noopener');}catch{tell('Informe um link HTTPS válido para a pasta de destino.');}};
$('openUploadFolder').onclick=()=>$('openSharepoint').onclick();
function applyTheme(choice){const dark=choice==='dark'||choice==='system'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches;document.documentElement.dataset.theme=dark?'dark':'light';}
const theme=localStorage.getItem('campo-theme')||'system';$('themeChoice').value=theme;applyTheme(theme);
$('themeChoice').onchange=()=>{localStorage.setItem('campo-theme',$('themeChoice').value);applyTheme($('themeChoice').value);};
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change',()=>applyTheme($('themeChoice').value));
