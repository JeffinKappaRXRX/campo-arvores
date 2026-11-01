const encoder=new TextEncoder();
const b64=bytes=>btoa(String.fromCharCode(...bytes)).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const unb64=s=>Uint8Array.from(atob(s.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0));
async function equalSecret(a,b){if(typeof a!=='string'||typeof b!=='string')return false;const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);let diff=0;const xx=new Uint8Array(x),yy=new Uint8Array(y);for(let i=0;i<xx.length;i++)diff|=xx[i]^yy[i];return diff===0;}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.ADMIN_SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function issueSession(env){const payload=b64(encoder.encode(JSON.stringify({role:'admin',exp:Math.floor(Date.now()/1000)+28800,aud:env.APP_ORIGIN}))),sig=await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload));return payload+'.'+b64(new Uint8Array(sig));}
async function validSession(token,env){try{if(!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32)return false;const [payload,sig,extra]=token.split('.');if(extra||!payload||!sig)return false;const okay=await crypto.subtle.verify('HMAC',await sessionKey(env),unb64(sig),encoder.encode(payload));if(!okay)return false;const data=JSON.parse(new TextDecoder().decode(unb64(payload)));return data.role==='admin'&&data.aud===env.APP_ORIGIN&&data.exp>Math.floor(Date.now()/1000);}catch{return false;}}
export default {async scheduled(event,env,ctx){ctx.waitUntil((async()=>{await runRepositoryInventory(env);await runAuthorizedRepositoryCleanup(env);})());},async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/api/auth/keys'){if(request.method!=='GET')return json({error:'Use GET.'},405);try{return json({keys:[(await campoEvaluationKey(env)).publicKey]});}catch{return json({error:'Chaves indisponíveis.'},503);}}
 if(path==='/api/auth/evaluate')return campoExternalEvaluation(request,env);
 const origin=request.headers.get('Origin'),url=new URL(request.url);const allowed=[env.APP_ORIGIN,...String(env.APP_ADDITIONAL_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean)];const cors=allowed.includes(origin)?{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Campo-Access','Vary':'Origin'}:{};
 const response=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(!allowed.includes(origin))return response({error:'Origem não autorizada.'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<14||!env.ADMIN_SESSION_SECRET||env.ADMIN_SESSION_SECRET.length<32||!env.LOGIN_GUARD)return response({error:'Configure administrador e LOGIN_GUARD no Worker.'},503);
 // The password is retained for initial administrator provisioning and recovery.
 if(url.pathname==='/api/admin/login'){
  if(request.method!=='POST')return response({error:'Use POST.'},405);if(Number(request.headers.get('content-length')||0)>2048)return response({error:'Solicitação grande demais.'},413);
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',hash=b64(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(ip)))),bucket=Math.floor(Date.now()/60000),guard='login:'+hash+':'+bucket;const tries=Number(await env.LOGIN_GUARD.get(guard)||0);if(tries>=5)return response({error:'Muitas tentativas. Aguarde um minuto.'},429);try{await env.LOGIN_GUARD.put(guard,String(tries+1),{expirationTtl:120});}catch{return response({error:'Aguarde alguns segundos antes de tentar entrar novamente.'},429);}
  let data;try{const raw=await request.text();if(raw.length>2048)return response({error:'Solicitação inválida.'},413);data=JSON.parse(raw);}catch{return response({error:'Solicitação inválida.'},400);}
  if(!await equalSecret(String(data.password||''),env.ADMIN_PASSWORD))return response({error:'Senha incorreta.'},401);return response({token:await issueSession(env),expiresIn:28800});
 }
 let identity=null;try{identity=await authenticatedOperator(request,env);}catch{if(fieldAuthenticationRequired(env))return response({error:'Autenticação central indisponível. Seus cadastros locais foram preservados.'},503);}
 const bootstrapAdmin=await validSession((request.headers.get('Authorization')||'').replace(/^Bearer /,''),env);
 let authResult=null;
 try{if(path==='/api/auth/start')authResult=await campoAuthStart(request,env);
 else if(path==='/api/auth/complete')authResult=await campoAuthComplete(request,env);
 else if(path==='/api/auth/status')authResult=await campoAuthStatus(request,env,identity,bootstrapAdmin||identity?.user.role==='admin');
 else if(path==='/api/auth/logout')authResult=await campoAuthLogout(request,env,identity);
 else if(path==='/api/admin/users')authResult=await campoManageUsers(request,env,identity,bootstrapAdmin);
 else if(path==='/api/access')authResult=response({admin:Boolean(bootstrapAdmin||identity?.user.role==='admin'),authenticated:Boolean(identity),user:identity?.user||null,required:fieldAuthenticationRequired(env)});
 }catch(e){authResult=response({error:e.status?e.message:'Não foi possível concluir a autenticação.'},e.status||503);}
 if(authResult){for(const [k,v]of Object.entries(cors))authResult.headers.set(k,v);return authResult;}
 if(fieldAuthenticationRequired(env)&&!identity&&!bootstrapAdmin)return response({error:'Entre com seu e-mail autorizado para acessar os dados compartilhados.',code:'AUTH_REQUIRED'},401);
 const headers=new Headers(request.headers);for(const key of [...headers.keys()])if(key.toLowerCase().startsWith('oai-'))headers.delete(key);headers.set('Origin',url.origin);
 const admin=bootstrapAdmin||identity?.user.role==='admin';headers.delete('Authorization');if(admin){headers.set('oai-authenticated-user-id','external-admin');headers.set('oai-authenticated-user-email',env.CAMPO_ADMIN_EMAIL||'administrador@campo.local');}
 const result=await internalApp.fetch(new Request(request,{headers}),{...env,CAMPO_ADMIN_EMAIL:env.CAMPO_ADMIN_EMAIL||'administrador@campo.local',CAMPO_USER:identity?.user||null,CAMPO_DEVICE_SESSION:identity?{hash:identity.session.token_hash,token:identity.token}:null});const output=new Response(result.body,result);for(const [k,v]of Object.entries(cors))output.headers.set(k,v);output.headers.set('Cache-Control','no-store');return output;
}};
