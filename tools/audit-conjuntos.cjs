#!/usr/bin/env node
'use strict';

// Read-only audit of a private export. Uses the same classifier as the interface.
// node tools/audit-conjuntos.cjs --input ../arbora-private --output ../arbora-private/audit
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const Geo=require('../docs/ciclo-conjuntos.js');
const DATASETS=['os_abertas','os_exec','poda_postes','parque_postes','prog','vera_prev','chaves','carga_trafos','carga_ativos','cart_prog','obras_os','obras','insp_abertas','faixa','ss'];
const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const has=v=>v!=null&&String(v).trim()!=='';
const hash=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
const increment=(counts,key)=>{key=String(key||'SEM_CONJUNTO');counts[key]=(counts[key]||0)+1;};

function decode(table){
 if(Array.isArray(table))return table;
 if(!table||!Number.isSafeInteger(table.n)||table.n<0||!table.c||typeof table.c!=='object')throw Error('Invalid columnar dataset');
 const columns=Object.entries(table.c).map(([name,column])=>{
  if(Array.isArray(column)){if(column.length!==table.n)throw Error('Column length mismatch: '+name);return [name,column];}
  if(!Array.isArray(column?.k)||!Array.isArray(column?.i)||column.i.length!==table.n||column.i.some(i=>!Number.isInteger(i)||i<0||i>=column.k.length))throw Error('Invalid dictionary column: '+name);
  return [name,column.i.map(i=>column.k[i])];
 });
 return Array.from({length:table.n},(_,i)=>Object.fromEntries(columns.map(([name,values])=>[name,values[i]])));
}

function referenceIndex(keys,index){
 const byKey=new Map(),byFeeder=new Map();
 const add=(map,id,entry)=>{id=normalize(id);if(!id)return;if(!map.has(id))map.set(id,[]);map.get(id).push(entry);};
 for(const key of keys){
  const spatial=Geo.classifyRow(key,index),entry={key:String(key.chave||''),code:spatial.conjCode||'',status:spatial.conjStatus,legacy:String(key.conj||'')};
  add(byKey,key.chave,entry);
  for(const feeder of String(key.alim||'').split(/[,;\/]+/))add(byFeeder,feeder,entry);
 }
 return row=>{
  // This describes a relation to network data, never an asset coordinate.
  const key=normalize(row.chave),feeders=String(row.alim||row.alimentador||row.feeder||'').split(/[,;\/]+/).map(normalize).filter(Boolean);
  let entries=byKey.get(key)||[],kind=entries.length?'chave':'';
  if(!entries.length){entries=feeders.flatMap(feeder=>byFeeder.get(feeder)||[]);if(entries.length)kind='alimentador';}
  const codes=[...new Set(entries.map(e=>e.code).filter(Boolean))].sort();
  return {kind,identifier:kind==='chave'?String(row.chave):kind==='alimentador'?feeders.join(';'):'',
   status:!entries.length?'sem_vinculo':codes.length>1?'multiplos_conjuntos':entries.some(e=>!e.code)?'referencia_incompleta':codes.length===1?'conjunto_unico_da_referencia':'referencia_sem_classificacao',
   codes,matchedRows:entries.length,locatedRows:entries.filter(e=>e.code).length};
 };
}

function orderStats(rows){
 const ids=new Map();let withId=0;
 for(const row of rows){const id=String(row.os??'').trim();if(!id)continue;withId++;ids.set(id,(ids.get(id)||0)+1);}
 return {rows:rows.length,rowsWithOsId:withId,rowsWithoutOsId:rows.length-withId,uniqueOsIds:ids.size,
  repeatedOsIds:[...ids.values()].filter(n=>n>1).length,additionalRowsForRepeatedOsIds:withId-ids.size,
  note:withId?'Repeated IDs are retained as source rows; they may represent multiple services or locations.':'Source has no usable OS identifier; unique OS totals cannot be verified.'};
}

