const ASSETS={};
(function(root){'use strict';
function numeric(value){return (typeof value==='number'||typeof value==='string')&&value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));}
function missing(r){const out=[];const add=(field,label)=>out.push({field,label});if(!String(r.inspector||'').trim())add('inspector','Inspetor');if(!String(r.feeder||'').trim())add('feeder','Alimentador / localidade');if(!numeric(r.lat)||Math.abs(Number(r.lat))>90)add('lat','Latitude válida');if(!numeric(r.lon)||Math.abs(Number(r.lon))>180)add('lon','Longitude válida');if(!String(r.id||r.editing||'').startsWith('vera-')&&!r.photos?.some(p=>typeof p.original==='string'&&p.original.trim()))add('photos','Ao menos uma foto');if(!numeric(r.height)||Number(r.height)<=0)add('height','Altura da árvore');const network=['mt','bt','at'].filter(k=>r[k]===true||r[k]==='sim');if(network.length&&!String(r.pole||'').trim())add('pole','ID do poste');if(network.includes('mt')&&!String(r.span||'').trim())add('span','ID do vão MT');for(const k of network)if(!numeric(r[k+'Distance'])||Number(r[k+'Distance'])<0)add(k+'Distance','Distância copa → '+k.toUpperCase());return out;}
function unknownSpecies(r){return !String(r.species||'').trim()||/^(árvore|arvore|não identificad[ao]|nao identificad[ao]|desconhecid[ao])$/i.test(String(r.species).trim());}
function identificationPending(r){return !r.deletedRemote&&(unknownSpecies(r)||['queued','error','suggested'].includes(r.plantIdentification?.status));}
root.CampoInspectionRules={missing,unknownSpecies,identificationPending};if(typeof module!=='undefined')module.exports=root.CampoInspectionRules;
})(typeof globalThis!=='undefined'?globalThis:this);

const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
let activeRequests=0;
function consolidatedLink(value){
 if(typeof value!=='string')return null;
 try{const u=new URL(value);if(u.username||u.password)return null;
  if(u.origin==='https://drive.google.com'&&/^\/file\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(u.pathname))return u.href;
  if(u.origin==='https://docs.google.com'&&/^\/spreadsheets\/d\/[a-zA-Z0-9_-]+(?:\/|$)/.test(u.pathname))return u.href;
 }catch{}return null;
}
async function limitedBody(request,limit=12*1024*1024){const reader=request.body?.getReader();if(!reader)throw Error('EMPTY');const chunks=[];let size=0;while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw Error('SIZE');}chunks.push(value);}return new Blob(chunks);}
const driveRequestLeases=new Map();
function reserveDriveRequest(){const now=Date.now();for(const [id,deadline]of driveRequestLeases)if(deadline<=now)driveRequestLeases.delete(id);if(driveRequestLeases.size>=2)return null;const id=Symbol();driveRequestLeases.set(id,now+85000);return ()=>driveRequestLeases.delete(id);}
let activeStreetRequests=0;
async function streets(request){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(activeStreetRequests)return json({error:'Download de ruas ocupado. Tente novamente em alguns segundos.'},429);
 let p;try{p=JSON.parse(await(await limitedBody(request,2048)).text());}catch{return json({error:'Área inválida.'},400);}
 if(!Number.isFinite(p.lat)||Math.abs(p.lat)>85||!Number.isFinite(p.lon)||Math.abs(p.lon)>180||![1,2,5,10,11].includes(p.radius))return json({error:'Informe posição válida e raio de consulta válido.'},400);
 const dy=p.radius/111.32,dx=p.radius/(111.32*Math.max(.1,Math.cos(p.lat*Math.PI/180)));
 const box=[Math.max(-85,p.lat-dy),Math.max(-180,p.lon-dx),Math.min(85,p.lat+dy),Math.min(180,p.lon+dx)].join(',');
 const query='[out:json][timeout:25][maxsize:134217728];(way["highway"]('+box+');node["place"]('+box+'););out geom;';
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);activeStreetRequests++;
 try{let r;for(const endpoint of ['https://overpass-api.de/api/interpreter','https://overpass.private.coffee/api/interpreter']){r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'CampoVegetacao/2.9 (manual offline area preparation)'},body:new URLSearchParams({data:query}),signal:controller.signal});if(r.ok)break;}

 if(!r.ok)return json({error:'Serviço de ruas indisponível (HTTP '+r.status+'). Tente novamente mais tarde.'},502);
 const data=JSON.parse(await(await limitedBody(r,16*1024*1024)).text());
 if(data.remark||!Array.isArray(data.elements))return json({error:'Consulta de ruas incompleta. Reduza o raio e tente novamente.'},502);
 return json({elements:data.elements});
 }catch(e){return json({error:e.name==='AbortError'?'Download de ruas excedeu o tempo. Tente novamente.':'Não foi possível obter as ruas. Tente novamente mais tarde.'},504);}finally{clearTimeout(timer);activeStreetRequests--;}
}
async function drive(request,env,status=false,consolidate=false,adminView=false){
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(request.method!==(status?'GET':'POST'))return json({error:'Método não permitido.'},405);
 const endpoint=env.GOOGLE_SCRIPT_URL,secret=env.GOOGLE_SCRIPT_TOKEN;
 if(!endpoint||!secret)return status?json({configured:false,connected:false}):json({error:'Google Drive ainda não conectado. Siga Configurar Google Drive na aba Envio.'},503);
 if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(endpoint))return json({error:'Endereço do receptor Google inválido. Avise o responsável.'},503);
 let payload={action:'status'};
 if(!status){
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))return json({error:'Use JSON.'},400);
  try{payload=JSON.parse(await (await limitedBody(request,30*1024*1024)).text());}catch(e){return json({error:e.message==='SIZE'?'Solicitação excede o limite. Use fotos de até 20 MB.':'Solicitação inválida.'},e.message==='SIZE'?413:400);}
  if(consolidate){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(payload.recordId||'')||!Number.isFinite(Date.parse(payload.version))||!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(payload.version||''))return json({error:'Cadastro inválido.'},400);payload={action:'consolidate',recordId:payload.recordId,version:payload.version};}else{
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(payload.recordId||'')||!/^\d{4}-\d{2}-\d{2}T[\d:.Z+-]+$/.test(payload.version||'')||!Number.isFinite(Date.parse(payload.version))||! /^(?:[a-zA-Z0-9_-]+_(?:original\.(?:jpg|png|webp|heic)|georreferenciada\.jpg)|inspecao\.(?:xlsx|kml)|metadados\.json)$/.test(payload.name||'')||typeof payload.base64!=='string'||!payload.base64.length||payload.base64.length>28000000||payload.base64.length%4!==0||! /^[A-Za-z0-9+/]*={0,2}$/.test(payload.base64))return json({error:'Arquivo ou identificação inválidos.'},400);
  if(payload.name==='metadados.json'){try{const bytes=Uint8Array.from(atob(payload.base64),c=>c.charCodeAt(0)),metadata=JSON.parse(new TextDecoder().decode(bytes)),missing=CampoInspectionRules.missing(metadata);if(metadata.id!==payload.recordId||metadata.updatedAt!==payload.version)return json({error:'Metadados não correspondem ao cadastro enviado.',code:'INVALID',retryable:false},422);if(missing.length)return json({error:'Preencha antes de sincronizar: '+missing.map(p=>p.label).join(', '),code:'INCOMPLETE',retryable:false},422);}catch{return json({error:'Metadados inválidos.',code:'INVALID',retryable:false},422);}}payload={action:'file',recordId:payload.recordId,version:payload.version,name:payload.name,base64:payload.base64};
  }
 }
 if(!status&&env.SHARED_DB){try{const tree=await env.SHARED_DB.prepare('SELECT deleted FROM shared_trees WHERE id=?').bind(payload.recordId).first();if(tree?.deleted)return json({error:'Árvore excluída pelo administrador. Não será reenviada.',code:'DELETED'},410);}catch{return json({error:'Não foi possível conferir o cadastro. Tente novamente.'},503);}}
 if(!status&&env.PRODUCTION_DATA_EPOCH&&Date.parse(payload.version)<Date.parse(env.PRODUCTION_DATA_EPOCH))return json({error:'Cadastro de homologação encerrado. Atualize o aplicativo.',code:'DELETED'},410);
 const releaseDriveRequest=reserveDriveRequest();if(!releaseDriveRequest)return json({error:'Envio ocupado. Tente novamente em alguns segundos.'},429);const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),85000);
 try{
  const result=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:secret}),signal:abort.signal});
  if(!result.ok)return json({error:'Receptor Google indisponível. Confira a implantação e tente novamente.'},502);
  let data;try{data=await result.json();}catch(e){return json({error:'Google retornou uma página de login. Implante como “Eu”, com acesso “Qualquer pessoa”, e use a URL /exec.'},502);}
  if(!data.ok){const errors={AUTH:'Chave da integração Google incorreta. Avise o responsável.',BUSY:'Google ocupado. Tente novamente.',CONFLICT:'Arquivo diferente nesta versão. Edite e salve a inspeção antes de reenviar.',SIZE:'Arquivo excede 20 MB.',INVALID:'Google recusou o formato.',VERIFY:'Google não confirmou o arquivo.',DELETED:'Inspeção excluída pelo administrador. Não será reenviada.',GOOGLE:'Google não concluiu o envio. Confira espaço, permissões e cotas no Apps Script.'};const code=typeof data.code==='string'&&/^[A-Z_]{1,40}$/.test(data.code)?data.code:'RECEIVER_ERROR';let detail=String(data.error||'Sem detalhe fornecido pelo receptor').slice(0,400);detail=detail.split(secret).join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').replace(/[\w.+-]+@[\w.-]+/g,'[conta]');console.warn(JSON.stringify({event:'drive_receiver_error',code,detail,action:payload.action}));return json({error:errors[data.code]||'O receptor Google recusou o envio (código '+code+'). Confira a execução no Apps Script.',code,retryable:['BUSY','GOOGLE','RECEIVER_ERROR'].includes(code)},data.code==='BUSY'?429:502);}
  if(status)return json({configured:true,connected:true,folderName:String(data.folderName||'Pasta de inspeções'),consolidation:data.consolidation===true,management:data.management===true,deletedIds:Array.isArray(data.deletedIds)?data.deletedIds:[],consolidatedUrl:adminView?consolidatedLink(data.consolidatedUrl):null});
  if(consolidate){if(data.consolidated!==true||data.recordId!==payload.recordId||data.version!==payload.version)return json({error:'O receptor não confirmou o ID e a versão do cadastro no Excel único. Os arquivos da inspeção são conferidos separadamente.'},502);return json({consolidated:true,version:data.version,url:isAdministrator(request,env)?consolidatedLink(data.url):null,count:isAdministrator(request,env)?data.count:undefined});}
  if(typeof data.id!=='string'||!Number.isFinite(data.size)||! /^[a-f0-9]{64}$/.test(data.sha256||'')||typeof data.folderId!=='string')return json({error:'Confirmação incompleta do Google. Arquivo continua pendente.'},502);
  return json({id:data.id,size:data.size,sha256:data.sha256,folderId:data.folderId,folderUrl:typeof data.folderUrl==='string'&&data.folderUrl.startsWith('https://drive.google.com/')?data.folderUrl:null});
 }catch(e){return json({error:e.name==='AbortError'?'Google excedeu o tempo de resposta. Reenvie para verificar os arquivos pendentes.':'Falha de conexão com Google. Tente novamente.'},504);}finally{clearTimeout(timer);releaseDriveRequest();}
}
async function adminRepository(request,env,remove=false){
 if(!isAdministrator(request,env))return json({error:'Acesso restrito ao administrador.'},403);
 const url=new URL(request.url),origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Origem não autorizada.'},403);
 if(request.method!==(remove?'POST':'GET'))return json({error:'Método não permitido.'},405);
 if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)return json({error:'Receptor não configurado.'},503);if(!/^https:\/\/script\.google\.com\/macros\/s\/[a-zA-Z0-9_-]+\/exec$/.test(env.GOOGLE_SCRIPT_URL))return json({error:'Receptor inválido.'},503);
 let payload={action:'admin_list',offset:Number(url.searchParams.get('offset')||0),limit:200};
 if(remove){try{const data=JSON.parse(await(await limitedBody(request,20000)).text());if(!Array.isArray(data.records)||!data.records.length||data.records.length>20||data.records.some(r=>! /^[a-zA-Z0-9_-]{1,100}$/.test(r.id||'')||!Number.isFinite(Date.parse(r.version))))throw Error();payload={action:'admin_delete',records:data.records.map(r=>({id:r.id,version:r.version}))};}catch{return json({error:'Selecione de 1 a 20 cadastros válidos.'},400);}}
 if(!remove&&(!Number.isInteger(payload.offset)||payload.offset<0))return json({error:'Página inválida.'},400);
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);
 try{const response=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:controller.signal});const data=await response.json();if(!response.ok||!data.ok)return json({error:data.code==='CONFLICT'?'Uma inspeção foi alterada em outro aparelho. Atualize a lista antes de excluir.':data.code==='BUSY'?'Repositório ocupado. Tente novamente.':'Atualize o receptor no Apps Script para usar gestão e exclusão. Nenhuma confirmação recebida.',code:data.code||'RECEIVER'},502);
 if(remove){if(!Array.isArray(data.deletedIds)||payload.records.some(r=>!data.deletedIds.includes(r.id)))return json({error:'Exclusão não confirmada. Atualize a lista e tente novamente.'},502);if(env.SHARED_DB)for(const id of data.deletedIds)await env.SHARED_DB.prepare('UPDATE shared_trees SET deleted=1,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND deleted=0').bind(new Date().toISOString(),crypto.randomUUID(),'Administrador',id).run();return json({deletedIds:data.deletedIds});}
 if(!Array.isArray(data.records))return json({error:'Receptor ainda não oferece a lista administrativa. Atualize o Apps Script.'},502);
 return json({records:data.records,deletedIds:data.deletedIds||[],pendingDeletes:data.pendingDeletes||[],nextOffset:data.nextOffset??null,total:data.total,revision:data.revision});
 }catch{return json({error:'Gestão do repositório indisponível. Dados locais preservados.'},504);}finally{clearTimeout(timer);}
}
async function centralNetwork(request,env){
 if(request.method!=='GET')return json({error:'Use GET.'},405);
 const url=new URL(request.url),chunk=url.pathname.endsWith('/chunk'),endpoint=env.GOOGLE_SCRIPT_URL;
 if(!endpoint||!env.GOOGLE_SCRIPT_TOKEN)return json({error:'Receptor Google não configurado.'},503);
 let payload={action:'network_manifest'};
 if(chunk){const offset=Number(url.searchParams.get('offset')),revision=url.searchParams.get('revision');if(!Number.isSafeInteger(offset)||offset<0||!revision||revision.length>200)return json({error:'Bloco inválido.'},400);payload={action:'network_chunk',offset,revision};}
 const releaseDriveRequest=reserveDriveRequest();if(!releaseDriveRequest)return json({error:'Conexão ocupada. Tente novamente.'},429);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);
 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:controller.signal});
  const data=await r.json();if(!r.ok||!data.ok){const errors={REDE_ACCESS:'O receptor não conseguiu acessar a rede privada. Execute configurarRedeCampo no Apps Script.',REDE_FORMAT:'A origem deve ser GPKG ou ZIP contendo GPKG.',REDE_CHANGED:'A rede mudou durante o download. Tente novamente.',REDE_RANGE:'Google não confirmou o bloco da rede.'};return json({error:errors[data.code]||'Atualize o receptor Google na Administração para habilitar a rede central.'},502);}
  if(!chunk){const m=data.network;if(m?.fileId!==env.REDE_CAMPO_ID||!Number.isSafeInteger(m.size)||m.size<1||!/[.](gpkg|zip)$/i.test(m.name||'')||typeof m.revision!=='string')return json({error:'Atualize o receptor Google na Administração para habilitar a rede central.'},502);return json(m);}
  if(data.offset!==payload.offset||data.revision!==payload.revision||typeof data.base64!=='string'||data.base64.length>5600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))return json({error:'Bloco não confirmado. Base local preservada.'},502);
  const binary=atob(data.base64),bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return new Response(bytes,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
 }catch{return json({error:'Rede central indisponível. Confira a implantação do receptor; a base local continua disponível.'},502);}finally{clearTimeout(timer);releaseDriveRequest();}
}
async function identify(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const origin=request.headers.get('Origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Origem não autorizada.'},403);
 if(!env.PLANTNET_API_KEY)return json({error:'Identificação ainda sem chave no servidor. Avise o administrador.'},503);
 if(activeRequests>=2)return json({error:'Identificação ocupada. Tente novamente em alguns segundos.'},429);
 if(!request.headers.get('Content-Type')?.startsWith('multipart/form-data'))return json({error:'Envie as fotos como formulário.'},400);
 activeRequests++;
 try{
  let form;try{const body=await limitedBody(request);form=await new Response(body,{headers:{'Content-Type':request.headers.get('Content-Type')}}).formData();}catch(e){return json({error:e.message==='SIZE'?'Fotos excedem 12 MB por solicitação.':'Não foi possível ler as fotos.'},e.message==='SIZE'?413:400);}
  const images=form.getAll('images'),organs=form.getAll('organs');
  if(images.length<1||images.length>5||organs.length!==images.length)return json({error:'Selecione de 1 a 5 fotos da mesma árvore.'},400);
  const upload=new FormData();
  for(let i=0;i<images.length;i++){
   const image=images[i];if(typeof image==='string'||!['image/jpeg','image/png'].includes(image.type)||image.size<1||image.size>5*1024*1024)return json({error:'Use fotos JPEG/PNG de até 5 MB cada.'},400);
   if(!['auto','leaf','bark','flower','fruit'].includes(organs[i]))return json({error:'Órgão da planta inválido.'},400);
   upload.append('images',image,'planta-'+(i+1)+(image.type==='image/png'?'.png':'.jpg'));upload.append('organs',organs[i]);
  }
  const url=new URL('https://my-api.plantnet.org/v2/identify/all');url.searchParams.set('api-key',env.PLANTNET_API_KEY);url.searchParams.set('lang','pt');url.searchParams.set('nb-results','5');
  const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),55000);
  try{
   const response=await fetch(url,{method:'POST',body:upload,signal:abort.signal});
   if(!response.ok){const errors={401:'Pl@ntNet recusou a chave do servidor. Avise o administrador.',403:'Pl@ntNet bloqueou o acesso do servidor. No portal API, desative “expor minha chave de API” e salve as configurações.',429:'Cota Pl@ntNet esgotada. Tente posteriormente.',404:'Planta não identificada. Fotografe folha, flor ou fruto com mais detalhe.'};return json({error:errors[response.status]||'Serviço de identificação indisponível (HTTP '+response.status+').',providerStatus:response.status},[401,403].includes(response.status)?502:response.status);}
   const data=await response.json();return json({results:data.results||[],version:data.version||null,remainingIdentificationRequests:data.remainingIdentificationRequests??null});
  }catch(e){return json({error:e.name==='AbortError'?'Pl@ntNet excedeu o tempo de resposta. Tente novamente.':'Não foi possível conectar ao Pl@ntNet. Tente novamente.'},504);}finally{clearTimeout(timer);}
 }finally{activeRequests--;}
}
function isAdministrator(request,env){
 const id=request.headers.get('oai-authenticated-user-id');
 const email=request.headers.get('oai-authenticated-user-email');
 return Boolean(id&&email&&env.CAMPO_ADMIN_EMAIL&&email.toLowerCase()===env.CAMPO_ADMIN_EMAIL.toLowerCase());
}
const internalApp={async fetch(request,env){
 const url=new URL(request.url);
 if(url.pathname.startsWith('/api/control/'))return controlAPI(request,env);
 if(url.pathname.startsWith('/api/vera/'))return veraAPI(request,env);
 if(url.pathname.startsWith('/api/central/'))return centralAPI(request,env);
 if(/^\/api\/(?:admin\/(?:universe|audit|presence)|team\/presence)(?:[/?]|$)/.test(url.pathname))return adminControlAPI(request,env);
 if(url.pathname==='/api/map/search')return mapAddressSearch(request,env);
 if(url.pathname.startsWith('/api/shared/'))return sharedAPI(request,env);
 if(url.pathname==='/api/network/manifest'||url.pathname==='/api/network/chunk')return centralNetwork(request,env);
 if(url.pathname==='/api/access')return request.method==='GET'?json({admin:isAdministrator(request,env)}):json({error:'Use GET.'},405);
 if(url.pathname==='/api/admin/drive/status'){
  if(!isAdministrator(request,env))return json({error:'Acesso restrito ao administrador.'},403);
  return drive(request,env,true,false,true);
 }
 if(url.pathname==='/api/streets/area')return streets(request);
 if(url.pathname==='/api/admin/records')return adminRepository(request,env);
 if(url.pathname==='/api/admin/records/delete')return adminRepository(request,env,true);
 if(url.pathname==='/api/drive/status')return drive(request,env,true);
 if(url.pathname==='/api/drive/file')return drive(request,env);
 if(url.pathname==='/api/drive/consolidate')return drive(request,env,false,true);
 if(url.pathname==='/api/plant/identify')return identify(request,env);
 if(url.pathname==='/api/plant/status')return request.method==='GET'?json({configured:Boolean(env.PLANTNET_API_KEY),provider:'Pl@ntNet'}):json({error:'Use GET.'},405);
 if(url.pathname.startsWith('/api/'))return json({error:'Rota não encontrada.'},404);
 if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
 const name=url.pathname==='/'?'index.html':url.pathname.slice(1),asset=ASSETS[name];if(!asset)return new Response('Not found',{status:404});
 const bytes=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
 return new Response(request.method==='HEAD'?null:bytes,{headers:{'Content-Type':asset.type,'Cache-Control':name==='sw.js'?'no-cache':'no-cache','X-Content-Type-Options':'nosniff'}});
}};

