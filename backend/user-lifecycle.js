// Account removal preserves inspection authorship; credentials and sessions are revoked.
async function campoDeleteUser(db,body,actor){
 if(!sharedId(body.id)||!Number.isSafeInteger(body.revision)||body.confirmation!=='EXCLUIR')throw sharedError('Confirme a exclusão do usuário selecionado.');
 const stamp=new Date().toISOString(),operation=crypto.randomUUID();
 const result=await db.batch([
  db.prepare("INSERT OR IGNORE INTO campo_user_lifecycle(user_id,deleted_at,deleted_by,operation_id) SELECT u.id,?,?,? FROM campo_users u WHERE u.id=? AND u.revision=? AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=u.id) AND (u.role<>'admin' OR u.blocked=1 OR EXISTS(SELECT 1 FROM campo_users other WHERE other.id<>u.id AND other.role='admin' AND other.blocked=0 AND NOT EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=other.id)))").bind(stamp,actor,operation,body.id,body.revision),
  db.prepare('UPDATE campo_users SET blocked=1,revision=revision+1,updated_at=? WHERE id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(stamp,body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('DELETE FROM campo_user_credentials WHERE user_id=? AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare('UPDATE campo_presence SET active=0,lat=NULL,lon=NULL,accuracy=NULL,location_at=NULL,sharing=0 WHERE session_id IN (SELECT session_id FROM campo_presence_identities WHERE user_id=?) AND EXISTS(SELECT 1 FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?)').bind(body.id,body.id,operation),
  db.prepare("INSERT INTO campo_auth_audit(user_id,actor_id,action,at,detail) SELECT user_id,?,'delete_user',?,'{}' FROM campo_user_lifecycle WHERE user_id=? AND operation_id=?").bind(actor,stamp,body.id,operation)
 ]);
 if(!result[0].meta.changes)throw sharedError('Não foi possível excluir: conta alterada, já excluída ou último administrador ativo. Atualize a lista.',409);
 return json({ok:true,deleted:true,id:body.id});
}
