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
 queries.push(db.prepare('INSERT INTO campo_user_sessions(token_hash,user_id,created_at,last_seen,expires_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE u.id=? AND u.revision=? AND u.blocked=0 AND c.revision=?)').bind(hash,row.id,now,now,now+CAMPO_SESSION_LIFE,row.id,row.revision,expectedCredentialRevision));
 queries.push(db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT ?,?,'login',?,'{\"method\":\"password\"}' WHERE EXISTS(SELECT 1 FROM campo_user_sessions WHERE token_hash=?)").bind(row.id,row.id,new Date(now).toISOString(),hash));
 const result=await db.batch(queries);if(!result[index].meta.changes)throw sharedError('Conta alterada ou bloqueada. Entre novamente.',401);
 const out=json({ok:true,user:authUser(row),admin:row.role==='admin'});out.headers.append('Set-Cookie',sessionCookie(CAMPO_SESSION_COOKIE,token));return out;
}
async function campoPasswordLogin(request,env){
 if(request.method!=='POST')return json({error:'Use POST.'},405);
 const b=await sharedBody(request,3000),login=String(b.username||'').trim().toLowerCase(),password=b.password;
 if(!login||login.length>254||typeof password!=='string'||password.length>128)return json({error:'Usuário ou senha incorretos.'},401);
 await campoPasswordRateLimit(request,env,login);const db=authDB(env),row=await db.prepare('SELECT u.*,c.username,c.password_hash,c.salt,c.revision credential_revision FROM campo_users u JOIN campo_user_credentials c ON c.user_id=u.id WHERE c.username=? COLLATE NOCASE OR u.email=? COLLATE NOCASE').bind(login,login).first();
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
