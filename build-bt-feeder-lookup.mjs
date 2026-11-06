import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const source=process.argv[2];
if(!source||!fs.existsSync(source))throw Error('Informe o caminho do GPKG original.');
const candidates=[process.env.OGR2OGR_PATH,'C:\\Program Files\\QGISQT6 3.44.0\\bin\\ogr2ogr.exe','C:\\Program Files\\QGIS 3.42.2\\bin\\ogr2ogr.exe'].filter(Boolean);
const ogr=candidates.find(file=>fs.existsSync(file));
if(!ogr)throw Error('ogr2ogr não encontrado. Informe OGR2OGR_PATH.');
const valid=`TRIM(Alimentador) GLOB '[A-Z][A-Z][A-Z]-[0-9][0-9][A-Z][0-9]'`;
function query(sql){const raw=execFileSync(ogr,['-q','-f','GeoJSON','/vsistdout/',source,'-dialect','SQLite','-sql',sql],{encoding:'utf8',maxBuffer:32*1024*1024});return JSON.parse(raw).features.map(feature=>feature.properties);}
const blocks=query(`SELECT UPPER(TRIM("NAME BLOCO")) AS chave,MIN(TRIM(Alimentador)) AS alimentador FROM "18_Vaos_BT_secundario" WHERE ${valid} AND "NAME BLOCO" IS NOT NULL AND TRIM("NAME BLOCO")<>'' GROUP BY UPPER(TRIM("NAME BLOCO")) HAVING COUNT(DISTINCT TRIM(Alimentador))=1 ORDER BY chave`);
const ids=query(`SELECT CAST(Id AS TEXT) AS chave,TRIM(Alimentador) AS alimentador FROM "18_Vaos_BT_secundario" WHERE ${valid} AND ("NAME BLOCO" IS NULL OR TRIM("NAME BLOCO")='') ORDER BY Id`);
const [stats]=query(`SELECT COUNT(*) AS total,SUM(CASE WHEN ${valid} THEN 1 ELSE 0 END) AS mapeados,SUM(CASE WHEN NOT (${valid}) OR Alimentador IS NULL OR TRIM(Alimentador)='' THEN 1 ELSE 0 END) AS sem_alimentador_confiavel FROM "18_Vaos_BT_secundario"`);
const byBlock=Object.fromEntries(blocks.map(row=>[row.chave,row.alimentador])),byId=Object.fromEntries(ids.map(row=>[row.chave,row.alimentador]));
if(blocks.length!==11660||ids.length!==20||Number(stats.mapeados)!==95510)throw Error('A origem mudou. Revise a conciliação antes de publicar: '+JSON.stringify({blocks:blocks.length,ids:ids.length,stats}));
const info=fs.statSync(source),meta={source:path.basename(source)+'/18_Vaos_BT_secundario',sourceBytes:info.size,sourceModifiedAt:info.mtime.toISOString(),total:Number(stats.total),mapped:Number(stats.mapeados),byBlock:blocks.length,byId:ids.length,unresolved:Number(stats.sem_alimentador_confiavel)};
const payload=JSON.stringify({meta,byBlock,byId}),payloadBase64=Buffer.from(payload).toString('base64'),privateDir=new URL('./.wrangler/',import.meta.url);
fs.mkdirSync(privateDir,{recursive:true});
fs.writeFileSync(new URL('bt-feeder-lookup.json',privateDir),payload);
fs.writeFileSync(new URL('bt-feeder-upload.sql',privateDir),`CREATE TABLE IF NOT EXISTS campo_network_lookup(id TEXT PRIMARY KEY,revision TEXT NOT NULL,data TEXT NOT NULL,updated_at TEXT NOT NULL);\nINSERT INTO campo_network_lookup(id,revision,data,updated_at) VALUES('bt-feeder','${info.mtime.toISOString().replace(/'/g,"''")}','${payloadBase64}',strftime('%Y-%m-%dT%H:%M:%fZ','now')) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,data=excluded.data,updated_at=excluded.updated_at;\n`);
console.log('Lookup BT privado gerado em .wrangler:',meta);
