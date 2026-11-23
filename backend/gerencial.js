// The viewer session is independent of the inspector and administrator sessions.
const GERENCIAL_COOKIE='__Host-arbora-gerencial';
const GERENCIAL_PAGE='/consulta-arbora.html';
const GERENCIAL_TTL=8*3600;
let gerencialKeys;

function gerencialSettings(env){
 const issuer=String(env.GERENCIAL_ACCESS_ISSUER||'');
 const audience=String(env.GERENCIAL_ACCESS_AUD||'');
 const domains=new Set(String(env.GERENCIAL_EMAIL_DOMAINS||'energisa.com.br').toLowerCase().split(',').map(domain=>domain.trim()).filter(Boolean));
 if(!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)||!audience)return null;
 return {issuer,audience,domains};
}
function gerencialEmail(value,settings){
 const email=String(value||'').trim().toLowerCase();
 const parts=/^[^\s@]+@([a-z0-9.-]+)$/.exec(email);
 return email.length<=254&&parts&&email.includes('energisa')&&settings?.domains.has(parts[1])?email:null;
}
async function gerencialAccessIdentity(assertion,settings){
 if(!assertion||assertion.length>8192)return null;
 let header,payload,signature,signed;
 try{
  const parts=assertion.split('.');
  if(parts.length!==3||parts.some(part=>!(/^[A-Za-z0-9_-]+$/).test(part)))return null;
  const decoder=new TextDecoder();
  header=JSON.parse(decoder.decode(unb64(parts[0])));
  payload=JSON.parse(decoder.decode(unb64(parts[1])));
  signature=unb64(parts[2]);
  signed=encoder.encode(parts[0]+'.'+parts[1]);
 }catch{return null;}
 const now=Date.now()/1000;
 if(header?.alg!=='RS256'||typeof header.kid!=='string'||payload?.iss!==settings.issuer||payload.type!=='app'
  ||!Array.isArray(payload.aud)||!payload.aud.includes(settings.audience)||!Number.isFinite(payload.exp)||payload.exp<=now
  ||(payload.nbf!==undefined&&(!Number.isFinite(payload.nbf)||payload.nbf>now)))return null;
 const email=gerencialEmail(payload.email,settings);
 if(!email)return null;
 const cache=gerencialKeys;
 if(cache?.issuer!==settings.issuer||cache.until<=Date.now()||(!cache.keys.has(header.kid)&&cache.fetchedAt+30000<=Date.now())){
  const response=await fetch(settings.issuer+'/cdn-cgi/access/certs',{redirect:'error',signal:AbortSignal.timeout(5000)});
  if(!response.ok)throw sharedError('A verificação de e-mail está temporariamente indisponível.',503);
  const {keys}=await response.json();
  gerencialKeys={issuer:settings.issuer,fetchedAt:Date.now(),until:Date.now()+300000,keys:new Map(keys.map(key=>[key.kid,key]))};
 }
 const jwk=gerencialKeys.keys.get(header.kid);
 if(!jwk)return null;
 const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,signed))return null;
 return {email,expiresAt:payload.exp*1000};
}
async function gerencialSession(request,env,settings){
 const token=authCookie(request,GERENCIAL_COOKIE);
 if(!settings||!(/^[A-Za-z0-9_-]{43}$/).test(token))return null;
 const hash=await authHash(token);
 const row=await authDB(env).prepare('SELECT email,expira_em FROM campo_gerencial_acessos WHERE token_hash=? AND expira_em>?').bind(hash,Date.now()).first();
 return gerencialEmail(row?.email,settings)?{email:row.email,hash}:null;
}
function gerencialRedirect(error,token,seconds){
 const headers=new Headers({Location:GERENCIAL_PAGE+(error?'?acesso='+error:''),'Cache-Control':'no-store'});
 if(token)headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,token,seconds));
 return new Response(null,{status:303,headers});
}
async function gerencialLogin(request,env,settings){
 if(!settings)return gerencialRedirect('indisponivel');
 const verified=await gerencialAccessIdentity(request.headers.get('Cf-Access-Jwt-Assertion'),settings);
 if(!verified)return gerencialRedirect('email');
 const current=await gerencialSession(request,env,settings);
 if(current?.email===verified.email)return gerencialRedirect();
 const now=Date.now(),seconds=Math.min(GERENCIAL_TTL,Math.floor((verified.expiresAt-now)/1000));
 if(seconds<1)return gerencialRedirect('email');
 const db=authDB(env),token=authRandom(),hash=await authHash(token),stamp=new Date(now).toISOString();
 const queries=[db.prepare('INSERT INTO campo_gerencial_acessos(email,entrou_em,expira_em,token_hash) VALUES(?,?,?,?)').bind(verified.email,stamp,now+seconds*1000,hash)];
 if(current)queries.push(db.prepare('UPDATE campo_gerencial_acessos SET token_hash=NULL,saiu_em=? WHERE token_hash=?').bind(stamp,current.hash));
 await db.batch(queries);
 return gerencialRedirect(null,token,seconds);
}
async function gerencialAudit(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const raw=new URL(request.url).searchParams.get('before');
 const before=raw===null?Number.MAX_SAFE_INTEGER:Number(raw);
 if(!Number.isSafeInteger(before)||before<=0)throw sharedError('Página inválida.');
 const {results}=await authDB(env).prepare('SELECT id,email,entrou_em,saiu_em FROM campo_gerencial_acessos WHERE id<? ORDER BY id DESC LIMIT 51').bind(before).all();
 const items=results.slice(0,50);
 return json({items,next:results.length>50?items.at(-1).id:null});
}
function gerencialActiveField(record){
 return !record.archiveCleanupPending&&record.adminClassification!=='homologacao';
}
function gerencialFieldRow(r){
 return {
  id:r.id, species:r.species||'', feeder:r.feeder||'', inspector:r.collectionInspector||r.inspector||'',
  pole:r.pole||'', span:r.span||'', key:r.key||r.chave||'', position:r.position||'', os:r.os||'',
  lat:r.lat, lon:r.lon, height:r.height, dap:r.dap, circ:r.circ, poda:r.poda||'', grouped:r.grouped||'',
  identification:CampoInspectionRules.identificationPending(r), photos:(r.photos||[]).filter(p=>p.assetId).length,
  day:controlDay(r.createdAt), seconds:r.inspectionTiming?.collectionSeconds, mtDistance:r.mtDistance, btDistance:r.btDistance
 };
}
function gerencialRiskRow(tree){
 const keys=['id','campoId','origem','especies','alimentador','chave','trecho','lat','lon','altura','dap','distRede','poste','vao','classe','prioridade','clientes','verificacao','acao','ano','poda'];
 const row=Object.fromEntries(keys.map(key=>[key,tree[key]]));
 return {...row,day:gerencialVeraDay(tree.data),photo:tree.origem==='Campo (prévia)'?Boolean(tree.photoAsset):true};
}
function gerencialVeraDay(value){
 const text=String(value||'').trim();
 const br=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
 if(br)return br[3]+'-'+br[2].padStart(2,'0')+'-'+br[1].padStart(2,'0');
 return /^\d{4}-\d{2}-\d{2}/.test(text)?text.slice(0,10):'';
}
async function gerencialVera(db){
 try{
  const meta=await veraMeta(db);
  const generation=meta.generation||null;
  const [{results},reviews]=await Promise.all([
   generation?db.prepare('SELECT data FROM vera_trees WHERE generation=?').bind(generation).all():{results:[]},
   veraReviews(db)
  ]);
  return {available:Boolean(generation),trees:results.map(row=>JSON.parse(row.data)),reference:meta.referencia?JSON.parse(meta.referencia):null,reviews:new Map(reviews.map(review=>[review.tree_id,review]))};
 }catch(error){
  if(veraMissingTable(error))return {available:false,trees:[],reference:null,reviews:new Map()};
  throw error;
 }
}
async function gerencialRouteSource(db){
 try{
  const [plans,visits,returns]=await Promise.all([
   db.prepare('SELECT data FROM campo_routes ORDER BY created_at DESC').all(),
   db.prepare('SELECT data,received_at FROM campo_route_visits ORDER BY received_at').all(),
   db.prepare('SELECT scope_id FROM campo_route_returns').all()
  ]);
  const returned=new Set(returns.results.map(row=>row.scope_id));
  return {
   routes:visibleRoutes(plans.results.map(row=>JSON.parse(row.data))).filter(route=>!returned.has(route.campaign?.id||route.id)),
   visits:visits.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at}))
  };
 }catch(error){
  if(centralMissingTable(error))return {routes:[],visits:[]};
  throw error;
 }
}
async function gerencialData(env){
 const db=await adminDb(env);
 const [data,vera,links,routeSource]=await Promise.all([
  controlUniverse(env),gerencialVera(db),
  db.prepare('SELECT source_id FROM shared_merges').all(),
  gerencialRouteSource(db)
 ]);
 const field=data.records.filter(gerencialActiveField);
 const live=field.map(row=>CampoParqueRegistros.liveTree(veraLiveRecord(row,vera.reviews.get(row.id)),vera.reference));
 const base=vera.trees.map(tree=>({...tree,origem:tree.fonte||'Base VERA'}));
 const park=CampoParqueRegistros.merge(base,live,new Set(links.results.map(row=>row.source_id)),vera.reference);
 const routes=CampoRoutes.campaignParts(routeSource.routes).map(parts=>{
  const route=parts[0],spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
  return {
   inspector:route.operator,
   daily:CampoRoutes.dailyCoverage(spans,routeSource.visits.filter(visit=>ids.has(visit.routeId))),
   targets:CampoRoutes.schedule(route.plan,CampoRoutes.metres(spans))
  };
 });
 return json({
  field:field.map(gerencialFieldRow),park:park.map(gerencialRiskRow),routes,
  veraAvailable:vera.available,archiveAvailable:data.archive.available,updatedAt:data.generatedAt
 });
}
async function gerencialPhoto(request,env){
 const params=new URL(request.url).searchParams,id=params.get('id'),source=params.get('source'),db=await adminDb(env);
 if(!sharedId(id))throw sharedError('Foto inválida.');
 if(source==='vera'){
  const meta=await veraMeta(db);
  const current=await db.prepare('SELECT id FROM vera_trees WHERE generation=? AND id=?').bind(meta.generation||'',id).first();
  const merged=await db.prepare('SELECT source_id FROM shared_merges WHERE source_id=?').bind('vera-'+id).first();
  if(!current||merged)throw sharedError('Foto indisponível.',404);
  return veraField(new URL('/api/vera/field-photo?id='+encodeURIComponent(id),'https://campo-internal'),db);
 }
 const index=Number(params.get('index')||0);
 if(source!=='campo'||!Number.isSafeInteger(index)||index<0)throw sharedError('Foto inválida.');
 const row=await sharedRead(db,id);
 const label=await db.prepare('SELECT classification FROM campo_record_labels WHERE tree_id=?').bind(id).first();
 if(!row||row.deleted||label?.classification==='homologacao')throw sharedError('Foto indisponível.',404);
 const photo=(JSON.parse(row.data).photos||[]).filter(item=>item.assetId)[index];
 if(!photo)throw sharedError('Foto indisponível.',404);
 const link=await db.prepare('SELECT image FROM shared_photos WHERE tree_id=? AND asset_id=?').bind(id,photo.assetId).first();
 if(!link)throw sharedError('Foto indisponível.',404);
 return json({image:link.image});
}
async function gerencialAPI(request,env,path,admin){
 try{
  if(path==='/api/admin/gerencial/acessos'&&request.method==='GET')return await gerencialAudit(request,env,admin);
  const settings=gerencialSettings(env);
  if(path==='/api/gerencial/entrar'&&request.method==='GET')return await gerencialLogin(request,env,settings);
  const viewer=await gerencialSession(request,env,settings);
  if(path==='/api/gerencial/sair'&&request.method==='POST'){
   if(viewer)await authDB(env).prepare('UPDATE campo_gerencial_acessos SET token_hash=NULL,saiu_em=? WHERE token_hash=?').bind(new Date().toISOString(),viewer.hash).run();
   const response=json({ok:true});
   response.headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,'',0));
   return response;
  }
  if(request.method!=='GET')return json({error:'Método não permitido.'},405);
  if(path==='/api/gerencial/sessao')return json({authenticated:Boolean(viewer||admin),email:viewer?.email||null,available:Boolean(settings)});
  if(!viewer&&!admin)throw sharedError('Entre com seu e-mail corporativo.',401);
  if(path==='/api/gerencial/dados')return await gerencialData(env);
  if(path==='/api/gerencial/foto')return await gerencialPhoto(request,env);
  return json({error:'Consulta não encontrada.'},404);
 }catch(error){
  if(path==='/api/gerencial/entrar')return gerencialRedirect('indisponivel');
  return json({error:error.status?error.message:'Consulta gerencial temporariamente indisponível.'},error.status||503);
 }
}
