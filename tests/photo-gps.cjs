const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),{JSDOM}=require('jsdom');
const exif=require('../docs/photo-exif-gps.js');

const u16=n=>{const value=Buffer.alloc(2);value.writeUInt16BE(n);return value;};
const u32=n=>{const value=Buffer.alloc(4);value.writeUInt32BE(n);return value;};
const box=(name,...parts)=>Buffer.concat([u32(8+parts.reduce((sum,p)=>sum+p.length,0)),Buffer.from(name),...parts]);
const bytes=(...parts)=>Buffer.concat(parts);
const url=(image,mime='image/jpeg')=>'data:'+mime+';base64,'+image.toString('base64');
function gps({little=true,lat='S',lon='W',invalid=false}={}){
 const tiff=Buffer.alloc(128);
 const short=(value,at)=>little?tiff.writeUInt16LE(value,at):tiff.writeUInt16BE(value,at);
 const long=(value,at)=>little?tiff.writeUInt32LE(value,at):tiff.writeUInt32BE(value,at);
 tiff.write(little?'II':'MM');
 short(42,2);long(8,4);
 const entry=(at,id,type,count,value)=>{short(id,at);short(type,at+2);long(count,at+4);long(value,at+8);};
 short(1,8);entry(10,0x8825,4,1,26);
 short(4,26);
 entry(28,1,2,2,0);tiff.write(lat,36);
 entry(40,2,5,3,80);
 entry(52,3,2,2,0);tiff.write(lon,60);
 entry(64,4,5,3,104);
 [9,57,42,67,48,36].forEach((n,i)=>{long(n,80+i*8);long(invalid&&i===0?0:1,84+i*8);});
 return tiff;
}
function jpeg(tiff){
 const payload=bytes(Buffer.from('Exif\0\0'),tiff);
 return bytes(Buffer.from([0xff,0xd8,0xff,0xe1]),u16(payload.length+2),payload,Buffer.from([0xff,0xd9]));
}
const coordinates={lat:-(9+57/60+42/3600),lon:-(67+48/60+36/3600)};
const image=jpeg(gps());
assert.deepEqual(exif.read(url(image)),coordinates);
assert.deepEqual(exif.read(url(jpeg(gps({little:false,lat:'N',lon:'E'})))),{lat:-coordinates.lat,lon:-coordinates.lon});
assert.equal(exif.read(url(jpeg(gps({invalid:true})))),null);
assert.equal(exif.read(url(image.subarray(0,60))),null);
assert.equal(exif.read(url(Buffer.from('sem metadados'))),null);
assert.equal(exif.read(url(jpeg(gps({lat:'?'})))),null);
assert.deepEqual(exif.read(url(gps(),'image/tiff')),coordinates);
const pngChunk=(name,payload)=>bytes(u32(payload.length),Buffer.from(name),payload,u32(0));
const png=bytes(Buffer.from('89504e470d0a1a0a','hex'),pngChunk('IDAT',Buffer.alloc(2*1024*1024)),pngChunk('eXIf',gps()));
assert.deepEqual(exif.read(url(png,'image/png')),coordinates,'finds metadata after large image data');
const webpBody=bytes(Buffer.from('WEBPEXIF'),Buffer.from([128,0,0,0]),gps());
const webpSize=Buffer.alloc(4);webpSize.writeUInt32LE(webpBody.length);
assert.deepEqual(exif.read(url(bytes(Buffer.from('RIFF'),webpSize,webpBody),'image/webp')),coordinates);
const full=version=>Buffer.from([version,0,0,0]);
const item=box('infe',full(2),u16(5),u16(0),Buffer.from('Exif\0'));
const tiffPacket=bytes(u32(0),gps());
const infos=box('iinf',full(0),u16(1),item);
const locations=box('iloc',full(1),Buffer.from([0x44,0]),u16(1),u16(5),u16(1),u16(0),u16(1),u32(0),u32(tiffPacket.length));
const heic=bytes(box('ftyp',Buffer.from('heic')),box('meta',full(0),infos,locations,box('idat',tiffPacket)));
assert.deepEqual(exif.read(url(heic,'image/heic')),coordinates);

