# Campo — publicação no GitHub, sem login no ChatGPT

Pacote de migração baseado na V3.12.0, preparado em 13/10/2026.

## 1. O que este pacote entrega

- `docs/`: aplicação para publicar no GitHub Pages. Interface móvel, offline, GPKG, mapas, fotos, identificação em lote, validação, ZIP e KPIs.
- `backend/`: API para publicar no Cloudflare Workers. Protege a chave Pl@ntNet e a integração Google; substitui a identidade do GPT por código da equipe e senha administrativa.
- `docs/google-drive-update.gs.txt`: receptor atualizado do Google Apps Script. O mesmo projeto/pasta pode continuar sendo usado.
- `backend/verify.mjs`: teste de autenticação e autorização, executável localmente.
- `PUBLICACAO-CHECKLIST.md`: critérios antes de distribuir à equipe.

Não há fotos, cadastros reais, arquivo GPKG, chave Pl@ntNet, token Google ou senha real neste pacote. Os identificadores de pasta/rede e a URL do receptor são referências do seu projeto; não concedem acesso sem as credenciais. A referência corporativa antiga do SharePoint foi removida nesta cópia.

GitHub Pages é hospedagem estática: sozinho não executa a API. Portanto, não basta subir a pasta e esperar sincronização/identificação funcionarem. Os dois serviços abaixo são necessários.

**O site atual não foi alterado nem desativado. Esta cópia ainda precisa ser implantada nas suas contas.**

## 2. Contas e programas

1. Conta GitHub.
2. Conta Cloudflare, começando no plano Free.
3. Sua conta Google, com acesso à pasta e ao Apps Script existentes.
4. Node.js LTS instalado no computador: https://nodejs.org/
5. Um editor de texto, como VS Code.

Limites consultados em 13/10/2026: Workers Free tem 100.000 requisições/dia e CPU de 10 ms por requisição; Workers KV Free tem 100.000 leituras e 1.000 escritas/dia. Apps Script e Pl@ntNet também têm suas próprias cotas. Não é garantia de capacidade ilimitada ou de que fotos grandes cabem no orçamento de CPU. Teste uploads reais antes de liberar muitos tablets. Não ative planos pagos sem decidir expressamente.

## 3. Primeiro: proteger o que já existe

No app atual, abra Administração e baixe **Backup JSON com fotos**, além de um ZIP.

- O JSON restaura cadastros/fotos no novo endereço.
- O ZIP é uma cópia para extração/manual; não é importado pelo botão de restauração.
- O Drive é o mesmo, se você mantiver as referências e os tokens existentes.
- Armazenamento local pertence ao endereço do site. Mudar para GitHub não copia IndexedDB, ruas, GPKG ou rascunhos.
- Rascunhos ainda não salvos devem ser salvos antes da migração.
- Não apague o app antigo ou seus dados antes de conferir o novo.

## 4. Criar o repositório GitHub

No GitHub:

1. **New repository** → nome `campo-arvores`.
2. Para GitHub Pages gratuito em conta Free, use repositório **Public**. O código e os arquivos da pasta docs serão públicos; não envie dados de campo nem segredos. Se desejar repositório privado, confira se seu plano suporta Pages privado; outra opção é hospedar a interface na Cloudflare.
3. Extraia este ZIP. Envie as pastas `docs` e `backend`, os arquivos de orientação e `.gitignore` para a raiz do repositório. Envie os arquivos extraídos, não apenas o ZIP.
4. **Settings → Pages → Build and deployment → Deploy from a branch**.
5. Selecione branch `main`, pasta `/docs`, e **Save**.
6. Aguarde a publicação e anote a URL informada, normalmente `https://SEU-USUARIO.github.io/campo-arvores/`.

A interface já pode abrir nessa fase, mas os serviços só funcionarão depois de configurar a API. Não envie GPKG ou backups JSON ao repositório público.

## 5. Publicar a API na Cloudflare — primeira vez

Abra um terminal na pasta extraída `backend`.

```powershell
npm install
npx wrangler login
npx wrangler kv namespace create LOGIN_GUARD
```

O último comando retorna um ID. Copie esse ID para `backend/wrangler.toml`, no campo `id` abaixo de `binding = "LOGIN_GUARD"`.

Edite também:

- `APP_ORIGIN`: origem do seu Pages, por exemplo `https://jefferson.github.io`. **Sem `/campo-arvores/` e sem barra final.** Se usar domínio próprio, use sua origem HTTPS real.
- `GOOGLE_SCRIPT_URL`: o pacote traz a última URL /exec informada na conversa. Confira se ainda é a implantação que você usa; altere se necessário.
- `CAMPO_ADMIN_EMAIL`: deixe o valor técnico padrão. Este login não usa conta de e-mail; usa a senha abaixo.

