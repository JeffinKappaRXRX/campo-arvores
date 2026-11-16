'use strict';
const accessPanel=document.createElement('details');accessPanel.className='external-access';accessPanel.innerHTML='<summary>Administração</summary><form id="externalAdminForm"><label>Senha do administrador<input id="externalAdminPassword" type="password" autocomplete="current-password" required></label><button type="submit" id="externalAdminLogin" class="secondary">Entrar na Administração</button><button type="button" id="externalAdminLogout" class="secondary">Sair da Administração</button><p id="externalAccessFeedback" role="status" class="hint"></p></form>';$('setup').append(accessPanel);
$('externalAccessFeedback').textContent='O inspetor entra com seu usuário e senha. Este acesso é para cadastro inicial e recuperação do administrador.';
if(location.pathname==='/acesso')accessPanel.open=true;
$('externalAdminForm').onsubmit=async event=>{
 event.preventDefault();
 const button=$('externalAdminLogin'),password=$('externalAdminPassword'),feedback=$('externalAccessFeedback');
 if(button.disabled)return;
 if(!navigator.onLine){feedback.textContent='Conecte à internet para entrar na Administração.';return;}
 button.disabled=true;feedback.textContent='Conferindo a senha…';
 try{
  const r=await fetch('/api/admin/login',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value}),
   signal:AbortSignal.timeout?.(15000)
  });
  const data=await r.json().catch(()=>null);
  if(!r.ok||typeof data?.token!=='string'||!data.token)throw Error(data?.error||'Login indisponível. Tente novamente.');
  sessionStorage.setItem('campo-admin-session',data.token);
  await initFieldAccess();
  if(!adminAllowed)throw Error('Não foi possível confirmar a sessão. Tente novamente.');
  view('admin');feedback.textContent='Administrador conectado. Sessão válida por até 8 horas nesta aba.';
 }catch(error){
  feedback.textContent=['TypeError','TimeoutError','AbortError'].includes(error.name)?'Não foi possível acessar o servidor. Confira a conexão e tente novamente. Se funcionar nos dados móveis, a falha está no caminho da rede Wi-Fi até o serviço. Seus cadastros locais foram preservados.':error.message;
 }finally{
  password.value='';password.type='password';window.CampoPasswordVisibility?.reset(accessPanel);button.disabled=false;
 }
};
$('externalAdminLogout').onclick=async()=>{
 const button=$('externalAdminLogout'),feedback=$('externalAccessFeedback');
 if(button.disabled)return false;
 button.disabled=true;
 try{
  const result=await fetch('/api/admin/logout',{method:'POST',signal:AbortSignal.timeout?.(15000)});
  if(!result.ok)throw Error();
  sessionStorage.removeItem('campo-admin-session');
  adminAllowed=false;$('adminNav').hidden=true;view('records');feedback.textContent='Sessão administrativa encerrada.';
  return true;
 }catch{
  feedback.textContent='Não foi possível encerrar no servidor. Confira a conexão e tente novamente.';
  return false;
 }finally{button.disabled=false;}
};
const restorePanel=document.createElement('article');restorePanel.innerHTML='<h3>Restaurar backup local da versão anterior</h3><p>Importe o backup JSON exportado na Administração. Os registros mais recentes são preservados. O ZIP é para extração manual e não serve para esta importação.</p><input type="file" id="restoreCampoJson" accept=".json,application/json"><p id="restoreCampoStatus" role="status"></p>';$('admin').append(restorePanel);
$('restoreCampoJson').onchange=async e=>{const file=e.target.files[0];if(!file)return;if(!adminAllowed){$('restoreCampoStatus').textContent='Entre como administrador.';return;}if(file.size>150*1024*1024){$('restoreCampoStatus').textContent='Backup acima de 150 MB. Faça a migração por partes.';return;}try{const payload=JSON.parse(await file.text());if(payload.application!=='Campo'||!Array.isArray(payload.records))throw Error('Backup Campo inválido.');for(const r of payload.records){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id||'')||!Number.isFinite(Date.parse(r.updatedAt))||!Number.isFinite(Date.parse(r.createdAt))||!Array.isArray(r.photos))throw Error('Há cadastro inválido no arquivo.');for(const p of r.photos){for(const key of ['original','annotated'])if(p[key]&&!/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=\s]+$/i.test(p[key]))throw Error('Foto inválida no backup.');}}
if(!confirm('Restaurar '+payload.records.length+' cadastros com fotos? Registros existentes mais recentes serão preservados.'))return;syncAutomatic=false;$('syncAuto').checked=false;await req('meta','readwrite',s=>s.put(false,'syncAutomatic'));let restored=0;for(const r of payload.records){const old=await req('records','readonly',s=>s.get(r.id));if(!old||Date.parse(r.updatedAt)>Date.parse(old.updatedAt)){await req('records','readwrite',s=>s.put(r));restored++;}}records=await req('records','readonly',s=>s.getAll());renderRecords();$('restoreCampoStatus').textContent=restored+' cadastros restaurados. Confira os dados e sincronize manualmente; o envio automático ficou desligado.';}catch(err){$('restoreCampoStatus').textContent=err.message;}finally{e.target.value='';}};
