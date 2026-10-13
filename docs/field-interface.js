'use strict';
// Administrative visibility comes from the server identity, never from local storage.
let adminAllowed=false;
const selectedRecords=new Set();
let selectionSyncBusy=false;
async function initFieldAccess(){try{const r=await fetch('/api/access',{cache:'no-store'});if(!r.ok)throw Error('Access');const access=await r.json();adminAllowed=access.admin===true;}catch{adminAllowed=false;}$('adminNav').hidden=!adminAllowed;if(!adminAllowed&&!$('admin').hidden)view('records');if(adminAllowed)checkDrive();}
$('returnField').onclick=()=>view('records');
function updateSelection(){
 for(const id of selectedRecords)if(!records.some(r=>r.id===id))selectedRecords.delete(id);
 const boxes=[...$('recordlist').querySelectorAll('[data-select-record]')];
 boxes.forEach(b=>{b.checked=selectedRecords.has(b.dataset.selectRecord);b.closest('.record').classList.toggle('selected',b.checked);});
 $('selectionCount').textContent=selectedRecords.size+' selecionado(s)';
 $('selectAllRecords').checked=boxes.length>0&&boxes.every(b=>b.checked);$('selectAllRecords').indeterminate=boxes.some(b=>b.checked)&&!$('selectAllRecords').checked;
 $('exportSelectedZip').disabled=!selectedRecords.size||zipBusy;$('syncSelected').disabled=!selectedRecords.size||driveBusy||syncBusy||selectionSyncBusy;
}
const bindFieldActions=bindRecordActions;
bindRecordActions=function(){bindFieldActions();$('recordlist').querySelectorAll('[data-select-record]').forEach(b=>b.onchange=()=>{if(b.checked)selectedRecords.add(b.dataset.selectRecord);else selectedRecords.delete(b.dataset.selectRecord);updateSelection();});updateSelection();};
$('selectAllRecords').onchange=()=>{$('recordlist').querySelectorAll('[data-select-record]').forEach(b=>{if($('selectAllRecords').checked)selectedRecords.add(b.dataset.selectRecord);else selectedRecords.delete(b.dataset.selectRecord);});updateSelection();};
$('exportSelectedZip').onclick=()=>exportRecordsZip(records.filter(r=>selectedRecords.has(r.id)));
$('syncSelected').onclick=async()=>{if(driveBusy||syncBusy||selectionSyncBusy)return;selectionSyncBusy=true;updateSelection();try{const ids=[...selectedRecords];for(const id of ids){await syncGooglePending(id);const current=records.find(r=>r.id===id);if(!navigator.onLine||!driveConnected||current&&!receiptValid(current))break;}}finally{selectionSyncBusy=false;updateSelection();}};
initFieldAccess();