(async()=>{
 const html=fs.readFileSync('docs/index.html','utf8'),dom=new JSDOM(html,{runScripts:'outside-only',url:'https://campo.test/'}),w=dom.window,d=w.document;
 const ctx=dom.getInternalVMContext(),node=id=>d.getElementById(id),actions=[],photos=[{original:url(image)}],source=fs.readFileSync('docs/field-photo-gps.js','utf8');
 w.testActions=actions;w.testPhotos=photos;
 const stub=`
 let adminPhotoGpsAllowed=false,photos=testPhotos,googleMap=null;
 const fieldMap={invalidateSize(){},setView(center,zoom){testActions.push(['center',center,zoom]);},fitBounds(bounds,opt){testActions.push(['bounds',bounds,opt.maxZoom]);}};
 function setMapFullscreen(on){testActions.push(['fullscreen',on]);}
 function setGPSFollow(on){testActions.push(['follow',on]);}
 function requestNetworkView(){}
 const L={layerGroup:()=>({addTo(){return this;},remove(){testActions.push(['clear']);}}),divIcon:o=>o,marker:point=>({bindTooltip(){return this;},addTo(){testActions.push(['pin',point]);}})};
 `;
 new vm.Script(stub).runInContext(ctx);
 let calls=0;
 w.CampoExifGps={read(raw){calls++;return exif.read(raw);}};
 new vm.Script(source).runInContext(ctx);
 const access=allowed=>vm.runInContext(`adminPhotoGpsAllowed=${allowed};window.dispatchEvent(new Event('campo-photo-gps-access'))`,ctx);
 const enabled=()=>{const c=node('photoGpsToggle');c.checked=true;c.dispatchEvent(new w.Event('change'));};
 const wait=()=>new Promise(resolve=>setTimeout(resolve,30));
 node('inspect').hidden=false;
 assert(node('photoGpsControls').hidden);
 enabled();w.CampoPhotoGps.refresh(true);await wait();assert.equal(calls,0);
 access(true);
 assert(!node('photoGpsControls').hidden);
 assert(!node('photoGpsToggle').checked);
 w.CampoPhotoGps.refresh(true);await wait();assert.equal(calls,0,'disabled keeps the ordinary photo flow');
 enabled();await wait();
 assert.equal(calls,1);
 assert.match(node('photoGpsStatus').textContent,/1 de 1/);
 const centers=actions.filter(row=>row[0]==='center');
 assert.equal(centers.length,1);
 assert.equal(centers[0][1][0],coordinates.lat);
 assert.equal(centers[0][1][1],coordinates.lon);
 assert.equal(centers[0][2],18);
 photos.push({original:url(jpeg(gps({lat:'N',lon:'E'})))},{original:'malformed'});
 w.CampoPhotoGps.refresh(true);await wait();
 assert.equal(calls,3,'existing photos are not decoded again');
 const fitted=actions.find(row=>row[0]==='bounds');
 assert.equal(fitted[1].length,2);
 assert.match(node('photoGpsStatus').textContent,/2 de 3/);
 assert.equal(node('lat').value,'');assert.equal(node('lon').value,'','framing does not modify inspection coordinates');
 node('photoGpsToggle').checked=false;
 node('photoGpsToggle').dispatchEvent(new w.Event('change'));
 assert(node('photoGpsOpen').hidden);
 const before=actions.filter(row=>row[0]==='pin').length;
 enabled();access(false);await wait();
 assert(node('photoGpsControls').hidden);
 assert.equal(actions.filter(row=>row[0]==='pin').length,before,'signing out cancels pending plotting');
 dom.window.close();
 console.log('PASS: EXIF GPS em JPEG, TIFF, PNG, WebP e HEIC, controle administrativo, enquadramento e cancelamento.');
})().catch(error=>{console.error(error);process.exitCode=1;});
