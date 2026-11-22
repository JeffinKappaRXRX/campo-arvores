const CYCLE_SIZE=4500000;
const CYCLE_TABLE='CREATE TABLE IF NOT EXISTS campo_cycle_snapshot (name TEXT PRIMARY KEY, revision TEXT NOT NULL, changed TEXT NOT NULL, parts INTEGER NOT NULL, data TEXT)';
async function cicloPodaAPI(request,env){
 try{
  if(!isAdministrator(request,env))throw sharedError('Ciclo de poda restrito à gestão.',403);
  const db=await adminDb(env),url=new URL(request.url);
  let current;
  try{current=await db.prepare("SELECT revision,changed,parts FROM campo_cycle_snapshot WHERE name='active'").first();}
  catch(error){if(!centralMissingTable(error))throw error;}
  if(request.method==='GET'){
   if(url.searchParams.get('meta')==='1')return json({revision:current?.revision||null,changed:current?.changed||null});
   if(!current)throw sharedError('Importe o Controle Man V1.xlsx para ativar o plano.',404);
   const {results}=await db.prepare("SELECT data FROM campo_cycle_snapshot WHERE revision=? AND name<>'active' ORDER BY name").bind(current.revision).all();
   const archive=results.length===current.parts?new Blob(results.map(row=>Uint8Array.from(atob(row.data),char=>char.charCodeAt(0)))):null;
   if(!archive?.size||archive.size>CYCLE_SIZE)throw sharedError('Base de ciclo incompleta. Atualize e tente novamente.',409);
   return new Response(archive,{headers:{'Content-Type':'application/gzip','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','X-Cycle-Revision':current.revision}});
  }
  if(request.method!=='POST')throw sharedError('Use GET ou POST.',405);
  if(request.headers.get('Content-Type')!=='application/gzip')throw sharedError('Envie a base em formato gzip.',415);
  const expected=url.searchParams.get('base')||'';
  if(expected!==(current?.revision||''))throw sharedError('Outra publicação atualizou o ciclo. Atualize a página antes de enviar.',409);
  let body;
  try{body=await limitedBody(request,CYCLE_SIZE);}
  catch{throw sharedError('Arquivo compactado excede 4,5 MB ou está vazio.',413);}
  let data;
  try{
   const compressed=new Response(body.stream().pipeThrough(new DecompressionStream('gzip')));
   data=JSON.parse(await(await limitedBody(compressed,20000000)).text());
  }catch{throw sharedError('Base de ciclo inválida ou excede 20 MB descompactada.');}
  if(!data.postes?.linhas?.length||data.checagem_excel?.length!==data.postes.linhas.length||
     !Array.isArray(data.arvores?.linhas)||!Array.isArray(data.execucoes)||!Number.isInteger(data.parametros?.inicio))
   throw sharedError('A base deve conter os postes, árvores, execuções, premissas e conferência.');
  await db.prepare(CYCLE_TABLE).run();
  const bytes=new Uint8Array(await body.arrayBuffer()), parts=[];
  const revision=crypto.randomUUID(),changed=new Date().toISOString();
  for(let offset=0;offset<bytes.length;offset+=240000){
   let raw='';const end=Math.min(offset+240000,bytes.length);
   for(let i=offset;i<end;i+=8192)raw+=String.fromCharCode(...bytes.subarray(i,Math.min(end,i+8192)));
   parts.push(btoa(raw));
  }
  // One transaction: readers see either the previous snapshot or all parts of the new one.
  const old=current?.revision||'';
  const guard="COALESCE((SELECT revision FROM campo_cycle_snapshot WHERE name='active'),'')=?";
  const batch=parts.map((part,i)=>db.prepare('INSERT INTO campo_cycle_snapshot SELECT ?,?,?,?,? WHERE '+guard)
    .bind(revision+':'+String(i).padStart(3,'0'),revision,changed,0,part,old));
  batch.push(db.prepare("DELETE FROM campo_cycle_snapshot WHERE name<>'active' AND revision<>? AND "+guard).bind(revision,old));
  batch.push(db.prepare("INSERT OR REPLACE INTO campo_cycle_snapshot SELECT 'active',?,?,?,NULL WHERE "+guard).bind(revision,changed,parts.length,old));
  const results=await db.batch(batch);
  if(!results.at(-1).meta?.changes)throw sharedError('Outra publicação atualizou o ciclo. Atualize a página antes de enviar.',409);
  return json({revision,changed,postes:data.postes.linhas.length,arvores:data.arvores.linhas.length,execucoes:data.execucoes.length});
 }catch(error){return json({error:error.status?error.message:'Base de ciclo temporariamente indisponível.'},error.status||503);}
}
