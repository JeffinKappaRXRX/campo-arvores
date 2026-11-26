'use strict';
importScripts('photo-exif-gps.js');
const reader=new FileReaderSync();
self.onmessage=({data:{files,start,scan}})=>{
 const points=files.map(file=>CampoExifGps.readSource({size:file.size,read(offset,length){
  if(length>256*1024||offset<0||length<0||offset+length>file.size)throw Error('Metadados inválidos.');
  return new DataView(reader.readAsArrayBuffer(file.slice(offset,offset+length)));
 }}));
 self.postMessage({start,scan,points});
};