// Private shared data stays in D1. Every route runs behind the access gateway.
const sharedId=v=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,100}$/.test(v);
const sharedError=(message,status=400)=>Object.assign(new Error(message),{status});
function sharedCoordinate(v,max){return !(typeof v==='string'&&!v.trim())&&v!==''&&v!==null&&v!==undefined&&Number.isFinite(Number(v))&&Math.abs(Number(v))<=max;}
function sharedView(row){return {...JSON.parse(row.data),id:row.tree_id||row.id,sharedVersion:row.version,sharedDeleted:Boolean(row.deleted),deletionRequest:row.pending||null,sharedUpdatedAt:row.updated_at,sharedActor:row.actor};}
async function sharedBody(request,limit=6500000){try{return JSON.parse(await(await limitedBody(request,limit)).text());}catch{throw sharedError('Solicitação inválida ou acima do tamanho permitido.',413);}}
async function sharedRead(db,id){return db.prepare('SELECT * FROM shared_trees WHERE id=?').bind(id).first();}
function sharedData(raw,actor,imported=false){
 if(!raw||!sharedId(raw.id)||!sharedCoordinate(raw.lat,90)||!sharedCoordinate(raw.lon,180))throw sharedError('ID, latitude e longitude válidos são obrigatórios.');
 const allowed=['externalId','inspector','feeder','height','dap','circ','position','pole','span','os','species','note','poda','projection','grouped','mt','bt','at','mtDistance','btDistance','atDistance','area','access','team','photoReference','address'];
 const out={id:raw.id,lat:Number(raw.lat),lon:Number(raw.lon),photos:[],createdAt:Number.isFinite(Date.parse(raw.createdAt))?raw.createdAt:new Date().toISOString(),updatedAt:Number.isFinite(Date.parse(raw.updatedAt))?raw.updatedAt:new Date().toISOString()};
 for(const key of allowed){if(typeof raw[key]==='boolean')out[key]=raw[key];else if(raw[key]!==undefined&&raw[key]!==null)out[key]=String(raw[key]).slice(0,key==='note'?5000:1000);}
 for(const key of ['height','dap','circ','mtDistance','btDistance','atDistance'])if(out[key]!==undefined&&out[key]!==''&&(!Number.isFinite(Number(out[key]))||Number(out[key])<0))throw sharedError('Medida inválida: '+key);
 for(const key of ['mt','bt','at'])out[key]=raw[key]===true||raw[key]==='sim';
 for(const key of ['inspectionTiming','plantIdentification','heightMeasurement','measurements','origin'])if(raw[key]&&typeof raw[key]==='object'){const serialized=JSON.stringify(raw[key]);if(serialized.length>16000)throw sharedError('Metadados acima do limite: '+key);out[key]=JSON.parse(serialized);}
 out.imported=imported||raw.imported===true;out.lastInspector=actor;
 return out;
}
async function sharedPhoto(photo){
 if(!sharedId(photo.assetId)||typeof photo.image!=='string'||photo.image.length>480000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo.image))throw sharedError('Foto compartilhada inválida ou grande demais.');
 const bytes=Uint8Array.from(atob(photo.image.split(',')[1]),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(photo.sha256!==hash)throw sharedError('Conteúdo da foto não confirmado.');return photo;
}
async function sharedSave(db,body,actor,imported=false,identity=null){
 const data=sharedData(body.record,actor,imported),id=data.id,expected=body.baseVersion;
 if(!Number.isSafeInteger(expected)||expected<0||!sharedId(body.operationId))throw sharedError('Versão e identificador da operação obrigatórios.');
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,id))throw sharedError('Administrador está revisando a exclusão deste cadastro. Tente novamente.',409);
 const old=await sharedRead(db,id);
 if(old?.deleted)throw sharedError('Árvore excluída pelo administrador. O cadastro não será recriado.',410);
 if(old?.last_op===body.operationId)return sharedView(old);
 if((old?.version||0)!==expected)throw sharedError('Outra pessoa atualizou esta árvore. Reabra a versão mais recente antes de salvar suas alterações.',409);
 data.createdBy=old?JSON.parse(old.data).createdBy||JSON.parse(old.data).inspector||JSON.parse(old.data).lastInspector||old.actor:actor;
 if(identity){const original=old?JSON.parse(old.data):null;data.createdByUserId=original?.createdByUserId||(old?null:identity.id);data.createdByEmail=original?.createdByEmail||(old?null:identity.email);data.lastEditorUserId=identity.id;data.lastEditorEmail=identity.email;if(!old)data.inspector=identity.name;else data.inspector=original.inspector||data.inspector;}
 const uploads=body.uploads||[];if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie no máximo 12 fotos por cadastro.');
 const photos=body.record.photos||[];if(!Array.isArray(photos)||photos.length>12)throw sharedError('Limite de 12 fotos na base compartilhada.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);uploadMap.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Referência de foto inválida.');
  if(!uploadMap.has(p.assetId)&&!await db.prepare('SELECT asset_id FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,p.assetId).first())throw sharedError('Foto ainda não recebida. Tente sincronizar novamente.');
  data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'foto.jpg').slice(0,180),receivedAt:p.receivedAt||data.updatedAt,identify:p.identify===true,organ:String(p.organ||'auto').slice(0,20),phase:['before','after','current'].includes(p.phase)?p.phase:'current'});
 }
 const stamp=new Date().toISOString(),version=expected+1;
 const statement=old?db.prepare('UPDATE shared_trees SET data=?,version=?,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(JSON.stringify(data),version,stamp,body.operationId,actor,id,expected):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) SELECT ?,?,1,?,?,? WHERE NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=? AND expires_at>unixepoch()*1000)').bind(id,JSON.stringify(data),stamp,body.operationId,actor,id);
 const statements=[statement];for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(id,p.assetId,p.image,id,body.operationId));
 if(typeof historyBaseline==='function'&&id.startsWith('vera-'))statements.push(...historyBaselineStatements(db,await historyBaseline(db,id),body.operationId,id));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado por outra pessoa. Sua cópia local foi preservada.',409);
 return {...data,id,sharedVersion:version,sharedDeleted:false,deletionRequest:old?.pending||null,sharedUpdatedAt:stamp,sharedActor:actor};
}
async function sharedAddress(db,lat,lon){
 const key=Number(lat).toFixed(4)+','+Number(lon).toFixed(4),cached=await db.prepare('SELECT address FROM shared_geocodes WHERE key=?').bind(key).first();if(cached)return {address:cached.address,source:'OpenStreetMap/Nominatim',approximate:true};
 // One outbound lookup per second across the shared database; no bulk geocoding.
 await db.prepare("INSERT OR IGNORE INTO shared_geocodes(key,address,created_at) VALUES('__rate__','',0)").run();
 const now=Date.now(),permit=await db.prepare("UPDATE shared_geocodes SET created_at=? WHERE key='__rate__' AND created_at<?").bind(now,now-1100).run();if(!permit.meta.changes)return {address:'',pending:true};
 try{const u=new URL('https://nominatim.openstreetmap.org/reverse');u.search=new URLSearchParams({format:'jsonv2',lat:String(lat),lon:String(lon),'accept-language':'pt-BR',zoom:'18'}).toString();const r=await fetch(u,{headers:{'User-Agent':'CampoVegetacao/4.0 (https://jeffinkapparxrx.github.io/campo-arvores/)'},signal:AbortSignal.timeout(8000)});if(!r.ok)return {address:'',pending:true};const value=await r.json(),address=String(value.display_name||'').slice(0,1000);if(address)await db.prepare('INSERT OR REPLACE INTO shared_geocodes(key,address,created_at) VALUES(?,?,?)').bind(key,address,now).run();return {address,pending:!address,source:'OpenStreetMap/Nominatim',approximate:true};}catch{return {address:'',pending:true};}
}
async function sharedRequestDelete(db,body){
 if(!sharedId(body.id)||!sharedId(body.treeId)||!Number.isSafeInteger(body.baseVersion))throw sharedError('Pedido inválido.');
 const existing=await db.prepare('SELECT id,tree_id,status FROM shared_deletions WHERE id=?').bind(body.id).first();if(existing){if(existing.tree_id!==body.treeId)throw sharedError('Identificador de solicitação já utilizado.',409);return {id:existing.id,status:existing.status};}
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,body.treeId))throw sharedError('Exclusão administrativa em andamento.',409);
 const tree=await sharedRead(db,body.treeId);if(!tree||tree.deleted)throw sharedError('Árvore não disponível.',410);if(tree.version!==body.baseVersion)throw sharedError('A árvore mudou. Atualize o mapa antes de solicitar exclusão.',409);if(tree.pending)throw sharedError('Esta árvore já tem solicitação pendente.',409);
 const e=body.evidence,actor=String(body.actor||'').trim().slice(0,120),reason=String(body.reason||'').trim().slice(0,2000);
 if(!actor||!reason||!e||!sharedCoordinate(e.lat,90)||!sharedCoordinate(e.lon,180)||!Number.isFinite(e.accuracy)||e.accuracy<0||!Number.isFinite(Date.parse(e.capturedAt)))throw sharedError('Foto, motivo, inspetor e GPS da evidência são obrigatórios.');
 if(!Number.isFinite(Date.parse(e.gpsTimestamp))||Math.abs(Date.parse(e.capturedAt)-Date.parse(e.gpsTimestamp))>120000)throw sharedError('Capture o GPS junto com a foto.');
 await sharedPhoto({assetId:body.id,image:e.original,sha256:e.sha256});if(typeof e.annotated!=='string'||e.annotated.length>650000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(e.annotated))throw sharedError('Foto georreferenciada obrigatória.');
 const now=new Date().toISOString(),evidence={original:e.original,annotated:e.annotated,sha256:e.sha256,lat:Number(e.lat),lon:Number(e.lon),accuracy:e.accuracy,capturedAt:e.capturedAt,gpsTimestamp:e.gpsTimestamp,address:String(e.address||'').slice(0,1000),addressPending:!e.address,treeLat:JSON.parse(tree.data).lat,treeLon:JSON.parse(tree.data).lon,receivedAt:now};
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET pending=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND pending IS NULL AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(body.id,now,body.id,actor,tree.id,body.baseVersion),
 db.prepare("INSERT INTO shared_deletions(id,tree_id,tree_version,status,reason,actor,created_at,evidence) SELECT ?,?,?,'pending',?,?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)").bind(body.id,tree.id,tree.version+1,reason,actor,now,JSON.stringify(evidence),tree.id,body.id)]);
 if(!result[0].meta.changes)throw sharedError('Árvore alterada; atualize o mapa.',409);return {id:body.id,status:'pending',tree:sharedView(await sharedRead(db,tree.id))};
}
async function sharedArchiveCleanup(db,id,env){
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(id).first();if(!row||row.status!=='approved')throw sharedError('Aprovação necessária.',409);
 if(row.archive_status==='removed')return row.archive_status;
 let status='pending';try{
  if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)throw Error('Receiver unavailable');
  const tree=await sharedRead(db,row.tree_id),version=JSON.parse(tree.data).updatedAt;
  if(!Number.isFinite(Date.parse(version)))throw Error('Archive version missing');
  // The receiver rejects a newer archived version. Never delete unreviewed work.
  const r=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'admin_delete',records:[{id:row.tree_id,version}],token:env.GOOGLE_SCRIPT_TOKEN}),signal:AbortSignal.timeout(25000)});const data=await r.json();if(!r.ok||!data.ok||!data.deletedIds?.includes(row.tree_id))throw Error('Deletion not confirmed');status='removed';
 }catch{status='pending';}
 await db.prepare('UPDATE shared_deletions SET archive_status=? WHERE id=?').bind(status,id).run();return status;
}
async function sharedReview(db,body,env){
 if(!sharedId(body.id)||!['approve','reject'].includes(body.decision))throw sharedError('Decisão inválida.');
 const row=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(body.id).first();if(!row)throw sharedError('Solicitação não encontrada.',404);if(row.status!=='pending')return {status:row.status,id:row.id,archiveStatus:row.archive_status};
 if(typeof adminRecordLocked==='function'&&await adminRecordLocked(db,row.tree_id))throw sharedError('Exclusão administrativa em andamento.',409);
 const tree=await sharedRead(db,row.tree_id);if(!tree||tree.pending!==row.id)throw sharedError('Pedido não corresponde ao cadastro atual.',409);
 if(body.decision==='approve'&&tree.version!==row.tree_version)throw sharedError('A árvore foi editada após a evidência. Rejeite este pedido e solicite uma nova avaliação.',409);
 const now=new Date().toISOString(),approved=body.decision==='approve',operation=crypto.randomUUID();
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET deleted=?,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND pending=? AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id=shared_trees.id AND expires_at>unixepoch()*1000)').bind(approved?1:0,now,operation,'Administrador',tree.id,tree.version,row.id),
 db.prepare('UPDATE shared_deletions SET status=?,reviewed_at=?,reviewer_note=? WHERE id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(approved?'approved':'rejected',now,String(body.note||'').slice(0,2000),row.id,tree.id,operation)]);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a análise. Atualize e revise.',409);
 const archiveStatus=approved?await sharedArchiveCleanup(db,row.id,env):'not_requested';return {id:row.id,status:approved?'approved':'rejected',tree:sharedView(await sharedRead(db,tree.id)),archiveStatus};
}
async function sharedAPI(request,env){
 if(!env.SHARED_DB)return json({error:'Base compartilhada ainda não configurada.'},503);
 if(new URL(request.url).pathname==='/api/shared/generation'&&request.method==='GET')return json({id:env.PRODUCTION_DATA_EPOCH||null});
 const db=env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB,url=new URL(request.url),path=url.pathname;
 try{
  if(request.method==='GET'&&path==='/api/shared/history')return json(await historyList(db,url));
  if(request.method==='GET'&&path==='/api/shared/history/photo')return json(await historyPhoto(db,url));
  if(request.method==='GET'&&path==='/api/shared/compare'){const a=await historyRecord(db,url.searchParams.get('a')),b=await historyRecord(db,url.searchParams.get('b'));return json({a:a.record,b:b.record});}
  if(request.method==='POST'&&path==='/api/shared/history/import')return json(await historyImport(db,await sharedBody(request),env.CAMPO_USER?.name||'Administrador'));
  if(request.method==='POST'&&path==='/api/shared/merge')return json(await historyMerge(db,await sharedBody(request),env.CAMPO_USER?.name||'Administrador',env.CAMPO_USER));
  if(request.method==='GET'&&path==='/api/shared/changes'){const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)throw sharedError('Cursor inválido.');const r=await db.prepare('SELECT * FROM shared_changes WHERE seq>? ORDER BY seq LIMIT 201').bind(after).all(),rows=r.results.slice(0,200);return json({changes:rows.map(r=>({seq:r.seq,tree:sharedView(r)})),next:rows.at(-1)?.seq||after,hasMore:r.results.length>200});}
  if(request.method==='GET'&&path==='/api/shared/photo'){const id=url.searchParams.get('id'),asset=url.searchParams.get('asset');if(!sharedId(id)||!sharedId(asset))throw sharedError('Foto inválida.');const row=await sharedRead(db,id);if(!row||row.deleted)throw sharedError('Árvore não encontrada.',404);const data=JSON.parse(row.data);if(!(data.photos||[]).some(p=>p.assetId===asset))throw sharedError('Foto não pertence a este cadastro.',404);const photo=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,asset).first();if(!photo)throw sharedError('Foto ainda não recebida.',404);return json({image:photo.image});}
  if(request.method==='GET'&&path==='/api/shared/tree'){const id=url.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const r=await sharedRead(db,id);if(!r)throw sharedError('Árvore não encontrada.',404);const out=sharedView(r);if(!r.deleted){const refs=out.photos.map(p=>p.assetId);const photos=refs.length?await db.prepare('SELECT asset_id,image FROM shared_photos WHERE tree_id=? AND asset_id IN ('+refs.map(()=>'?').join(',')+')').bind(id,...refs).all():{results:[]};const assets=new Map(photos.results.map(p=>[p.asset_id,p.image]));out.photos=out.photos.map(p=>({...p,original:assets.get(p.assetId)||'',sharedDerivative:true}));}return json({tree:out});}
  if(request.method==='POST'&&path==='/api/shared/save'){const body=await sharedBody(request);if(env.PRODUCTION_DATA_EPOCH&&Date.parse(body.record?.updatedAt)<Date.parse(env.PRODUCTION_DATA_EPOCH))throw sharedError('Cadastro de homologação encerrado. Atualize o aplicativo.',410);const actor=env.CAMPO_USER?.name||String(body.actor||'').trim().slice(0,120);if(!actor)throw sharedError('Informe o nome do inspetor.');return json({tree:await sharedSave(db,body,actor,false,env.CAMPO_USER)});}
  if(request.method==='POST'&&path==='/api/shared/address'){const b=await sharedBody(request,1024);if(!sharedCoordinate(b.lat,90)||!sharedCoordinate(b.lon,180))throw sharedError('Coordenadas inválidas.');return json(await sharedAddress(db,b.lat,b.lon));}
  if(request.method==='POST'&&path==='/api/shared/deletion-request'){const b=await sharedBody(request,1300000);if(env.CAMPO_USER)b.actor=env.CAMPO_USER.name;return json(await sharedRequestDelete(db,b));}
  if(path.startsWith('/api/shared/admin/')){if(!isAdministrator(request,env))throw sharedError('Acesso restrito ao administrador.',403);
   if(path==='/api/shared/admin/import'&&request.method==='POST'){const b=await sharedBody(request,1500000);if(!Array.isArray(b.rows)||!b.rows.length||b.rows.length>20)throw sharedError('Importe de 1 a 20 linhas por lote.');const results=[];for(const item of b.rows){try{const tree=await sharedSave(db,item,'Administrador · importação',true);results.push({id:item.record?.id,ok:true,tree});}catch(e){results.push({id:item.record?.id,ok:false,error:e.message,status:e.status||500});}}return json({results});}
   if(path==='/api/shared/admin/deletions'&&request.method==='GET'){const r=await db.prepare('SELECT id,tree_id,tree_version,status,reason,actor,created_at,reviewed_at,reviewer_note,archive_status FROM shared_deletions ORDER BY created_at DESC LIMIT 200').all();return json({requests:r.results});}
   if(path==='/api/shared/admin/evidence'&&request.method==='GET'){const r=await db.prepare('SELECT * FROM shared_deletions WHERE id=?').bind(url.searchParams.get('id')||'').first();if(!r)throw sharedError('Evidência não encontrada.',404);const evidence=JSON.parse(r.evidence);if(!evidence.address){const a=await sharedAddress(db,evidence.lat,evidence.lon);if(a.address){evidence.address=a.address;evidence.addressPending=false;await db.prepare('UPDATE shared_deletions SET evidence=? WHERE id=?').bind(JSON.stringify(evidence),r.id).run();}}return json({request:{...r,evidence}});}
   if(path==='/api/shared/admin/archive-cleanup'&&request.method==='POST'){const b=await sharedBody(request,1000);return json({archiveStatus:await sharedArchiveCleanup(db,b.id,env)});}
   if(path==='/api/shared/admin/review'&&request.method==='POST')return json(await sharedReview(db,await sharedBody(request,5000),env));
  }
  return json({error:'Rota compartilhada não encontrada.'},404);
 }catch(e){console.warn(JSON.stringify({event:'shared_error',path,status:e.status||503,message:e.status?e.message:'database_unavailable'}));return json({error:e.status?e.message:'Base compartilhada ocupada ou indisponível. Sua cópia continua salva no aparelho.'},e.status||503);}
}

