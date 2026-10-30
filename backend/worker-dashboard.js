const ASSETS={};
(function(root){'use strict';
function numeric(value){return (typeof value==='number'||typeof value==='string')&&value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value));}
function missing(r){const out=[];const add=(field,label)=>out.push({field,label});if(!String(r.inspector||'').trim())add('inspector','Inspetor');if(!String(r.feeder||'').trim())add('feeder','Alimentador / localidade');if(!numeric(r.lat)||Math.abs(Number(r.lat))>90)add('lat','Latitude válida');if(!numeric(r.lon)||Math.abs(Number(r.lon))>180)add('lon','Longitude válida');if(!r.photos?.some(p=>typeof p.original==='string'&&p.original.trim()))add('photos','Ao menos uma foto');if(!numeric(r.height)||Number(r.height)<=0)add('height','Altura da árvore');const network=['mt','bt','at'].filter(k=>r[k]===true||r[k]==='sim');if(network.length&&!String(r.pole||'').trim())add('pole','ID do poste');if(network.includes('mt')&&!String(r.span||'').trim())add('span','ID do vão MT');for(const k of network)if(!numeric(r[k+'Distance'])||Number(r[k+'Distance'])<0)add(k+'Distance','Distância copa → '+k.toUpperCase());return out;}
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
let activeDriveRequests=0;
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
 if(activeDriveRequests>=2)return json({error:'Envio ocupado. Tente novamente em alguns segundos.'},429);
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
 activeDriveRequests++;const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),85000);
 try{
  const result=await fetch(endpoint,{method:'POST',redirect:'follow',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:secret}),signal:abort.signal});
  if(!result.ok)return json({error:'Receptor Google indisponível. Confira a implantação e tente novamente.'},502);
  let data;try{data=await result.json();}catch(e){return json({error:'Google retornou uma página de login. Implante como “Eu”, com acesso “Qualquer pessoa”, e use a URL /exec.'},502);}
  if(!data.ok){const errors={AUTH:'Chave da integração Google incorreta. Avise o responsável.',BUSY:'Google ocupado. Tente novamente.',CONFLICT:'Arquivo diferente nesta versão. Edite e salve a inspeção antes de reenviar.',SIZE:'Arquivo excede 20 MB.',INVALID:'Google recusou o formato.',VERIFY:'Google não confirmou o arquivo.',DELETED:'Inspeção excluída pelo administrador. Não será reenviada.',GOOGLE:'Google não concluiu o envio. Confira espaço, permissões e cotas no Apps Script.'};const code=typeof data.code==='string'&&/^[A-Z_]{1,40}$/.test(data.code)?data.code:'RECEIVER_ERROR';let detail=String(data.error||'Sem detalhe fornecido pelo receptor').slice(0,400);detail=detail.split(secret).join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').replace(/[\w.+-]+@[\w.-]+/g,'[conta]');console.warn(JSON.stringify({event:'drive_receiver_error',code,detail,action:payload.action}));return json({error:errors[data.code]||'O receptor Google recusou o envio (código '+code+'). Confira a execução no Apps Script.',code,retryable:['BUSY','GOOGLE','RECEIVER_ERROR'].includes(code)},data.code==='BUSY'?429:502);}
  if(status)return json({configured:true,connected:true,folderName:String(data.folderName||'Pasta de inspeções'),consolidation:data.consolidation===true,management:data.management===true,deletedIds:Array.isArray(data.deletedIds)?data.deletedIds:[],consolidatedUrl:adminView?consolidatedLink(data.consolidatedUrl):null});
  if(consolidate){if(data.consolidated!==true||data.recordId!==payload.recordId||data.version!==payload.version)return json({error:'O receptor não confirmou o ID e a versão do cadastro no Excel único. Os arquivos da inspeção são conferidos separadamente.'},502);return json({consolidated:true,version:data.version,url:isAdministrator(request,env)?consolidatedLink(data.url):null,count:isAdministrator(request,env)?data.count:undefined});}
  if(typeof data.id!=='string'||!Number.isFinite(data.size)||! /^[a-f0-9]{64}$/.test(data.sha256||'')||typeof data.folderId!=='string')return json({error:'Confirmação incompleta do Google. Arquivo continua pendente.'},502);
  return json({id:data.id,size:data.size,sha256:data.sha256,folderId:data.folderId,folderUrl:typeof data.folderUrl==='string'&&data.folderUrl.startsWith('https://drive.google.com/')?data.folderUrl:null});
 }catch(e){return json({error:e.name==='AbortError'?'Google excedeu o tempo de resposta. Reenvie para verificar os arquivos pendentes.':'Falha de conexão com Google. Tente novamente.'},504);}finally{clearTimeout(timer);activeDriveRequests--;}
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
 if(activeDriveRequests>=2)return json({error:'Conexão ocupada. Tente novamente.'},429);
 let payload={action:'network_manifest'};
 if(chunk){const offset=Number(url.searchParams.get('offset')),revision=url.searchParams.get('revision');if(!Number.isSafeInteger(offset)||offset<0||!revision||revision.length>200)return json({error:'Bloco inválido.'},400);payload={action:'network_chunk',offset,revision};}
 activeDriveRequests++;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),85000);
 try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,token:env.GOOGLE_SCRIPT_TOKEN}),signal:controller.signal});
  const data=await r.json();if(!r.ok||!data.ok){const errors={REDE_ACCESS:'O receptor não conseguiu acessar a rede privada. Execute configurarRedeCampo no Apps Script.',REDE_FORMAT:'A origem deve ser GPKG ou ZIP contendo GPKG.',REDE_CHANGED:'A rede mudou durante o download. Tente novamente.',REDE_RANGE:'Google não confirmou o bloco da rede.'};return json({error:errors[data.code]||'Atualize o receptor Google na Administração para habilitar a rede central.'},502);}
  if(!chunk){const m=data.network;if(m?.fileId!==env.REDE_CAMPO_ID||!Number.isSafeInteger(m.size)||m.size<1||!/[.](gpkg|zip)$/i.test(m.name||'')||typeof m.revision!=='string')return json({error:'Atualize o receptor Google na Administração para habilitar a rede central.'},502);return json(m);}
  if(data.offset!==payload.offset||data.revision!==payload.revision||typeof data.base64!=='string'||data.base64.length>5600000||!/^[A-Za-z0-9+/]*={0,2}$/.test(data.base64))return json({error:'Bloco não confirmado. Base local preservada.'},502);
  return new Response(Uint8Array.from(atob(data.base64),c=>c.charCodeAt(0)),{headers:{'Content-Type':'application/octet-stream','Cache-Control':'no-store'}});
 }catch{return json({error:'Rede central indisponível. Confira a implantação do receptor; a base local continua disponível.'},502);}finally{clearTimeout(timer);activeDriveRequests--;}
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
 if(raw.inspectionTiming&&typeof raw.inspectionTiming==='object'&&JSON.stringify(raw.inspectionTiming).length<4000)out.inspectionTiming=JSON.parse(JSON.stringify(raw.inspectionTiming));
 out.imported=imported||raw.imported===true;out.lastInspector=actor;
 return out;
}
async function sharedPhoto(photo){
 if(!sharedId(photo.assetId)||typeof photo.image!=='string'||photo.image.length>480000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(photo.image))throw sharedError('Foto compartilhada inválida ou grande demais.');
 const bytes=Uint8Array.from(atob(photo.image.split(',')[1]),c=>c.charCodeAt(0));const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(photo.sha256!==hash)throw sharedError('Conteúdo da foto não confirmado.');return photo;
}
async function sharedSave(db,body,actor,imported=false){
 const data=sharedData(body.record,actor,imported),id=data.id,expected=body.baseVersion;
 if(!Number.isSafeInteger(expected)||expected<0||!sharedId(body.operationId))throw sharedError('Versão e identificador da operação obrigatórios.');
 const old=await sharedRead(db,id);
 if(old?.deleted)throw sharedError('Árvore excluída pelo administrador. O cadastro não será recriado.',410);
 if(old?.last_op===body.operationId)return sharedView(old);
 if((old?.version||0)!==expected)throw sharedError('Outra pessoa atualizou esta árvore. Reabra a versão mais recente antes de salvar suas alterações.',409);
 const uploads=body.uploads||[];if(!Array.isArray(uploads)||uploads.length>12)throw sharedError('Envie no máximo 12 fotos por cadastro.');
 const photos=body.record.photos||[];if(!Array.isArray(photos)||photos.length>12)throw sharedError('Limite de 12 fotos na base compartilhada.');
 const uploadMap=new Map();for(const p of uploads){await sharedPhoto(p);uploadMap.set(p.assetId,p);}
 for(const p of photos){if(!sharedId(p.id)||!sharedId(p.assetId))throw sharedError('Referência de foto inválida.');
  if(!uploadMap.has(p.assetId)&&!await db.prepare('SELECT asset_id FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,p.assetId).first())throw sharedError('Foto ainda não recebida. Tente sincronizar novamente.');
  data.photos.push({id:p.id,assetId:p.assetId,name:String(p.name||'foto.jpg').slice(0,180),receivedAt:p.receivedAt||data.updatedAt,identify:p.identify===true,organ:String(p.organ||'auto').slice(0,20)});
 }
 const stamp=new Date().toISOString(),version=expected+1;
 const statement=old?db.prepare('UPDATE shared_trees SET data=?,version=?,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0').bind(JSON.stringify(data),version,stamp,body.operationId,actor,id,expected):db.prepare('INSERT OR IGNORE INTO shared_trees(id,data,version,updated_at,last_op,actor) VALUES(?,?,1,?,?,?)').bind(id,JSON.stringify(data),stamp,body.operationId,actor);
 const statements=[statement];for(const p of uploads)statements.push(db.prepare('INSERT OR IGNORE INTO shared_photos(tree_id,asset_id,image) SELECT ?,?,? WHERE EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(id,p.assetId,p.image,id,body.operationId));
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
 const tree=await sharedRead(db,body.treeId);if(!tree||tree.deleted)throw sharedError('Árvore não disponível.',410);if(tree.version!==body.baseVersion)throw sharedError('A árvore mudou. Atualize o mapa antes de solicitar exclusão.',409);if(tree.pending)throw sharedError('Esta árvore já tem solicitação pendente.',409);
 const e=body.evidence,actor=String(body.actor||'').trim().slice(0,120),reason=String(body.reason||'').trim().slice(0,2000);
 if(!actor||!reason||!e||!sharedCoordinate(e.lat,90)||!sharedCoordinate(e.lon,180)||!Number.isFinite(e.accuracy)||e.accuracy<0||!Number.isFinite(Date.parse(e.capturedAt)))throw sharedError('Foto, motivo, inspetor e GPS da evidência são obrigatórios.');
 if(!Number.isFinite(Date.parse(e.gpsTimestamp))||Math.abs(Date.parse(e.capturedAt)-Date.parse(e.gpsTimestamp))>120000)throw sharedError('Capture o GPS junto com a foto.');
 await sharedPhoto({assetId:body.id,image:e.original,sha256:e.sha256});if(typeof e.annotated!=='string'||e.annotated.length>650000||!/^data:image\/jpeg;base64,\/9j\/[A-Za-z0-9+/=]+$/.test(e.annotated))throw sharedError('Foto georreferenciada obrigatória.');
 const now=new Date().toISOString(),evidence={original:e.original,annotated:e.annotated,sha256:e.sha256,lat:Number(e.lat),lon:Number(e.lon),accuracy:e.accuracy,capturedAt:e.capturedAt,gpsTimestamp:e.gpsTimestamp,address:String(e.address||'').slice(0,1000),addressPending:!e.address,treeLat:JSON.parse(tree.data).lat,treeLon:JSON.parse(tree.data).lon,receivedAt:now};
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET pending=?,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND deleted=0 AND pending IS NULL').bind(body.id,now,body.id,actor,tree.id,body.baseVersion),
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
 const tree=await sharedRead(db,row.tree_id);if(!tree||tree.pending!==row.id)throw sharedError('Pedido não corresponde ao cadastro atual.',409);
 if(body.decision==='approve'&&tree.version!==row.tree_version)throw sharedError('A árvore foi editada após a evidência. Rejeite este pedido e solicite uma nova avaliação.',409);
 const now=new Date().toISOString(),approved=body.decision==='approve',operation=crypto.randomUUID();
 const result=await db.batch([
 db.prepare('UPDATE shared_trees SET deleted=?,pending=NULL,version=version+1,updated_at=?,last_op=?,actor=? WHERE id=? AND version=? AND pending=?').bind(approved?1:0,now,operation,'Administrador',tree.id,tree.version,row.id),
 db.prepare('UPDATE shared_deletions SET status=?,reviewed_at=?,reviewer_note=? WHERE id=? AND status=\'pending\' AND EXISTS(SELECT 1 FROM shared_trees WHERE id=? AND last_op=?)').bind(approved?'approved':'rejected',now,String(body.note||'').slice(0,2000),row.id,tree.id,operation)]);
 if(!result[0].meta.changes)throw sharedError('Cadastro alterado durante a análise. Atualize e revise.',409);
 const archiveStatus=approved?await sharedArchiveCleanup(db,row.id,env):'not_requested';return {id:row.id,status:approved?'approved':'rejected',tree:sharedView(await sharedRead(db,tree.id)),archiveStatus};
}
async function sharedAPI(request,env){
 if(!env.SHARED_DB)return json({error:'Base compartilhada ainda não configurada.'},503);
 const db=env.SHARED_DB.withSession?env.SHARED_DB.withSession('first-primary'):env.SHARED_DB,url=new URL(request.url),path=url.pathname;
 try{
  if(request.method==='GET'&&path==='/api/shared/changes'){const after=Number(url.searchParams.get('after')||0);if(!Number.isSafeInteger(after)||after<0)throw sharedError('Cursor inválido.');const r=await db.prepare('SELECT * FROM shared_changes WHERE seq>? ORDER BY seq LIMIT 201').bind(after).all(),rows=r.results.slice(0,200);return json({changes:rows.map(r=>({seq:r.seq,tree:sharedView(r)})),next:rows.at(-1)?.seq||after,hasMore:r.results.length>200});}
  if(request.method==='GET'&&path==='/api/shared/tree'){const id=url.searchParams.get('id');if(!sharedId(id))throw sharedError('ID inválido.');const r=await sharedRead(db,id);if(!r)throw sharedError('Árvore não encontrada.',404);const out=sharedView(r);if(!r.deleted){const refs=out.photos.map(p=>p.assetId);const photos=refs.length?await db.prepare('SELECT asset_id,image FROM shared_photos WHERE tree_id=? AND asset_id IN ('+refs.map(()=>'?').join(',')+')').bind(id,...refs).all():{results:[]};const assets=new Map(photos.results.map(p=>[p.asset_id,p.image]));out.photos=out.photos.map(p=>({...p,original:assets.get(p.assetId)||'',sharedDerivative:true}));}return json({tree:out});}
  if(request.method==='POST'&&path==='/api/shared/save'){const body=await sharedBody(request),actor=String(body.actor||'').trim().slice(0,120);if(!actor)throw sharedError('Informe o nome do inspetor.');return json({tree:await sharedSave(db,body,actor)});}
  if(request.method==='POST'&&path==='/api/shared/address'){const b=await sharedBody(request,1024);if(!sharedCoordinate(b.lat,90)||!sharedCoordinate(b.lon,180))throw sharedError('Coordenadas inválidas.');return json(await sharedAddress(db,b.lat,b.lon));}
  if(request.method==='POST'&&path==='/api/shared/deletion-request')return json(await sharedRequestDelete(db,await sharedBody(request,1300000)));
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

const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);let diff=0;const xx=new Uint8Array(x),yy=new Uint8Array(y);for(let i=0;i<xx.length;i++)diff|=xx[i]^yy[i];return diff===0;}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issueSession(env){const payload=b64(encoder.encode(JSON.stringify({role:'admin',exp:Math.floor(Date.now()/1000)+28800,aud:env.APP_ORIGIN}))),sig=await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(sig));}
async function validSession(token,env){try{if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return false;const [payload,sig,extra]=token.split('.');if(extra||!payload||!sig)return false;const okay=await crypto.subtle.verify('HMAC',await sessionKey(env),unb64(sig),encoder.encode(payload));if(!okay)return false;const data=JSON.parse(new TextDecoder().decode(unb64(payload)));return data.role==='admin'&&data.aud===env.APP_ORIGIN&&data.exp>Math.floor(Date.now()/1000);}catch{return false;}}
export default {async fetch(request,env){
 const origin=request.headers.get('Origin'),url=new URL(request.url);const cors=origin===env.APP_ORIGIN?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campo-Access','Vary':'Origin'}:{};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(origin!==env.APP_ORIGIN)return response({error:'Origem não autorizada.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!env.FIELD_ACCESS_TOKEN||env.FIELD_ACCESS_TOKEN.length<32||!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<14||!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32||!env.LOGIN_GUARD)return response({error:'Configure acesso da equipe, administrador e LOGIN_GUARD no Worker.'},503);
 if(!await equalSecret(request.headers.get('X-Campo-Access')||'',env.FIELD_ACCESS_TOKEN))return response({error:'Código de acesso da equipe inválido. Abra o link autorizado.'},403);
 if(url.pathname==='/api/admin/login'){
  if(request.method!=='POST')return response({error:'Use POST.'},405);if(Number(request.headers.get('content-length')||0)>2048)return response({error:'Solicitação grande demais.'},413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',hash=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(ip)))),bucket=Math.floor(Date.now()/60000),guard='login:'+hash+':'+bucket;const tries=Number(await env.LOGIN_GUARD.get(guard)||0);if(tries>=5)return response({error:'Muitas tentativas. Aguarde um minuto.'},429);try{await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:120});}catch{return response({error:'Aguarde alguns segundos antes de tentar entrar novamente.'},429);}
  let data;try{const raw=await request.text();if(raw.length>2048)return response({error:'Solicitação inválida.'},413);data=JSON.parse(raw);}catch{return response({error:'Solicitação inválida.'},400);}
  if(!await equalSecret(String(data.password||''),env.ADMIN_PASSWORD))return response({error:'Senha incorreta.'},401);return response({token:await issueSession(env),expiresIn:28800});
 }
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-'))headers.delete(key);headers.set('Origin',url.origin);
 const admin=await validSession((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env);headers.delete('Authorization');if(admin){headers.set('oai-authenticated-user-id','external-admin');headers.set('oai-authenticated-user-email',env.CAMPO_ADMIN_EMAIL||'administrador@campo.local');}
 const result=await internalApp.fetch(new Request(request,{headers}),{...env,CAMPO_ADMIN_EMAIL:env.CAMPO_ADMIN_EMAIL||'administrador@campo.local'});const output=new Response(result.body,result);for(const [k,v]of Object.entries(cors))output.headers.set(k,v);output.headers.set('Cache-Control','no-store');return output;
}};
