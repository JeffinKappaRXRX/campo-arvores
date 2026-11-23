'use strict';
importScripts('vendor/fflate.js','exports.js');

function photoBytes(source){
 const match=/^data:([^;,]+);base64,([\s\S]+)$/.exec(source||'');
 if(!match)throw Error('Imagem sem conteúdo válido');
 const raw=atob(match[2]),data=new Uint8Array(raw.length);
 for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
 return {data,mime:match[1]};
}
const safe=id=>String(id).replace(/[^a-zA-Z0-9_-]/g,'_');
function openRecords(){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('campo-vegetacao');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
  request.onupgradeneeded=()=>request.transaction.abort();
 });
}
function readRecord(db,{id,updatedAt}){
 return new Promise((resolve,reject)=>{
  const request=db.transaction('records','readonly').objectStore('records').get(id);
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{
   if(!request.result||request.result.updatedAt!==updatedAt)reject(Error('Um cadastro mudou durante a exportação. Gere o ZIP novamente.'));
   else resolve(request.result);
  };
 });
}
onmessage=async ({data:{records}})=>{
 let db;
 try{
  db=await openRecords();
  const parts=[],encoder=new TextEncoder();
  const zip=new fflate.Zip((error,chunk,final)=>{
   if(error)throw error;
   parts.push(new Blob([chunk]));
   if(final)postMessage({archive:new Blob(parts,{type:'application/zip'})});
  });
  const add=(path,bytes)=>{
   const entry=new fflate.ZipPassThrough(path);
   zip.add(entry);entry.push(bytes,true);
  };
  for(const key of records){
   const record=await readRecord(db,key);
   const folder='Campo_'+safe(record.id)+'/',photos=[];
   for(const photo of record.photos||[]){
    const original=photoBytes(photo.original);
    const ext=({'image/png':'png','image/webp':'webp','image/heic':'heic'})[original.mime]||'jpg';
    const name=safe(photo.id)+'_original.'+ext,geo=photo.annotated?safe(photo.id)+'_georreferenciada.jpg':null;
    add(folder+name,original.data);
    if(geo)add(folder+geo,photoBytes(photo.annotated).data);
    photos.push({id:photo.id,name:photo.name,metadata:photo.metadata||null,original:name,georreferenced:geo});
   }
   add(folder+'inspecao.xlsx',CampoExports.xlsx([record]));
   add(folder+'inspecao.kml',encoder.encode(CampoExports.kml([record])));
   const {photos:originals,...metadata}=record;
   add(folder+'metadados.json',encoder.encode(JSON.stringify({...metadata,photos},null,2)));
  }
  add('campo-inspecoes.xlsx',CampoExports.xlsx(records));
  add('campo-arvores.kml',encoder.encode(CampoExports.kml(records)));
  add('LEIA-ME.txt',encoder.encode('Fotos originais e georreferenciadas são arquivos separados por inspeção. Excel e KML usam a posição final do alfinete da árvore. O ZIP baixado não confirma envio a nenhum repositório.'));
  zip.end();
 }catch(error){postMessage({error:error.message});}
 finally{db?.close();}
};
