// Private, one-shot inventory requested through the Cloudflare control plane.
// Does not alter Drive files or inspection records.
async function runRepositoryInventory(env){
 const db=env.SHARED_DB,id='repository-inventory',job=await db.prepare('SELECT status FROM campo_maintenance WHERE id=?').bind(id).first();
 if(job?.status!=='inspect')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='inspect'").bind(id).run();if(!claim.meta?.changes)return;
 try{const inventory=await universalAdminRecords(env);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('review_required',JSON.stringify(inventory),id).run();}
 catch(e){const detail=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify({error:detail}),id).run();}
}

// No public route starts this job. A Cloudflare account administrator supplies the
// exact reviewed IDs and versions in D1; each item still uses normal deletion locks.
async function runAuthorizedRepositoryCleanup(env){
 const db=env.SHARED_DB,id='authorized-homologation-cleanup',job=await db.prepare('SELECT status,result FROM campo_maintenance WHERE id=?').bind(id).first();if(job?.status!=='approved')return;
 const claim=await db.prepare("UPDATE campo_maintenance SET status='running' WHERE id=? AND status='approved'").bind(id).run();if(!claim.meta?.changes)return;
 const state=JSON.parse(job.result);try{
 if(state.authorization!=='explicit_selected_ids'||!Array.isArray(state.records)||state.records.length<1||state.records.length>2)throw Error('Manifesto de manutenção inválido.');
 const current=await universalAdminRecords(env);for(const r of state.records){const c=current.records.find(x=>x.id===r.id);if(!c||c.adminClassification!=='homologacao'||c.updatedAt!==r.version||c.archiveVersion!==r.archiveVersion||c.adminLabelRevision!==r.labelRevision)throw Error('Cadastro ou classificação mudou. Revisão obrigatória antes de excluir.');}
 const result=await universalAdminDelete(env,{records:state.records});state.deletedIds=result.deletedIds;state.finishedAt=new Date().toISOString();await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('completed',JSON.stringify(state),id).run();
 }catch(e){state.error=String(e.message||e).split(env.GOOGLE_SCRIPT_TOKEN||'__none__').join('[redigido]').replace(/https?:\/\/\S+/g,'[endereço]').slice(0,600);await db.prepare('UPDATE campo_maintenance SET status=?,result=? WHERE id=?').bind('failed',JSON.stringify(state),id).run();}
}
