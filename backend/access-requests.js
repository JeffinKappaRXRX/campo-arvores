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
