// Desktop-only, read-only analytics. No inspection or photo cache is written on the device.
let controlArchiveState=null;
async function controlInventory(env,force=false){
 const endpoint=env.GOOGLE_SCRIPT_URL||'',now=Date.now();
 if(!controlArchiveState||controlArchiveState.endpoint!==endpoint)controlArchiveState={endpoint,inventory:null,at:0,expires:0,promise:null,error:''};
 const state=controlArchiveState;
 if(state.promise)return state.promise;
 if(!force&&state.expires>now)return state;
 state.promise=(async()=>{try{state.inventory=await adminArchiveInventory(env);state.at=Date.now();state.error='';state.expires=state.at+60000;}catch(e){state.error=e.message;state.expires=Date.now()+30000;}finally{state.promise=null;}return state;})();return state.promise;
}
function controlDay(v){const date=Date.parse(v);return Number.isFinite(date)?new Date(date-5*3600000).toISOString().slice(0,10):'';}
function controlFilters(params){
 const f=Object.fromEntries(['month','day','inspector','feeder','classification','state','q'].map(k=>[k,(params.get(k)||'').trim()]));
 if(f.month&&!/^\d{4}-\d{2}$/.test(f.month)||f.day&&!/^\d{4}-\d{2}-\d{2}$/.test(f.day)||Object.values(f).some(v=>v.length>200)||!['','producao','homologacao','unknown'].includes(f.classification)||!['','missing','identification','poda','request'].includes(f.state))throw sharedError('Filtro inválido.');return f;
}
function controlProblems(r){return CampoInspectionRules.missing({...r,photos:r.photos?.map(p=>({...p,original:p.original||p.assetId||p.id||'referencia'}))||[]});}
function controlMatches(r,f){const day=controlDay(r.createdAt),name=(r.collectionInspector||r.inspector||'').trim();return !r.archiveCleanupPending&&(!f.month||day.startsWith(f.month))&&(!f.day||day===f.day)&&(!f.inspector||name.toLocaleLowerCase('pt-BR')===f.inspector.toLocaleLowerCase('pt-BR'))&&(!f.feeder||r.feeder===f.feeder)&&(!f.classification||(f.classification==='unknown'?!r.adminClassification:r.adminClassification===f.classification))&&(!f.q||[r.id,r.pole,r.span,r.species,name,r.feeder,r.address,r.os].some(v=>String(v||'').toLocaleLowerCase('pt-BR').includes(f.q.toLocaleLowerCase('pt-BR'))))&&(!f.state||(f.state==='missing'?controlProblems(r).length:f.state==='identification'?CampoInspectionRules.identificationPending(r):f.state==='poda'?r.poda==='sim':r.deletionRequest));}
function controlSummary(rows){
 const times=rows.map(r=>r.inspectionTiming?.collectionSeconds).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b),sum=times.reduce((a,b)=>a+b,0),count=rows.length;
 return {count,individual:rows.filter(r=>r.grouped!=='sim').length,grouped:rows.filter(r=>r.grouped==='sim').length,measured:times.length,unknown:count-times.length,mean:times.length?sum/times.length:null,median:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null,hours:sum/3600,poda:rows.filter(r=>r.poda==='sim').length,identification:rows.filter(r=>CampoInspectionRules.identificationPending(r)).length,missing:rows.filter(r=>controlProblems(r).length).length,requests:rows.filter(r=>r.deletionRequest).length,photos:rows.reduce((n,r)=>n+(r.photos?.length||0),0)};
}
function controlGroup(rows,key){const groups=new Map();for(const r of rows){const name=String(key(r)||'Não informado');if(!groups.has(name))groups.set(name,[]);groups.get(name).push(r);}return [...groups].map(([name,list])=>({name,...controlSummary(list)})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name));}
function controlMap(rows,params){
 const bbox=(params.get('bbox')||'').split(',').map(Number),zoom=Number(params.get('zoom')||10);if(params.has('bbox')&&(bbox.length!==4||!bbox.every(Number.isFinite)||bbox[0]>bbox[2]||bbox[1]>bbox[3])||!Number.isFinite(zoom)||zoom<0||zoom>24)throw sharedError('Área do mapa inválida.');
 const points=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180)&&(!params.has('bbox')||(Number(r.lon)>=bbox[0]&&Number(r.lat)>=bbox[1]&&Number(r.lon)<=bbox[2]&&Number(r.lat)<=bbox[3])));
 if(points.length<=600)return {count:points.length,grouped:false,points:points.map(r=>({id:r.id,lat:Number(r.lat),lon:Number(r.lon),species:r.species,pole:r.pole,poda:r.poda}))};
 let size=64,groups;do{groups=new Map();for(const r of points){const lat=Number(r.lat),lon=Number(r.lon),s=Math.sin(Math.max(-85,Math.min(85,lat))*Math.PI/180),scale=256*2**zoom,x=(lon+180)/360*scale,y=(.5-Math.log((1+s)/(1-s))/(4*Math.PI))*scale,key=Math.floor(x/size)+':'+Math.floor(y/size);let g=groups.get(key);if(!g){g={id:'group:'+key,count:0,lat:0,lon:0,bounds:[lon,lat,lon,lat]};groups.set(key,g);}g.count++;g.lat+=lat;g.lon+=lon;g.bounds=[Math.min(g.bounds[0],lon),Math.min(g.bounds[1],lat),Math.max(g.bounds[2],lon),Math.max(g.bounds[3],lat)];}if(groups.size>600)size*=2;}while(groups.size>600);
 return {count:points.length,grouped:true,points:[...groups.values()].map(g=>({...g,lat:g.lat/g.count,lon:g.lon/g.count}))};
}
function controlRecord(r){return {...r,photos:(r.photos||[]).map(p=>({id:p.id,assetId:p.assetId,name:p.name,receivedAt:p.receivedAt})),missingFields:controlProblems(r).map(p=>p.label)};}
async function controlUniverse(env,force=false){const archive=await controlInventory(env,force),inventory=archive.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};const data=await universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});return {...data,archive:{available:Boolean(archive.inventory),at:archive.at?new Date(archive.at).toISOString():null,error:archive.error||null}};}
async function controlLiveUniverse(env){const inventory=controlArchiveState?.endpoint===env.GOOGLE_SCRIPT_URL&&controlArchiveState.inventory||{archive:[],deleted:new Set(),revision:null,pending:[]};return universalAdminRecords(env,{...inventory,deleted:new Set(inventory.deleted)});}
function controlBounds(rows){let bounds=null;for(const r of rows){if(!sharedCoordinate(r.lat,90)||!sharedCoordinate(r.lon,180))continue;const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}return bounds;}
async function controlAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);if(request.method!=='GET')throw sharedError('Use GET para consultar o painel.',405);
 const u=new URL(request.url),p=u.pathname,db=await adminDb(env);
 if(p==='/api/control/revision'){const r=await db.prepare('SELECT COALESCE(MAX(seq),0) seq FROM shared_changes').first(),labels=await db.prepare('SELECT MAX(updated_at) stamp FROM campo_record_labels').first();return json({revision:r.seq+':'+(labels.stamp||''),intervalSeconds:10,version:'4.5.4',at:new Date().toISOString()});}
 if(p==='/api/control/map'){const data=await controlLiveUniverse(env),filters=controlFilters(u.searchParams),all=data.records.filter(r=>!r.archiveCleanupPending),rows=all.filter(r=>controlMatches(r,filters));return json({map:controlMap(rows,u.searchParams),bounds:controlBounds(rows),total:rows.length,available:all.length,filtered:Object.values(filters).some(Boolean),generatedAt:data.generatedAt});}
 if(p!=='/api/control/data'&&p!=='/api/control/tree')throw sharedError('Consulta não encontrada.',404);
 let data=p==='/api/control/tree'?await controlLiveUniverse(env):await controlUniverse(env,u.searchParams.get('refresh')==='1');
 if(p==='/api/control/tree'&&!data.records.some(r=>r.id===u.searchParams.get('id')))data=await controlUniverse(env);
 if(p==='/api/control/tree'){const id=u.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const record=data.records.find(r=>r.id===id&&!r.archiveCleanupPending);if(!record)throw sharedError('Cadastro não está mais na base ativa.',404);return json({record:controlRecord(record)});}
 const filters=controlFilters(u.searchParams),rows=data.records.filter(r=>controlMatches(r,filters)),page=Number(u.searchParams.get('page')||0);if(!Number.isSafeInteger(page)||page<0)throw sharedError('Página inválida.');
 const last=Math.max(0,Math.ceil(rows.length/50)-1),current=Math.min(page,last),all=data.records.filter(r=>!r.archiveCleanupPending),options={inspectors:[...new Set(all.map(r=>(r.collectionInspector||r.inspector||'').trim()).filter(Boolean))].sort(),feeders:[...new Set(all.map(r=>r.feeder).filter(Boolean))].sort()};
 const coords=rows.filter(r=>sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180));let bounds=null;for(const r of coords){const lon=Number(r.lon),lat=Number(r.lat);bounds=bounds?[Math.min(bounds[0],lon),Math.min(bounds[1],lat),Math.max(bounds[2],lon),Math.max(bounds[3],lat)]:[lon,lat,lon,lat];}
 return json({summary:controlSummary(rows),daily:controlGroup(rows,r=>controlDay(r.createdAt)).sort((a,b)=>b.name.localeCompare(a.name)).slice(0,31),inspectors:controlGroup(rows,r=>r.collectionInspector||r.inspector).slice(0,100),feeders:controlGroup(rows,r=>r.feeder).slice(0,30),positions:controlGroup(rows,r=>r.position),records:rows.slice(current*50,(current+1)*50).map(controlRecord),page:current,pages:last+1,total:rows.length,options,map:controlMap(rows,u.searchParams),bounds,archive:data.archive,sources:data.sources,scope:data.scope,generatedAt:data.generatedAt});
 }catch(e){return json({error:e.status?e.message:'Painel temporariamente indisponível. Tente novamente.'},e.status||503);}}
