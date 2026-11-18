const ROUTE_TABLES=[
 'CREATE TABLE IF NOT EXISTS campo_routes (id TEXT PRIMARY KEY, assignee TEXT NOT NULL, data TEXT NOT NULL, created_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_routes_assignee ON campo_routes(assignee,created_at)',
 'CREATE TABLE IF NOT EXISTS campo_route_visits (id TEXT PRIMARY KEY, route_id TEXT NOT NULL, actor TEXT NOT NULL, data TEXT NOT NULL, received_at TEXT NOT NULL)',
 'CREATE INDEX IF NOT EXISTS campo_route_visits_route ON campo_route_visits(route_id,received_at)'
];
async function routeAPI(request,env){
 try{
  const admin=isAdministrator(request,env),actor=env.CAMPO_USER?.id,url=new URL(request.url),path=url.pathname;
  if(!admin&&!actor)throw sharedError('Entre com sua conta para acessar as rotas.',403);
  const db=await adminDb(env);
  if(path==='/api/routes'&&request.method==='GET'){
   const all=admin&&url.searchParams.get('mine')!=='1';
   if(!all&&!actor)throw sharedError('Entre com uma conta de inspetor.',403);
   try{
    const routes=all?db.prepare('SELECT data FROM campo_routes ORDER BY created_at DESC'):db.prepare('SELECT data FROM campo_routes WHERE assignee=? ORDER BY created_at DESC').bind(actor);
    const visits=all?db.prepare('SELECT data,received_at FROM campo_route_visits ORDER BY received_at'):db.prepare('SELECT data,received_at FROM campo_route_visits WHERE actor=? ORDER BY received_at').bind(actor);
    const [a,b]=await Promise.all([routes.all(),visits.all()]);
    return json({routes:a.results.map(row=>JSON.parse(row.data)),visits:b.results.map(row=>({...JSON.parse(row.data),receivedAt:row.received_at}))});
   }catch(error){if(centralMissingTable(error))return json({routes:[],visits:[]});throw error;}
  }
  if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
  const input=await sharedBody(request,500000),now=new Date().toISOString();
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
   const operator=await db.prepare(`SELECT id,name FROM campo_users WHERE id=? AND blocked=0 AND NOT EXISTS (SELECT 1 FROM campo_user_lifecycle WHERE user_id=campo_users.id AND deleted_at IS NOT NULL)`).bind(assignee).first();
   if(!operator)throw sharedError('Selecione uma conta ativa.');
   await db.batch(ROUTE_TABLES.map(sql=>db.prepare(sql)));
   const route={id,assignee,operator:operator.name,name,locality,feeder,zone,section,...(sections.length>1?{sections}:{}),phase,spans,createdAt:now};
   const insert=await db.prepare('INSERT OR IGNORE INTO campo_routes(id,assignee,data,created_at) VALUES(?,?,?,?)').bind(id,assignee,JSON.stringify(route),now).run();
   if(!insert.meta?.changes){const stored=JSON.parse((await db.prepare('SELECT data FROM campo_routes WHERE id=?').bind(id).first()).data);const {createdAt:_new,...wanted}=route,{createdAt:_old,...existing}=stored;if(JSON.stringify(wanted)!==JSON.stringify(existing))throw sharedError('Esta rota já foi publicada. Crie uma nova rota para alterar o plano.',409);return json({route:stored});}
   return json({route},201);
  }
  if(path==='/api/routes/visit'&&actor){
   const {id,routeId,startedAt,endedAt}=input||{},start=Date.parse(startedAt),end=Date.parse(endedAt);
   if(!CampoRoutes.identifier(id)||!CampoRoutes.identifier(routeId)||!Number.isFinite(start)||!Number.isFinite(end)||start>end||end>Date.now()+600000||end-start>7*86400000||
     !Array.isArray(input.ranges)||input.ranges.length>750)throw sharedError('Dados da vistoria inválidos.');
   const entry=await db.prepare('SELECT data FROM campo_routes WHERE id=? AND assignee=?').bind(routeId,actor).first();
   if(!entry)throw sharedError('Rota não atribuída à sua conta.',404);
   const route=JSON.parse(entry.data),ids=new Set(route.spans.map(s=>s.id));
   const ranges=input.ranges.map(x=>{
    if(!x||!ids.has(x.spanId)||!Number.isInteger(x.start)||!Number.isInteger(x.end)||x.start<0||x.end>CampoRoutes.FULL||x.start>=x.end)throw sharedError('Vão ou faixa de vistoria inválida.');
    return {spanId:x.spanId,start:x.start,end:x.end};
   });
   const visit={id,routeId,actor,startedAt:new Date(start).toISOString(),endedAt:new Date(end).toISOString(),day:CampoRoutes.day(end),trackMetres:Math.round(Math.max(0,Math.min(1000000,Number(input.trackMetres)||0))),ranges,reason:CampoRoutes.text(input.reason,480)};
   if(!ranges.length&&!visit.reason)throw sharedError('Informe por que a rota foi encerrada sem cobertura.');
   await db.prepare('INSERT OR IGNORE INTO campo_route_visits(id,route_id,actor,data,received_at) VALUES(?,?,?,?,?)').bind(id,routeId,actor,JSON.stringify(visit),now).run();
   const row=await db.prepare('SELECT data,received_at FROM campo_route_visits WHERE id=? AND actor=?').bind(id,actor).first();
   if(row?.data!==JSON.stringify(visit))throw sharedError('O identificador já pertence a outra vistoria.',409);
   return json({visit:{...visit,receivedAt:row.received_at}});
  }
  throw sharedError('Operação não permitida.',403);
 }catch(error){return json({error:error.status?error.message:'Rotas temporariamente indisponíveis.'},error.status||503);}
}
