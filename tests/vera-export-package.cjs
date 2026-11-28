'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {unzipSync,strFromU8}=require('../docs/vendor/fflate.js');

const folder='https://drive.google.com/drive/folders/example';
const headers=fs.readFileSync('docs/tree-template.csv','utf8').trim().split(';');
headers.push('ID DA ARVORE');
const record=(id,link,photos)=>{
 const values=Array(headers.length).fill('');
 values[5]=id==='tree1'?'18/11/2026':'';
 values[6]='00123';
 values[7]=0;
 values[10]=link;
 values[17]=id==='tree1'?'000123':id;
 return {id,values,photos};
};
const fixture={headers,unit:'cm',counts:{},driveAvailable:true,rows:[
 record('tree1',folder,[{asset:'a',name:'Primeira'},{asset:'b',name:'Segunda'}]),
 record('tree2',folder,[{asset:null,name:'Legado'}]),
 record('tree3','',[{asset:'missing',name:'Ausente'}])
]};
const calls=[];
let finish;
const done=new Promise(resolve=>{finish=resolve;});
const context=vm.createContext({
 URL,Blob,AbortSignal,TextEncoder,Uint8Array,atob,console,onmessage:null,
 fetch:async (path,options)=>{
  calls.push(path);
  if(path.startsWith('/api/control/export?'))return Response.json(fixture);
  assert.deepEqual(JSON.parse(options.body).photos,[{id:'tree1',asset:'a'},{id:'tree1',asset:'b'},{id:'tree3',asset:'missing'}]);
  return Response.json({photos:[
   {id:'tree1',asset:'a',image:'data:image/jpeg;base64,/9j/AA=='},
   {id:'tree1',asset:'b',image:'data:image/png;base64,iVBORw=='}
  ]});
 },
 importScripts(...paths){for(const path of paths)vm.runInContext(fs.readFileSync('docs/'+path.split('?')[0],'utf8'),context);},
 postMessage(value){if(!value.progress)finish(value);}
});
context.self=context;
context.location={href:'https://arbora.example/vera-export-worker.js?v=test'};
vm.runInContext(fs.readFileSync('docs/vera-export-worker.js','utf8'),context);

(async()=>{
 await context.onmessage({data:'format=package&idMode=empty&column=treeId'});
 const result=await done;
 assert.equal(result.error,undefined);
 assert.equal(result.saved,2);
 assert.equal(result.remote,1);
 assert.equal(result.missing,1);
 const bytes=new Uint8Array(await result.archive.arrayBuffer()),zip=unzipSync(bytes);
 assert(zip['fotos/arvore-tree1/01.jpg']);
 assert(zip['fotos/arvore-tree1/02.png']);
 assert(!Object.keys(zip).some(path=>path.includes('arvore-tree3')));
 const xlsx=unzipSync(zip['template-vera.xlsx']);
 const xml=path=>strFromU8(xlsx[path]);
 const sheet=xml('xl/worksheets/sheet1.xml'),links=xml('xl/worksheets/_rels/sheet1.xml.rels');
 assert.match(sheet,/<c r="R2" t="inlineStr"[^>]*><is><t[^>]*>000123<\/t>/,'ID da árvore mantém zeros à esquerda no XLSX');
 assert.match(strFromU8(zip['template-vera.csv']),/;ID DA ARVORE\r\n[^\r\n]+;000123/);
 assert.match(sheet,/<c r="F2" s="4"><v>46344<\/v><\/c>/);
 assert.match(sheet,/<c r="F3" t="inlineStr" s="0">/,'missing dates stay blank');
 assert.match(xml('xl/styles.xml'),/<numFmt numFmtId="164" formatCode="dd\/mm\/yyyy"\/>/);
 assert.match(strFromU8(zip['template-vera.csv']),/18\/11\/2026;00123/);
 assert.match(sheet,/<hyperlink ref="K2" r:id="rId1"\/>/);
 assert.match(sheet,/<hyperlink ref="K3" r:id="rId2"\/>/);
 assert.doesNotMatch(sheet,/<hyperlink ref="K4"/);
 assert(links.includes('Target="fotos\\arvore-tree1\\01.jpg" TargetMode="External"'));
 assert(links.includes('Target="'+folder+'"'));
 assert(xml('xl/worksheets/_rels/sheet2.xml.rels').includes('fotos\\arvore-tree1\\02.png'));
 assert.match(strFromU8(zip['template-vera.csv']),/00123;0;;;fotos\/arvore-tree1\/01.jpg/);
 assert.equal(calls.length,2,'loads images in a single bounded batch');
 if(process.argv[2])fs.writeFileSync(process.argv[2],bytes);
 console.log('PASS VERA ZIP: linked workbook, compatible CSV, photo matching, Drive fallback and missing-file handling.');
})().catch(error=>{console.error(error);process.exitCode=1;});