function classify(rows,index,locations,references,dataset){
 return rows.map((original,i)=>{
  const row=Geo.classifyRow(original,index,locations),reference=references(original);
  return {dataset,sourceRow:i+1,row,original,reference,
   recordId:String(original.os||original.id||original.poste||original.pole||original.chave||original.ss||original.obra||original.inst||original.cod||'row-'+(i+1)),
   coordinateEvidence:row.locationMethod==='Vínculo exato pelo poste'?'parque_postes: identificador exato do poste':
    row.point?(dataset==='chaves'||dataset==='faixa'?'Coordenada de referência da rede; localização física do serviço não comprovada':'Coordenada presente na fonte; método original não documentado'):'Sem ponto verificado',
  };
 });
}

function summarize(records,index){
 const summary={...Geo.audit(records.map(x=>x.row)),byOfficialCode:{},byLegacyCode:{},unlocatedLegacyCodes:{},unlocatedByReferenceStatus:{},legacyUnrecognized:0,referenceOnlyUnique:0};
 const officialCodes=new Set(Object.keys(index)),officialNames=new Set(Object.values(index).map(normalize));
 for(const {row,original,reference} of records){
  increment(summary.byOfficialCode,row.conjCode);increment(summary.byLegacyCode,original.conj);
  if(has(original.conj)&&!officialCodes.has(String(original.conj))&&!officialNames.has(normalize(original.conj)))summary.legacyUnrecognized++;
  if(!row.conjCode){increment(summary.unlocatedLegacyCodes,original.conj);increment(summary.unlocatedByReferenceStatus,reference.status);if(reference.status==='conjunto_unico_da_referencia')summary.referenceOnlyUnique++;}
 }
 return summary;
}