// Version metadata is already immutable in shared_changes. Images are fetched only on demand.
async function historyRoot(db,id){
 if(!sharedId(id))throw sharedError('Árvore inválida.');
 for(let depth=0;depth<32;depth++){const link=await db.prepare('SELECT target_id FROM shared_merges WHERE source_id=?').bind(id).first();if(!link)return id;id=link.target_id;}
 throw sharedError('Vínculo histórico inválido.',409);
}
async function historyFamily(db,id){
 const root=await historyRoot(db,id),row=await sharedRead(db,root);
 if(row?.deleted)throw sharedError('Árvore removida da base ativa.',410);
 const links=await db.prepare('SELECT source_id FROM shared_merges WHERE target_id=? ORDER BY created_at').bind(root).all();
 return {root,ids:[root,...links.results.map(r=>r.source_id)],row};
}
function historyBaseData(t,id){
 const present=v=>v!==null&&v!==undefined&&v!=='',network=v=>present(v)&&Number(v)>=0,dap=Number(t.dap)>0?t.dap:'';
 const data={id,externalId:t.id,lat:Number(t.lat),lon:Number(t.lon),species:t.especieConf?'':t.especies||'',suggestedSpecies:t.especieConf?t.especies:'',speciesConfidence:t.especieConf||'',height:t.altura??'',dap,circ:dap?(Number(dap)*Math.PI).toFixed(1):'',pole:t.poste||'',span:t.vao||'',feeder:t.alimentador||'',note:t.observacao||'',poda:/^s/i.test(t.poda||'')?'sim':/^n/i.test(t.poda||'')?'nao':'',position:t.projecao==='SIM'?'Projeção':'',projection:t.projecao==='SIM'?'sim':t.projecao==='NÃO'?'nao':'',address:t.logradouro||'',photos:[],sourceLabel:t.fonte||'Levantamento VERA',sourceYear:t.ano||'',sourceDate:t.data||'',inspector:t.inspetor||'Levantamento original',updatedAt:null,createdAt:null,baseline:true};
 for(const k of ['mt','bt','at']){const v=t['dist'+k.toUpperCase()];data[k]=network(v);data[k+'Distance']=network(v)?v:'';}
 return data;
}
async function historyBaseline(db,id){
 const stored=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id=?').bind(id).first();if(stored)return {...stored,stored:true};
 if(!id.startsWith('vera-'))return null;
 const row=await db.prepare("SELECT t.data,t.generation FROM vera_trees t WHERE t.id=? AND t.generation=(SELECT value FROM vera_meta WHERE key='generation')").bind(id.slice(5)).first();if(!row)return null;
 const source=JSON.parse(row.data),data=historyBaseData(source,id),photo=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(source.id)).first();
 let image=null;if(photo&&photo.image.length<=480000&&VERA_IMAGE.test(photo.image)){image=photo.image;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(image))),b=>b.toString(16).padStart(2,'0')).join('');data.photos=[{id:'base-photo',assetId:'base_'+hash,name:'Foto do levantamento original',phase:'before',receivedAt:null}];}
 return {tree_id:id,data:JSON.stringify(data),recorded_at:new Date().toISOString(),actor:data.sourceLabel,image,generation:row.generation,sourceData:row.data};
}
function historyBaselineStatements(db,baseline,operationId,gateId){
 if(!baseline||baseline.stored)return [];
 const gate='EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)';
 const queries=[db.prepare('INSERT OR IGNORE INTO shared_baselines(tree_id,data,recorded_at,actor) SELECT ?,?,?,? WHERE '+gate).bind(baseline.tree_id,baseline.data,baseline.recorded_at,baseline.actor,gateId,operationId)];
 if(baseline.image)queries.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(baseline.tree_id,JSON.parse(baseline.data).photos[0].assetId,baseline.image,gateId,operationId));
 return queries;
}
async function historyRecord(db,id){
 if(!sharedId(id))throw sharedError('ID inválido.');const row=await sharedRead(db,id);
 if(row){if(row.deleted)throw sharedError('Esta árvore já foi removida ou mesclada. Atualize o mapa.',409);return {row,record:sharedView(row),version:row.version};}
 const baseline=await historyBaseline(db,id);if(!baseline)throw sharedError('Sincronize esta árvore antes de mesclar.',409);
 return {row:null,baseline,record:{...JSON.parse(baseline.data),sharedVersion:0,baselineToken:baseline.generation},version:0};
}
async function historyList(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),offset=Number(url.searchParams.get('offset')||0);
 if(!Number.isSafeInteger(offset)||offset<0)throw sharedError('Página inválida.');
 const marks='SELECT value FROM json_each(?)',ids=JSON.stringify(family.ids),rows=await db.prepare("SELECT 's:'||seq key,tree_id,data,version,deleted,updated_at,actor,'inspection' kind FROM shared_changes WHERE tree_id IN ("+marks+") UNION ALL SELECT 'l:'||seq,tree_id,data,NULL,0,local_version,actor,'local' FROM shared_local_history WHERE tree_id IN ("+marks+") ORDER BY updated_at DESC,key DESC LIMIT 21 OFFSET ?").bind(ids,ids,offset).all();
 const snapshots=rows.results.slice(0,20).map(r=>({key:r.key,sourceId:r.tree_id,version:r.version,at:r.updated_at,actor:r.actor,kind:r.deleted?'merged':r.kind,record:JSON.parse(r.data)}));
 if(rows.results.length<=20){const baselines=await db.prepare('SELECT * FROM shared_baselines WHERE tree_id IN ('+marks+')').bind(ids).all();for(const b of baselines.results)snapshots.push({key:'b:'+b.tree_id,sourceId:b.tree_id,version:0,at:null,recordedAt:b.recorded_at,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});
  // Existing VERA inspections can still compare against their current imported original.
  for(const id of family.ids.filter(id=>id.startsWith('vera-')&&!baselines.results.some(b=>b.tree_id===id))){const b=await historyBaseline(db,id);if(b)snapshots.push({key:'v:'+id,sourceId:id,version:0,at:null,actor:b.actor,kind:'baseline',record:JSON.parse(b.data)});}
 }
 const current=await historyRecord(db,family.root);
 return {id:family.root,current:current.record,snapshots,nextOffset:rows.results.length>20?offset+20:null,linkedIds:family.ids};
}
async function historyPhoto(db,url){
 const family=await historyFamily(db,url.searchParams.get('id')),source=url.searchParams.get('tree'),key=url.searchParams.get('key'),asset=url.searchParams.get('asset');
 if(!family.ids.includes(source)||!sharedId(asset))throw sharedError('Foto não pertence ao histórico.',404);
 let snapshot;if(/^[sl]:\d+$/.test(key||'')){const table=key[0]==='s'?'shared_changes':'shared_local_history',row=await db.prepare('SELECT data FROM '+table+' WHERE tree_id=? AND seq=?').bind(source,Number(key.slice(2))).first();if(row)snapshot=JSON.parse(row.data);}
 else if(key==='b:'+source||key==='v:'+source){const baseline=await historyBaseline(db,source);if(baseline){snapshot=JSON.parse(baseline.data);if(baseline.image&&snapshot.photos.some(p=>p.assetId===asset))return {image:baseline.image};}}
 if(!snapshot?.photos?.some(p=>p.assetId===asset))throw sharedError('Foto não pertence a esta versão.',404);
 const row=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(source,asset).first();if(!row)throw sharedError('Foto histórica não recebida. Consulte a pasta original.',404);return {image:row.image};
}
async function historyImport(db,body,actor){
 const raw=body.record,data=sharedData(raw,actor);if(!Number.isFinite(Date.parse(raw.updatedAt)))throw sharedError('Versão local inválida.');
 const family=await historyFamily(db,data.id);if(!family.row)throw sharedError('Envie a versão atual antes do histórico local.',409);
 const previous=await db.prepare('SELECT seq FROM shared_local_history WHERE tree_id=? AND local_version=?').bind(data.id,data.updatedAt).first();
 const central=await db.prepare("SELECT seq FROM shared_changes WHERE tree_id=? AND json_extract(data,'$.updatedAt')=? LIMIT 1").bind(data.id,data.updatedAt).first();if(previous||central)return {preserved:true,alreadyStored:true};
 const uploads=body.uploads||[],photos=raw.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(photos)||photos.length>12)throw sharedError('Histórico com fotos acima do limite.');
 const map=new Map();for(const p of uploads){await sharedPhoto(p);map.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Foto histórica inválida.');const existing=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(data.id,p.assetId).first();if(!existing&&!map.has(p.assetId))throw sharedError('Foto histórica ainda não recebida.');if(existing&&map.has(p.assetId)&&existing.image!==map.get(p.assetId).image)throw sharedError('Identificador de foto já utilizado.',409);data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'Foto anterior').slice(0,180),receivedAt:p.receivedAt||null,phase:['before','after','current'].includes(p.phase)?p.phase:'current'});}
 const statements=[db.prepare('INSERT OR IGNORE INTO shared_local_history(tree_id,local_version,data,received_at,actor) VALUES(?,?,?,?,?)').bind(data.id,data.updatedAt,JSON.stringify(data),new Date().toISOString(),actor)];
 for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) VALUES(?,?,?)').bind(data.id,p.assetId,p.image));await db.batch(statements);return {preserved:true};
}
function historyCondition(part,alias){
 return part.row?{sql:'EXISTS(SELECT 1 FROM shared_trees '+alias+' WHERE '+alias+'.id=? AND '+alias+'.version=? AND '+alias+'.deleted=0 AND '+alias+'.pending IS NULL)',args:[part.record.id,part.version]}:{sql:"NOT EXISTS(SELECT 1 FROM shared_trees WHERE id=?) AND EXISTS(SELECT 1 FROM vera_trees v WHERE v.id=? AND v.generation=? AND v.data=? AND v.generation=(SELECT value FROM vera_meta WHERE key='generation'))",args:[part.record.id,part.record.id.slice(5),part.baseline.generation,part.baseline.sourceData]};
}
async function historyMerge(db,body,actor,identity){
 if(!sharedId(body.operationId)||body.confirm!==true||!sharedId(body.targetId)||!sharedId(body.sourceId)||body.targetId===body.sourceId)throw sharedError('Escolha dois cadastros distintos e confirme que são a mesma árvore.');
 const retried=await db.prepare('SELECT * FROM shared_merges WHERE operation_id=?').bind(body.operationId).first();
 if(retried){if(retried.source_id!==body.sourceId||retried.target_id!==await historyRoot(db,body.targetId))throw sharedError('Operação já usada para outra mesclagem.',409);return {tree:sharedView(await sharedRead(db,retried.target_id)),source:sharedView(await sharedRead(db,body.sourceId)),replayed:true};}
 const target=await historyRecord(db,body.targetId),source=await historyRecord(db,body.sourceId);
 for(const [part,version,token]of [[target,body.targetVersion,body.targetBaseline],[source,body.sourceVersion,body.sourceBaseline]]){if(!Number.isSafeInteger(version)||version!==part.version||!part.row&&token!==part.baseline.generation)throw sharedError('Uma árvore mudou. Reabra a comparação antes de confirmar.',409);if(part.row?.pending)throw sharedError('Resolva o pedido de exclusão antes de mesclar.',409);}
 const family=await historyFamily(db,target.record.id),other=await historyFamily(db,source.record.id);if(family.ids.length+other.ids.length>200)throw sharedError('Limite de vínculos históricos atingido. Solicite revisão administrativa.');
 const stamp=new Date().toISOString(),raw={...target.record,...body.values,id:target.record.id,lat:body.values?.lat??target.record.lat,lon:body.values?.lon??target.record.lon,updatedAt:stamp,createdAt:target.record.createdAt||stamp},data=sharedData(raw,actor);
 for(const k of ['createdBy','createdByUserId','createdByEmail','inspector'])if(target.record[k]!==undefined)data[k]=target.record[k];data.lastEditorUserId=identity?.id||null;data.lastEditorEmail=identity?.email||null;data.mergeOperation=body.operationId;if(Number(data.height)!==Number(target.record.height))data.heightMeasurement={method:'manual-merge',confirmedAt:stamp,actor};data.measurements={source:'reviewed-merge',sources:[target.record.id,source.record.id],confirmedAt:stamp};
 const uploads=body.uploads||[],refs=body.photos||[];if(!Array.isArray(uploads)||uploads.length>12||!Array.isArray(refs)||refs.length>12)throw sharedError('Use até 12 fotos atuais. As demais continuam no histórico.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);if(uploadMap.has(p.assetId))throw sharedError('Foto repetida.');uploadMap.set(p.assetId,p);}
 const copies=[],seen=new Set();data.photos=[];
 for(const ref of refs){if(!sharedId(ref.assetId)||!['before','after','current'].includes(ref.phase||'current'))throw sharedError('Foto inválida.');if(seen.has(ref.assetId))continue;seen.add(ref.assetId);
  let photo;if(ref.treeId){const part=[target,source].find(p=>p.record.id===ref.treeId),p=part?.record.photos?.find(p=>p.assetId===ref.assetId);if(!p)throw sharedError('Foto fora dos cadastros comparados.');photo={...p};if(ref.treeId!==target.record.id||!part.row){if(part.baseline?.image)copies.push({assetId:ref.assetId,image:part.baseline.image});else{const image=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(ref.treeId,ref.assetId).first();if(!image)throw sharedError('Foto não recebida. Sincronize antes de mesclar.');copies.push({assetId:ref.assetId,image:image.image});}}}
  else {const p=uploadMap.get(ref.assetId);if(!p)throw sharedError('Foto nova não recebida.');photo={id:ref.assetId,assetId:ref.assetId,name:String(ref.name||'Foto da atualização').slice(0,180),receivedAt:stamp};copies.push(p);}
  data.photos.push({...photo,id:ref.assetId,phase:ref.phase||'current'});
 }
 const a=historyCondition(target,'a'),b=historyCondition(source,'b'),guard=a.sql+' AND '+b.sql+' AND NOT EXISTS(SELECT 1 FROM campo_admin_locks WHERE tree_id IN (?,?) AND expires_at>unixepoch()*1000)',args=[...a.args,...b.args,target.record.id,source.record.id];
 const statements=[db.prepare('INSERT INTO shared_merges(source_id,target_id,operation_id,source_version,target_version,created_at,actor) SELECT ?,?,?,?,?,?,? WHERE '+guard).bind(source.record.id,target.record.id,body.operationId,source.version,target.version,stamp,actor,...args)];
 const gate='EXISTS(SELECT 1 FROM shared_merges WHERE operation_id=?)',gone={...source.record,mergedInto:target.record.id};delete gone.sharedVersion;
 for(const [part,value,deleted]of [[target,data,0],[source,gone,1]]){
  if(part.row)statements.push(db.prepare('UPDATE shared_trees SET data=?,version=version+1,deleted=?,updated_at=?,last_op=?,actor=? WHERE id=? AND '+gate).bind(JSON.stringify(value),deleted,stamp,body.operationId,actor,part.record.id,body.operationId));
  else statements.push(db.prepare('INSERT INTO shared_trees(id,data,version,deleted,updated_at,last_op,actor) SELECT ?,?,1,?,?,?,? WHERE '+gate).bind(part.record.id,JSON.stringify(value),deleted,stamp,body.operationId,actor,body.operationId));
 }
 for(const part of [target,source]){const baseline=part.baseline||await historyBaseline(db,part.record.id);statements.push(...historyBaselineStatements(db,baseline,body.operationId,target.record.id));}
 for(const p of copies)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE '+gate).bind(target.record.id,p.assetId,p.image,body.operationId));
 statements.push(db.prepare('UPDATE shared_merges SET target_id=? WHERE target_id=? AND operation_id<>? AND '+gate).bind(target.record.id,source.record.id,body.operationId,body.operationId));
 const result=await db.batch(statements);if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a comparação. Nenhuma mesclagem foi aplicada; reabra os dados.',409);
 return {tree:sharedView(await sharedRead(db,target.record.id)),source:sharedView(await sharedRead(db,source.record.id)),preserved:true};
}

// Private, one-shot inventory requested through the Cloudflare control plane.
// Does not alter Drive files or inspection records.
async function runRepositoryInventory(env){
 const db=env.SHARED_DB,id='repository-inventory',job=await db.prepare('SELECT status FROM campo_maintenance WHERE id=?').bind(id).first();
 if(job?.status!=='inspect')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='inspect'").bind(id).run();if(!claim.meta?.changes)return;
 try{const inventory=await universalAdminRecords(env);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('review_required',JSON.stringify(inventory),id).run();}
 catch(e){const detail=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify({error:detail}),id).run();}
}

