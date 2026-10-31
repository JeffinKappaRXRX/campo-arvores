import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs=new URL('../docs/',import.meta.url);
const files=(await fs.readdir(docs)).filter(file=>/\.(?:js|css|html|json|csv)$/.test(file)&&file!=='config.js').sort();
const assets=Object.fromEntries(await Promise.all(files.map(async file=>['/'+file,await fs.readFile(new URL(file,docs),'utf8')])));
// A changed application asset always changes sw.js, even if a version bump is forgotten.
const canonical={...assets,'/sw.js':assets['/sw.js'].replace(/const CACHE='[^']+';/,"const CACHE='campo-app-build';")};
const build=createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0,20);
assets['/sw.js']=canonical['/sw.js'].replace("const CACHE='campo-app-build';","const CACHE='campo-app-"+build+"';");
await fs.writeFile(new URL('sw.js',docs),assets['/sw.js']);
const template=await fs.readFile(new URL('pages-worker.js',import.meta.url),'utf8');
const route=" if(Object.prototype.hasOwnProperty.call(RELEASE_ASSETS,path)){const mime=path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':path.endsWith('.json')?'application/json':path.endsWith('.csv')?'text/csv':'application/javascript';return new Response(request.method==='HEAD'?null:RELEASE_ASSETS[path],{headers:{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'}});}\n const upstream=new URL(";
const source='// Generated release; run hosting/build-release.mjs after changing docs/.\nconst RELEASE_ASSETS='+JSON.stringify(assets)+';\n'+template.replace(' const upstream=new URL(',route);
await fs.mkdir(new URL('dist/',import.meta.url),{recursive:true});await fs.writeFile(new URL('dist/_worker.js',import.meta.url),source);
console.log('Release '+build+' preparado: '+files.length+' arquivos em hosting/dist/_worker.js');
