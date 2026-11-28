// A viewer link grants read-only access and is independent of field and admin sessions.
const GERENCIAL_COOKIE='__Host-arbora-gerencial';
const GERENCIAL_TTL=8*3600;
const GERENCIAL_LINK_ID='gerencial_viewer_link_hash';
const gerencialToken=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);

async function gerencialLinkHash(db){
 const setting=await db.prepare('SELECT value FROM campo_admin_settings WHERE id=?').bind(GERENCIAL_LINK_ID).first();
 return setting?.value||null;
}
async function gerencialManageLink(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=authDB(env);
 if(request.method==='GET')return json({enabled:Boolean(await gerencialLinkHash(db))});
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const {action}=await sharedBody(request,256);
 if(action==='revoke'){
  await db.prepare('DELETE FROM campo_admin_settings WHERE id=?').bind(GERENCIAL_LINK_ID).run();
  return json({enabled:false});
 }
 if(action!=='rotate')throw sharedError('Ação de link inválida.');
 const token=authRandom(),hash=await authHash(token);
 await db.prepare('INSERT INTO campo_admin_settings(id,value,updated_at) VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at')
  .bind(GERENCIAL_LINK_ID,hash,new Date().toISOString()).run();
 return json({enabled:true,fragment:'acesso='+token});
}
async function gerencialSession(request,db){
 const token=authCookie(request,GERENCIAL_COOKIE);
 if(!gerencialToken(token))return null;
 const linkHash=await gerencialLinkHash(db);
 if(!linkHash)return null;
 const hash=await authHash(linkHash+':'+token);
 const row=await db.prepare('SELECT id FROM campo_gerencial_acessos WHERE token_hash=? AND expira_em>?').bind(hash,Date.now()).first();
 return row?{hash}:null;
}
async function gerencialLogin(request,env,db){
 const {token:link}=await sharedBody(request,256);
 if(!gerencialToken(link))throw sharedError('Link gerencial inválido ou revogado.',401);
 const linkHash=await gerencialLinkHash(db);
 if(!linkHash||!await equalSecret(await authHash(link),linkHash))throw sharedError('Link gerencial inválido ou revogado.',401);
 if(await gerencialSession(request,db))return json({ok:true});
 const token=authRandom(),hash=await authHash(linkHash+':'+token);
 const ip=request.headers.get('CF-Connecting-IP');
 const network=ip&&env.ADMIN_SESSION_SECRET?b64(new Uint8Array(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode('arbora-gerencial:'+linkHash+':'+ip)))).slice(0,12):null;
 const label=network?'Link · rede '+network:'Link · rede indisponível';
 const now=Date.now(),stamp=new Date(now).toISOString();
 const inserted=await db.prepare('INSERT INTO campo_gerencial_acessos(email,entrou_em,expira_em,token_hash) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_admin_settings WHERE id=? AND value=?)')
  .bind(label,stamp,now+GERENCIAL_TTL*1000,hash,GERENCIAL_LINK_ID,linkHash).run();
 if(!inserted.meta?.changes)throw sharedError('Link gerencial inválido ou revogado.',401);
 const response=json({ok:true});
 response.headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,token,GERENCIAL_TTL));
 return response;
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
function gerencialName(value){
 return String(value||'').normalize('NFD').replace(/\p{Diacritic}/gu,'').trim().toLowerCase();
}
async function gerencialInspectors(db){
 const [setting,users]=await Promise.all([
  db.prepare('SELECT inspector_ids FROM campo_gerencial_vitrine WHERE id=1').first(),
  db.prepare("SELECT id,name FROM campo_users u WHERE role='inspector' AND blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle l WHERE l.user_id=u.id)").all()
 ]);
 const accounts=users.results;
 const defaults=['herlen','lucivaldo'].flatMap(name=>{
  const matches=accounts.filter(account=>gerencialName(account.name).split(/\s+/)[0]===name);
  return matches.length===1?[matches[0].id]:[];
 });
 const ids=new Set(setting?JSON.parse(setting.inspector_ids):defaults);
 return {accounts,enabled:accounts.filter(account=>ids.has(account.id))};
}
async function gerencialSelection(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=await adminDb(env),scope=await gerencialInspectors(db);
 if(request.method==='GET')return json(scope);
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const {ids}=await sharedBody(request,12000);
 if(!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!scope.accounts.some(account=>account.id===id)))throw sharedError('Selecione contas ativas de inspetores.');
 await db.prepare('INSERT INTO campo_gerencial_vitrine(id,inspector_ids) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET inspector_ids=excluded.inspector_ids').bind(JSON.stringify(ids)).run();
 return json({enabled:scope.accounts.filter(account=>ids.includes(account.id))});
}
async function gerencialTeams(db){
 const [teams,members,preference]=await Promise.all([
  db.prepare('SELECT id,nome AS name FROM campo_gerencial_equipes ORDER BY nome').all(),
  db.prepare('SELECT user_id AS userId,equipe_id AS teamId FROM campo_gerencial_equipe_membros').all(),
  db.prepare("SELECT value FROM campo_admin_settings WHERE id='gerencial_show_inspectors'").first()
 ]);
 return {teams:teams.results,members:members.results,showInspectorNames:preference?.value==='true'};
}
async function gerencialManageTeams(request,env,admin){
 if(!admin)throw sharedError('Acesso restrito ao administrador.',403);
 const db=await adminDb(env);
 if(request.method==='GET')return json(await gerencialTeams(db));
 if(request.method!=='POST')throw sharedError('Método não permitido.',405);
 const input=await sharedBody(request,12000);
 if(input.action==='create'){
  const name=typeof input.name==='string'?input.name.trim().replace(/\s+/g,' ').toLocaleUpperCase('pt-BR'):'';
  if(!/^[\p{L}\p{N}][\p{L}\p{N} ./_-]{0,39}$/u.test(name))throw sharedError('Informe um código ou nome de equipe de até 40 caracteres.');
  const id=crypto.randomUUID();
  const result=await db.prepare('INSERT OR IGNORE INTO campo_gerencial_equipes(id,nome) VALUES(?,?)').bind(id,name).run();
  if(!result.meta?.changes)throw sharedError('Já existe uma equipe com esse nome.',409);
  return json({team:{id,name}},201);
 }
 if(input.action==='assign'){
  const {userId,teamId}=input;
  if(!CampoRoutes.identifier(userId)||(teamId!==null&&!CampoRoutes.identifier(teamId)))throw sharedError('Vínculo de equipe inválido.');
  const account=await db.prepare("SELECT id FROM campo_users u WHERE id=? AND role='inspector' AND blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle l WHERE l.user_id=u.id)").bind(userId).first();
  if(!account)throw sharedError('Selecione um inspetor ativo.',404);
  if(teamId===null)await db.prepare('DELETE FROM campo_gerencial_equipe_membros WHERE user_id=?').bind(userId).run();
  else{
   const found=await db.prepare('SELECT id FROM campo_gerencial_equipes WHERE id=?').bind(teamId).first();
   if(!found)throw sharedError('Equipe não encontrada.',404);
   await db.prepare('INSERT INTO campo_gerencial_equipe_membros(user_id,equipe_id) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET equipe_id=excluded.equipe_id').bind(userId,teamId).run();
  }
  return json({userId,teamId});
 }
 if(input.action==='visibility'&&typeof input.showInspectorNames==='boolean'){
  await db.prepare("INSERT INTO campo_admin_settings(id,value,updated_at) VALUES('gerencial_show_inspectors',?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at")
   .bind(String(input.showInspectorNames),new Date().toISOString()).run();
  return json({showInspectorNames:input.showInspectorNames});
 }
 throw sharedError('Ação de equipe inválida.');
}
function gerencialTeamGroups(enabled,{teams,members,showInspectorNames}){
 const byTeam=new Map(teams.map(team=>[team.id,team])),assignments=new Map(members.map(member=>[member.userId,member.teamId]));
 const groups=new Map(),operators=new Map();
 let unassigned=0;
 for(const account of [...enabled].sort((a,b)=>a.id.localeCompare(b.id))){
  const team=byTeam.get(assignments.get(account.id));
  const id=team?.id||'unlinked-'+(++unassigned);
  if(!groups.has(id))groups.set(id,{id,label:team?.name||'Sem equipe '+unassigned,operatorCount:0});
  const group=groups.get(id);
  group.operatorCount++;
  if(showInspectorNames)(group.inspectors??=[]).push(account.name);
  operators.set(account.id,group);
 }
 for(const group of groups.values()){
  group.inspectors?.sort((a,b)=>a.localeCompare(b,'pt-BR'));
  if(showInspectorNames)group.label+=' · '+group.inspectors.join(', ');
  delete group.inspectors;
 }
 return {groups:[...groups.values()].sort((a,b)=>a.label.localeCompare(b.label,'pt-BR',{numeric:true})),operators};
}
async function gerencialRouteSource(db,enabled){
 if(!enabled.length)return {routes:[],visits:[]};
 const scope=JSON.stringify(enabled.map(account=>account.id));
 try{
  const [plans,visits,returns]=await Promise.all([
   db.prepare('SELECT data FROM campo_routes WHERE assignee IN (SELECT value FROM json_each(?)) ORDER BY created_at DESC').bind(scope).all(),
   db.prepare('SELECT v.data,v.received_at FROM campo_routes r JOIN campo_route_visits v ON v.route_id=r.id WHERE r.assignee IN (SELECT value FROM json_each(?)) ORDER BY v.received_at').bind(scope).all(),
   db.prepare('SELECT scope_id,data FROM campo_route_returns WHERE assignee IN (SELECT value FROM json_each(?))').bind(scope).all()
  ]);
  const returned=new Map(returns.results.map(row=>[row.scope_id,JSON.parse(row.data)]));
  return {
   routes:visibleRoutes(plans.results.map(row=>JSON.parse(row.data)).filter(route=>!route.deletedAt)).filter(route=>!routeIsTest({...route,returned:returned.get(route.campaign?.id||route.id)})),
   visits:visits.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at}))
  };
 }catch(error){
  if(centralMissingTable(error))return {routes:[],visits:[]};
  throw error;
 }
}
function gerencialScopedTrees(records,enabled,accounts){
 const byId=new Map(enabled.map(account=>[account.id,account])),byName=new Map();
 for(const account of accounts){
  const name=gerencialName(account.name);
  byName.set(name,byName.has(name)?null:byId.get(account.id));
 }
 return records.filter(gerencialActiveField).flatMap(r=>{
  const operator=r.createdByUserId?byId.get(r.createdByUserId):byName.get(gerencialName(r.collectionInspector||r.inspector));
  return operator?[{r,operator}]:[];
 });
}
async function gerencialFieldHistory(env){
 const db=await adminDb(env);
 const [{enabled,accounts},data,settings,merges]=await Promise.all([
  gerencialInspectors(db),controlUniverse(env),gerencialTeams(db),db.prepare('SELECT source_id FROM shared_merges').all()
 ]);
 const {operators}=gerencialTeamGroups(enabled,settings);
 const inactive=new Set([...data.deletedIds,...merges.results.map(row=>row.source_id)]);
 const points=gerencialScopedTrees(data.records,enabled,accounts).filter(({r})=>
  !inactive.has(r.id)&&sharedCoordinate(r.lat,90)&&sharedCoordinate(r.lon,180)
 ).map(({r,operator})=>[Number(r.lat),Number(r.lon),operators.get(operator.id).id,CampoSpanQuality.key(r.span)]);
 return json({points,archiveAvailable:data.archive.available});
}

