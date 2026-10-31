const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const docs=path.join(__dirname,'../docs');
const browser=vm.createContext({TextEncoder,TextDecoder,Uint8Array,Date,console});
vm.runInContext(fs.readFileSync(path.join(docs,'vendor/fflate.js'),'utf8'),browser);
vm.runInContext(fs.readFileSync(path.join(docs,'exports.js'),'utf8'),browser);
const record={id:'test-units',createdAt:'2026-10-31T12:00:00Z',updatedAt:'2026-10-31T12:00:00Z',lat:-10,lon:-67,mtDistance:'1.25',btDistance:0,atDistance:'',height:12.5,dap:28,circ:88,origin:{lat:-10,lon:-67,accuracy:4},heightMeasurement:{horizontalDistance:20,baseAngle:-3,topAngle:28},photos:[],folderUrl:'https://drive.google.com/drive/folders/test-only'};
const before=JSON.stringify(record);
function cells(xml,row){const content=xml.match(new RegExp('<row r="'+row+'"[^>]*>([\\s\\S]*?)</row>'))[1];return [...content.matchAll(/<c\b[^>]*>([\s\S]*?)<\/c>/g)].map(m=>{const number=m[1].match(/<v>(.*?)<\/v>/);return number?Number(number[1]):(m[1].match(/<t[^>]*>([\s\S]*?)<\/t>/)?.[1]||'');});}
function check(files){const xml=files['xl/worksheets/sheet1.xml'],headers=cells(xml,1),values=cells(xml,2),get=label=>values[headers.indexOf(label)];assert.equal(get('Distância MT (cm)'),125);assert.equal(get('Distância BT (cm)'),0);assert.equal(get('Distância AT (cm)'),'');assert.equal(get('Altura (m)'),12.5);assert.equal(get('DAP (cm)'),28);assert.equal(get('CAP (cm)'),88);assert.equal(get('Precisão GPS aparelho (m)'),4);assert.equal(get('Distância usada altura (m)'),20);assert(!xml.includes('Distância MT (m)'));assert(files['xl/worksheets/sheet3.xml'].includes('100 cm = 1 m'));}
for(const records of [[record],[record,{...record,id:'other',mtDistance:2.5}]]){const zip=browser.CampoExports.xlsx(records),files=browser.fflate.unzipSync(zip);check(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,new TextDecoder().decode(v)])));}
const kml=browser.CampoExports.kml([record]);assert(kml.includes('<displayName>Distância MT (cm)</displayName><value>125</value>'));
for(const file of ['google-drive-update.gs.txt','google-drive-setup.gs.txt']){
 const context=vm.createContext({Utilities:{newBlob:(text,mime,name)=>({text,name}),zip:parts=>Object.fromEntries(parts.map(p=>[p.name,p.text]))}});
 vm.runInContext(fs.readFileSync(path.join(docs,file),'utf8')+'\nthis.exporter=CampoCentralXlsx;',context);
 check(context.exporter.xlsx([record]));check(context.exporter.xlsx([record]));
 const zip=context.exporter.xlsx([{...record,mtDistance:0.001,btDistance:null,atDistance:undefined}]);const h=cells(zip['xl/worksheets/sheet1.xml'],1),v=cells(zip['xl/worksheets/sheet1.xml'],2);assert.equal(v[h.indexOf('Distância MT (cm)')],0.1);assert.equal(v[h.indexOf('Distância BT (cm)')],'');assert.equal(v[h.indexOf('Distância AT (cm)')],'');
}
assert.equal(JSON.stringify(record),before,'export must not mutate metre-based records, metadata or receipts');
console.log('PASS: individual/grouped XLSX, both Drive consolidated generators and KML export MT/BT/AT in cm; height/GPS/horizontal distance remain m; zero/blank/fractional values and source records preserved.');
