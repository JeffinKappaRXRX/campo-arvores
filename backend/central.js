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
// Dados de gestão e orçamento: só administrador lê. Os arquivos vão comprimidos em partes e o navegador junta.
async function centralAPI(request,env){try{
 if(!isAdministrator(request,env))throw sharedError('Painel restrito ao administrador.',403);
 const u=new URL(request.url),db=await adminDb(env);let meta;
 if(u.pathname==='/api/central/solicitacoes')return await centralSolicitacoes(request,db);
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