// No public route starts this job. A Cloudflare account administrator supplies the
// exact reviewed IDs and versions in D1; each item still uses normal deletion locks.
async function runAuthorizedRepositoryCleanup(env){
 const db=env.SHARED_DB,id='authorized-homologation-cleanup',job=await db.prepare('SELECT status,result FROM campo_maintenance WHERE id=?').bind(id).first();if(job?.status!=='approved')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='approved'").bind(id).run();if(!claim.meta?.changes)return;
 const state=JSON.parse(job.result);try{
 if(state.authorization!=='explicit_selected_ids'||!Array.isArray(state.records)||state.records.length<1||state.records.length>2)throw Error('Manifesto de manutenção inválido.');
 const current=await universalAdminRecords(env);for(const r of state.records){const c=current.records.find(x=>x.id===r.id);if(!c||c.adminClassification!=='homologacao'||c.updatedAt!==r.version||c.archiveVersion!==r.archiveVersion||c.adminLabelRevision!==r.labelRevision)throw Error('Cadastro ou classificação mudou. Revisão obrigatória antes de excluir.');}
 const result=await universalAdminDelete(env,{records:state.records});state.deletedIds=result.deletedIds;state.finishedAt=new Date().toISOString();await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('completed',JSON.stringify(state),id).run();
 }catch(e){state.error=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify(state),id).run();}
}

// Address search is explicitly submitted. Local layer suggestions never call this provider.
async function mapAddressSearch(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 let body;try{body=await sharedBody(request,2000);}catch{return json({error:'Pesquisa inválida.'},400);}
 const query=typeof body.query==='string'?body.query.trim().replace(/\s+/g,' '):'';
 if(query.length<3||query.length>160)return json({error:'Informe de 3 a 160 caracteres, incluindo cidade e estado.'},400);
 const db=env.SHARED_DB?.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;if(!db)return json({error:'Pesquisa online indisponível. Use as camadas salvas ou coordenadas.'},503);
 try{const key='photon:'+query.toLocaleLowerCase('pt-BR'),now=Date.now(),cached=await db.prepare('SELECT data FROM campo_place_cache WHERE cache_key=? AND expires_at>?').bind(key,now).first();if(cached)return json({...JSON.parse(cached.data),cached:true});
 const gate=await db.prepare("INSERT INTO campo_search_limit(id,next_at) VALUES('places',?) ON CONFLICT(id) DO UPDATE SET next_at=excluded.next_at WHERE campo_search_limit.next_at<=?").bind(now+1100,now).run();if(!gate.meta?.changes)return json({error:'Pesquisa ocupada. Aguarde um instante e toque em Buscar.'},429);
 const url=new URL(env.MAP_GEOCODER_URL||'https://photon.komoot.io/api/');if(url.protocol!=='https:'||url.username||url.password)return json({error:'Serviço de endereços não configurado corretamente.'},503);url.searchParams.set('q',query);url.searchParams.set('limit','6');url.searchParams.set('countrycode','BR');
 const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'CampoVegetacao/4.3 (explicit place search; mapeamento-arvores.pages.dev)'},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Provider unavailable');
 const data=JSON.parse(await(await limitedBody(response,500000)).text());if(!Array.isArray(data.features))throw Error('Invalid provider');
 const results=data.features.slice(0,6).flatMap(f=>{const c=f.geometry?.coordinates,p=f.properties||{};if(f.geometry?.type!=='Point'||!Array.isArray(c)||!sharedCoordinate(c[1],90)||!sharedCoordinate(c[0],180))return [];const title=[p.name,p.street,p.housenumber].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,200)||'Endereço';const detail=[p.district,p.city,p.county,p.state,p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(' · ').slice(0,300);return [{title,detail,lat:c[1],lon:c[0]}];});const out={results,provider:'Photon',attribution:'© OpenStreetMap contributors · ODbL'};
 await db.batch([db.prepare('INSERT INTO campo_place_cache(cache_key,data,expires_at) VALUES(?,?,?) ON CONFLICT(cache_key) DO UPDATE SET data=excluded.data,expires_at=excluded.expires_at').bind(key,JSON.stringify(out),now+7*86400000),db.prepare('DELETE FROM campo_place_cache WHERE expires_at<? OR cache_key IN (SELECT cache_key FROM campo_place_cache ORDER BY expires_at DESC LIMIT -1 OFFSET 1000)').bind(now)]);return json(out);
 }catch{return json({error:'Endereços indisponíveis agora. Use coordenadas ou a rede salva e tente novamente depois.'},502);}
}

// Administrative aggregation and history are checked on the server, not just hidden in the UI.
async function adminDb(env){if(!env.SHARED_DB)throw sharedError('Base central não configurada.',503);return env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;}
async function archiveCall(env,payload){
 if(!env.GOOGLE_SCRIPT_URL||!env.GOOGLE_SCRIPT_TOKEN)throw sharedError('Receptor Drive não configurado.',503);
 let r;try{r=await fetch(env.GOOGLE_SCRIPT_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:AbortSignal.timeout(85000)});}catch(e){throw sharedError(e.name==='TimeoutError'||e.name==='AbortError'?'O Drive excedeu o tempo de resposta. Atualize a base para conferir os cadastros e retomar a limpeza pendente.':'Falha de conexão com o Drive. Atualize a base antes de retomar.',504);}
 let d;try{d=await r.json();}catch{throw sharedError('O receptor Drive retornou resposta inválida. Confira a implantação do Apps Script.',502);}
 if(!r.ok||!d.ok){const errors={CONFLICT:'Cadastro alterado. Atualize a lista antes de excluir.',BUSY:'Repositório Drive ocupado. Aguarde e atualize a base.',INVALID:'O receptor Drive recusou o formato da operação. Atualize a implantação do Apps Script.',AUTH:'O receptor Drive recusou a integração. Confira a configuração.'};throw sharedError(errors[d.code]||'Repositório Drive não confirmou a operação ('+String(d.code||r.status).replace(/[^A-Z0-9_]/g,'').slice(0,30)+'). Confira a execução no Apps Script.',d.code==='CONFLICT'?409:d.code==='BUSY'?429:502);}
 return d;
}
function mergeAdminUniverse(archive,shared){const map=new Map();for(const a of archive){map.set(a.id,{...a,repositorySources:['drive'],archiveVersion:a.updatedAt});}for(const row of shared){const s=sharedView(row),a=map.get(s.id);if(s.sharedDeleted){map.delete(s.id);continue;}const newest=!a||Date.parse(s.updatedAt)>=Date.parse(a.updatedAt)?s:a;map.set(s.id,{...a,...newest,repositorySources:a?['drive','shared']:['shared'],archiveVersion:a?.archiveVersion||null,sharedVersion:s.sharedVersion,sharedDataVersion:s.updatedAt,sharedUpdatedAt:s.sharedUpdatedAt,sharedActor:s.sharedActor,collectionInspector:s.createdBy||JSON.parse(row.first_data||'{}').inspector||JSON.parse(row.first_data||'{}').lastInspector||a?.inspector||s.inspector});}return [...map.values()].sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||''))||a.id.localeCompare(b.id));}
async function adminArchiveInventory(env){let offset=0,revision;const archive=[],deleted=new Set(),pending=new Map(),seen=new Set();do{if(seen.has(offset))throw sharedError('Paginação do Drive inválida.',502);seen.add(offset);const d=await archiveCall(env,{action:'admin_list',offset,limit:200});if(!Array.isArray(d.records))throw sharedError('Atualize o receptor para listar o repositório.',502);if(revision!==undefined&&d.revision!==revision)throw sharedError('Repositório mudou durante a leitura. Atualize novamente.',409);revision=d.revision;archive.push(...d.records);for(const id of d.deletedIds||[])deleted.add(id);for(const r of d.pendingDeletes||[])if(sharedId(r.id)&&Number.isFinite(Date.parse(r.updatedAt)))pending.set(r.id,{...r,archiveCleanupPending:true,repositorySources:['drive'],archiveVersion:r.updatedAt});offset=d.nextOffset??null;}while(offset!==null);return {archive,deleted,revision,pending:[...pending.values()]};}
async function universalAdminRecords(env,inventory=null){const {archive,deleted,revision,pending}=inventory||await adminArchiveInventory(env),db=await adminDb(env),shared=await db.prepare('SELECT t.*,(SELECT c.data FROM shared_changes c WHERE c.tree_id=t.id ORDER BY c.seq LIMIT 1) first_data FROM shared_trees t').all();for(const row of shared.results)if(row.deleted)deleted.add(row.id);const labels=await db.prepare('SELECT tree_id,classification,revision,updated_at FROM campo_record_labels').all(),byId=new Map(labels.results.map(r=>[r.tree_id,r]));const rows=[...mergeAdminUniverse(archive,shared.results).filter(r=>!deleted.has(r.id)),...pending].map(r=>({...r,adminClassification:byId.get(r.id)?.classification||'',adminLabelRevision:byId.get(r.id)?.revision||0,adminLabelUpdatedAt:byId.get(r.id)?.updated_at||null}));return {records:rows,deletedIds:[...deleted],revision,total:rows.length,sources:{drive:archive.length,shared:shared.results.filter(r=>!r.deleted).length},scope:'all_users_all_dates',generatedAt:new Date().toISOString()};}
async function adminRecordLocked(db,id){return Boolean(await db.prepare('SELECT tree_id FROM campo_admin_locks WHERE tree_id=? AND expires_at>?').bind(id,Date.now()).first());}
async function universalAdminDelete(env,body){const list=body.records;if(!Array.isArray(list)||!list.length||list.length>20||new Set(list.map(r=>r.id)).size!==list.length||list.some(r=>!sharedId(r.id)||!Number.isFinite(Date.parse(r.version))||r.sharedVersion!=null&&(!Number.isSafeInteger(r.sharedVersion)||r.sharedVersion<1)))throw sharedError('Selecione de 1 a 20 cadastros válidos.');const db=await adminDb(env),op=crypto.randomUUID(),now=Date.now();
 try{const claims=await db.batch(list.map(r=>db.prepare('INSERT INTO campo_admin_locks(tree_id,operation_id,expires_at) VALUES(?,?,?) ON CONFLICT(tree_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at WHERE campo_admin_locks.expires_at<?').bind(r.id,op,now+120000,now)));if(claims.some(r=>!r.meta.changes))throw sharedError('Há uma operação em andamento nesses cadastros.',409);
 const placeholders=list.map(()=>'?').join(','),currentRows=await db.prepare('SELECT * FROM shared_trees WHERE id IN ('+placeholders+')').bind(...list.map(r=>r.id)).all(),currentById=new Map(currentRows.results.map(r=>[r.id,r])),currentLabels=await db.prepare('SELECT tree_id,revision FROM campo_record_labels WHERE tree_id IN ('+placeholders+')').bind(...list.map(r=>r.id)).all(),labelById=new Map(currentLabels.results.map(r=>[r.tree_id,r]));const central=[];for(const r of list){const row=currentById.get(r.id);if(row&&!row.deleted&&(r.sharedVersion!==row.version||r.sharedDataVersion&&JSON.parse(row.data).updatedAt!==r.sharedDataVersion))throw sharedError('Uma árvore foi alterada por outro usuário. Atualize antes de excluir.',409);if(r.labelRevision!==undefined){if(!Number.isSafeInteger(r.labelRevision)||r.labelRevision<0)throw sharedError('Classificação inválida.');const label=labelById.get(r.id);if((label?.revision||0)!==r.labelRevision)throw sharedError('A classificação de um cadastro mudou. Atualize e confira antes de excluir.',409);}central.push(row);}
 // Validate the Drive versions before any deletion. No date cutoff or device scope applies.
 const archiveSnapshot=await adminArchiveInventory(env),archiveMap=new Map([...archiveSnapshot.archive,...archiveSnapshot.pending].map(r=>[r.id,r]));const archived=[];for(const r of list){const a=archiveMap.get(r.id);if(a){if(a.updatedAt!==(r.archiveVersion||r.version))throw sharedError('Versão do Drive mudou. Atualize a lista antes de excluir.',409);archived.push({...r,archiveVersion:a.updatedAt});}}if(archived.length){const d=await archiveCall(env,{action:'admin_delete',records:archived.map(r=>({id:r.id,version:r.archiveVersion}))});if(archived.some(r=>!d.deletedIds?.includes(r.id)))throw sharedError('O Drive não confirmou toda a exclusão. Atualize e tente novamente.',502);}
 const stamp=new Date().toISOString();await db.batch(list.map((r,i)=>central[i]?db.prepare('UPDATE shared_trees SET deleted=1,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=?').bind(stamp,op,'Administrador',r.id,central[i].version):db.prepare('INSERT INTO shared_trees(id,data,version,deleted,updated_at,last_op,actor) VALUES(?,?,1,1,?,?,?)').bind(r.id,JSON.stringify({id:r.id,updatedAt:r.version,createdAt:stamp,photos:[],archiveOnly:true}),stamp,op,'Administrador')));
 await db.prepare('DELETE FROM shared_photos WHERE tree_id IN ('+placeholders+')').bind(...list.map(r=>r.id)).run();const archivedClause=archived.length?'tree_id IN ('+archived.map(()=>'?').join(',')+')':'0';await db.prepare("UPDATE shared_deletions SET status='approved',reviewed_at=?,reviewer_note='Exclusão administrativa direta',archive_status=CASE WHEN "+archivedClause+" THEN 'removed' ELSE 'not_requested' END WHERE tree_id IN ("+placeholders+") AND status='pending'").bind(stamp,...archived.map(r=>r.id),...list.map(r=>r.id)).run();return {deletedIds:list.map(r=>r.id)};
 }finally{await db.prepare('DELETE FROM campo_admin_locks WHERE operation_id=?').bind(op).run();}}