Publique uma primeira versão:

```powershell
npm run deploy
```

Se o Wrangler avisar que o Worker não existe, confirme a criação. O terminal informa uma URL como `https://campo-api.SEUSUBDOMINIO.workers.dev`. Neste momento a API recusa operação até receber os segredos — isso é esperado.

## 6. Guardar as credenciais no Worker

Execute um comando por vez. Cada um pedirá o valor de forma interativa. Não cole os valores no GitHub, no `config.js`, no `wrangler.toml` ou neste guia.

```powershell
npx wrangler secret put GOOGLE_SCRIPT_TOKEN
npx wrangler secret put PLANTNET_API_KEY
npx wrangler secret put FIELD_ACCESS_TOKEN
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put ADMIN_SESSION_SECRET
```

| Nome | Valor |
|---|---|
| `GOOGLE_SCRIPT_TOKEN` | A CHAVE_INTEGRACAO existente, inteira e sem espaços extras. Não gere outra sem atualizar o receptor. |
| `PLANTNET_API_KEY` | A chave válida do seu Pl@ntNet. |
| `FIELD_ACCESS_TOKEN` | Um código aleatório forte com pelo menos 32 caracteres, para a equipe. |
| `ADMIN_PASSWORD` | Sua senha administrativa exclusiva, com pelo menos 14 caracteres; prefira uma senha aleatória longa. |
| `ADMIN_SESSION_SECRET` | Outro valor aleatório com pelo menos 32 caracteres, diferente do código da equipe. Nunca distribua. |

Para gerar um valor aleatório no seu computador:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Execute separadamente para cada segredo que precisar gerar. Guarde os valores em um gerenciador de senhas.

O namespace KV limita tentativas administrativas. Por usar KV distribuído, é proteção de melhor esforço; não equivale a um bloqueio global estrito contra tentativas simultâneas. O código de equipe e a senha forte continuam necessários.

Depois:

```powershell
npm run deploy
```

## 7. Ligar a interface à API

Edite `docs/config.js`:

```javascript
window.CAMPO_CONFIG = {
  apiBase: 'https://campo-api.SEUSUBDOMINIO.workers.dev'
};
```

Coloque somente o endereço HTTPS retornado pela Cloudflare, sem barra final. Envie este arquivo atualizado ao GitHub e aguarde o Pages republicar.

O app continua em GitHub Pages. A URL do Worker é somente a API, não a tela do app.

## 8. Conferir o receptor Google

Se ainda não atualizou para produtividade/exclusão administrativa:

1. No mesmo projeto Apps Script, substitua Código.gs por `docs/google-drive-update.gs.txt`.
2. Preserve a chave `CAMPO_SECRET` existente. Não apague as propriedades do projeto.
3. Execute `configurarCampo` para validar a pasta e `configurarRedeCampo` para a rede central.
4. Execute `atualizarConsolidadoCampo` para incorporar pastas antigas à base administrativa.
5. **Implantar → Gerenciar implantações → Editar → Nova versão → Implantar**.
6. Mantenha executar como **Eu**, acesso **Qualquer pessoa**, URL `/exec` e a chave atuais.

Se criar uma nova implantação com URL diferente, altere `GOOGLE_SCRIPT_URL` em wrangler.toml e publique o Worker novamente.

## 9. Link para a equipe e acesso administrativo

Link normal:

`https://SEU-USUARIO.github.io/campo-arvores/`

Link autorizado para o inspetor:

`https://SEU-USUARIO.github.io/campo-arvores/#acesso=SEU_FIELD_ACCESS_TOKEN`

O app lê o código do fragmento, guarda-o apenas no aparelho e remove-o da barra de endereço. Também há opção de informar o código na tela de acesso. Escolha um código hexadecimal para não precisar codificar caracteres especiais na URL.

- Inspetores **não fazem login no GPT nem no Google** para sincronizar.
- Compartilhe apenas o código/link da equipe. Não compartilhe senha administrativa nem chaves de API.
- Para Administração, abra **Acesso da equipe e administrador**, informe `ADMIN_PASSWORD` e entre. A sessão dura até 8 horas, nesta aba.
- A senha é verificada no servidor; mudar o HTML não concede autorização administrativa.
- Quem receber o link completo consegue usar os serviços e pode repassá-lo. Não há identificação individual autenticada; o nome do inspetor continua informado no formulário.
- O código controla a API, não esconde o código HTML/JS hospedado publicamente nem os dados locais que o próprio usuário já coletou.

