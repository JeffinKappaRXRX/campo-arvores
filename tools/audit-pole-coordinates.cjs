'use strict';

const fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib');
const Geo=require('../docs/ciclo-conjuntos.js');
const {decode,csvCell}=require('./audit-conjuntos.cjs');
const within=Geo.stateBoundary(require('../docs/acre-limite.js'));
const cycleOptions={
 ciclo_postes:{anchor:true,poleRecord:true},ciclo_arvores:{},parque_postes:{anchor:true,poleRecord:true},
 os_abertas:{anchor:true},poda_postes:{anchor:true},prog:{anchor:true},faixa:{anchor:true},
 vera_prev:{},vera_trees:{},arbora_trees:{}
};
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
function cycleRows(table){
 return table.linhas.map(row=>Object.fromEntries(table.campos.map((field,i)=>[
  field,Object.hasOwn(table.dic,field)?table.dic[field][row[i]]:row[i]
 ])));
}
function tally(rows,registry,options,exception){
 const counts={total:rows.length,outsideSource:0,correctedOutside:0,remainingOutside:0,
  correctedInside:0,locatedMissing:0,mapped:0,removedByPole:0,statuses:{}};
 for(const [i,row] of rows.entries()){
  const result=Geo.reconcile(row,registry,{within,...options});
  const status=result.locationStatus, outside=Boolean(result.originalPoint&&!within(result.originalPoint));
  counts.statuses[status]=(counts.statuses[status]||0)+1;
  if(result.point)counts.mapped++;
  if(outside){counts.outsideSource++;if(result.point)counts.correctedOutside++;else counts.remainingOutside++;}
  if(!outside&&status==='corrigido_gis')counts.correctedInside++;
  if(status==='localizado_gis')counts.locatedMissing++;
  if(!outside&&result.originalPoint&&!result.point)counts.removedByPole++;
  if(outside||status==='corrigido_gis'||status==='localizado_gis'||!result.point)exception(i+1,row,result);
 }
 return counts;
}
function run(input,output){
 const repo=path.resolve(__dirname,'..'),folder=path.resolve(output);
 if(folder===repo||folder.startsWith(repo+path.sep))throw Error('Write private audit outside repository');
 fs.mkdirSync(folder,{recursive:true});
 const lookup=read(path.join(input,'postes-gis.json')), registry=Geo.poleRegistry(lookup);
 const cycle=JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(input,'SIGORA_Ciclo_e_Referencias_2027.json.gz'))));
 const trees=read(path.join(input,'trees.json'));
 const withId=entries=>entries.map(entry=>({...JSON.parse(entry.data),id:entry.id}));
 const sources={ciclo_postes:cycleRows(cycle.postes),ciclo_arvores:cycleRows(cycle.arvores),
  vera_trees:withId(trees.vera),arbora_trees:withId(trees.shared)};
 for(const name of Object.keys(cycleOptions))if(!sources[name])sources[name]=decode(read(path.join(input,'central',name+'.json')));
 const summary={registry:lookup.source,counts:lookup.counts,cycleDate:cycle.gerado_em,datasets:{}};
 for(const [name,rows] of Object.entries(sources)){
  const report=path.join(folder,name+'.csv'), fd=fs.openSync(report,'w');
  const fields=['Linha','ID','Poste','Status','Método','Latitude original','Longitude original','Latitude GIS','Longitude GIS','Latitude no mapa','Longitude no mapa','Distância até poste GIS (m)'];
  fs.writeSync(fd,'\ufeff'+fields.map(csvCell).join(';')+'\r\n');
  try{
   summary.datasets[name]=tally(rows,registry,cycleOptions[name],(index,row,r)=>{
    const record=[index,row.os||row.id||row.poste,row.posteGIS||row.poste||row.pole||(cycleOptions[name].poleRecord?row.id:''),
     r.locationStatus,r.locationMethod,...(r.originalPoint||['','']),...(r.polePoint||['','']),...(r.point||['','']),r.poleDistanceM?.toFixed(1)];
    fs.writeSync(fd,record.map(csvCell).join(';')+'\r\n');
   });
  }finally{fs.closeSync(fd);}
 }
 fs.writeFileSync(path.join(folder,'summary.json'),JSON.stringify(summary,null,2)+'\n');
 return summary;
}
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw Error('Usage: node tools/audit-pole-coordinates.cjs PRIVATE_INPUT PRIVATE_OUTPUT');
 console.log(JSON.stringify(run(input,output),null,2));
}
