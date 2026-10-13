# Campo — inspeção de vegetação

Aplicativo para registro de árvores, mapa da rede, operação offline e sincronização.

**Versão:** 3.12.0.

## Publicação

A interface está em `docs/`. No GitHub, abra **Settings → Pages**, escolha **Deploy from a branch**, branch **main**, pasta **/docs**, e salve.

Endereço esperado após ativação: https://JeffinKappaRXRX.github.io/campo-arvores/

**A API ainda precisa ser implantada e configurada.** O endereço em `docs/config.js` é um exemplo; identificação e sincronização só funcionarão após configurar o backend.

Siga o [guia completo](LEIA-ME.md) e o [checklist de validação](PUBLICACAO-CHECKLIST.md).

## Dados e credenciais

Não publique fotos, cadastros, backups, GPKGs privados ou chaves de API neste repositório. As credenciais são configuradas como secrets no backend. Dados já salvos no navegador do endereço antigo não migram automaticamente; use o backup descrito no guia.


## Configuração privada removida do código público

Os IDs da pasta e do GPKG e a URL do Apps Script não são distribuídos no repositório. Configure no Worker com `npx wrangler secret put GOOGLE_SCRIPT_URL` e `npx wrangler secret put REDE_CAMPO_ID`. No modelo `docs/google-drive-update.gs.txt`, substitua `CONFIGURE_ID_PASTA_PRIVADA` e `CONFIGURE_ID_GPKG_PRIVADO` apenas no seu projeto privado do Apps Script. Não envie o modelo preenchido para o GitHub.

A lista privada de alimentadores e as cores por identificador não estão incluídas. Carregue essa configuração dentro do aplicativo, junto com a base privada. Os perfis genéricos das quatro camadas foram preservados.