const CSV_COLUMNS=['dataset','sourceRow','recordId','os','poste','chave','alimentador','status','codigoOficial','nomeOficial','conjuntoOriginal','divergenciaOriginal','metodoLocalizacao','evidenciaCoordenada','latitude','longitude','candidatos','referenciaTipo','referenciaId','referenciaStatus','referenciaCodigos','referenciaLinhas','referenciaLocalizadas'];
function csvCell(value){let text=String(value??'');if(/^[=+@]/.test(text)||/^-[^\d.]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';}
function csvRecord(item){const {dataset,sourceRow,recordId,row,original,reference,coordinateEvidence}=item;return [dataset,sourceRow,recordId,original.os,original.poste||original.posteGIS||original.pole||(dataset==='parque_postes'?original.id:''),original.chave,original.alim||original.alimentador||original.feeder,row.conjStatus,row.conjCode,row.conjName,row.conjOriginal,row.conjConflict?'SIM':'NAO',row.locationMethod,coordinateEvidence,row.point?.[0],row.point?.[1],JSON.stringify(row.conjCandidates||[]),reference.kind,reference.identifier,reference.status,reference.codes.join(';'),reference.matchedRows,reference.locatedRows].map(csvCell).join(',')+'\r\n';}
function writeCsv(file,records){const fd=fs.openSync(file,'w');try{fs.writeSync(fd,'\ufeff'+CSV_COLUMNS.map(csvCell).join(',')+'\r\n');for(let i=0;i<records.length;i+=1000)fs.writeSync(fd,records.slice(i,i+1000).map(csvRecord).join(''));}finally{fs.closeSync(fd);}}

function run(input,output){
 input=path.resolve(input);output=path.resolve(output);const repo=path.resolve(__dirname,'..');
 if(output===repo||output.startsWith(repo+path.sep))throw Error('Private audit output must be outside the source repository');
 fs.mkdirSync(output,{recursive:true});
 const sources={};
 function read(file){const full=path.join(input,file),bytes=fs.readFileSync(full);sources[file]={bytes:bytes.length,sha256:hash(bytes)};return JSON.parse(bytes);}
 const polygons=read('conjuntos.geojson'),names=Object.fromEntries(polygons.features.map(f=>[f.properties.codigo,f.properties.nome]));
 const index=Geo.spatial(polygons.features,'codigo',names,polygons.source),loaded={};
 for(const dataset of DATASETS)if(fs.existsSync(path.join(input,'central',dataset+'.json')))loaded[dataset]=decode(read('central/'+dataset+'.json'));
 if(!loaded.parque_postes||!loaded.chaves)throw Error('parque_postes and chaves are required to audit references');
 const locations=Geo.locationIndex(loaded.parque_postes),references=referenceIndex(loaded.chaves,index);
 const metaFile=path.join(input,'central-meta.json');let metadata=fs.existsSync(metaFile)?read('central-meta.json'):null;
 if(Array.isArray(metadata))metadata=Object.fromEntries(metadata.map(row=>[row.key,row.value]));
 const treeFile=path.join(input,'trees.json');
 if(fs.existsSync(treeFile)){const trees=read('trees.json');for(const type of ['shared','vera'])if(Array.isArray(trees[type]))loaded['trees_'+type]=trees[type].map(record=>{const data=typeof record.data==='string'?JSON.parse(record.data):record.data;return {...data,id:record.id};});}
 const results={},orderIdentifiers=new Map(),duplicateOs=[];let totalRows=0,totalClassified=0,totalConflicts=0;
 for(const [dataset,rows]of Object.entries(loaded)){
  const records=classify(rows,index,locations,references,dataset),summary=summarize(records,names);
  summary.os=orderStats(rows);summary.columns=[...new Set(rows.flatMap(row=>Object.keys(row)))];
  results[dataset]=summary;totalRows+=rows.length;totalClassified+=summary.classified;totalConflicts+=summary.conflicts;
  writeCsv(path.join(output,dataset+'.csv'),records);
  writeCsv(path.join(output,dataset+'.unlocated.csv'),records.filter(item=>!item.row.conjCode));
  for(const item of records){const os=String(item.original.os??'').trim();if(!os)continue;if(!orderIdentifiers.has(os))orderIdentifiers.set(os,[]);orderIdentifiers.get(os).push({dataset,sourceRow:item.sourceRow,code:item.row.conjCode,status:item.row.conjStatus});}
 }
 for(const [os,rows]of orderIdentifiers)if(rows.length>1)duplicateOs.push({os,rows});
 const summary={generatedAt:new Date().toISOString(),source:{kind:'Exportação privada de dados; sem consulta ou escrita de produção',generation:metadata?.generation||null,updatedAt:metadata?.updatedAt||null,polygons:polygons.source,targetCRS:polygons.targetCRS},
  classifierSha256:hash(fs.readFileSync(path.join(repo,'docs/ciclo-conjuntos.js'))),sources,
  totals:{sourceRows:totalRows,classifiedRows:totalClassified,unlocatedRows:totalRows-totalClassified,legacyConflicts:totalConflicts,uniqueObservedOsIds:orderIdentifiers.size,osIdsRepeatedAcrossSourceRows:duplicateOs.length},datasets:results,
  limitations:[
   'Totals count source rows, not unique assets, trees, pruning events or work orders across datasets.',
   'Rows without coordinates or an exact pole location remain unlocated, even when a network key or feeder has an associated conjunto.',
   'Reference columns describe network-key/feeder association and are never substituted as asset/service coordinates.',
   'Existing source coordinates are classified as supplied; their original survey/centroid provenance cannot be established from this export.',
   'A source without an OS identifier cannot support verified counts of unique work orders.',
   'These results are dated to each exported source; they do not certify that the exported generation is the currently served production base.'
  ]};
 fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 fs.writeFileSync(path.join(output,'duplicate-os.json'),JSON.stringify(duplicateOs)+'\n');
 return summary;
}

if(require.main===module){const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];if(!args.includes('--input')||!args.includes('--output'))throw Error('Usage: node tools/audit-conjuntos.cjs --input PRIVATE_EXPORT --output PRIVATE_AUDIT');const result=run(value('--input'),value('--output'));console.log(JSON.stringify({source:result.source.generation,updatedAt:result.source.updatedAt,totals:result.totals,datasets:Object.fromEntries(Object.entries(result.datasets).map(([name,s])=>[name,{total:s.total,classified:s.classified,unlocated:s.unlocated,conflicts:s.conflicts,statuses:s.statuses}]))},null,2));}
module.exports={decode,referenceIndex,orderStats,classify,summarize,csvCell,csvRecord,run};