const adminAuditKeys=['lat','lon','inspector','feeder','height','dap','circ','position','pole','span','os','species','note','poda','projection','grouped','mt','bt','at','mtDistance','btDistance','atDistance','photos','area','access','team','plantIdentification','heightMeasurement','measurements'];
function auditPeriod(params){const month=params.get('month')||'',day=params.get('day')||'',actor=(params.get('actor')||'').trim();if(month&&!/^\d{4}-\d{2}$/.test(month)||day&&!/^\d{4}-\d{2}-\d{2}$/.test(day)||actor.length>120)throw sharedError('Filtro inválido.');const clauses=["kind<>'sync'"],args=[];if(month){clauses.push("strftime('%Y-%m',updated_at,'-5 hours')=?");args.push(month);}if(day){clauses.push("date(updated_at,'-5 hours')=?");args.push(day);}if(actor){clauses.push('lower(trim(actor))=lower(trim(?))');args.push(actor);}return {where:clauses.join(' AND '),args};}
async function adminAudit(db,params){const f=auditPeriod(params),filter=params.get('case')||'all',offset=Number(params.get('offset')||0);if(!['all','edit','cross','request','delete'].includes(filter)||!Number.isSafeInteger(offset)||offset<0)throw sharedError('Filtro de auditoria inválido.');const subset={all:'1=1',edit:"kind='edit'",cross:'cross_user=1',request:"kind='request'",delete:"kind='delete'"}[filter];const grouped=await db.prepare(`SELECT actor,SUM(kind='create') creations,SUM(kind='edit') edits,SUM(cross_user) crossEdits,SUM(kind='request') requests,COUNT(DISTINCT tree_id) trees,COUNT(DISTINCT CASE WHEN kind='edit' THEN tree_id END) editedTrees,COUNT(DISTINCT CASE WHEN kind='request' THEN tree_id END) requestTrees FROM campo_admin_history WHERE ${f.where} GROUP BY lower(trim(actor)) ORDER BY edits DESC,actor`).bind(...f.args).all();const counts=await db.prepare(`SELECT COUNT(*) events,COUNT(DISTINCT tree_id) historyTrees,MIN(updated_at) historySince,SUM(kind='edit') edits,SUM(cross_user) crossEdits,SUM(kind='request') requests,COUNT(DISTINCT CASE WHEN kind='edit' THEN tree_id END) editedTrees,COUNT(DISTINCT CASE WHEN kind='request' THEN tree_id END) requestTrees FROM campo_admin_history WHERE ${f.where}`).bind(...f.args).first();const rows=await db.prepare(`SELECT * FROM campo_admin_history WHERE ${f.where} AND ${subset} ORDER BY seq DESC LIMIT 101 OFFSET ?`).bind(...f.args,offset).all();const ids=filter==='all'?{results:[]}:await db.prepare(`SELECT DISTINCT tree_id FROM campo_admin_history WHERE ${f.where} AND ${subset}`).bind(...f.args).all();return {caseTrees:ids.results.map(r=>r.tree_id),summary:counts,users:grouped.results,events:rows.results.slice(0,100).map(r=>{const current=JSON.parse(r.data),old=r.previous_data?JSON.parse(r.previous_data):{};const fields=r.kind==='edit'?adminAuditKeys.filter(k=>JSON.stringify(current[k]??null)!==JSON.stringify(old[k]??null)):[];return {seq:r.seq,treeId:r.tree_id,kind:r.kind,actor:r.actor,previousActor:r.previous_editor,at:r.updated_at,crossUser:Boolean(r.cross_user),fields,changes:fields.map(k=>({field:k,before:k==='photos'?(old.photos?.length||0):typeof old[k]==='object'?JSON.stringify(old[k]).slice(0,500):old[k]??null,after:k==='photos'?(current.photos?.length||0):typeof current[k]==='object'?JSON.stringify(current[k]).slice(0,500):current[k]??null})),pole:current.pole,feeder:current.feeder,species:current.species,version:r.version};}),nextOffset:rows.results.length>100?offset+100:null,scope:'all_history',identity:'self_reported_names'};}
async function presenceEnabled(db){const row=await db.prepare("SELECT value FROM campo_admin_settings WHERE id='presence'").first();return row?.value==='true';}
async function presencePing(db,b){if(!sharedId(b.sessionId)||typeof b.token!=='string'||b.token.length<32||b.token.length>100||typeof b.name!=='string'||!b.name.trim()||b.name.length>120)throw sharedError('Nome e sessão válidos são obrigatórios.');const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.token))),x=>x.toString(16).padStart(2,'0')).join('');const old=await db.prepare('SELECT token_hash,last_seen FROM campo_presence WHERE session_id=?').bind(b.sessionId).first();if(old&&old.token_hash!==hash)throw sharedError('Sessão de presença inválida.',403);const enabled=await presenceEnabled(db);if(!enabled||b.active===false){if(old)await db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0 WHERE session_id=? AND token_hash=?').bind(b.sessionId,hash).run();return {enabled,accepted:false};}if(old&&Date.now()-Date.parse(old.last_seen)<15000)return {enabled,accepted:true,throttled:true};const p=b.location,at=Date.now();let lat=null,lon=null,accuracy=null,locationAt=null;if(b.shareLocation===true&&p&&typeof p.lat==='number'&&typeof p.lon==='number'&&sharedCoordinate(p.lat,90)&&sharedCoordinate(p.lon,180)&&Number.isFinite(p.accuracy)&&p.accuracy>=0&&Number.isFinite(Date.parse(p.timestamp))&&at-Date.parse(p.timestamp)>=-5000&&at-Date.parse(p.timestamp)<=60000){lat=p.lat;lon=p.lon;accuracy=p.accuracy;locationAt=p.timestamp;}const now=new Date(at).toISOString();await db.prepare('INSERT INTO campo_presence(session_id,token_hash,name,first_seen,last_seen,active,lat,lon,accuracy,location_at,sharing) VALUES(?,?,?,?,?,1,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET name=excluded.name,last_seen=excluded.last_seen,active=1,lat=excluded.lat,lon=excluded.lon,accuracy=excluded.accuracy,location_at=excluded.location_at,sharing=excluded.sharing WHERE campo_presence.token_hash=excluded.token_hash').bind(b.sessionId,hash,b.name.trim(),now,now,lat,lon,accuracy,locationAt,b.shareLocation===true?1:0).run();await db.prepare("DELETE FROM campo_presence WHERE julianday(last_seen)<julianday('now','-7 days')").run();return {enabled:true,accepted:true};}
async function adminControlAPI(request,env){try{const u=new URL(request.url),p=u.pathname,db=await adminDb(env);if(p==='/api/team/presence/config'&&request.method==='GET')return json({enabled:await presenceEnabled(db)});if(p==='/api/team/presence/ping'&&request.method==='POST'){const b=await sharedBody(request,3000);if(env.CAMPO_USER){b.name=env.CAMPO_USER.name;b.sessionId='u-'+env.CAMPO_DEVICE_SESSION.hash.slice(0,32);b.token=env.CAMPO_DEVICE_SESSION.token;}const result=await presencePing(db,b);if(env.CAMPO_USER&&result.accepted)await db.prepare('INSERT INTO campo_presence_identities(session_id,user_id,email) VALUES(?,?,?) ON CONFLICT(session_id) DO UPDATE SET user_id=excluded.user_id,email=excluded.email').bind(b.sessionId,env.CAMPO_USER.id,env.CAMPO_USER.email).run();return json(result);}if(!isAdministrator(request,env))throw sharedError('Acesso restrito ao administrador.',403);
 if(p==='/api/admin/universe'&&request.method==='GET')return json(await universalAdminRecords(env));
 if(p==='/api/admin/universe/labels'&&request.method==='POST')return json(await updateAdminLabels(env,await sharedBody(request,50000)));
 if(p==='/api/admin/universe/delete'&&request.method==='POST')return json(await universalAdminDelete(env,await sharedBody(request,30000)));
 if(p==='/api/admin/audit'&&request.method==='GET')return json(await adminAudit(db,u.searchParams));
 if(p==='/api/admin/presence'&&request.method==='GET'){const rows=await db.prepare("SELECT p.session_id,p.name,p.first_seen,p.last_seen,p.active,i.user_id,i.email,CASE WHEN julianday(location_at)>=julianday('now','-2 hours') THEN lat ELSE NULL END lat,CASE WHEN julianday(location_at)>=julianday('now','-2 hours') THEN lon ELSE NULL END lon,accuracy,location_at,sharing FROM campo_presence p LEFT JOIN campo_presence_identities i ON i.session_id=p.session_id ORDER BY last_seen DESC").all();return json({enabled:await presenceEnabled(db),sessions:rows.results,identity:'self_reported_names',activeWindowSeconds:120});}
 if(p==='/api/admin/presence'&&request.method==='POST'){const b=await sharedBody(request,1000);if(typeof b.enabled!=='boolean')throw sharedError('Configuração inválida.');await db.prepare("INSERT INTO campo_admin_settings(id,value,updated_at) VALUES('presence',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(String(b.enabled),new Date().toISOString()).run();if(!b.enabled)await db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0').run();return json({enabled:b.enabled});}
 return json({error:'Rota administrativa não encontrada.'},404);
 }catch(e){if(!e.status)console.error(JSON.stringify({event:'admin_control_error',route:new URL(request.url).pathname,detail:String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,500)}));return json({error:e.status?e.message:'Falha no controle central. A operação não foi confirmada. Atualize a base e tente em lotes menores.'},e.status||503);}}

async function updateAdminLabels(env,body){const records=body.records,value=body.classification;if(!Array.isArray(records)||!records.length||records.length>20||new Set(records.map(r=>r.id)).size!==records.length||!['','homologacao','producao'].includes(value)||records.some(r=>!sharedId(r.id)||!Number.isSafeInteger(r.labelRevision)||r.labelRevision<0))throw sharedError('Selecione de 1 a 20 cadastros e uma classificação válida.');const db=await adminDb(env),op=crypto.randomUUID(),now=Date.now();try{const locks=await db.batch(records.map(r=>db.prepare('INSERT INTO campo_admin_locks(tree_id,operation_id,expires_at) VALUES(?,?,?) ON CONFLICT(tree_id) DO UPDATE SET operation_id=excluded.operation_id,expires_at=excluded.expires_at WHERE campo_admin_locks.expires_at<?').bind(r.id,op,now+120000,now)));if(locks.some(r=>!r.meta.changes))throw sharedError('Há uma operação em andamento. Tente novamente.',409);const inventory=await adminArchiveInventory(env),known=new Set(inventory.archive.map(r=>r.id)),shared=await db.prepare('SELECT id,deleted FROM shared_trees').all();for(const r of shared.results){if(r.deleted)known.delete(r.id);else known.add(r.id);}for(const id of inventory.deleted)known.delete(id);const labels=await db.prepare('SELECT tree_id,revision FROM campo_record_labels WHERE tree_id IN ('+records.map(()=>'?').join(',')+')').bind(...records.map(r=>r.id)).all(),byId=new Map(labels.results.map(r=>[r.tree_id,r]));for(const r of records){if(!known.has(r.id))throw sharedError('Cadastro não está mais na base ativa. Atualize antes de classificar.',409);const old=byId.get(r.id);if((old?.revision||0)!==r.labelRevision)throw sharedError('Classificação alterada em outra sessão. Atualize a lista.',409);}const stamp=new Date().toISOString();await db.batch(records.map(r=>db.prepare("INSERT INTO campo_record_labels(tree_id,classification,revision,updated_at,actor) VALUES(?,?,1,?,'Administrador') ON CONFLICT(tree_id) DO UPDATE SET classification=excluded.classification,revision=campo_record_labels.revision+1,updated_at=excluded.updated_at,actor=excluded.actor").bind(r.id,value,stamp)));return {labels:records.map(r=>({id:r.id,classification:value,revision:r.labelRevision+1,updatedAt:stamp}))};}finally{await db.prepare('DELETE FROM campo_admin_locks WHERE operation_id=?').bind(op).run();}}

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
 if(p==='/api/control/revision'){const r=await db.prepare('SELECT COALESCE(MAX(seq),0) seq FROM shared_changes').first(),labels=await db.prepare('SELECT MAX(updated_at) stamp FROM campo_record_labels').first();return json({revision:r.seq+':'+(labels.stamp||''),intervalSeconds:10,version:'4.6.1',at:new Date().toISOString()});}
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

// Base VERA corrigida: leitura restrita ao administrador; escrita só pelo envio local com VERA_SYNC_TOKEN.
const VERA_GENERATION=/^[a-z0-9-]{8,40}$/,VERA_ID=/^[A-Za-z0-9_-]{1,40}$/,VERA_IMAGE=/^data:image\/jpeg;base64,[a-z0-9+/=]+$/i;
const veraMissingTable=e=>/no such table/i.test(String(e?.message||e));
// Só o necessário para a prévia de risco: nunca fotos, nem identificação de quem inspecionou além do nome já exibido no painel.
function veraLiveRecord(r,review){return {id:r.id,review:review||null,count:r.count??null,photoAsset:(r.photos||[]).find(p=>p.assetId)?.assetId||'',species:r.species||'',height:r.height??null,dap:r.dap??null,circ:r.circ??null,mt:r.mt===true,bt:r.bt===true,mtDistance:r.mtDistance??null,btDistance:r.btDistance??null,position:r.position||'',projection:r.projection||'',lat:r.lat??null,lon:r.lon??null,pole:r.pole||'',span:r.span||'',feeder:r.feeder||'',poda:r.poda||'',note:String(r.note||'').slice(0,300),createdAt:r.createdAt||null,updatedAt:r.updatedAt||null,actor:r.sharedActor||r.lastInspector||r.inspector||''};}
// Para o mapa do inspetor: só o que ele precisa para achar e atualizar a árvore. Clientes e prioridade ficam no painel.
function veraFieldRow(t){return {id:t.id,lat:t.lat,lon:t.lon,coordOriginal:t.coordOriginal,especies:t.especies,qtd:t.qtd,altura:t.altura,dap:t.dap,origemDap:t.origemDap,distMT:t.distMT,distBT:t.distBT,distAT:t.distAT,projecao:t.projecao,classe:t.classe,acao:t.acao,poste:t.poste,vao:t.vao,alimentador:t.alimentador,ano:t.ano,logradouro:t.logradouro,observacao:t.observacao,poda:t.poda,registro:t.registro,seq:t.seq,nArvores:t.nArvores,origemArvore:t.origemArvore,metodo:t.metodo,confianca:t.confianca,fonte:t.fonte,especieConf:t.especieConf};}
// Volta para a planilha: tudo que o campo cadastrou, sem as fotos, que vêm uma a uma por field-photo.
function veraExportRecord(r,review){return {id:r.id,externalId:r.externalId||'',lat:r.lat??null,lon:r.lon??null,species:r.species||'',height:r.height??null,dap:r.dap??null,circ:r.circ??null,position:r.position||'',pole:r.pole||'',span:r.span||'',feeder:r.feeder||'',os:r.os||'',poda:r.poda||'',projection:r.projection||'',grouped:r.grouped||'',mt:r.mt===true,bt:r.bt===true,at:r.at===true,mtDistance:r.mtDistance??null,btDistance:r.btDistance??null,atDistance:r.atDistance??null,note:r.note||'',address:r.address||'',inspector:r.collectionInspector||r.inspector||'',lastInspector:r.sharedActor||r.lastInspector||'',createdAt:r.createdAt||null,updatedAt:r.updatedAt||null,sharedVersion:r.sharedVersion??null,folderUrl:r.folderUrl||r.googleReceipt?.folderUrl||'',photos:(r.photos||[]).map(p=>p.assetId).filter(Boolean),review:review||null};}
async function veraMeta(db){const {results}=await db.prepare('SELECT key,value FROM vera_meta').all();return Object.fromEntries(results.map(r=>[r.key,r.value]));}
async function veraReviews(db){try{const {results}=await db.prepare('SELECT tree_id,verificacao,obs,actor,updated_at FROM vera_field_review').all();return results;}catch(e){if(veraMissingTable(e))return [];throw e;}}
const veraPhotoId=id=>id.replace(/-\d+$/,'');
async function veraField(u,db){
 if(u.pathname==='/api/vera/field-photo'){const id=u.searchParams.get('id')||'';if(!VERA_ID.test(id))throw sharedError('ID inválido.');const row=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(id)).first();if(!row)throw sharedError('Miniatura indisponível.',404);return json({image:row.image});}
 let meta;try{meta=await veraMeta(db);}catch(e){if(veraMissingTable(e))return json({generation:null,trees:[]});throw e;}
 const generation=meta.generation||null;if(generation&&u.searchParams.get('since')===generation)return json({generation,unchanged:true});
 const {results}=generation?await db.prepare('SELECT data FROM vera_trees WHERE generation=?').bind(generation).all():{results:[]};return json({generation,trees:results.map(r=>veraFieldRow(JSON.parse(r.data)))});
}
async function veraAPI(request,env){try{
 const u=new URL(request.url);
 // Inspetores também leem: o gateway de acesso já exigiu o login antes de chegar aqui.
 if(u.pathname==='/api/vera/field'||u.pathname==='/api/vera/field-photo'){if(request.method!=='GET')throw sharedError('Use GET.',405);return await veraField(u,await adminDb(env));}
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);const db=await adminDb(env);
 if(u.pathname==='/api/vera/review'){if(request.method!=='POST')throw sharedError('Use POST.',405);if(Number(request.headers.get('content-length')||0)>4096)throw sharedError('Solicitação grande demais.',413);let body;try{body=await request.json();}catch{throw sharedError('Solicitação inválida.');}const {id,verificacao,obs}=body||{};if(!sharedId(id))throw sharedError('ID inválido.');if(verificacao===''){await db.prepare('DELETE FROM vera_field_review WHERE tree_id=?').bind(id).run();return json({id,review:null});}if(!['CONFIRMADA','NÃO CONFIRMADA'].includes(verificacao))throw sharedError('Conferência inválida.');const review={tree_id:id,verificacao,obs:String(obs||'').slice(0,300),actor:String(env.CAMPO_USER?.name||env.CAMPO_USER?.username||'Administrador').slice(0,120),updated_at:new Date().toISOString()};await db.prepare('INSERT OR REPLACE INTO vera_field_review(tree_id,verificacao,obs,actor,updated_at) VALUES(?,?,?,?,?)').bind(review.tree_id,review.verificacao,review.obs,review.actor,review.updated_at).run();return json({id,review});}
 if(request.method!=='GET')throw sharedError('Use GET para consultar a base VERA.',405);let meta;
 try{meta=await veraMeta(db);}catch(e){if(veraMissingTable(e))return json({generation:null,updatedAt:null,total:0,trees:[]});throw e;}
 const generation=meta.generation||null;
 if(u.pathname==='/api/vera/meta'){const reviews=await veraReviews(db);return json({generation,updatedAt:meta.updatedAt||null,total:Number(meta.total||0),reviews:reviews.length+':'+reviews.reduce((m,r)=>r.updated_at>m?r.updated_at:m,'')});}
 if(u.pathname==='/api/vera/trees'){if(generation&&u.searchParams.get('since')===generation)return json({generation,unchanged:true});const {results}=generation?await db.prepare('SELECT data FROM vera_trees WHERE generation=?').bind(generation).all():{results:[]};return json({generation,updatedAt:meta.updatedAt||null,total:results.length,trees:results.map(r=>JSON.parse(r.data)),referencia:meta.referencia?JSON.parse(meta.referencia):null});}
 if(u.pathname==='/api/vera/live'){const data=await controlLiveUniverse(env),reviews=new Map((await veraReviews(db)).map(r=>[r.tree_id,r]));const links=await db.prepare('SELECT source_id,target_id FROM shared_merges').all();return json({merged:links.results.map(r=>({sourceId:r.source_id,targetId:r.target_id})),generatedAt:data.generatedAt,records:data.records.filter(r=>!r.archiveCleanupPending&&r.adminClassification!=='homologacao').map(r=>veraLiveRecord(r,reviews.get(r.id)))});}
 if(u.pathname==='/api/vera/photo'){const id=u.searchParams.get('id')||'';if(!VERA_ID.test(id))throw sharedError('ID inválido.');const row=await db.prepare('SELECT image FROM vera_thumbs WHERE id=?').bind(veraPhotoId(id)).first();if(!row)throw sharedError('Miniatura indisponível.',404);return json({image:row.image});}
 throw sharedError('Consulta não encontrada.',404);
}catch(e){return json({error:e.status?e.message:'Base VERA temporariamente indisponível.'},e.status||503);}}
// Troca atômica: as linhas novas entram numa geração própria e o painel só passa a vê-las no commit.
async function veraSync(request,env){try{
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(!env.VERA_SYNC_TOKEN||env.VERA_SYNC_TOKEN.length<32)return json({error:'Envio VERA não configurado no Worker.'},503);
 if(!await equalSecret((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.VERA_SYNC_TOKEN))return json({error:'Token de envio inválido.'},401);
 if(Number(request.headers.get('content-length')||0)>9000000)return json({error:'Lote grande demais.'},413);
 let body;try{body=await request.json();}catch{return json({error:'Solicitação inválida.'},400);}
 const db=await adminDb(env),{action,generation}=body||{};
 if(action==='field-export'){const data=await controlLiveUniverse(env),reviews=new Map((await veraReviews(db)).map(r=>[r.tree_id,r]));return json({generatedAt:data.generatedAt,records:data.records.filter(r=>!r.archiveCleanupPending&&r.adminClassification!=='homologacao').map(r=>veraExportRecord(r,reviews.get(r.id))),deleted:data.deletedIds.filter(id=>id.startsWith('vera-'))});}
 if(action==='field-photo'){if(!sharedId(body.id)||!sharedId(body.asset))return json({error:'Foto inválida.'},400);const row=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(body.id,body.asset).first();if(!row)return json({error:'Foto não encontrada.'},404);return json({image:row.image});}
 if(action==='thumb-ids'){const {results}=await db.prepare('SELECT id FROM vera_thumbs').all();return json({ids:results.map(r=>r.id)});}
 if(action==='thumbs'){const items=body.items;if(!Array.isArray(items)||!items.length||items.length>40||!items.every(i=>VERA_ID.test(i?.id||'')&&typeof i.image==='string'&&i.image.length<300000&&VERA_IMAGE.test(i.image)))return json({error:'Miniaturas inválidas.'},400);await db.batch(items.map(i=>db.prepare('INSERT OR REPLACE INTO vera_thumbs(id,image) VALUES(?,?)').bind(i.id,i.image)));return json({saved:items.length});}
 if(!VERA_GENERATION.test(generation||''))return json({error:'Geração inválida.'},400);
 if(action==='rows'){const rows=body.rows;if(!Array.isArray(rows)||!rows.length||rows.length>500||!rows.every(r=>VERA_ID.test(r?.id||'')&&r.data&&typeof r.data==='object'))return json({error:'Linhas inválidas.'},400);const texts=rows.map(r=>JSON.stringify({...r.data,id:r.id}));if(texts.some(t=>t.length>16000))return json({error:'Linha grande demais.'},413);await db.batch(rows.map((r,i)=>db.prepare('INSERT OR REPLACE INTO vera_trees(generation,id,data) VALUES(?,?,?)').bind(generation,r.id,texts[i])));return json({saved:rows.length});}
 if(action==='commit'){const total=Number(body.total),found=await db.prepare('SELECT COUNT(*) n FROM vera_trees WHERE generation=?').bind(generation).first();if(!Number.isSafeInteger(total)||total<1||found.n!==total)return json({error:'Envio incompleto: '+found.n+' de '+body.total+' linhas.'},409);const set=(k,v)=>db.prepare('INSERT OR REPLACE INTO vera_meta(key,value) VALUES(?,?)').bind(k,String(v)),now=new Date().toISOString();const referencia=JSON.stringify(body.referencia&&typeof body.referencia==='object'?body.referencia:{});if(referencia.length>200000)return json({error:'Referência grande demais.'},413);await db.batch([set('generation',generation),set('updatedAt',now),set('total',total),set('referencia',referencia),db.prepare('DELETE FROM vera_trees WHERE generation<>?').bind(generation),db.prepare('DELETE FROM vera_thumbs WHERE id NOT IN (SELECT id FROM vera_trees WHERE generation=?)').bind(generation)]);return json({generation,total,updatedAt:now});}
 return json({error:'Ação desconhecida.'},400);
}catch(e){if(veraMissingTable(e))return json({error:'Aplique backend/vera-schema.sql no D1 antes do primeiro envio.'},503);return json({error:e.status?e.message:'Envio VERA temporariamente indisponível.'},e.status||503);}}

const CENTRAL_NAME=/^[a-z0-9_]{1,40}$/,CENTRAL_GENERATION=/^cen-[0-9]{8,20}$/,CENTRAL_BODY=/^[A-Za-z0-9+/]+={0,2}$/;
function centralMissingTable(e){return /no such table/i.test(String(e?.message||e));}
async function centralMeta(db){const {results}=await db.prepare('SELECT key,value FROM central_meta').all();return Object.fromEntries(results.map(r=>[r.key,r.value]));}
const SOLIC_TIPOS=new Set(['PD','AVULSA']),SOLIC_SITUACOES=new Set(['Rascunho','Enviada','Atendida','Cancelada']),SOLIC_ID=/^[a-f0-9-]{36}$/;
// Valida tudo no servidor: a tela só oferece material ativo, mas é aqui que a solicitação é gravada.
function solicitacaoValida(b){
 if(!b||typeof b!=='object')throw sharedError('Solicitação inválida.');
 if(!SOLIC_TIPOS.has(b.tipo))throw sharedError('Tipo inválido.');
 if(!SOLIC_SITUACOES.has(b.situacao))throw sharedError('Situação inválida.');
 if(b.tipo==='PD'&&!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(b.mesPd||''))throw sharedError('Informe o mês do plano de demanda.');
 if(typeof (b.obs??'')!=='string'||(b.obs||'').length>1000)throw sharedError('Observação longa demais.');
 if(!Array.isArray(b.itens)||!b.itens.length||b.itens.length>500)throw sharedError('Inclua de 1 a 500 itens.');
 const vistos=new Set(),itens=b.itens.map(i=>{const cod=Number(i?.cod),qtd=Number(i?.qtd);if(!Number.isSafeInteger(cod)||cod<=0)throw sharedError('Código de material inválido.');if(!Number.isFinite(qtd)||qtd<=0||qtd>1e8)throw sharedError('Quantidade inválida no material '+cod+'.');if(vistos.has(cod))throw sharedError('Material '+cod+' repetido.');vistos.add(cod);return {cod,desc:String(i.desc||'').slice(0,200),un:String(i.un||'').slice(0,40),qtd};});
 return {tipo:b.tipo,mesPd:b.tipo==='PD'?b.mesPd:null,situacao:b.situacao,obs:b.obs||'',itens};
}
async function centralSolicitacoes(request,db){
 if(request.method==='GET'){const {results}=await db.prepare('SELECT id,tipo,mes_pd,situacao,obs,itens,criado_em,atualizado_em FROM central_solicitacoes ORDER BY criado_em DESC LIMIT 500').all();return json({solicitacoes:results.map(r=>({id:r.id,tipo:r.tipo,mesPd:r.mes_pd,situacao:r.situacao,obs:r.obs,itens:JSON.parse(r.itens),criadoEm:r.criado_em,atualizadoEm:r.atualizado_em}))});}
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 if(Number(request.headers.get('content-length')||0)>400000)throw sharedError('Solicitação grande demais.',413);
 let body;try{body=await request.json();}catch{throw sharedError('Solicitação inválida.');}
 const s=solicitacaoValida(body),now=new Date().toISOString();
 if(body.id!=null){if(!SOLIC_ID.test(String(body.id)))throw sharedError('Solicitação inválida.');const out=await db.prepare('UPDATE central_solicitacoes SET tipo=?,mes_pd=?,situacao=?,obs=?,itens=?,atualizado_em=? WHERE id=?').bind(s.tipo,s.mesPd,s.situacao,s.obs,JSON.stringify(s.itens),now,body.id).run();if(!out.meta?.changes)throw sharedError('Solicitação não encontrada.',404);return json({id:body.id,atualizadoEm:now});}
 const id=crypto.randomUUID();await db.prepare('INSERT INTO central_solicitacoes(id,tipo,mes_pd,situacao,obs,itens,criado_em,atualizado_em) VALUES(?,?,?,?,?,?,?,?)').bind(id,s.tipo,s.mesPd,s.situacao,s.obs,JSON.stringify(s.itens),now,now).run();return json({id,criadoEm:now});
}
// Data marco e premissas editadas na tela: sobrevivem ao envio diário e valem em qualquer computador.
const PREM_CHAVE=/^[A-Za-z0-9_.\/ ÁÉÍÓÚÂÊÔÃÕÇáéíóúâêôãõç-]{1,60}$/;
async function centralPremissas(request,db){
 if(request.method==='GET'){try{const {results}=await db.prepare('SELECT chave,valor,atualizado_em FROM central_premissas').all();return json({premissas:Object.fromEntries(results.map(r=>[r.chave,JSON.parse(r.valor)])),atualizadoEm:results.reduce((a,r)=>r.atualizado_em>a?r.atualizado_em:a,'')||null});}catch(e){if(centralMissingTable(e))return json({premissas:{},atualizadoEm:null});throw e;}}
 if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
 if(Number(request.headers.get('content-length')||0)>40000)throw sharedError('Premissas grandes demais.',413);
 let body;try{body=await request.json();}catch{throw sharedError('Premissas inválidas.');}
 const p=body?.premissas;if(!p||typeof p!=='object'||Array.isArray(p))throw sharedError('Premissas inválidas.');const itens=Object.entries(p);if(!itens.length||itens.length>200)throw sharedError('Envie de 1 a 200 premissas.');
 for(const [k,v]of itens){if(!PREM_CHAVE.test(k))throw sharedError('Nome de premissa inválido.');if(v!==null&&!(typeof v==='number'&&Number.isFinite(v))&&!(typeof v==='string'&&v.length<=60))throw sharedError('Valor inválido em '+k+'.');}
 // A tabela nasce no primeiro salvamento: não depende de aplicar o esquema à mão.
 await db.prepare('CREATE TABLE IF NOT EXISTS central_premissas(chave TEXT PRIMARY KEY,valor TEXT NOT NULL,atualizado_em TEXT NOT NULL)').run();
 const now=new Date().toISOString();await db.batch(itens.map(([k,v])=>v===null||v===''?db.prepare('DELETE FROM central_premissas WHERE chave=?').bind(k):db.prepare('INSERT OR REPLACE INTO central_premissas(chave,valor,atualizado_em) VALUES(?,?,?)').bind(k,JSON.stringify(v),now)));
 return json({salvas:itens.length,atualizadoEm:now});
}
// Dados de gestão e orçamento: só administrador lê. Os arquivos vão comprimidos em partes e o navegador junta.
async function centralAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 const u=new URL(request.url),db=await adminDb(env);let meta;
 if(u.pathname==='/api/central/solicitacoes')return await centralSolicitacoes(request,db);
 if(u.pathname==='/api/central/premissas')return await centralPremissas(request,db);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 try{meta=await centralMeta(db);}catch(e){if(centralMissingTable(e))return json({generation:null,updatedAt:null,manifest:{}});throw e;}

 if(u.pathname==='/api/central/meta')return json({generation:meta.generation||null,updatedAt:meta.updatedAt||null,manifest:meta.manifest?JSON.parse(meta.manifest):{}});
 if(u.pathname==='/api/central/data'){const name=u.searchParams.get('name')||'',part=Number(u.searchParams.get('part')),generation=u.searchParams.get('generation')||'';if(!CENTRAL_NAME.test(name)||!Number.isSafeInteger(part)||part<0||part>999||!CENTRAL_GENERATION.test(generation))throw sharedError('Consulta inválida.');const row=await db.prepare('SELECT body FROM central_parts WHERE generation=? AND name=? AND part=?').bind(generation,name,part).first();if(!row)throw sharedError('Base atualizada: recarregue a página.',409);return json({body:row.body});}
 throw sharedError('Consulta não encontrada.',404);
}catch(e){return json({error:e.status?e.message:'Base temporariamente indisponível.'},e.status||503);}}
// Troca atômica: enquanto envia, o painel segue na geração anterior.
async function centralSync(request,env){try{
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 if(!env.VERA_SYNC_TOKEN||env.VERA_SYNC_TOKEN.length<32)return json({error:'Envio não configurado no Worker.'},503);
 if(!await equalSecret((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env.VERA_SYNC_TOKEN))return json({error:'Token de envio inválido.'},401);
 if(Number(request.headers.get('content-length')||0)>2000000)return json({error:'Lote grande demais.'},413);
 let body;try{body=await request.json();}catch{return json({error:'Solicitação inválida.'},400);}
 const db=await adminDb(env),{action,generation}=body||{};
 if(!CENTRAL_GENERATION.test(generation||''))return json({error:'Geração inválida.'},400);
 if(action==='part'){const {name,part,data}=body;if(!CENTRAL_NAME.test(name||'')||!Number.isSafeInteger(part)||part<0||part>999||typeof data!=='string'||!data.length||data.length>1500000||!CENTRAL_BODY.test(data))return json({error:'Parte inválida.'},400);await db.prepare('INSERT OR REPLACE INTO central_parts(generation,name,part,body) VALUES(?,?,?,?)').bind(generation,name,part,data).run();return json({saved:true});}
 if(action==='commit'){const manifest=body.manifest;if(!manifest||typeof manifest!=='object'||!Object.keys(manifest).length||!Object.keys(manifest).every(k=>CENTRAL_NAME.test(k)&&Number.isSafeInteger(manifest[k]?.parts)&&manifest[k].parts>0))return json({error:'Manifesto inválido.'},400);const {results}=await db.prepare('SELECT name,COUNT(*) n FROM central_parts WHERE generation=? GROUP BY name').bind(generation).all(),found=Object.fromEntries(results.map(r=>[r.name,r.n]));for(const [k,v]of Object.entries(manifest))if(found[k]!==v.parts)return json({error:'Envio incompleto: '+k+'.'},409);const now=new Date().toISOString(),set=(k,v)=>db.prepare('INSERT OR REPLACE INTO central_meta(key,value) VALUES(?,?)').bind(k,String(v));await db.batch([set('generation',generation),set('updatedAt',now),set('manifest',JSON.stringify(manifest)),db.prepare('DELETE FROM central_parts WHERE generation<>?').bind(generation)]);return json({generation,updatedAt:now});}
 return json({error:'Ação desconhecida.'},400);
}catch(e){if(centralMissingTable(e))return json({error:'Aplique backend/central-schema.sql no D1 antes do primeiro envio.'},503);return json({error:e.status?e.message:'Envio temporariamente indisponível.'},e.status||503);}}

// D1 authorizes each password-authenticated data request and revokes devices.
const CAMPO_AUTH_APP_ORIGIN='https://mapeamento-arvores.pages.dev';
const CAMPO_SESSION_COOKIE='__Host-campo-session',CAMPO_SESSION_LIFE=400*86400000;
function fieldAuthenticationRequired(env){return env.FIELD_AUTH_REQUIRED!=='false';}
function authDB(env){if(!env.SHARED_DB)throw sharedError('Autenticação central indisponível.',503);return env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB;}
function authCookie(request,name){const found=(request.headers.get('Cookie')||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));return found.length===1?found[0].slice(name.length+1):'';}
function sessionCookie(name,value,age=34560000){return name+'='+value+'; Path=/; Max-Age='+age+'; Secure; HttpOnly; SameSite=Lax';}
async function authHash(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
function authRandom(){return b64(crypto.getRandomValues(new Uint8Array(32)));}
function authUser(row){return row?{id:row.id,email:row.email,name:row.name,role:row.role,username:row.username||''}:null;}
async function authenticatedOperator(request,env){const token=authCookie(request,CAMPO_SESSION_COOKIE);if(!/^[A-Za-z0-9_-]{43}$/.test(token))return null;const db=authDB(env),hash=await authHash(token),row=await db.prepare('SELECT u.*,c.username,s.token_hash,s.last_seen,s.expires_at FROM campo_user_sessions s JOIN campo_users u ON u.id=s.user_id LEFT JOIN campo_user_credentials c ON c.user_id=u.id WHERE s.token_hash=? AND u.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id)').bind(hash).first();return row?{user:authUser(row),session:row,token}:null;}
async function campoAuthStatus(request,env,identity,admin){if(request.method!=='GET')return json({error:'Use GET.'},405);const required=fieldAuthenticationRequired(env),out=json({required,authenticated:Boolean(identity),user:identity?.user||null,admin:Boolean(admin)});if(identity&&Date.now()-identity.session.last_seen>3600000){const now=Date.now();await authDB(env).prepare('UPDATE campo_user_sessions SET last_seen=?,expires_at=? WHERE token_hash=?').bind(now,now+CAMPO_SESSION_LIFE,identity.session.token_hash).run();out.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,identity.token));}return out;}
async function campoAuthLogout(request,env,identity){if(request.method!=='POST')return json({error:'Use POST.'},405);if(identity)await authDB(env).prepare('DELETE FROM campo_user_sessions WHERE token_hash=?').bind(identity.session.token_hash).run();const r=json({ok:true});r.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,'',0));r.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));return r;}
function normalizedPhone(value){const raw=String(value||'').trim();if(!raw)return null;let digits=raw.replace(/\D/g,'');if(!raw.startsWith('+')&&[10,11].includes(digits.length))digits='55'+digits;if(!/^[1-9]\d{9,14}$/.test(digits))throw sharedError('Celular inválido. Informe DDD e número.');return '+'+digits;}
async function campoManageUsers(request,env,identity,bootstrapAdmin){
 if(!bootstrapAdmin&&identity?.user.role!=='admin')return json({error:'Acesso restrito ao administrador.'},403);const db=authDB(env),actor=identity?.user.id||'admin-password';
 if(request.method==='GET'){const rows=await db.prepare('SELECT u.id,u.email,u.name,u.phone,u.role,u.blocked,u.revision,u.created_at,u.updated_at,l.deleted_at,c.username,(c.user_id IS NOT NULL) passwordConfigured,(SELECT MAX(s.last_seen) FROM campo_user_sessions s WHERE s.user_id=u.id) last_seen FROM campo_users u LEFT JOIN campo_user_credentials c ON c.user_id=u.id LEFT JOIN campo_user_lifecycle l ON l.user_id=u.id ORDER BY (l.deleted_at IS NOT NULL), u.blocked,u.name').all();return json({users:rows.results,loginMethod:'username_password',phoneAuthentication:false});}
 if(request.method!=='POST')return json({error:'Use GET ou POST.'},405);
 try{
 const b=await sharedBody(request,5000);
 if(b.action==='delete')return await campoDeleteUser(db,b,actor);
 if(b.action==='revoke'){if(typeof b.id!=='string')throw sharedError('Usuário inválido.');await db.batch([db.prepare('DELETE FROM campo_user_sessions WHERE user_id=?').bind(b.id),db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'revoke_sessions',?,'{}')").bind(b.id,actor,new Date().toISOString())]);return json({ok:true});}
 const name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),role=b.role,blocked=b.blocked===true?1:0,phone=normalizedPhone(b.phone),username=normalizedUsername(b.username);
 if(!name||name.length>100||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254||!['inspector','admin'].includes(role))throw sharedError('Informe nome, e-mail de contato válido e perfil.');
 const stamp=new Date().toISOString(),id=b.id||crypto.randomUUID();if(!sharedId(id))throw sharedError('Usuário inválido.');const old=b.id?await db.prepare('SELECT * FROM campo_users WHERE id=?').bind(id).first():null;
 const deleted=old?await db.prepare('SELECT user_id FROM campo_user_lifecycle WHERE user_id=?').bind(id).first():null;if(deleted&&b.action!=='restore')throw sharedError('Usuário excluído. Use Restaurar e defina uma nova senha.',409);if(!deleted&&b.action==='restore')throw sharedError('A conta não está excluída. Atualize a lista.',409);
 if(b.id&&(!old||b.revision!==old.revision))throw sharedError('Usuário alterado. Atualize a lista.',409);
 if(old&&old.email!==email)throw sharedError('Para mudar o e-mail de contato, cadastre uma nova conta e bloqueie a anterior.');
 const credential=old?await db.prepare('SELECT * FROM campo_user_credentials WHERE user_id=?').bind(id).first():null;
 if(!credential&&!b.password)throw sharedError('Defina a senha inicial do usuário.');const nextPassword=b.password?await campoPasswordRecord(b.password,env):{hash:credential.password_hash,salt:credential.salt};
 if(old?.role==='admin'&&!old.blocked&&(blocked||role!=='admin')){const n=await db.prepare("SELECT COUNT(*) n FROM campo_users WHERE role='admin' AND blocked=0 AND id<>?").bind(id).first();if(!n.n)throw sharedError('Cadastre outro administrador ativo antes de bloquear ou alterar o último administrador.',409);}
 const edit=old?db.prepare("UPDATE campo_users SET name=?,phone=?,role=?,blocked=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND (role<>'admin' OR blocked=1 OR (?=0 AND ?='admin') OR EXISTS(SELECT 1 FROM campo_users other WHERE other.role='admin' AND other.blocked=0 AND other.id<>campo_users.id)) AND COALESCE((SELECT revision FROM campo_user_credentials WHERE user_id=campo_users.id),0)=?").bind(name,phone,role,blocked,stamp,id,b.revision,blocked,role,credential?.revision||0):db.prepare('INSERT INTO campo_users(id,email,name,phone,role,blocked,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)').bind(id,email,name,phone,role,blocked,stamp,stamp);
 const credentialEdit=db.prepare('INSERT INTO campo_user_credentials(user_id,username,password_hash,salt,revision,updated_at) SELECT ?,?,?,?,1,? WHERE changes()=1 ON CONFLICT(user_id) DO UPDATE SET username=excluded.username,password_hash=excluded.password_hash,salt=excluded.salt,revision=campo_user_credentials.revision+1,updated_at=excluded.updated_at WHERE campo_user_credentials.revision=?').bind(id,username,nextPassword.hash,nextPassword.salt,stamp,credential?.revision||0);
 const revoke=blocked||old?.role!==role||Boolean(b.password)||Boolean(credential&&credential.username!==username),result=await db.batch([edit,credentialEdit,db.prepare('DELETE FROM campo_user_sessions WHERE user_id=? AND ?=1 AND EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,revoke?1:0,id,(old?.revision||0)+1,stamp),db.prepare('INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,actor,old?'update_user':'create_user',stamp,JSON.stringify({email,username,role,blocked:Boolean(blocked),passwordChanged:Boolean(b.password)}),id,(old?.revision||0)+1,stamp)]);
 if(!result[0].meta.changes||!result[1].meta.changes)throw sharedError('Usuário alterado. Atualize a lista.',409);
 if(deleted){await db.prepare('DELETE FROM campo_user_lifecycle WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_users WHERE id=? AND revision=? AND updated_at=?)').bind(id,id,(old?.revision||0)+1,stamp).run();await db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'restore_user',?,'{}')").bind(id,actor,stamp).run();}
 if(blocked)await db.prepare('UPDATE campo_presence SET active=0 WHERE session_id IN (SELECT session_id FROM campo_presence_identities WHERE user_id=?)').bind(id).run();return json({ok:true,id,passwordChanged:Boolean(b.password)});
 }catch(e){return json({error:e.status?e.message:/UNIQUE|constraint/i.test(e.message)?'Usuário, e-mail ou celular já cadastrado. Revise a conta existente.':'Não foi possível salvar o usuário.'},e.status||400);}
}

// Account removal preserves inspection authorship; credentials and sessions are revoked.
async function campoDeleteUser(db,body,actor){
 if(!sharedId(body.id)||!Number.isSafeInteger(body.revision)||body.confirmation!=='EXCLUIR')throw sharedError('Confirme a exclusão do usuário selecionado.');
 const stamp=new Date().toISOString(),operation=crypto.randomUUID();
 const result=await db.batch([
  db.prepare("INSERT OR IGNORE INTO campo_user_lifecycle(user_id,deleted_at,deleted_by,operation_id) SELECT u.id,?,?,? FROM campo_users u WHERE u.id=? AND u.revision=? AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id) AND (u.role<>'admin' OR u.blocked=1 OR EXISTS(SELECT 1 FROM campo_users other WHERE other.id<>u.id AND other.role='admin' AND other.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=other.id)))").bind(stamp,actor,operation,body.id,body.revision),
  db.prepare('UPDATE campo_users SET blocked=1,revision=revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(stamp,body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_credentials WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0 WHERE session_id IN (SELECT session_id FROM campo_presence_identities WHERE user_id=?) AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT user_id,?,'delete_user',?,'{}' FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?").bind(actor,stamp,body.id,operation)
 ]);
 if(!result[0].meta.changes)throw sharedError('Não foi possível excluir: conta alterada, já excluída ou último administrador ativo. Atualize a lista.',409);
 return json({ok:true,deleted:true,id:body.id});
}

// Worker-native password hashing: per-user salt, PBKDF2 platform cap and secret HMAC pepper.
const CAMPO_PASSWORD_ITERATIONS=100000;
function normalizedUsername(value){const username=String(value||'').trim().toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username))throw sharedError('Usuário: use de 3 a 50 letras sem acento, números, ponto, hífen ou sublinhado.');return username;}
function validateCampoPassword(value){if(typeof value!=='string'||value.length<12||value.length>128||!value.trim())throw sharedError('Use uma senha de 12 a 128 caracteres. Uma frase com várias palavras facilita lembrar.');return value;}
async function campoPasswordHash(password,salt,env){
 const pepper=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
 const prepared=await crypto.subtle.sign('HMAC',pepper,new TextEncoder().encode('campo-password-v1\0'+password));
 const key=await crypto.subtle.importKey('raw',prepared,'PBKDF2',false,['deriveBits']);
 return b64(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unb64(salt),iterations:CAMPO_PASSWORD_ITERATIONS},key,256)));
}
async function campoPasswordRecord(password,env){validateCampoPassword(password);const salt=b64(crypto.getRandomValues(new Uint8Array(16)));return {salt,hash:await campoPasswordHash(password,salt,env)};}
async function checkCampoPassword(password,credential,env){const candidate=await campoPasswordHash(String(password||''),credential?.salt||'AAAAAAAAAAAAAAAAAAAAAA',env);return Boolean(credential)&&await equalSecret(candidate,credential.password_hash);}
async function campoPasswordRateLimit(request,env,login){
 const db=authDB(env),now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown',keys=[['password-ip:'+await authHash(ip),60000,10],['password-user:'+await authHash(login),900000,10]];
 for(const [key,life,limit]of keys){const row=await db.prepare('INSERT INTO campo_password_limits(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count').bind(key,now+life,now,now).first();if(row.count>limit)throw sharedError('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.',429);}
 await db.prepare('DELETE FROM campo_password_limits WHERE key IN (SELECT key FROM campo_password_limits WHERE reset_at<? LIMIT 100)').bind(now).run();
}
async function campoCreateUserSession(db,row,env,expectedCredentialRevision,oldSession){
 const token=authRandom(),hash=await authHash(token),now=Date.now(),queries=[];
 if(oldSession)queries.push(db.prepare('DELETE FROM campo_user_sessions WHERE token_hash=?').bind(oldSession));
 const index=queries.length;
 queries.push(db.prepare('INSERT INTO campo_user_sessions(token_hash,user_id,created_at,last_seen,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.revision=? AND u.blocked=0 AND c.revision=? AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id))').bind(hash,row.id,now,now,now+CAMPO_SESSION_LIFE,row.id,row.revision,expectedCredentialRevision));
 queries.push(db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT ?,?,'login',?,'{\"method\":\"password\"}' WHERE EXISTS(SELECT 1 FROM campo_user_sessions WHERE token_hash=?)").bind(row.id,row.id,new Date(now).toISOString(),hash));
 const result=await db.batch(queries);if(!result[index].meta.changes)throw sharedError('Conta alterada ou bloqueada. Entre novamente.',401);
 const out=json({ok:true,user:authUser(row),admin:row.role==='admin'});out.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,token));return out;
}
async function campoPasswordLogin(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const b=await sharedBody(request,3000),login=String(b.username||'').trim().toLowerCase(),password=b.password;
 if(!login||login.length>254||typeof password!=='string'||password.length>128)return json({error:'Usuário ou senha incorretos.'},401);
 await campoPasswordRateLimit(request,env,login);const db=authDB(env),row=await db.prepare('SELECT u.*,c.username,c.password_hash,c.salt,c.revision credential_revision FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE (c.username=? COLLATE NOCASE OR u.email=? COLLATE NOCASE) AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id)').bind(login,login).first();
 if(!await checkCampoPassword(password,row,env)||row.blocked)return json({error:'Usuário ou senha incorretos.'},401);
 return campoCreateUserSession(db,row,env,row.credential_revision,authCookie(request,CAMPO_SESSION_COOKIE)?await authHash(authCookie(request,CAMPO_SESSION_COOKIE)):null);
}
async function campoChangePassword(request,env,identity){
 if(request.method!=='POST')return json({error:'Use POST.'},405);if(!identity)return json({error:'Entre para alterar sua senha.'},401);
 const b=await sharedBody(request,3000),db=authDB(env);validateCampoPassword(b.newPassword);await campoPasswordRateLimit(request,env,identity.user.email);
 const old=await db.prepare('SELECT * FROM campo_user_credentials WHERE user_id=?').bind(identity.user.id).first();if(!await checkCampoPassword(b.currentPassword,old,env))return json({error:'Senha atual incorreta.'},400);
 const updated=await campoPasswordRecord(b.newPassword,env),stamp=new Date().toISOString();
 const result=await db.batch([db.prepare('UPDATE campo_user_credentials SET password_hash=?,salt=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=?').bind(updated.hash,updated.salt,stamp,identity.user.id,old.revision),db.prepare('DELETE FROM campo_user_sessions WHERE user_id=?').bind(identity.user.id),db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) VALUES(?,?,'change_password',?,'{}')").bind(identity.user.id,identity.user.id,stamp)]);
 if(!result[0].meta.changes)throw sharedError('Senha alterada em outra sessão. Entre novamente.',409);
 const row=await db.prepare('SELECT u.*,c.username FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.blocked=0').bind(identity.user.id).first();if(!row)throw sharedError('Conta indisponível.',401);return campoCreateUserSession(db,row,env,old.revision+1,null);
}

// Public requests never authorize an account. Only an administrator can approve.
const CAMPO_REQUEST_RECEIVED='Solicitação recebida. Aguarde a liberação do administrador e o administrador definirá seu usuário e senha.';
async function campoRequestAccess(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const b=await sharedBody(request,3000),name=String(b.name||'').trim(),email=String(b.email||'').trim().toLowerCase(),phone=normalizedPhone(b.phone);
 if(!name||name.length>100||email.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(email))throw sharedError('Informe seu nome e um e-mail válido.');
 const now=Date.now(),ip=request.headers.get('CF-Connecting-IP')||'unknown',guard='access-request:'+await authHash(ip)+':'+Math.floor(now/3600000),tries=Number(await env.LOGIN_GUARD.get(guard)||0);
 if(tries>=10)throw sharedError('Muitas solicitações. Aguarde antes de tentar novamente.',429);
 await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:7200});
 const db=authDB(env),stamp=new Date(now).toISOString();
 // Unique email + OR IGNORE: retries do not flood the inbox or revive rejected/blocked accounts.
 await db.prepare("INSERT OR IGNORE INTO campo_access_requests(id,email,name,phone,status,revision,created_at,updated_at) SELECT ?,?,?,?,'pending',1,?,? WHERE NOT EXISTS(SELECT 1 FROM campo_users WHERE email=? COLLATE NOCASE) AND (SELECT COUNT(*) FROM campo_access_requests)<5000").bind(crypto.randomUUID(),email,name,phone,stamp,stamp,email).run();
 // Same response for existing, blocked and unknown accounts; no account enumeration.
 return json({ok:true,message:CAMPO_REQUEST_RECEIVED},202);
}
async function campoManageAccessRequests(request,env,identity,bootstrapAdmin){
 if(!bootstrapAdmin&&identity?.user.role!=='admin')return json({error:'Acesso restrito ao administrador.'},403);
 const db=authDB(env),actor=identity?.user.id||'admin-password';
 if(request.method==='GET'){
  const u=new URL(request.url),offset=Number(u.searchParams.get('offset')||0),reviewed=u.searchParams.get('status')==='reviewed';
  if(!Number.isSafeInteger(offset)||offset<0||offset>5000)throw sharedError('Página inválida.');
  if(u.searchParams.get('summary')==='1'){const row=await db.prepare("SELECT COUNT(*) pending,(SELECT id FROM campo_access_requests WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 1) latestId FROM campo_access_requests WHERE status='pending'").first();return json({pending:row.pending||0,latestId:row.latestId||null});}
  const where=reviewed?"status<>'pending'":"status='pending'",rows=await db.prepare('SELECT id,email,name,phone,status,revision,created_at,updated_at,reviewed_at FROM campo_access_requests WHERE '+where+' ORDER BY created_at DESC,id LIMIT 50 OFFSET ?').bind(offset).all(),counts=await db.prepare("SELECT COUNT(*) total,SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) pending,(SELECT id FROM campo_access_requests WHERE status='pending' ORDER BY created_at DESC,id DESC LIMIT 1) latestId FROM campo_access_requests").first();
  const pending=counts.pending||0,total=reviewed?counts.total-pending:pending;return json({requests:rows.results,pending,latestId:counts.latestId||null,total,offset,nextOffset:offset+50<total?offset+50:null});
 }
 if(request.method!=='POST')return json({error:'Use GET ou POST.'},405);
 const b=await sharedBody(request,2000);if(!sharedId(b.id)||!Number.isSafeInteger(b.revision)||!['approve','reject'].includes(b.action))throw sharedError('Solicitação inválida.');
 const current=await db.prepare('SELECT * FROM campo_access_requests WHERE id=?').bind(b.id).first();
 if(!current||current.status!=='pending'||current.revision!==b.revision)throw sharedError('Solicitação já analisada. Atualize a lista.',409);
 const stamp=new Date().toISOString(),decision=b.action==='approve'?'approved':'rejected',queries=[];
 if(decision==='approved'){
  const existing=await db.prepare('SELECT u.id,u.blocked,c.username FROM campo_users u LEFT JOIN campo_user_credentials c ON c.user_id=u.id WHERE email=? COLLATE NOCASE').bind(current.email).first();
  if(existing?.blocked)throw sharedError('Esta conta está bloqueada. Revise o cadastro de usuários antes de liberar.',409);
  // Existing active credentials are not changed by approving a request.
  if(existing&&!existing.username)throw sharedError('Defina o usuário e a senha desta conta no cadastro de usuários antes de aprovar.',409);
  if(!existing){
   const username=normalizedUsername(b.username),password=await campoPasswordRecord(b.password,env),id=crypto.randomUUID();
   if(current.phone&&await db.prepare('SELECT id FROM campo_users WHERE phone=?').bind(current.phone).first())throw sharedError('Celular já associado a outra conta. Revise o contato.',409);
   queries.push(db.prepare("INSERT INTO campo_users(id,email,name,phone,role,blocked,created_at,updated_at) SELECT ?,email,name,phone,'inspector',0,?,? FROM campo_access_requests WHERE id=? AND status='pending' AND revision=?").bind(id,stamp,stamp,b.id,b.revision));
   queries.push(db.prepare('INSERT INTO campo_user_credentials(user_id,username,password_hash,salt,revision,updated_at) SELECT ?,?,?,?,1,? WHERE changes()=1').bind(id,username,password.hash,password.salt,stamp));
  }
 }

 const index=queries.length;
 queries.push(db.prepare("UPDATE campo_access_requests SET status=?,revision=revision+1,updated_at=?,reviewed_at=?,reviewed_by=? WHERE id=? AND status='pending' AND revision=? AND (?='rejected' OR EXISTS(SELECT 1 FROM campo_users WHERE email=campo_access_requests.email COLLATE NOCASE AND blocked=0))").bind(decision,stamp,stamp,actor,b.id,b.revision,decision));
 queries.push(db.prepare('INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT (SELECT id FROM campo_users WHERE email=r.email COLLATE NOCASE),?,?,?,? FROM campo_access_requests r WHERE id=? AND revision=? AND status=? AND reviewed_by=? AND reviewed_at=?').bind(actor,'access_request_'+decision,stamp,JSON.stringify({requestId:b.id,email:current.email}),b.id,b.revision+1,decision,actor,stamp));
 let results;try{results=await db.batch(queries);}catch(e){if(/UNIQUE|constraint/i.test(e.message))throw sharedError('Usuário, e-mail ou celular já cadastrado. Atualize a lista e revise.',409);throw e;}if(!results[index].meta.changes)throw sharedError('A solicitação mudou. Atualize a lista antes de continuar.',409);
 return json({ok:true,status:decision});
}

