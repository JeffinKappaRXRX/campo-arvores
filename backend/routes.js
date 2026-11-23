const ROUTE_REFERENCE_KEY='arbora:mt-reference:2026-08-03';
async function routeReference(request,env,admin){
 if(!admin)throw sharedError('Complemento de rede restrito à gestão.',403);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 const manifest=await env.LOGIN_GUARD?.get(ROUTE_REFERENCE_KEY,'json');
 if(!Number.isInteger(manifest?.parts)||manifest.parts<1||manifest.parts>32||!Number.isInteger(manifest.size)||manifest.size<1||manifest.size>6000000)throw sharedError('Complemento VERA ainda não está disponível na base central.',404);
 const parts=await Promise.all(Array.from({length:manifest.parts},(_,i)=>env.LOGIN_GUARD.get(ROUTE_REFERENCE_KEY+':'+i,'arrayBuffer')));
 if(parts.some(part=>!part)||parts.reduce((size,part)=>size+part.byteLength,0)!==manifest.size)throw sharedError('Complemento VERA incompleto. Tente novamente.',503);
 return new Response(new Blob(parts),{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
const ROUTE_GEOMETRY_KEY='arbora:route-geometry:campo-20260803-v2';
async function routeGeometry(request,env,admin){
 if(!admin)throw sharedError('Rede MT do planejador restrita à gestão.',403);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 const manifest=await env.LOGIN_GUARD?.get(ROUTE_GEOMETRY_KEY,'json');
 if(!manifest?.feeders?.length||!Number.isInteger(manifest.parts)||manifest.parts<1||manifest.parts>40||!Number.isInteger(manifest.size)||manifest.size>12000000)throw sharedError('A rede MT do planejador está indisponível.',503);
 if(new URL(request.url).searchParams.has('catalog'))return json({feeders:manifest.feeders,count:manifest.count});
 const parts=await Promise.all(Array.from({length:manifest.parts},(_,i)=>env.LOGIN_GUARD.get(ROUTE_GEOMETRY_KEY+':'+i,'arrayBuffer')));
 if(parts.some(part=>!part)||parts.reduce((size,part)=>size+part.byteLength,0)!==manifest.size)throw sharedError('Arquivo da rede MT incompleto. Tente novamente.',503);
 return new Response(new Blob(parts),{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
function visibleRoutes(routes){
 return CampoRoutes.campaignParts(routes).flatMap(parts=>{
  const plan=parts[0].campaign;
  if(!plan)return parts;
  return parts.length===plan.total&&parts.every((part,i)=>part.campaign?.index===i+1&&part.campaign.total===plan.total&&part.assignee===parts[0].assignee)?parts:[];
 });
}
const ROUTE_TABLES=[
 'CREATE TABLE IF NOT EXISTS campo_routes (id TEXT PRIMARY KEY, assignee TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_routes_assignee ON campo_routes(assignee,created_at)',
 'CREATE TABLE IF NOT EXISTS campo_route_visits (id TEXT PRIMARY KEY, route_id TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, received_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_route_visits_route ON campo_route_visits(route_id,received_at)',
 'CREATE TABLE IF NOT EXISTS campo_route_returns (id TEXT PRIMARY KEY, scope_id TEXT NOT NULL UNIQUE, route_id TEXT NOT NULL, assignee TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_route_returns_assignee ON campo_route_returns(assignee,created_at)'
];
const ROUTE_RETURN_REASONS={acesso:'Acesso impedido',seguranca:'Condição insegura',rede:'Dados ou traçado da rede incorretos',area:'Fora da área ou atribuição',reprogramacao:'Reprogramação operacional',homologacao:'Homologação',outro:'Outro',gestao_reatribuicao:'Reatribuição pela gestão',gestao_correcao:'Correção da rota pela gestão',gestao_homologacao:'Homologação ou teste da gestão',gestao_solicitacao:'Solicitação do inspetor à gestão',gestao_outro:'Retirada pela gestão'};
async function authorizeRouteHomologation(request,env,db,input){
 const login=String(input.adminLogin||'').trim().toLowerCase(),password=input.adminPassword;
 if(!login||login.length>254||typeof password!=='string'||!password||password.length>128)throw sharedError('Administrador ou senha incorretos.',401);
 await campoPasswordRateLimit(request,env,'route-homologation:'+login);
 const administrator=await db.prepare("SELECT u.id,u.name,u.role,u.blocked,c.password_hash,c.salt FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE (c.username=? COLLATE NOCASE OR u.email=? COLLATE NOCASE) AND u.role='admin' AND u.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id AND deleted_at IS NOT NULL)").bind(login,login).first();
 if(!await checkCampoPassword(password,administrator,env))throw sharedError('Administrador ou senha incorretos.',401);
 return {id:administrator.id,name:administrator.name};
}
function routeIsTest(route){
 return route.homologation===true||['homologacao','gestao_homologacao'].includes(route.returned?.reasonCode);
}
const validRouteOutlet=point=>Array.isArray(point)&&point.length===2&&point.every(Number.isFinite)&&Math.abs(point[0])<=180&&Math.abs(point[1])<=90;
async function routeUpdateOutlet(db,input){
 const {routeId,outlet}=input;
 if(!CampoRoutes.identifier(routeId)||!validRouteOutlet(outlet))throw sharedError('Selecione a saída da subestação no mapa.');
 const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first();
 if(!entry)throw sharedError('Rota não encontrada.',404);
 const route=JSON.parse(entry.data);
 if(route.deletedAt)throw sharedError('Rota indisponível.',404);
 if(route.outlet&&JSON.stringify(route.outlet)!==JSON.stringify(outlet))throw sharedError('A saída já foi vinculada a esta rota. Preserve a referência das chaves já confirmadas.',409);
 const args=route.campaign?[route.assignee,route.campaign.id]:[route.id];
 const where=route.campaign?"assignee=? AND json_extract(data,'$.campaign.id')=?":"id=?";
 const {results}=await db.prepare('SELECT data FROM campo_routes WHERE '+where).bind(...args).all();
 if(!CampoRoutes.keySections(visibleRoutes(results.map(row=>JSON.parse(row.data))).flatMap(part=>part.spans),outlet).length)throw sharedError('A saída não tem conexão inequívoca com uma ponta T1 da rota.');
 const edited=await db.prepare("UPDATE campo_routes SET data=json_set(data,'$.outlet',json(?)) WHERE "+where+" AND json_extract(data,'$.outlet') IS NULL AND json_extract(data,'$.deletedAt') IS NULL").bind(JSON.stringify(outlet),...args).run();
 if(!edited.meta?.changes&&!route.outlet)throw sharedError('A rota mudou durante o vínculo. Atualize a tela.',409);
 return json({ok:true});
}
async function routeUpdateTest(db,input){
 const {routeId,action}=input;
 if(!CampoRoutes.identifier(routeId)||!['classify','delete'].includes(action))throw sharedError('Informe uma rota válida.');
 const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first();
 if(!entry)throw sharedError('Rota não encontrada.',404);
 const route=JSON.parse(entry.data),scope=route.campaign?.id||route.id;
 const returned=await db.prepare('SELECT data FROM campo_route_returns WHERE scope_id=?').bind(scope).first();
 if(action==='delete'&&!routeIsTest({...route,returned:returned?JSON.parse(returned.data):null}))throw sharedError('Classifique a rota como homologação antes de excluir.',409);
 const rows=route.campaign?await db.prepare("SELECT data FROM campo_routes WHERE assignee=? AND json_extract(data,'$.campaign.id')=?").bind(route.assignee,scope).all():{results:[entry]};
 const stamp=new Date().toISOString(),parts=rows.results.map(row=>JSON.parse(row.data));
 if(parts.some(part=>part.deletedAt))return json({ok:true});
 const where=route.campaign?"assignee=? AND json_extract(data,'$.campaign.id')=?":"id=?";
 const args=route.campaign?[route.assignee,scope]:[route.id];
 const assign=action==='delete'?"json_set(data,'$.homologation',json('true'),'$.deletedAt',?)":"json_set(data,'$.homologation',json('true'))";
 await db.prepare("UPDATE campo_routes SET data="+assign+" WHERE "+where+" AND json_extract(data,'$.deletedAt') IS NULL").bind(...(action==='delete'?[stamp,...args]:args)).run();
 return json({ok:true});
}
async function routeKeyRanges(db,route,check){
 if(!check||typeof check.code!=='string'||!Array.isArray(check.segments)||!check.segments.length||check.segments.length>250||new Set(check.segments).size!==check.segments.length)throw sharedError('Selecione a chave e os trechos vistoriados.');
 const rows=route.campaign?await db.prepare("SELECT data FROM campo_routes WHERE assignee=? AND json_extract(data,'$.campaign.id')=?").bind(route.assignee,route.campaign.id).all():{results:[{data:JSON.stringify(route)}]};
 const parts=visibleRoutes(rows.results.map(row=>JSON.parse(row.data)).filter(part=>!part.deletedAt));
 if(!parts.length)throw sharedError('Rota ainda indisponível.',409);
 const section=CampoRoutes.keySections(parts.flatMap(part=>part.spans),route.outlet).find(part=>part.code===check.code);
 const byId=new Map((section?.segments||[]).map(segment=>[segment.id,segment]));
 if(check.segments.some(id=>!byId.has(id)))throw sharedError('A chave ou derivação não pertence a esta rota.',409);
 return check.segments.flatMap(id=>byId.get(id).ids.map(spanId=>({spanId,start:0,end:CampoRoutes.FULL})));
}
async function routeAPI(request,env){
 try{
  const admin=isAdministrator(request,env),actor=env.CAMPO_USER?.id,url=new URL(request.url),path=url.pathname;
  if(path==='/api/routes/geometry')return await routeGeometry(request,env,admin);
  if(path==='/api/routes/reference')return await routeReference(request,env,admin);
  if(!admin&&!actor)throw sharedError('Entre com sua conta para acessar as rotas.',403);
  const db=await adminDb(env);
   await db.batch(ROUTE_TABLES.map(sql=>db.prepare(sql)));
  if(path==='/api/routes'&&request.method==='GET'){
   const all=admin&&url.searchParams.get('mine')!=='1';
   if(!all&&!actor)throw sharedError('Entre com uma conta de inspetor.',403);
   try{
    const routeQuery=all?db.prepare('SELECT data FROM campo_routes ORDER BY created_at DESC'):db.prepare('SELECT data FROM campo_routes WHERE assignee=? ORDER BY created_at DESC').bind(actor);
    const visitQuery=all?db.prepare('SELECT data,received_at FROM campo_route_visits ORDER BY received_at'):db.prepare('SELECT data,received_at FROM campo_route_visits WHERE actor=? ORDER BY received_at').bind(actor);
     const returnQuery=all?db.prepare('SELECT data FROM campo_route_returns ORDER BY created_at DESC'):db.prepare('SELECT data FROM campo_route_returns WHERE assignee=? ORDER BY created_at DESC').bind(actor);
     const [a,b,c]=await Promise.all([routeQuery.all(),visitQuery.all(),returnQuery.all()]);
     const returns=c.results.map(row=>JSON.parse(row.data)),byScope=new Map(returns.map(item=>[item.scopeId,item]));
     let routes=visibleRoutes(a.results.map(row=>JSON.parse(row.data)).filter(route=>!route.deletedAt)).map(route=>{const returned=byScope.get(route.campaign?.id||route.id);return returned?{...route,returned}:route;});
     if(!all)routes=routes.filter(route=>!route.returned);
     const ids=new Set(routes.map(route=>route.id));
    const visits=b.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at})).filter(visit=>ids.has(visit.routeId));
     const deletedIds=all?[]:a.results.map(row=>JSON.parse(row.data)).filter(route=>route.deletedAt).map(route=>route.id);
    return json({routes,visits,returns,...(deletedIds.length?{deletedIds}:{})});
    }catch(error){if(centralMissingTable(error))return json({routes:[],visits:[],returns:[]});throw error;}
  }
  if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
  const input=await sharedBody(request,500000),now=new Date().toISOString();
  if(path==='/api/routes/saida'&&admin){
   const result=await routeUpdateOutlet(db,input);
   await realtimePublish(env,'route-assigned');
   return result;
  }
  if(path==='/api/routes/homologacao'&&admin){
   const result=await routeUpdateTest(db,input);
   await realtimePublish(env,'route-return');
   return result;
  }
  if(path==='/api/routes'&&admin){
   const {id,assignee}=input||{};
   if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(assignee)||!Array.isArray(input.spans)||!input.spans.length||input.spans.length>250)throw sharedError('Informe o inspetor e até 250 vãos.');
   const {text,key,phase:priority,sections:validSections}=CampoRoutes;
   const name=text(input.name),fallback={locality:key(input.locality),feeder:key(input.feeder),zone:key(input.zone),section:key(input.section).replace(/^T/,'')};
   let spans;
   try{spans=input.spans.map(CampoRoutes.span);}catch(error){throw sharedError(error.message);}
   const derive=input.fromNetwork===true;
   if(derive)spans=spans.map(s=>({...s,locality:s.locality||fallback.locality,feeder:s.feeder||fallback.feeder,zone:s.zone||fallback.zone,section:s.section||fallback.section}));
   if(!name||new Set(spans.map(s=>s.id)).size!==spans.length)throw sharedError('Informe o nome da rota e revise os vãos repetidos.');
   if(derive&&spans.some(s=>!s.feeder||!s.locality||!priority(s.zone,s.section)))throw sharedError('Complete os dados ausentes na rede: localidade, alimentador, zona ou trecho.');
   if(!derive&&(!fallback.locality||!fallback.feeder||!priority(fallback.zone,fallback.section)||spans.some(s=>Object.keys(fallback).some(k=>s[k]&&s[k]!==fallback[k]))))throw sharedError('Revise localidade, alimentador, zona e trecho dos vãos.');
   const values=field=>[...new Set(spans.map(s=>s[field]))].sort();
   const sections=derive?validSections(values('section')):[fallback.section];
   const locality=derive?values('locality').join(' / '):fallback.locality;
   const feeder=derive?values('feeder').join(' / '):fallback.feeder;
   const zone=derive?values('zone').join(' / '):fallback.zone;
   const section=sections[0],phase=derive?Math.min(...spans.map(s=>priority(s.zone,s.section))):priority(zone,section);
   const buffer=CampoRoutes.bufferMetres(input.buffer),plan=CampoRoutes.routePlan(input.plan);
   if(input.plan!=null&&!plan)throw sharedError('Informe a data inicial e uma capacidade diária válida.');
   const campaign=input.campaign;
   const outlet=input.outlet;
   if(outlet!==undefined&&!validRouteOutlet(outlet))throw sharedError('Selecione a saída da subestação no mapa.');
   if(campaign&&(!CampoRoutes.identifier(campaign.id)||!Number.isInteger(campaign.index)||!Number.isInteger(campaign.total)||campaign.total<2||campaign.total>160||campaign.index<1||campaign.index>campaign.total||id!==campaign.id+'-'+campaign.index||!text(campaign.name)))throw sharedError('Identificação da rota fracionada inválida.');
   const operator=await db.prepare(`SELECT id,name FROM campo_users WHERE id=? AND blocked=0 AND NOT EXISTS (SELECT 1 FROM campo_user_lifecycle WHERE user_id=campo_users.id AND deleted_at IS NOT NULL)`).bind(assignee).first();
   if(!operator)throw sharedError('Selecione uma conta ativa.');
   const route={id,assignee,operator:operator.name,name,locality,feeder,zone,section,...(sections.length>1?{sections}:{}),phase,spans,createdAt:now,...(input.homologation===true?{homologation:true}:{}),...(outlet?{outlet}:{}),...(plan?{plan}:{}),...(input.buffer!=null?{buffer}:{}),...(campaign?{campaign:{id:campaign.id,index:campaign.index,total:campaign.total,name:text(campaign.name)}}:{})};
   if(campaign){
    const peer=await db.prepare('SELECT assignee,data FROM campo_routes WHERE id=?').bind(campaign.id+'-1').first();
    if((peer&&(peer.assignee!==assignee||JSON.stringify(JSON.parse(peer.data).plan||null)!==JSON.stringify(plan)||JSON.stringify(JSON.parse(peer.data).outlet||null)!==JSON.stringify(outlet||null)||Boolean(JSON.parse(peer.data).homologation)!==Boolean(route.homologation)||JSON.parse(peer.data).deletedAt))||(!peer&&campaign.index!==1))throw sharedError('A primeira parte da rota precisa estar gravada para o mesmo inspetor.',409);
   }
   const insert=await db.prepare('INSERT OR IGNORE INTO campo_routes(id,assignee,data,created_at) VALUES(?,?,?,?)').bind(id,assignee,JSON.stringify(route),now).run();
   if(!insert.meta?.changes){const stored=JSON.parse((await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(id).first()).data);const {createdAt:_new,...wanted}=route,{createdAt:_old,...existing}=stored;if(JSON.stringify(wanted)!==JSON.stringify(existing))throw sharedError('Esta rota já foi publicada. Crie uma nova rota para alterar o plano.',409);return json({route:stored});}
   await realtimePublish(env,'route-assigned');
   return json({route},201);
  }
   if(path==='/api/routes/return'&&(actor||admin)){
    const {id,routeId}=input||{},reasonCode=String(input.reasonCode||''),note=CampoRoutes.text(input.note,480);
    const management=reasonCode.startsWith('gestao_');
    if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(routeId)||!ROUTE_RETURN_REASONS[reasonCode]||(['outro','gestao_outro'].includes(reasonCode)&&!note))throw sharedError('Informe a rota e um motivo válido para a devolução.');
    if(management&&!admin)throw sharedError('Somente a gestão pode retirar uma rota do inspetor.',403);
    const entry=management?await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(routeId).first():await db.prepare('SELECT data FROM campo_routes WHERE id=? AND assignee=?').bind(routeId,actor).first();
    if(!entry)throw sharedError(management?'Rota não encontrada.':'Rota não atribuída à sua conta.',404);
    const route=JSON.parse(entry.data);if(route.deletedAt)throw sharedError('Rota de homologação excluída.',410);const scopeId=route.campaign?.id||route.id;
    const authorizedBy=reasonCode==='homologacao'?await authorizeRouteHomologation(request,env,db,input):null;
    const returnActor=actor||'administrator',returned={id,scopeId,routeId,assignee:route.assignee,actor:returnActor,actorName:env.CAMPO_USER?.name||(management?'Administrador':route.operator||'Inspetor'),source:management?'management':'field',reasonCode,reason:ROUTE_RETURN_REASONS[reasonCode],note,createdAt:now,...(authorizedBy?{authorizedBy}:{})};
    const insert=await db.prepare('INSERT OR IGNORE INTO campo_route_returns(id,scope_id,route_id,assignee,actor,data,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,scopeId,routeId,route.assignee,returnActor,JSON.stringify(returned),now).run();
    if(!insert.meta?.changes){
     const row=await db.prepare('SELECT data FROM campo_route_returns WHERE scope_id=?').bind(scopeId).first(),stored=row&&JSON.parse(row.data);
     if(stored?.id!==id)throw sharedError('Esta rota já foi devolvida.',409);
     return json({returned:stored});
    }
    await realtimePublish(env,'route-return');
    return json({returned},201);
   }
  if(path==='/api/routes/visit'&&actor){
   const {id,routeId,startedAt,endedAt}=input||{},start=Date.parse(startedAt),end=Date.parse(endedAt);
   if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(routeId)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>Date.now()+600000||end-start>7*86400000||
     (!input.keyCheck&&(!Array.isArray(input.ranges)||input.ranges.length>750)))throw sharedError('Dados da vistoria inválidos.');
   const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=? AND assignee=?').bind(routeId,actor).first();
   if(!entry)throw sharedError('Rota não atribuída à sua conta.',404);
   const route=JSON.parse(entry.data),ids=new Set(route.spans.map(s=>s.id));
   if(route.deletedAt)throw sharedError('Rota de homologação excluída.',410);
   const old=await db.prepare('SELECT data,received_at FROM campo_route_visits WHERE id=? AND actor=?').bind(id,actor).first();
   if(old&&input.keyCheck){
    const saved=JSON.parse(old.data);
    if(saved.routeId===routeId&&JSON.stringify(saved.keyCheck)===JSON.stringify(input.keyCheck))return json({visit:{...saved,receivedAt:old.received_at}});
    throw sharedError('O identificador já pertence a outra vistoria.',409);
   }
    if(await db.prepare('SELECT id FROM campo_route_returns WHERE scope_id=?').bind(route.campaign?.id||route.id).first())throw sharedError('A rota já foi devolvida e não aceita novas conclusões.',409);
   const ranges=input.keyCheck?await routeKeyRanges(db,route,input.keyCheck):input.ranges.map(x=>{
    if(!x||!ids.has(x.spanId)||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end>CampoRoutes.FULL||x.start>=x.end)throw sharedError('Vão ou faixa de vistoria inválida.');
    return {spanId:x.spanId,start:x.start,end:x.end};
   });
   const visit={id,routeId,actor,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),day:CampoRoutes.day(end),trackMetres:Math.round(Math.max(0,Math.min(1000000,Number(input.trackMetres)||0))),ranges,reason:CampoRoutes.text(input.reason,480),...(input.keyCheck?{keyCheck:input.keyCheck}:{})};
   if(!ranges.length&&!visit.reason)throw sharedError('Informe por que a rota foi encerrada sem cobertura.');
   const result=await db.prepare("INSERT OR IGNORE INTO campo_route_visits(id,route_id,actor,data,received_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_routes WHERE id=? AND json_extract(data,'$.deletedAt') IS NULL) AND NOT EXISTS(SELECT 1 FROM campo_route_returns WHERE scope_id=?)").bind(id,routeId,actor,JSON.stringify(visit),now,routeId,route.campaign?.id||route.id).run();
   const row=await db.prepare('SELECT data,received_at FROM campo_route_visits WHERE id=? AND actor=?').bind(id,actor).first();
   if(row?.data!==JSON.stringify(visit))throw sharedError('A rota mudou antes de confirmar a vistoria ou o identificador já foi usado.',409);
   if(result.meta?.changes)await realtimePublish(env,'route-visit');
   return json({visit:{...visit,receivedAt:row.received_at}});
  }
  throw sharedError('Operação não permitida.',403);
 }catch(error){return json({error:error.status?error.message:'Rotas temporariamente indisponíveis.'},error.status||503);}
}
