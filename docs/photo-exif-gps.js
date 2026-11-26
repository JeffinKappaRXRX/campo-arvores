'use strict';
(() => {
 const MAX_EXIF=256*1024;
 const tag=(view,offset,length)=>String.fromCharCode(...new Uint8Array(view.buffer,view.byteOffset+offset,length));
 function source(url){
  if(typeof url!=='string')return null;
  const start=url.indexOf(',')+1;
  if(start<1||!/^data:[^,]*;base64,$/i.test(url.slice(0,start)))return null;
  const size=Math.floor((url.length-start)*3/4)-(url.endsWith('==')?2:url.endsWith('=')?1:0);
  return {size,read(offset,length){
   if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(length)||offset<0||length<0||length>MAX_EXIF||offset+length>size)throw Error('Invalid image offset');
   const first=Math.floor(offset/3),last=Math.ceil((offset+length)/3);
   const raw=atob(url.slice(start+first*4,start+last*4));
   const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
   return new DataView(bytes.buffer,offset-first*3,length);
  }};
 }
 function tiff(view,start,metadata){
  if(view.byteLength-start<8)return null;
  const order=view.getUint16(start),little=order===0x4949;
  if(!little&&order!==0x4d4d)return null;
  const short=at=>view.getUint16(start+at,little),long=at=>view.getUint32(start+at,little);
  if(short(2)!==42)return null;
  function entries(offset){
   const count=short(offset);
   if(count>512||start+offset+2+count*12>view.byteLength)throw Error('Invalid EXIF directory');
   const props=new Map();
   for(let index=0;index<count;index++){
    const at=offset+2+index*12;
    props.set(short(at),{type:short(at+2),count:long(at+4),at:at+8});
   }
   return props;
  }
  const root=entries(long(4));
  function point(){
   const pointer=root.get(0x8825);
   if(pointer?.type!==4||pointer.count!==1)return null;
   const gps=entries(long(pointer.at));
   function coord(valueTag,refTag,positive,negative,max){
    const value=gps.get(valueTag),ref=gps.get(refTag);
    if(value?.type!==5||value.count!==3||ref?.type!==2||ref.count!==2)return NaN;
    const letter=String.fromCharCode(view.getUint8(start+ref.at));
    if(letter!==positive&&letter!==negative)return NaN;
    const offset=long(value.at);
    const [degrees,minutes,seconds]=[0,8,16].map(n=>long(offset+n)/long(offset+n+4));
    const number=degrees+minutes/60+seconds/3600;
    if(minutes>=60||seconds>=60||!Number.isFinite(number)||number>max)return NaN;
    return letter===negative?-number:number;
   }
   const lat=coord(2,1,'N','S',90),lon=coord(4,3,'E','W',180);
   return Number.isFinite(lat)&&Number.isFinite(lon)?{lat,lon}:null;
  }
  function captureDate(){
   const pointer=root.get(0x8769);
   if(pointer?.type!==4||pointer.count!==1)return null;
   const fields=entries(long(pointer.at));
   const ascii=(key,max)=>{
    const item=fields.get(key);
    if(item?.type!==2||item.count<1||item.count>max)return '';
    const at=item.count<=4?item.at:long(item.at);
    return tag(view,start+at,item.count).split('\0')[0].trim();
   };
   return captureTime(ascii(0x9003,24),ascii(0x9011,8));
  }
  if(!metadata)return point();
  let coordinates=null,capturedAt=null;
  try{coordinates=point();}catch{/* Incomplete GPS tags do not discard a valid date. */}
  try{capturedAt=captureDate();}catch{/* Incomplete time tags do not discard a valid position. */}
  return {point:coordinates,capturedAt};
 }
 function captureTime(value,offset){
  const match=/^(\d{4}):(\d{2}):(\d{2}) (\d{2}:\d{2}:\d{2})$/.exec(value);
  if(!match||Number(match[1])<1900)return null;
  const [,year,month,day,time]=match;
  const local=year+'-'+month+'-'+day+'T'+time;
  const utc=Date.parse(local+'Z');
  if(!Number.isFinite(utc)||!new Date(utc).toISOString().startsWith(local+'.'))return null;
  // Acre inspection dates are reported in Rio Branco. Honor the camera's offset when present.
  const zone=offset||'-05:00';
  if(!/^[+-](?:0\d|1[0-3]):[0-5]\d$|^[+-]14:00$/.test(zone))return null;
  const instant=Date.parse(local+zone);
  return Number.isFinite(instant)?new Date(instant).toISOString():null;
 }
 function exif(view,metadata){
  return tiff(view,view.byteLength>=6&&tag(view,0,6)==='Exif\0\0'?6:0,metadata);
 }
 function jpeg(image,metadata){
  for(let at=2,segments=0;at+4<=image.size&&segments++<512;){
   const header=image.read(at,4),marker=header.getUint16(0);
   if((marker&0xff00)!==0xff00||marker===0xffda||marker===0xffd9)return null;
   if(marker===0xffff){at++;continue;}
   const size=header.getUint16(2),data=at+4;
   if(size<2||data+size-2>image.size)return null;
   if(marker===0xffe1&&size>=8&&tag(image.read(data,6),0,6)==='Exif\0\0')return exif(image.read(data,size-2),metadata);
   at+=size+2;
  }
  return null;
 }
 function chunks(image,png,metadata){
  const name=png?'eXIf':'EXIF';
  for(let at=png?8:12,scanned=0;at+8<=image.size&&scanned++<1024;){
   const header=image.read(at,8),size=header.getUint32(png?0:4,!png),kind=tag(header,png?4:0,4);
   if(at+8+size>image.size)return null;
   if(kind===name)return exif(image.read(at+8,size),metadata);
   if(png&&kind==='IEND')return null;
   at+=8+size+(png?4:size%2);
  }
  return null;
 }
 function boxes(image,start,end){
  const result=[];
  for(let at=start;at+8<=end&&result.length<1024;){
   const header=image.read(at,8),name=tag(header,4,4);
   let size=header.getUint32(0),headerSize=8;
   if(size===1){size=Number(image.read(at+8,8).getBigUint64(0));headerSize=16;}
   if(size===0)size=end-at;
   if(!Number.isSafeInteger(size)||size<headerSize||at+size>end)break;
   result.push({name,start:at+headerSize,end:at+size});at+=size;
  }
  return result;
 }
 function iso(image,metadata){
  const meta=boxes(image,0,image.size).find(box=>box.name==='meta');
  if(!meta)return null;
  const children=boxes(image,meta.start+4,meta.end);
  const info=children.find(box=>box.name==='iinf'),location=children.find(box=>box.name==='iloc');
  if(!info||!location)return null;
  const infoVersion=image.read(info.start,1).getUint8(0);
  let id=null;
  for(const item of boxes(image,info.start+(infoVersion===0?6:8),info.end)){
   if(item.name!=='infe'||item.end-item.start<12)continue;
   const view=image.read(item.start,Math.min(14,item.end-item.start)),version=view.getUint8(0);
   if(version===2&&tag(view,8,4)==='Exif')id=view.getUint16(4);
   if(version===3&&view.byteLength>=14&&tag(view,10,4)==='Exif')id=view.getUint32(4);
   if(id!==null)break;
  }
  if(id===null)return null;
  const view=image.read(location.start,location.end-location.start),version=view.getUint8(0);
  if(version>2)return null;
  const offsets=view.getUint8(4),bases=view.getUint8(5),offsetSize=offsets>>4,lengthSize=offsets&15,baseSize=bases>>4,indexSize=version?bases&15:0;
  if([offsetSize,lengthSize,baseSize,indexSize].some(size=>size>8))return null;
  let at=6;
  function number(bytes){
   if(bytes>8||at+bytes>view.byteLength)throw Error('Invalid EXIF item location');
   let value=0;
   for(let i=0;i<bytes;i++)value=value*256+view.getUint8(at++);
   if(!Number.isSafeInteger(value))throw Error('Image offset out of range');
   return value;
  }
  const count=number(version<2?2:4);
  if(count>4096)return null;
  for(let i=0;i<count;i++){
   const itemId=number(version<2?2:4),method=version?number(2)&15:0,reference=number(2),base=number(baseSize),extents=number(2);
   if(itemId!==id){at+=extents*(indexSize+offsetSize+lengthSize);if(at>view.byteLength)return null;continue;}
   const inline=method===1?children.find(box=>box.name==='idat'):null;
   if(reference||method>1||method===1&&!inline||extents>64)return null;
   const parts=[];
   let total=0;
   for(let n=0;n<extents;n++){
    number(indexSize);
    const offset=number(offsetSize),length=number(lengthSize);
    total+=length;
    if(total>MAX_EXIF||inline&&inline.start+base+offset+length>inline.end)return null;
    parts.push(image.read((inline?.start||0)+base+offset,length));
   }
   if(total<12)return null;
   const bytes=new Uint8Array(total);
   let pos=0;
   for(const part of parts){bytes.set(new Uint8Array(part.buffer,part.byteOffset,part.byteLength),pos);pos+=part.byteLength;}
   const payload=new DataView(bytes.buffer),start=payload.getUint32(0)+4;
   return tiff(payload,start,metadata);
  }
  return null;
 }
 function readSource(image,metadata=false){
  try{
   if(!image||image.size<8)return null;
   const header=image.read(0,Math.min(12,image.size)),first=header.getUint16(0);
   if(first===0xffd8)return jpeg(image,metadata);
   if(first===0x4949||first===0x4d4d)return exif(image.read(0,Math.min(image.size,MAX_EXIF)),metadata);
   if(header.getUint32(0)===0x89504e47&&header.getUint32(4)===0x0d0a1a0a)return chunks(image,true,metadata);
   if(header.byteLength<12)return null;
   if(tag(header,0,4)==='RIFF'&&tag(header,8,4)==='WEBP')return chunks(image,false,metadata);
   if(tag(header,4,4)==='ftyp')return iso(image,metadata);
  }catch{/* Malformed or unsupported metadata remains optional. */}
  return null;
 }
 function read(url){return readSource(source(url));}
 function readMetadataSource(image){return readSource(image,true);}
 function readMetadata(url){return readMetadataSource(source(url));}
 globalThis.CampoExifGps={read,readSource,readMetadata,readMetadataSource};
 if(typeof module!=='undefined')module.exports=globalThis.CampoExifGps;
})();
