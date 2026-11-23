'use strict';
const prefix='window.CICLO_PODA_DADOS';
const specs={
 postes:{sheet:'Ciclo Poda',start:12,columns:[
  ['id',0,'s'],['alim',1,'d'],['conj',2,'d'],['polo',3,'d'],['trecho',4,'d'],['chave',5,'d'],['tipo',6,'d'],
  ['pontos',7],['nvera',8,'z'],['ciclo',9],['origc',10,'d'],['status',11,'d'],['criacao',12],['execucao',13],
  ['lat',25,'c'],['lon',26,'c'],['origcoord',27,'d'],['latP',29,'c'],['lonP',30,'c'],['latA',31,'c'],['lonA',32,'c'],
  ['perim',37,'d'],['cat',38,'d'],['arv',39,'z'],['faixa',40,'z'],['qtdSgm',42],['origq',43,'d'],['tensao',44,'d'],
  ['arranjo',45,'d'],['kv',46],['rede',47,'d'],['moLM',48],['moLV',49],['distIT',50],['zona',51],['equipe',52,'d'],
  ['idsVera',53,'s'],['espVera',54,'s']]},
 arvores:{sheet:'BASE ÁRVORES',start:2,columns:[
  ['id',0,'s'],['esp',5,'d'],['altura',7],['dap',9],['distMT',11],['distBT',12],['lat',35,'c'],['lon',36,'c'],
  ['classe',37,'d'],['prior',38],['acao',40,'d'],['chave',24,'d'],['alim',25,'d'],['trecho',26,'d'],['polo',48,'d'],
  ['zona',46,'d'],['prazo',51,'d'],['sit',52,'d'],['posteGIS',53,'s'],['dataLev',42],['faixaAlt',49,'d'],['cicloEsp',null],['motivo',23,'s']]}
};
const checkColumns=[15,16,18,33,34,35,36];
function round(value,digits){
 const abs=Math.abs(value),scale=10**digits,scaled=abs*scale,index=Math.floor(scaled);
 const exactHalf=abs*2**digits%1===.5&&scaled%1===.5;
 return exactHalf?Math.sign(value)*(index+(index%2))/scale:Number(value.toFixed(digits));
}
const txt=v=>v==null?'':String(v).trim();
const number=v=>v==null||v===''||typeof v==='boolean'?null:((n)=>Number.isFinite(n)?n:null)(Number(String(v).replace(',','.')));
const unescapeXml=s=>s.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi,(_,key)=>key[0]==='#'?String.fromCodePoint(key[1].toLowerCase()==='x'?parseInt(key.slice(2),16):Number(key.slice(1))):({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'})[key]);
const attrs=s=>Object.fromEntries([...s.matchAll(/([\w:.-]+)="([^"]*)"/g)].map(m=>[m[1],unescapeXml(m[2])]));
const textTags=s=>[...s.matchAll(/<t(?:\s[^>]*)?>([^]*?)<\/t>/g)].map(m=>unescapeXml(m[1])).join('');
const decoder=new TextDecoder();
const bytes=async(file,at,size)=>new Uint8Array(await file.slice(at,at+size).arrayBuffer());
const view=u=>new DataView(u.buffer,u.byteOffset,u.byteLength);
async function zip(file){
 const offset=Math.max(0,file.size-65557), tail=view(await bytes(file,offset,file.size-offset));let end=tail.byteLength-22;
 while(end>=0&&tail.getUint32(end,true)!==0x06054b50)end--;
 if(end<0)throw Error('O arquivo não é um XLSX legível.');
 const size=tail.getUint32(end+12,true), start=tail.getUint32(end+16,true);
 if(size>16000000||start+size>file.size)throw Error('Índice ZIP do Excel inválido.');
 const index=await bytes(file,start,size), dv=view(index), entries=new Map();
 for(let i=0;i<size;){
  if(i+46>size||dv.getUint32(i,true)!==0x02014b50)throw Error('Índice ZIP do Excel inválido.');
  const length=dv.getUint16(i+28,true);
  entries.set(decoder.decode(index.subarray(i+46,i+46+length)),{
   method:dv.getUint16(i+10,true),size:dv.getUint32(i+20,true),expanded:dv.getUint32(i+24,true),offset:dv.getUint32(i+42,true)
  });
  i+=46+length+dv.getUint16(i+30,true)+dv.getUint16(i+32,true);
 }
 return async name=>{
  const row=entries.get(name);
  if(!row||row.expanded>350000000)throw Error('Aba inválida ou grande demais no Excel: '+name);
  const header=view(await bytes(file,row.offset,30));
  if(header.byteLength!==30||header.getUint32(0,true)!==0x04034b50)throw Error('Aba do Excel danificada.');
  const at=row.offset+30+header.getUint16(26,true)+header.getUint16(28,true);
  const stream=file.slice(at,at+row.size).stream();
  if(row.method!==8&&row.method!==0)throw Error('Compressão XLSX incompatível.');
  return (row.method===8?stream.pipeThrough(new DecompressionStream('deflate-raw')):stream).pipeThrough(new TextDecoderStream());
 };
}
async function elements(open,name,tag,consume){
 const reader=(await open(name)).getReader(), opening=new RegExp('<'+tag+'(?=[\\s>/])'), close='</'+tag+'>';let buffer='';
 try{
  for(;;){
   const chunk=await reader.read();
   if(chunk.done)break;
   buffer+=chunk.value;let pos=0;
   while(pos<buffer.length){
    const match=opening.exec(buffer.slice(pos)); // XML uses a single record per row or shared string.
    if(!match){pos=Math.max(pos,buffer.length-tag.length-2);break;}
    const start=pos+match.index, mark=buffer.indexOf('>',start);
    if(mark<0){pos=start;break;}
    const selfClosing=buffer[mark-1]==='/',end=selfClosing?mark:buffer.indexOf(close,mark+1);
    if(end<0){pos=start;break;}
    if(consume(buffer.slice(start,mark+1),selfClosing?'':buffer.slice(mark+1,end))===false){await reader.cancel();return;}
    pos=end+(selfClosing?1:close.length);
   }
   buffer=buffer.slice(pos);
   if(buffer.length>16000000)throw Error('Registro XML do Excel grande demais.');
  }
  if(opening.test(buffer))throw Error('Aba do Excel truncada.');
 }finally{reader.releaseLock();}
}
function cellColumn(label){
 let index=0;for(const char of label)index=index*26+char.charCodeAt(0)-64;return index-1;
}
async function sheet(open,name,columns,limit=Infinity){
 const result=new Map();
 await elements(open,name,'row',(header,body)=>{
  const r=Number(/\br="(\d+)"/.exec(header)?.[1]);if(r>limit)return false;
  if(!r||!body)return;
  const values={};
  for(const m of body.matchAll(/<c\b([^>]*?)(?:\/>|>([^]*?)<\/c>)/g)){
   const col=/\br="([A-Z]+)\d+"/.exec(m[1]);if(!col)continue;
   const n=cellColumn(col[1]);if(!columns.has(n)||!m[2])continue;
   const type=/\bt="([^"]+)"/.exec(m[1])?.[1], value=/<v>([^]*?)<\/v>/.exec(m[2])?.[1];
   if(type==='inlineStr')values[n]=textTags(m[2]);
   else if(value!=null&&type!=='e')values[n]=type==='s'?{index:Number(value)}:type==='str'?unescapeXml(value):type==='b'?value==='1':number(value);
  }
  if(Object.keys(values).length)result.set(r,values);
 });
 return result;
}
function pack(spec,rows){
 const dic=Object.fromEntries(spec.columns.filter(c=>c[2]==='d').map(c=>[c[0],[]]));
 const indexes=Object.fromEntries(Object.keys(dic).map(k=>[k,new Map()]));
 return {campos:spec.columns.map(c=>c[0]),dic,linhas:rows.map(row=>spec.columns.map(([key,index,type])=>{
  const value=row[key]??row[index];
  if(type==='d'){
   const v=txt(value),idx=indexes[key];
   if(!idx.has(v)){idx.set(v,dic[key].length);dic[key].push(v);}
   return idx.get(v);
  }
  if(type==='s')return txt(value);
  if(type==='z')return number(value)||0;
  if(type==='c'){const n=number(value);return n==null?null:round(n,6);}
  return number(value);
 }))};
}
async function workbook(file,status){
 const open=await zip(file), names={}, links={};
 await elements(open,'xl/_rels/workbook.xml.rels','Relationship',tag=>{const a=attrs(tag);links[a.Id]=a.Target?.startsWith('/')?a.Target.slice(1):'xl/'+a.Target;});
 await elements(open,'xl/workbook.xml','sheet',tag=>{const a=attrs(tag);names[a.name]=links[a['r:id']];});
 const baseName='Base Poda SGM', growName='Crescimento Espécies';
 for(const name of [specs.postes.sheet,specs.arvores.sheet,baseName,growName])if(!names[name])throw Error('Aba ausente no Excel: '+name);
 const cols=s=>s.columns.map(c=>c[1]).filter(n=>n!=null),read=(name,c,limit)=>{status('Lendo '+name+'…');return sheet(open,names[name],new Set(c),limit);};
 const posts=await read(specs.postes.sheet,[...cols(specs.postes),...checkColumns,2,9,10,11,12]);
 const trees=await read(specs.arvores.sheet,[...cols(specs.arvores),15,16,19,20,21,41]);
 const base=await read(baseName,[5,6,7,11,14]);
 const growth=await read(growName,[0,1,2,3,5,6,7],250);
 const wanted=new Map();
 for(const rows of [posts,trees,base,growth])for(const d of rows.values())for(const k of Object.keys(d)){
  const v=d[k];if(v&&typeof v==='object'){if(!wanted.has(v.index))wanted.set(v.index,[]);wanted.get(v.index).push([d,k]);}
 }
 status('Vinculando textos, postes, árvores e histórico do Excel…');
 if(wanted.size){
  let i=0;
  await elements(open,'xl/sharedStrings.xml','si',(_,body)=>{
   for(const [d,k] of wanted.get(i)||[])d[k]=textTags(body);
   wanted.delete(i++);
   if(!wanted.size)return false;
  });
  if(wanted.size)throw Error('Índice de textos inválido no Excel.');
 }
 const p=(r,c)=>posts.get(r)?.[c], par={marco:number(p(4,2)),inicio:number(p(5,2)),janela:number(p(6,2))||6,padrao:number(p(7,2))||6,faixa:number(p(8,2))||12,
  it:[4,5,6].map(r=>[txt(p(r,9)),number(p(r,10)),number(p(r,11)),number(p(r,12))])};
 const classes=[],species=new Map();
 for(const [r,d] of growth){
  if(r>=5&&r<=8&&d[0])classes.push([txt(d[0]),number(d[1]),number(d[2]),txt(d[3])]);
  if(r>=5&&r<250&&d[5])species.set(txt(d[5]).toUpperCase(),number(d[7]));
 }
 const postRows=[...posts].filter(([i,p])=>i>=12&&txt(p[0])).map(([,p])=>p), ids=new Set(postRows.map(p=>txt(p[0])));
 const execucoes=[];
 for(const [i,d] of base){
  const desc=txt(d[7]).toUpperCase(),id=txt(d[5]),dt=number(d[11]);
  if(i>=2&&desc.includes('PODA')&&!desc.includes('FAIXA')&&txt(d[6]).toUpperCase()==='EXECUTADA'&&dt!=null&&ids.has(id))execucoes.push([id,round(dt,4),number(d[14])||0]);
 }
 const treeRows=[];
 for(const [i,d] of trees){
  if(i<2||!txt(d[0]))continue;
  const esp=txt(d[5]).toUpperCase(),useNew=number(d[35])&&number(d[36]);
  treeRows.push({...d,esp,lat:d[useNew?35:15],lon:d[useNew?36:16],classe:d[37]||d[19],prior:d[38]||d[20],
   acao:d[40]||d[21],motivo:txt(d[23]||d[41]).slice(0,160),cicloEsp:species.has(esp)?species.get(esp):par.padrao});
 }
 const stamp=date=>new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Rio_Branco',dateStyle:'short',timeStyle:'short'}).format(date);
 return {gerado_em:stamp(new Date()),fonte:{local:file.name,modificado:file.lastModified?stamp(new Date(file.lastModified)):''},parametros:par,classes,
  postes:pack(specs.postes,postRows),arvores:pack(specs.arvores,treeRows),checagem_excel:postRows.map(p=>checkColumns.map((c,i)=>i===2?txt(p[c]):number(p[c]))),execucoes};
}
async function readSource(file,status){
 if(/\.xlsx$/i.test(file.name))return workbook(file,status);
 if(file.size>20000000||!/\.(?:json|js|gz)$/i.test(file.name))throw Error('Selecione Controle Man V1.xlsx ou o extrato JSON/JS/JSON.GZ do Ciclo Poda.');
 if(/\.gz$/i.test(file.name)){
  const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader(),chunks=[];
  let size=0;
  try{
   for(;;){
    const {done,value}=await reader.read();if(done)break;
    size+=value.byteLength;
    if(size>20000000){await reader.cancel();throw Error('A base excede 20 MB descompactada.');}
    chunks.push(value);
   }
  }finally{reader.releaseLock();}
  return JSON.parse(await new Blob(chunks).text());
 }
 const input=(await file.text()).trim();
 return JSON.parse(input.startsWith(prefix)?input.slice(input.indexOf('=')+1).trim().replace(/;$/,''):input);
}
if(typeof module!=='undefined')module.exports={readSource};
else self.onmessage=async({data:file})=>{
 try{
  const source=await readSource(file,message=>self.postMessage({message}));
  // Private network paths and machine names are irrelevant to the published snapshot.
  const {maquina,locais,link_sharepoint,...data}=source;
  const {local,modificado}=data.fonte||{};
  data.fonte={local:String(local||file.name).slice(0,150),modificado:String(modificado||'').slice(0,100)};
  self.postMessage({data});
 }catch(e){self.postMessage({error:e.message});}
};