**Estar acessível por link não torna o uso autorizado em um tablet corporativo e não oculta tráfego da empresa.**

## 10. Restaurar os seus cadastros e preparar os tablets

No novo endereço:

1. Abra com o código da equipe.
2. Entre na Administração.
3. Na parte inferior, use **Restaurar backup local da versão anterior** e selecione o JSON exportado do app atual. Limite por arquivo: 150 MB; para backups maiores, migre em partes.
4. Confira quantidades, fotos, coordenadas e registros. A importação não apaga versões locais mais recentes e desliga envio automático para você conferir antes.
5. Confira conexão e sincronize os pendentes manualmente. Recebimentos já confirmados são preservados; não há reenvio automático de todas as inspeções.
6. Atualize a rede do Drive e baixe as ruas offline de novo no novo endereço.
7. Em cada tablet novo, preencha o nome do inspetor e prepare a rede/ruas. O backup local do seu aparelho não é copiado para todos os inspetores.

## 11. Rotina de atualização — como você pediu

1. Testamos a alteração aqui no ambiente atual.
2. Eu preparo um novo pacote externo compatível com o GitHub/Worker. Não é suficiente exportar o Worker original de Sites sem adaptar autenticação e rotas.
3. Faça backup antes de substituir a versão em produção.
4. Atualize arquivos da pasta `docs` no mesmo repositório/URL. **Preserve seu `docs/config.js`** com o endereço real da API.
5. Se o pacote também alterar a API, atualize `backend`, preserve seu `wrangler.toml` com a origem, URL do Google e ID do KV, e rode `npm run deploy`.
6. Os segredos já cadastrados na Cloudflare permanecem; não é preciso digitá-los a cada deploy.
7. Atualize o Apps Script somente se o guia da nova versão pedir.
8. Abra o app online, confira a versão no rodapé e teste offline/sincronização.

Não mude o nome do repositório, domínio ou pasta publicada durante atualizações comuns: isso pode mudar o endereço e separar o armazenamento local. Uma versão de Service Worker nova deve ter nome de cache novo; isso será ajustado em cada pacote.

## 12. Teste de aceitação

Use `PUBLICACAO-CHECKLIST.md`. Os testes locais de autenticação passaram, mas o pacote ainda não foi testado nas suas contas Cloudflare/GitHub ou no tablet corporativo.

Teste técnico local da API:

```powershell
node build.mjs
node verify.mjs
```

Teste no ambiente publicado: cadastro TESTE com foto, identificação, envio, Excel consolidado, ZIP e modo avião. Confira a CPU por requisição em Workers → Metrics; se ultrapassar o plano Free, reduza a resolução das fotos ou avalie a arquitetura/plano antes de ampliar a equipe.

## 13. Recuperação e revogação

- Para revogar o link da equipe, altere `FIELD_ACCESS_TOKEN` na Cloudflare e distribua o novo link. Os aparelhos com o código antigo deixam de sincronizar; dados locais continuam salvos.
- Para revogar sessões administrativas imediatamente, altere `ADMIN_SESSION_SECRET`. Alterar apenas ADMIN_PASSWORD impede novos logins com a senha antiga, mas não invalida sessões existentes antes do vencimento.
- ZIP e JSON baixados continuam cópias independentes. Excluir no repositório não apaga backups já exportados.
- Nunca publique .dev.vars, .env, fotos, backups ou o GPKG no repositório público.

## 14. Fontes oficiais consultadas

- GitHub Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages
- Configuração Pages: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
- Limites Workers: https://developers.cloudflare.com/workers/platform/limits/
- Segredos Wrangler: https://developers.cloudflare.com/workers/wrangler/commands/workers/
- Criar KV: https://developers.cloudflare.com/kv/get-started/
- Limites KV: https://developers.cloudflare.com/kv/platform/limits/


## Configuração privada removida do código público

Os IDs da pasta e do GPKG e a URL do Apps Script não são distribuídos no repositório. Configure no Worker com `npx wrangler secret put GOOGLE_SCRIPT_URL` e `npx wrangler secret put REDE_CAMPO_ID`. No modelo `docs/google-drive-update.gs.txt`, substitua `CONFIGURE_ID_PASTA_PRIVADA` e `CONFIGURE_ID_GPKG_PRIVADO` apenas no seu projeto privado do Apps Script. Não envie o modelo preenchido para o GitHub.
