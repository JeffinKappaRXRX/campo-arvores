'use strict';
// Same IndexedDB/version as the app. Immutable originals are stored once by hash, not once per edit.
window.CampoLocalHistory=(()=>{
 const meta=(mode,fn)=>req('meta',mode,fn),prefix='tree-history:',queueKey='tree-history-queue';
 async function put(record){
  const old=await req('records','readonly',s=>s.get(record.id));let snapshot=null,assets=[];
  if(old&&old.updatedAt!==record.updatedAt){snapshot=structuredClone(old);snapshot.photos=[];
   for(const p of old.photos||[]){const {original,annotated,...ref}=p;if(original){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(original))),b=>b.toString(16).padStart(2,'0')).join(''),key=prefix+'photo:'+hash;ref.localHistoryAsset=key;assets.push({key,original});}snapshot.photos.push(ref);}
  }
  await new Promise((resolve,reject)=>{const tx=db.transaction(['records','meta'],'readwrite'),store=tx.objectStore('records'),m=tx.objectStore('meta'),get=store.get(record.id);let error;
   get.onsuccess=()=>{if((get.result?.updatedAt||null)!==(old?.updatedAt||null)){error=Error('Este cadastro foi alterado em outra aba. O formulário foi mantido.');tx.abort();return;}
    if(snapshot){const key=prefix+record.id+':'+snapshot.updatedAt;m.put(snapshot,key);for(const p of assets)m.put({original:p.original},p.key);
     const index=m.get(prefix+record.id);index.onsuccess=()=>{const list=index.result||[];if(!list.includes(key))list.push(key);m.put(list,prefix+record.id);};
     const queue=m.get(queueKey);queue.onsuccess=()=>{const list=queue.result||[];if(!list.includes(key))list.push(key);m.put(list,queueKey);};
    }store.put(record);
   };tx.oncomplete=resolve;tx.onerror=()=>reject(error||tx.error);tx.onabort=()=>reject(error||tx.error||Error('Histórico local não confirmado.'));
  });
 }
 async function snapshots(id){const keys=await meta('readonly',s=>s.get(prefix+id))||[],out=[];for(const key of keys.slice(-100).reverse()){const record=await meta('readonly',s=>s.get(key));if(record)out.push({key:'local:'+key,sourceId:id,at:record.updatedAt,actor:record.inspector,kind:'device',record});}return out;}
 async function photo(snapshot,photo){if(photo.original)return photo.original;if(!photo.localHistoryAsset)throw Error('Foto original não está neste aparelho.');const asset=await meta('readonly',s=>s.get(photo.localHistoryAsset));if(!asset?.original)throw Error('Foto local não encontrada.');return asset.original;}
 async function sync(){let queue=await meta('readonly',s=>s.get(queueKey))||[];for(const key of queue.slice(0,2)){
   const record=await meta('readonly',s=>s.get(key));if(!record){await done(key);continue;}
   const current=sharedTrees.get(record.id);if(!current||current.sharedDeleted&&!current.mergedInto)continue;
   const ready={...record,photos:[]};for(const p of record.photos||[])ready.photos.push(p.localHistoryAsset?{...p,assetId:undefined,original:await photo(null,p)}:p);
   try{const payload=await sharedPayload(ready);await sharedCall('history/import',{record:payload.record,uploads:payload.uploads});await done(key);}catch(e){if(e.status===401||e.status===503)throw e;break;}
  }
 }
 async function done(key){await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite'),s=tx.objectStore('meta'),r=s.get(queueKey);r.onsuccess=()=>s.put((r.result||[]).filter(k=>k!==key),queueKey);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
 return {put,snapshots,photo,sync};
})();
