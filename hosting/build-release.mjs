import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const docs=new URL('../docs/',import.meta.url);
const files=(await fs.readdir(docs)).filter(file=>/\.(?:js|css|html|json|csv|txt)$/.test(file)&&file!=='config.js').sort();
const assets=Object.fromEntries(await Promise.all(files.map(async file=>{
 const source=await fs.readFile(new URL(file,docs),'utf8');
 // Pages serves the API on the same origin. Only the GitHub mirror needs config.js.
 return ['/'+file,file.endsWith('.html')?source.replace('<script src="config.js"></script>',''):source];
})));
// A changed application asset always changes sw.js, even if a version bump is forgotten.
const canonical={...assets,'/sw.js':assets['/sw.js'].replace(/const CACHE='[^']+';/,"const CACHE='campo-app-build';")};
const build=createHash('sha256').update(JSON.stringify(canonical)).digest('hex').slice(0,20);
assets['/sw.js']=canonical['/sw.js'].replace("const CACHE='campo-app-build';","const CACHE='campo-app-"+build+"';");
// Use distinct request URLs even when the browser is still controlled by an older worker.
const versionLinks=html=>html.replace(/((?:src|href)=")([\w./-]+\.(?:js|css))"/g,'$1$2?v='+build+'"');
assets['/acesso.html']=versionLinks(assets['/index.html']);
// The desktop entry reuses the field form markup and logic with a separate draft database.
if(assets['/gestao-cadastro.js']){
 const fieldApp=assets['/app.js'];
 const initListener=/^window\.addEventListener\('DOMContentLoaded',\(\)=>init\(\).+$/m;
 if(!initListener.test(fieldApp)||!fieldApp.includes("indexedDB.open('campo-vegetacao',1)"))throw Error('Revise a inicialização do formulário da gestão.');
 assets['/gestao-cadastro-app.js']=fieldApp.replace("indexedDB.open('campo-vegetacao',1)","indexedDB.open('campo-gestao-cadastro',1)").replace(initListener,'');
 const omitFromDesktop=['app-updates.js','user-access.js','team-presence.js','field-corrections.js','offline-auto.js','field-photo-gps.js','route-field.js'];
 let desktop=assets['/index.html'].replace('class="account-locked"','class="account-locked gestao-cadastro"')
  .replace('<script src="app.js"></script>','<script src="gestao-cadastro-app.js"></script>')
  .replace('</head>','<link rel="stylesheet" href="gestao-fotos.css"></head>')
  .replace('</body>','<script src="gestao-cadastro.js"></script></body>');
 for(const name of omitFromDesktop)desktop=desktop.replace('<script src="'+name+'"></script>','');
 assets['/gestao-cadastro.html']=versionLinks(desktop);
}
for(const page of ['/gestao.html','/consulta-arbora.html'])if(assets[page])assets[page]=versionLinks(assets[page]);
await fs.writeFile(new URL('sw.js',docs),assets['/sw.js']);
const template=await fs.readFile(new URL('pages-worker.js',import.meta.url),'utf8');
const route=" if(Object.prototype.hasOwnProperty.call(RELEASE_ASSETS,path)){const mime=path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':path.endsWith('.json')?'application/json':path.endsWith('.csv')?'text/csv':path.endsWith('.txt')?'text/plain':'application/javascript';return new Response(request.method==='HEAD'?null:RELEASE_ASSETS[path],{headers:{'Content-Type':mime+'; charset=utf-8','Cache-Control':'no-cache'}});}\n const upstream=new URL(";
const source='// Generated release; run hosting/build-release.mjs after changing docs/.\nconst RELEASE_ASSETS='+JSON.stringify(assets)+';\n'+template.replace(' const upstream=new URL(',route);
await fs.mkdir(new URL('dist/',import.meta.url),{recursive:true});await fs.writeFile(new URL('dist/_worker.js',import.meta.url),source);
console.log('Release '+build+' preparado: '+files.length+' arquivos em hosting/dist/_worker.js');