let gerencialBingCache;
async function gerencialBing(env){
 if(!env.BING_MAPS_KEY)return json({available:false});
 if(gerencialBingCache?.until>Date.now())return json(gerencialBingCache.data);
 const endpoint=new URL('https://dev.virtualearth.net/REST/v1/Imagery/Metadata/Aerial');
 endpoint.searchParams.set('key',env.BING_MAPS_KEY);
 try{
  const response=await fetch(endpoint,{signal:AbortSignal.timeout(6000),redirect:'error'});
  if(!response.ok)return json({available:false});
  const metadata=await response.json(),resource=metadata.resourceSets?.[0]?.resources?.[0];
  const source=String(resource?.imageUrl||'').replace(/^http:/,'https:');
  if(!/^https:\/\/[^/]*\.tiles\.virtualearth\.net\/tiles\/[A-Za-z]\{quadkey\}\.[a-z]+(?:\?[^#]*)?$/i.test(source)||source.includes(env.BING_MAPS_KEY))return json({available:false});
  const subdomains=(resource.imageUrlSubdomains||[]).filter(value=>/^[a-z0-9-]+$/i.test(value));
  if(source.includes('{subdomain}')&&!subdomains.length)return json({available:false});
  const data={available:true,source,subdomains,attribution:String(metadata.copyright||'© Microsoft Bing Maps'),nativeZoom:15};
  gerencialBingCache={data,until:Date.now()+3600000};
  return json(data);
 }catch{return json({available:false});}
}
async function gerencialData(env){
 const db=await adminDb(env);
 const [{enabled,accounts},data,settings]=await Promise.all([gerencialInspectors(db),controlUniverse(env),gerencialTeams(db)]);
 const {groups,operators}=gerencialTeamGroups(enabled,settings);
 const source=await gerencialRouteSource(db,enabled);
 const byId=new Map(enabled.map(account=>[account.id,account]));
 const scoped=gerencialScopedTrees(data.records,enabled,accounts);
 const checked=await spanCheckRecords(env,scoped.map(row=>row.r),source.routes);
 const field=scoped.map(({r,operator})=>{
  const check=checked.get(r.id);
  return {
   inspector:operators.get(operator.id).id,day:controlDay(r.createdAt),seconds:r.inspectionTiming?.collectionSeconds,
   poda:r.poda,grouped:r.grouped,position:r.position,feeder:r.feeder,
   identification:CampoInspectionRules.identificationPending(r),missing:controlProblems(r).length>0,
   spanChecked:Boolean(check),...(check?.metres>CampoSpanQuality.threshold?{spanAlert:check}:{})
  };
 });
 const routes=gerencialCampaigns(source,byId).map(parts=>{
  const route=parts[0],id=route.campaign?.id||route.id,spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
  const visits=source.visits.filter(visit=>ids.has(visit.routeId)),planned=CampoRoutes.metres(spans),cover=CampoRoutes.coverage(spans,visits);
  const keys=CampoRoutes.keySections(spans,route.outlet),closed=keys.filter(section=>CampoRoutes.keyProgress(section,cover.bySpan).every(segment=>segment.closed));
  return {
   id,name:settings.showInspectorNames?(route.campaign?.name||route.name):[route.feeder,CampoRoutes.sectionLabel(route),controlDay(route.createdAt).split('-').reverse().join('/')].filter(Boolean).join(' · '),
   inspector:operators.get(route.assignee).id,feeder:route.feeder,revision:visits.at(-1)?.receivedAt||null,
   planned,confirmed:cover.metres,pending:Math.max(0,planned-cover.metres),keys:keys.length,closed:closed.length,
   daily:CampoRoutes.dailyCoverage(spans,visits),targets:CampoRoutes.schedule(route.plan,planned)
  };
 });
 return json({field,routes,groups,archiveAvailable:data.archive.available,updatedAt:data.generatedAt});
}
function gerencialCampaigns(source,byId){
 return CampoRoutes.campaignParts(source.routes.filter(route=>byId.has(route.assignee)));
}
async function gerencialVeraPositions(db){
 try{
  return (await db.prepare(`SELECT id,json_extract(data,'$.lat') AS lat,json_extract(data,'$.lon') AS lon
   FROM vera_trees WHERE generation=(SELECT value FROM vera_meta WHERE key='generation')`).all()).results;
 }catch(error){
  if(veraMissingTable(error))return null;
  throw error;
 }
}
async function gerencialTreePositions(env,veraOnly=false){
 const db=await adminDb(env);
 const [data,vera,merges]=await Promise.all([
  controlUniverse(env),gerencialVeraPositions(db),db.prepare('SELECT source_id FROM shared_merges').all()
 ]);
 const inactive=new Set([...data.deletedIds,...merges.results.map(row=>row.source_id)]);
 const field=new Map(data.records.filter(row=>gerencialActiveField(row)&&!inactive.has(row.id)).map(row=>[row.id,row]));
 const coordinates=row=>sharedCoordinate(row.lat,90)&&sharedCoordinate(row.lon,180)?[Number(row.lat),Number(row.lon)]:null;
 const baseline=(vera||[]).flatMap(row=>{
  const id='vera-'+row.id;
  if(inactive.has(id))return [];
  const updated=field.get(id);
  field.delete(id);
  const point=(updated&&coordinates(updated))||coordinates(row);
  return point?[point]:[];
 });
 return json({
  vera:baseline,...(veraOnly?{}:{field:[...field.values()].map(coordinates).filter(Boolean)}),
  veraAvailable:vera!==null,archiveAvailable:data.archive.available
 });
}
async function gerencialRouteMap(request,env){
 const params=new URL(request.url).searchParams,requested=[...new Set(params.getAll('id'))];
 if(!requested.length||requested.length>12||requested.some(id=>!CampoRoutes.identifier(id)))throw sharedError('Seleção de rotas inválida.');
 const db=await adminDb(env),{enabled}=await gerencialInspectors(db);
 const source=await gerencialRouteSource(db,enabled),byId=new Map(enabled.map(account=>[account.id,account]));
 const routes=new Map(gerencialCampaigns(source,byId).map(parts=>[parts[0].campaign?.id||parts[0].id,parts]));
 const views=requested.flatMap(id=>{
  const parts=routes.get(id);
  if(!parts)return [];
  const route=parts[0],spans=parts.flatMap(part=>part.spans),ids=new Set(parts.map(part=>part.id));
  const cover=CampoRoutes.coverage(spans,source.visits.filter(visit=>ids.has(visit.routeId)));
  const lines=CampoRoutes.mapLines(spans,cover.bySpan);
  const keys=CampoRoutes.keySections(spans,route.outlet).map(section=>({
   code:section.code,point:section.segments[0].start,
   pending:CampoRoutes.keyProgress(section,cover.bySpan).filter(segment=>!segment.closed).length
  }));
  return [{id,lines,keys,spanIds:spans.map(span=>CampoSpanQuality.key(span.id)),outlet:route.outlet}];
 });
 if(!views.length)throw sharedError('Rotas indisponíveis.',404);
 return json(params.has('batch')||requested.length>1?{routes:views}:views[0]);
}
async function gerencialAPI(request,env,path,admin){
 try{
  if(path==='/api/admin/gerencial/acessos'&&request.method==='GET')return await gerencialAudit(request,env,admin);
  if(path==='/api/admin/gerencial/equipes')return await gerencialManageTeams(request,env,admin);
  if(path==='/api/admin/gerencial/inspetores')return await gerencialSelection(request,env,admin);
  if(path==='/api/admin/gerencial/link')return await gerencialManageLink(request,env,admin);
  const db=authDB(env);
  if(path==='/api/gerencial/link-session'&&request.method==='POST')return await gerencialLogin(request,env,db);
  const viewer=await gerencialSession(request,db);
  if(path==='/api/gerencial/sair'&&request.method==='POST'){
   if(viewer)await db.prepare('UPDATE campo_gerencial_acessos SET token_hash=NULL,saiu_em=? WHERE token_hash=?').bind(new Date().toISOString(),viewer.hash).run();
   const response=json({ok:true});
   response.headers.append('Set-Cookie',sessionCookie(GERENCIAL_COOKIE,'',0));
   return response;
  }
  if(request.method!=='GET')throw sharedError('Método não permitido.',405);
  if(path==='/api/gerencial/sessao')return json({authenticated:Boolean(viewer||admin),admin:Boolean(admin),viewer:Boolean(viewer)});
  if(!viewer&&!admin)throw sharedError('Abra o link compartilhado pela administração.',401);
  if(path==='/api/gerencial/dados')return await gerencialData(env);
  if(path==='/api/gerencial/arvores'){
   const layer=new URL(request.url).searchParams.get('camada');
   return layer==='campo'?await gerencialFieldHistory(env):await gerencialTreePositions(env,layer==='vera');
  }
  if(path==='/api/gerencial/bing')return await gerencialBing(env);
  if(path==='/api/gerencial/rota')return await gerencialRouteMap(request,env);
  return json({error:'Consulta não encontrada.'},404);
 }catch(error){
  return json({error:error.status?error.message:'Consulta gerencial temporariamente indisponível.'},error.status||503);
 }
}
