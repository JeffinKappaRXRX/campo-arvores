const CENTRAL_NAME=/^[a-z0-9_]{1,40}$/,CENTRAL_GENERATION=/^cen-[0-9]{8,20}$/,CENTRAL_BODY=/^[A-Za-z0-9+/]+={0,2}$/;
function centralMissingTable(e){return /no such table/i.test(String(e?.message||e));}
async function centralMeta(db){const {results}=await db.prepare('SELECT key,value FROM central_meta').all();return Object.fromEntries(results.map(r=>[r.key,r.value]));}
// Dados de gestão e orçamento: só administrador lê. Os arquivos vão comprimidos em partes e o navegador junta.
async function centralAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 if(request.method!=='GET')throw sharedError('Use GET.',405);
 const u=new URL(request.url),db=await adminDb(env);let meta;
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
