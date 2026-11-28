// Desktop-only, read-only analytics. No inspection or photo cache is written on the device.
let controlArchiveState=null;
async function controlInventory(env,force=false){
 const endpoint=env.GOOGLE_SCRIPT_URL||'',now=Date.now();
 if(!controlArchiveState||controlArchiveState.endpoint!==endpoint)controlArchiveState={endpoint,inventory:null,at:0,expires:0,attempt:0,error:''};
 const state=controlArchiveState;
 if(!force&&state.expires>now)return state;
 // Fetch within the current Worker request. Only the resolved inventory is shared.
 try{
  const inventory=await adminArchiveInventory(env);
  if(now>=state.attempt)Object.assign(state,{inventory,at:Date.now(),expires:Date.now()+60000,attempt:now,error:''});
 }catch(error){
  if(now>=state.attempt)Object.assign(state,{error:error.message,expires:Date.now()+30000,attempt:now});
 }
 return state;
}
function controlDay(v){if(/^\d{4}-\d{2}-\d{2}$/.test(v))return v;const date=Date.parse(v);return Number.isFinite(date)?new Date(date-5*3600000).toISOString().slice(0,10):'';}
function controlFilters(params){
 const f=Object.fromEntries(['month','day','q'].map(k=>[k,(params.get(k)||'').trim()]));for(const k of ['inspector','feeder','classification','state'])f[k]=[...new Set(params.getAll(k).map(v=>v.trim()).filter(Boolean))];
 if(f.month&&!/^\d{4}-\d{2}$/.test(f.month)||f.day&&!/^\d{4}-\d{2}-\d{2}$/.test(f.day)||Object.values(f).flat().some(v=>v.length>200)||[f.inspector,f.feeder].some(l=>l.length>200)||f.classification.some(v=>!['producao','homologacao','unknown'].includes(v))||f.state.some(v=>!['missing','identification','poda','request'].includes(v)))throw sharedError('Filtro inválido.');return f;
}
function controlPhotos(r){return Array.isArray(r.photos)?r.photos.filter(p=>p&&typeof p==='object'):[];}
function controlInspector(r){return String(r.collectionInspector||r.inspector||'').trim();}
function controlProblems(r){return CampoInspectionRules.missing({...r,photos:controlPhotos(r).map(p=>({...p,original:p.original||p.assetId||p.id||'referencia'}))});}
function controlMatches(r,f){const day=controlDay(r.createdAt),name=controlInspector(r);return !r.archiveCleanupPending&&(!f.month||day.startsWith(f.month))&&(!f.day||day===f.day)&&(!f.inspector.length||f.inspector.some(i=>name.toLocaleLowerCase('pt-BR')===i.toLocaleLowerCase('pt-BR')))&&(!f.feeder.length||f.feeder.includes(r.feeder))&&(!f.classification.length||f.classification.some(c=>c==='unknown'?!r.adminClassification:r.adminClassification===c))&&(!f.q||[r.id,r.pole,r.span,r.species,name,r.feeder,r.address,r.os,r.lat,r.lon].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(f.q.toLocaleLowerCase('pt-BR'))))&&(!f.state.length||f.state.some(s=>s==='missing'?controlProblems(r).length:s==='identification'?CampoInspectionRules.identificationPending(r):s==='poda'?r.poda==='sim':r.deletionRequest));}
function controlSummary(rows){
 const times=rows.map(r=>r.inspectionTiming?.collectionSeconds).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b),sum=times.reduce((a,b)=>a+b,0),count=rows.length;
 return {count,individual:rows.filter(r=>r.grouped!=='sim').length,grouped:rows.filter(r=>r.grouped==='sim').length,measured:times.length,unknown:count-times.length,mean:times.length?sum/times.length:null,median:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,hours:sum/3600,poda:rows.filter(r=>r.poda==='sim').length,identification:rows.filter(r=>CampoInspectionRules.identificationPending(r)).length,missing:rows.filter(r=>controlProblems(r).length).length,requests:rows.filter(r=>r.deletionRequest).length,photos:rows.reduce((n,r)=>n+controlPhotos(r).length,0)};
}
function controlGroup(rows,key){const groups=new Map();for(const r of rows){const name=String(key(r)||'Não informado');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}return [...groups].map(([name,list])=>({name,...controlSummary(list)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function controlMap(rows,params){
 const bbox=(params.get('bbox')||'').split(',').map(Number),zoom=Number(params.get('zoom')||10);if(params.has('bbox')&&(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]>bbox[2]||bbox[1]>bbox[3])||!Number.isFinite(zoom)||zoom<0||zoom>24)throw sharedError('Área do mapa inválida.');
 const points=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180)&&(!params.has('bbox')||(Number(r.lon)>=bbox[0]&&Number(r.lat)>=bbox[1]&&Number(r.lon)<=bbox[2]&&Number(r.lat)<=bbox[3])));
 if(points.length<=600)return {count:points.length,grouped:false,points:points.map(r=>({id:r.id,lat:Number(r.lat),lon:Number(r.lon),species:r.species,pole:r.pole,poda:r.poda}))};
 let size=64,groups;do{groups=new Map();for(const r of points){const lat=Number(r.lat),lon=Number(r.lon),s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180),scale=256*2**zoom,x=(lon+180)/360*scale,y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale,key=Math.floor(x/size)+':'+Math.floor(y/size);let g=groups.get(key);if(!g){g={id:'group:'+key,count:0,lat:0,lon:0,bounds:[lon,lat,lon,lat]};groups.set(key,g);}g.count++;g.lat+=lat;g.lon+=lon;g.bounds=[Math.min(g.bounds[0],lon),Math.min(g.bounds[1],lat),Math.max(g.bounds[2],lon),Math.max(g.bounds[3],lat)];}if(groups.size>600)size*=2;}while(groups.size>600);
 return {count:points.length,grouped:true,points:[...groups.values()].map(g=>({...g,lat:g.lat/g.count,lon:g.lon/g.count}))};
}
function controlRecord(r){return {...r,photos:controlPhotos(r).map(p=>({id:p.id,assetId:p.assetId,name:p.name,receivedAt:p.receivedAt})),missingFields:controlProblems(r).map(p=>p.label)};}
async function controlUniverse(env,force=false,includeArchive=false){const archive=await controlInventory(env,force),inventory=archive.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};const data=await universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});return {...data,...(includeArchive&&{archiveRecords:inventory.archive}),archive:{available:Boolean(archive.inventory),at:archive.at?new Date(archive.at).toISOString():null,error:archive.error||null}};}
async function controlLiveUniverse(env){const inventory=controlArchiveState?.endpoint===env.GOOGLE_SCRIPT_URL&&controlArchiveState.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};return universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});}
function controlBounds(rows){let bounds=null;for(const r of rows){if(!sharedCoordinate(r.lat,90)||!sharedCoordinate(r.lon,180))continue;const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}return bounds;}
function controlCsvCell(value){let text=value===null||value===undefined?'':String(value);if(typeof value!=='number'&&/^[=+\-@]/.test(text))text="'"+text;return /[;"\r\n]/.test(text)?'"'+text.replaceAll('"','""')+'"':text;}
function controlPhotoUrl(value){
 try{
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';
 }catch{return '';}
}
function controlPhotoLink(r,archived){
 const photos=[...controlPhotos(r),...controlPhotos(archived||{})];
 return [r.folderUrl,r.googleReceipt?.folderUrl,archived?.folderUrl,r.photoReference,...photos.map(photo=>photo.originalUrl)]
  .map(controlPhotoUrl).find(Boolean)||'';
}
function controlCsvNumber(value){return value===null||value===undefined||value===''?'':Number.isFinite(Number(value))?Number(value):value;}
// Use the inspection day in Rio Branco, including legacy dates already recorded as day/month/year.
function controlExportDay(value){
 const raw=String(value??'').trim();
 if(!raw)return '';
 const match=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
 const day=match?match[3]+'-'+match[2]+'-'+match[1]:controlDay(raw);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return '';
 const time=Date.parse(day+'T00:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===day?day:'';
}
function controlParkFilters(params){
 const values={},query=(params.get('parkQuery')||'').trim();
 for(const [key] of CampoParqueRegistros.filters)values[key]=(params.get('park.'+key)||'').trim();
 if([query,...Object.values(values)].some(value=>value.length>200))throw sharedError('Filtro do parque inválido.');
 return {values,query};
}
async function controlParkExportRows(env,data,params,manifest){
 const db=await adminDb(env),meta=await veraMeta(db);
 const [historical,live,thumbs]=await Promise.all([
  veraParkBase(db,meta.generation),veraParkLive(db,data),
  manifest?db.prepare('SELECT id FROM vera_thumbs').all():null
 ]);
 const core=CampoParqueRegistros,reference=meta.referencia?JSON.parse(meta.referencia):null;
 const base=historical.map(core.baseTree),byId=new Map(base.map(tree=>[tree.id,tree]));
 const records=new Map(data.records.map(record=>[record.id,record]));
 const archived=new Map(data.archiveRecords.map(record=>[record.id,record]));
 const thumbIds=new Set(thumbs?.results.map(row=>row.id));
 const inactive=new Set([...live.deleted,...live.merged.map(link=>link.sourceId)]);
 const {values,query}=controlParkFilters(params);
 const trees=core.merge(base,live.records.map(record=>core.liveTree(record,reference)),inactive,reference);
 return trees.filter(tree=>core.matches(tree,values,query)).map(tree=>{
  const field=records.get(tree.campoId||tree.raw?.id);
  // Only rows with a VERA baseline inherit original coordinates, metadata and photo references.
  const original=tree.raw&&!tree.campoId?null:byId.get(tree.id);
  if(!original)return field;
  const id=field?.id||'vera-'+original.id;
  const baseline=historyBaseData(original,id);
  const historicalPhoto={name:'Foto histórica VERA (miniatura)',originalUrl:original.urlFoto,veraId:thumbIds.has(veraPhotoId(original.id))?original.id:null};
  const photos=controlPhotos(field||{});
  return {...baseline,...field,id,
   externalId:original.id,treeId:original.id,species:tree.especies,lat:tree.lat,lon:tree.lon,pole:tree.poste,span:tree.vao,feeder:tree.alimentador,
   createdAt:original.data||field?.createdAt,folderUrl:field?.folderUrl||archived.get(id)?.folderUrl||original.urlPasta,photoReference:field?.photoReference||original.urlFoto,
   key:field?.key||original.chave,municipality:field?.municipality||original.municipio,street:field?.street||original.logradouro,
   photos:historicalPhoto.veraId||historicalPhoto.originalUrl?[...photos,historicalPhoto]:photos
  };
 });
}
const CONTROL_EXPORT_EXTRAS=[
 ['span','ID DO VAO',r=>r.span],
 ['key','CHAVE',r=>r.key||r.chave],
 ['street','LOGRADOURO',r=>r.street||r.logradouro||r.address],
 ['municipality','MUNICIPIO',r=>r.municipality||r.municipio],
 ['perimeter','PERIMETRO',r=>controlCsvNumber(r.perimeter||r.perimetro||r.circ)],
 ['photoLink','LINK DA FOTO',(_r,link)=>link]
];
const CONTROL_EXPORT_COLUMNS=[
 ...CONTROL_EXPORT_EXTRAS,
 ['treeId','ID DA ARVORE',r=>String(r.treeId??r.id)]
];
function controlExportTable(rows,{columns,idMode,unit,archive,manifest}){
 const headers=['ID','ESPECIE','LONGITUDE','LATITUDE','ALTURA','DATA','POSTE','DT BT','DT MT','DT AT','FOTO','AREA','DAP','ACESSO','EQUIPE','OBSERVACAO','ALIMENTADOR'];
 headers.push(...columns.map(([,header])=>header));
 const counts={missing:0,review:0,adjustable:0};
 const all=rows.map(r=>{
  const pole=String(r.pole??''),link=controlPhotoLink(r,archive.get(r.id));
  const id=idMode==='pole'?pole:idMode==='empty'?'':String(r.externalId||r.id);
  const distances=['bt','mt','at'].map(network=>{
   const {value,issue}=CampoSuggestionRules.networkDistance(r,network);
   if(issue){
    if(value===null)counts.missing++;
    if(issue.change)counts.adjustable++;
    else counts.review++;
   }
   return value===null?'':unit==='cm'?Number((value*100).toPrecision(12)):value;
  });
  const day=controlExportDay(r.createdAt);
  const date=day.split('-').reverse().join('/');
  const values=[id,r.species,controlCsvNumber(r.lon),controlCsvNumber(r.lat),controlCsvNumber(r.height),date,pole,...distances,link,r.area,controlCsvNumber(r.dap),r.access,r.team,r.note,r.feeder];
  values.push(...columns.map(([,,value])=>value(r,link)??''));
  if(!manifest)return values;
  const photos=controlPhotos(r).map(p=>({asset:sharedId(p.assetId)?p.assetId:null,name:p.name||p.id||'',url:controlPhotoUrl(p.originalUrl),...(p.veraId&&{veraId:p.veraId})}));
  return {id:r.id,values,photos};
 });
 return {headers,all,counts};
}
async function controlExport(env,params){
 const from=params.get('from')||'',to=params.get('to')||'';
 const selected=new Set(params.getAll('column'));
 // Older clients still use the original group of six columns.
 if(params.get('extras')==='1')for(const [key] of CONTROL_EXPORT_EXTRAS)selected.add(key);
 const columns=CONTROL_EXPORT_COLUMNS.filter(([key])=>selected.has(key));
 if(columns.length!==selected.size)throw sharedError('Coluna opcional inválida.');
 const idMode=params.get('idMode')??'original',unit=params.get('distanceUnit')??'m',filters=controlFilters(params);
 if((from&&!/^\d{4}-\d{2}-\d{2}$/.test(from))||(to&&!/^\d{4}-\d{2}-\d{2}$/.test(to))||(from&&to&&from>to))
  throw sharedError('Período inválido.');
 if(!['original','pole','empty'].includes(idMode)||!['m','cm'].includes(unit))throw sharedError('Opção de exportação inválida.');
 const data=await controlUniverse(env,false,true),manifest=params.get('format')==='package';
 const park=params.get('scope')==='park';
 const source=park?await controlParkExportRows(env,data,params,manifest):data.records;
 const rows=source.filter(r=>{
  if(!park&&!controlMatches(r,filters))return false;
  const day=controlExportDay(r.createdAt);
  return (!from&&!to)||Boolean(day&&(!from||day>=from)&&(!to||day<=to));
 }).sort((a,b)=>String(a.externalId||a.id).localeCompare(String(b.externalId||b.id),'pt-BR',{numeric:true}));
 const archive=new Map(data.archiveRecords.map(record=>[record.id,record]));
 const {headers,all,counts}=controlExportTable(rows,{columns,idMode,unit,archive,manifest});
 if(manifest)return json({headers,rows:all,unit,counts,driveAvailable:data.archive.available});
 const csv='\uFEFF'+[headers,...all].map(row=>row.map(controlCsvCell).join(';')).join('\r\n')+'\r\n';
 return new Response(csv,{headers:{
  'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="arbora-todas-as-bases.csv"',
  'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Campo-Record-Count':String(rows.length),
  'X-Campo-Distance-Review':String(counts.review),'X-Campo-Distance-Adjustable':String(counts.adjustable),
  'X-Campo-Distance-Missing':String(counts.missing),'X-Campo-Archive-Available':data.archive.available?'1':'0'
 }});
}
async function controlExportPhotos(request,env){
 if(request.method!=='POST')throw sharedError('Use POST.',405);
 const body=await sharedBody(request,12000),photos=body?.photos;
 if(!Array.isArray(photos)||!photos.length||photos.length>12||photos.some(p=>!sharedId(p?.id)||(p.veraId!==undefined?!VERA_ID.test(p.veraId)||p.id!=='vera-'+p.veraId:!sharedId(p.asset))))
  throw sharedError('Selecione até 12 fotos válidas por lote.');
 const db=await adminDb(env);
 const current=photos.filter(photo=>photo.veraId===undefined),historical=photos.filter(photo=>photo.veraId!==undefined);
 const [rows,thumbs]=await Promise.all([
  current.length?db.prepare(`
   WITH requested AS (
    SELECT DISTINCT json_extract(value,'$.id') id,json_extract(value,'$.asset') asset FROM json_each(?)
   )
   SELECT s.tree_id id,s.asset_id asset,s.image
   FROM requested r
   JOIN shared_photos s ON s.tree_id=r.id AND s.asset_id=r.asset
   JOIN shared_trees t ON t.id=r.id AND t.deleted=0
   WHERE EXISTS(SELECT 1 FROM json_each(t.data,'$.photos') p WHERE json_extract(p.value,'$.assetId')=r.asset)
  `).bind(JSON.stringify(current)).all():{results:[]},
  historical.length?db.prepare(`
   WITH requested AS (
    SELECT DISTINCT json_extract(value,'$.id') id,json_extract(value,'$.veraId') vera_id,
     json_extract(value,'$.thumbnail') thumbnail FROM json_each(?)
   )
   SELECT r.id,r.vera_id veraId,s.image FROM requested r
   JOIN vera_trees t ON t.id=r.vera_id AND t.generation=(SELECT value FROM vera_meta WHERE key='generation')
   JOIN vera_thumbs s ON s.id=r.thumbnail
   WHERE NOT EXISTS(SELECT 1 FROM shared_trees st WHERE st.id=r.id AND st.deleted=1)
    AND NOT EXISTS(SELECT 1 FROM shared_merges m WHERE m.source_id=r.id)
  `).bind(JSON.stringify(historical.map(photo=>({...photo,thumbnail:veraPhotoId(photo.veraId)})))).all():{results:[]}
 ]);
 return json({photos:[...rows.results,...thumbs.results]});
}
async function controlAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 if(new URL(request.url).pathname==='/api/control/export/photos')return await controlExportPhotos(request,env);
 if(new URL(request.url).pathname==='/api/control/edit')return await controlEditAPI(request,env,await adminDb(env));
 if(new URL(request.url).pathname==='/api/control/create')return await controlCreateAPI(request,env,await adminDb(env));
 if(new URL(request.url).pathname==='/api/control/suggestions')return await controlSuggestions(request,env,await adminDb(env));
 if(request.method!=='GET')throw sharedError('Use GET para consultar o painel.',405);
 const u=new URL(request.url),p=u.pathname,db=await adminDb(env);
 if(p==='/api/control/live'){if(!env.CAMPO_REALTIME)throw sharedError('Canal em tempo real ainda não configurado.',503);if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket obrigatório.',{status:426,headers:{Upgrade:'websocket','Cache-Control':'no-store'}});return env.CAMPO_REALTIME.getByName('management').fetch(new Request('https://campo-realtime/connect',{headers:request.headers}));}
 if(p==='/api/control/revision'){const r=await db.prepare('SELECT COALESCE(MAX(seq),0) seq FROM shared_changes').first(),labels=await db.prepare('SELECT MAX(updated_at) stamp FROM campo_record_labels').first();return json({revision:r.seq+':'+(labels.stamp||''),intervalSeconds:10,version:'4.7.3',at:new Date().toISOString()});}
 if(p==='/api/control/quality')return await controlQuality(request,env,db);
 if(p==='/api/control/span-quality')return await adminSpanChecks(env,db,await controlUniverse(env),u.searchParams);
 if(p==='/api/control/export')return await controlExport(env,u.searchParams);
 if(p==='/api/control/map'){const data=await (u.searchParams.get('archive')==='1'?controlUniverse(env):controlLiveUniverse(env)),filters=controlFilters(u.searchParams),all=data.records.filter(r=>!r.archiveCleanupPending),rows=all.filter(r=>controlMatches(r,filters));return json({map:controlMap(rows,u.searchParams),bounds:controlBounds(rows),total:rows.length,available:all.length,filtered:Object.values(filters).some(v=>v.length>0),generatedAt:data.generatedAt});}
 if(p!=='/api/control/data'&&p!=='/api/control/tree')throw sharedError('Consulta não encontrada.',404);
 let data=p==='/api/control/tree'?await controlLiveUniverse(env):await controlUniverse(env,u.searchParams.get('refresh')==='1');
 if(p==='/api/control/tree'&&!data.records.some(r=>r.id===u.searchParams.get('id')))data=await controlUniverse(env);
 if(p==='/api/control/tree'){const id=u.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const record=data.records.find(r=>r.id===id&&!r.archiveCleanupPending);if(!record)throw sharedError('Cadastro não está mais na base ativa.',404);return json({record:controlRecord(record)});}
 const filters=controlFilters(u.searchParams),rows=data.records.filter(r=>controlMatches(r,filters)),page=Number(u.searchParams.get('page')||0);if(!Number.isSafeInteger(page)||page<0)throw sharedError('Página inválida.');
 const last=Math.max(0,Math.ceil(rows.length/50)-1),current=Math.min(page,last),all=data.records.filter(r=>!r.archiveCleanupPending),options={inspectors:[...new Set(all.map(r=>controlInspector(r)).filter(Boolean))].sort(),feeders:[...new Set(all.map(r=>r.feeder).filter(Boolean))].sort()};
 const coords=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180));let bounds=null;for(const r of coords){const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}
 return json({summary:controlSummary(rows),daily:controlGroup(rows,r=>controlDay(r.createdAt)).sort((a,b)=>b.name.localeCompare(a.name)).slice(0,31),inspectors:controlGroup(rows,r=>r.collectionInspector||r.inspector).slice(0,100),feeders:controlGroup(rows,r=>r.feeder).slice(0,30),positions:controlGroup(rows,r=>r.position),records:rows.slice(current*50,(current+1)*50).map(controlRecord),page:current,pages:last+1,total:rows.length,options,map:controlMap(rows,u.searchParams),bounds,archive:data.archive,sources:data.sources,scope:data.scope,generatedAt:data.generatedAt});
 }catch(e){
  if(!e.status)console.warn(JSON.stringify({event:'control_read_failed',path:new URL(request.url).pathname,error:String(e.message||e).slice(0,240)}));
  return json({error:e.status?e.message:'Painel temporariamente indisponível. Tente novamente.'},e.status||503);
 }}
