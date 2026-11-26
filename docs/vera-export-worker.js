'use strict';
const version=new URL(self.location.href).search;
importScripts('vendor/fflate.js'+version,'exports.js'+version);

const mimeExtensions={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const encoder=new TextEncoder();
const photoKey=(id,asset)=>id+':'+asset;
const maxZipBytes=1024*1024*1024;

async function request(path,body){
 const response=await fetch(path,{
  credentials:'same-origin',cache:'no-store',signal:AbortSignal.timeout(120000),
  ...(body&&{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
 });
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data)throw Error(data?.error||'Falha ao baixar os dados da exportação ('+response.status+').');
 return data;
}

function csvCell(value){
 let text=String(value??'');
 if(typeof value!=='number'&&/^[=+\-@]/.test(text))text="'"+text;
 return /[;"\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;
}

async function exportPackage(params){
 const {headers,rows,unit,counts,driveAvailable}=await request('/api/control/export?'+params);
 const photoColumn=headers.indexOf('FOTO'),sheets=[
  {name:'Template VERA',headers,rows:[],links:[],dateColumns:new Set([headers.indexOf('DATA')])},
  {name:'Fotos',headers:['ID do cadastro','POSTE','Nome da foto','Arquivo no ZIP','Pasta ou foto no Drive','Situação'],rows:[],links:[]}
 ];
 const [template,photos]=sheets,parts=[];
 let saved=0,remote=0,missing=0,noPhotos=0,size=0,processed=0;
 let archive;
 const zip=new fflate.Zip((error,chunk,done)=>{
  if(error)throw error;
  parts.push(new Blob([chunk]));
  if(done)archive=new Blob(parts,{type:'application/zip'});
 });
 function add(path,data){
  size+=data.byteLength;
  if(size>maxZipBytes)throw Error('Este recorte passou de 1 GB. Divida a extração por período ou alimentador.');
  const entry=new fflate.ZipPassThrough(path);
  zip.add(entry);
  entry.push(data,true);
 }
 function addPhoto(row,image,index){
  const match=/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image||'');
  if(!match)return '';
  const folder='fotos/arvore-'+String(row.id).replace(/[^a-zA-Z0-9_-]/g,'_'),filename=String(index+1).padStart(2,'0')+'.'+mimeExtensions[match[1]];
  const path=folder+'/'+filename;
  add(path,Uint8Array.from(atob(match[2]),c=>c.charCodeAt(0)));
  return path;
 }
 const localLink=(sheet,row,column,path)=>sheet.links.push({row,column,target:path.replaceAll('/','\\')});
 const externalLink=(sheet,row,column,target)=>sheet.links.push({row,column,target});
 for(let offset=0;offset<rows.length;){
  const batch=[],refs=[];
  do {
   const row=rows[offset];
   const assets=row.photos.filter(p=>p.asset).map(p=>({id:row.id,asset:p.asset}));
   if(batch.length&&refs.length+assets.length>12)break;
   batch.push(row);
   refs.push(...assets);
   offset++;
  }while(offset<rows.length&&batch.length<20);
  const images=new Map();
  for(let i=0;i<refs.length;i+=12){
   const result=await request('/api/control/export/photos',{photos:refs.slice(i,i+12)});
   for(const photo of result.photos)images.set(photoKey(photo.id,photo.asset),photo.image);
  }
  for(const row of batch){
   const folder=row.values[photoColumn]||'',values=row.values.slice();
   let first='';
   if(!row.photos.length){
    noPhotos++;
    if(folder){
     photos.links.push({row:photos.rows.length,column:4,target:folder});
     photos.rows.push([row.id,values[6],'','',folder,'Pasta de origem']);
    }
   }
   for(const [i,p] of row.photos.entries()){
    const path=addPhoto(row,images.get(photoKey(row.id,p.asset)),i),link=p.url||folder;
    if(path){saved++;first||=path;}
    else if(link)remote++;
    else missing++;
    const index=photos.rows.length;
    photos.rows.push([row.id,values[6],p.name,path,link,path?'Incluída no ZIP':link?'Link externo':'Arquivo indisponível']);
    if(path)localLink(photos,index,3,path);
    if(link)externalLink(photos,index,4,link);
   }
   if(first){
    values[photoColumn]=first;
    localLink(template,template.rows.length,photoColumn,first);
   }else if(folder)externalLink(template,template.rows.length,photoColumn,folder);
   template.rows.push(values);
   processed++;
  }
  postMessage({progress:{processed,total:rows.length,saved}});
 }
 add('template-vera.xlsx',CampoExports.workbook(sheets));
 const csv='\uFEFF'+[headers,...template.rows].map(row=>row.map(csvCell).join(';')).join('\r\n')+'\r\n';
 add('template-vera.csv',encoder.encode(csv));
 const info=[
  'Extraia o ZIP inteiro antes de abrir template-vera.xlsx.',
  'Na aba Template VERA, FOTO abre a primeira foto local da árvore, quando incluída.',
  'Na aba Fotos, cada linha contém o link individual da foto e o endereço de origem quando disponível.',
  'Mantenha a planilha na mesma pasta de fotos/ para os links relativos continuarem funcionando.',
  'Registros com fotos disponíveis apenas por link precisam de internet e da permissão da pasta de origem.',
  'O CSV mantém os mesmos campos do template. Os caminhos locais só funcionam junto da pasta extraída.',
  'Unidade de DT BT, DT MT e DT AT: '+unit+'.',
  'Fotos incluídas: '+saved+'. Só por link: '+remote+'. Arquivos indisponíveis: '+missing+'. Cadastros sem fotos listadas: '+noPhotos+'.',
  ...(!driveAvailable?['O índice do Google Drive não respondeu. O pacote foi montado com os dados disponíveis na base central.']:[])
 ];
 add('LEIA-ME.txt',encoder.encode(info.join('\r\n')));
 zip.end();
 return {archive,saved,remote,missing,noPhotos,total:rows.length,counts,driveAvailable};
}

onmessage=async ({data})=>{
 try{postMessage(await exportPackage(data));}
 catch(error){postMessage({error:error.message});}
};