const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);let diff=0;const xx=new Uint8Array(x),yy=new Uint8Array(y);for(let i=0;i<xx.length;i++)diff|=xx[i]^yy[i];return diff===0;}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issueSession(env){const payload=b64(encoder.encode(JSON.stringify({role:'admin',exp:Math.floor(Date.now()/1000)+28800,aud:env.APP_ORIGIN}))),sig=await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(sig));}
async function validSession(token,env){try{if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return false;const [payload,sig,extra]=token.split('.');if(extra||!payload||!sig)return false;const okay=await crypto.subtle.verify('HMAC',await sessionKey(env),unb64(sig),encoder.encode(payload));if(!okay)return false;const data=JSON.parse(new TextDecoder().decode(unb64(payload)));return data.role==='admin'&&data.aud===env.APP_ORIGIN&&data.exp>Math.floor(Date.now()/1000);}catch{return false;}}
export default {async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await runRepositoryInventory(env);await runAuthorizedRepositoryCleanup(env);})());},async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(['/api/auth/keys','/api/auth/evaluate','/api/auth/complete'].includes(path))return json({error:'O login por e-mail foi substituído por usuário e senha.'},410);
 const origin=request.headers.get('Origin'),url=new URL(request.url);const allowed=[env.APP_ORIGIN,...String(env.APP_ADDITIONAL_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)];const cors=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campo-Access','Vary':'Origin'}:{};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!allowed.includes(origin))return response({error:'Origem não autorizada.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<14||!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32||!env.LOGIN_GUARD)return response({error:'Configure administrador e LOGIN_GUARD no Worker.'},503);
 if(path==='/api/vera/sync'){const out=await veraSync(request,env);for(const [k,v]of Object.entries(cors))out.headers.set(k,v);return out;}
 if(path==='/api/central/sync'){const out=await centralSync(request,env);for(const [k,v]of Object.entries(cors))out.headers.set(k,v);return out;}
 // The password is retained for initial administrator provisioning and recovery.
 if(url.pathname==='/api/admin/login'){
  if(request.method!=='POST')return response({error:'Use POST.'},405);if(Number(request.headers.get('content-length')||0)>2048)return response({error:'Solicitação grande demais.'},413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',hash=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(ip)))),bucket=Math.floor(Date.now()/60000),guard='login:'+hash+':'+bucket;const tries=Number(await env.LOGIN_GUARD.get(guard)||0);if(tries>=5)return response({error:'Muitas tentativas. Aguarde um minuto.'},429);try{await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:120});}catch{return response({error:'Aguarde alguns segundos antes de tentar entrar novamente.'},429);}
  let data;try{const raw=await request.text();if(raw.length>2048)return response({error:'Solicitação inválida.'},413);data=JSON.parse(raw);}catch{return response({error:'Solicitação inválida.'},400);}
  if(!await equalSecret(String(data.password||''),env.ADMIN_PASSWORD))return response({error:'Senha incorreta.'},401);const token=await issueSession(env),out=response({token,expiresIn:28800});out.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery',token,28800));return out;
 }
 if(path==='/api/admin/logout'){if(request.method!=='POST')return response({error:'Use POST.'},405);const out=response({ok:true});out.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));return out;}
 let identity=null;try{identity=await authenticatedOperator(request,env);}catch{if(fieldAuthenticationRequired(env))return response({error:'Autenticação central indisponível. Seus cadastros locais foram preservados.'},503);}
 const bootstrapAdmin=await validSession((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env)||await validSession(authCookie(request,'__Host-campo-admin-recovery'),env);
 let authResult=null;
 try{if(path==='/api/auth/start')authResult=new Response(null,{status:303,headers:{Location:CAMPO_AUTH_APP_ORIGIN+'/?login=senha','Cache-Control':'no-store'}});
 else if(path==='/api/auth/login'){authResult=await campoPasswordLogin(request,env);if(authResult.ok)authResult.headers.append('Set-Cookie',sessionCookie('__Host-campo-admin-recovery','',0));}
 else if(path==='/api/auth/password')authResult=await campoChangePassword(request,env,identity);
 else if(path==='/api/auth/status')authResult=await campoAuthStatus(request,env,identity,bootstrapAdmin||identity?.user.role==='admin');
 else if(path==='/api/auth/logout')authResult=await campoAuthLogout(request,env,identity);
 else if(path==='/api/auth/request-access')authResult=await campoRequestAccess(request,env);
 else if(path==='/api/admin/access-requests')authResult=await campoManageAccessRequests(request,env,identity,bootstrapAdmin);
 else if(path==='/api/admin/users')authResult=await campoManageUsers(request,env,identity,bootstrapAdmin);
 else if(path==='/api/access')authResult=response({admin:Boolean(bootstrapAdmin||identity?.user.role==='admin'),authenticated:Boolean(identity),user:identity?.user||null,required:fieldAuthenticationRequired(env)});
 }catch(e){authResult=response({error:e.status?e.message:'Não foi possível concluir a autenticação.'},e.status||503);}
 if(authResult){for(const [k,v]of Object.entries(cors))authResult.headers.set(k,v);return authResult;}
 if(fieldAuthenticationRequired(env)&&!identity&&!bootstrapAdmin)return response({error:'Entre com seu usuário e senha para acessar os dados compartilhados.',code:'AUTH_REQUIRED'},401);
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-'))headers.delete(key);headers.set('Origin',url.origin);
 const admin=bootstrapAdmin||identity?.user.role==='admin';headers.delete('Authorization');if(admin){headers.set('oai-authenticated-user-id','external-admin');headers.set('oai-authenticated-user-email',env.CAMPO_ADMIN_EMAIL||'administrador@campo.local');}
 const result=await internalApp.fetch(new Request(request,{headers}),{...env,CAMPO_ADMIN_EMAIL:env.CAMPO_ADMIN_EMAIL||'administrador@campo.local',CAMPO_USER:identity?.user||null,CAMPO_DEVICE_SESSION:identity?{hash:identity.session.token_hash,token:identity.token}:null});const output=new Response(result.body,result);for(const [k,v]of Object.entries(cors))output.headers.set(k,v);output.headers.set('Cache-Control','no-store');return output;
}};
