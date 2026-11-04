**Endereço oficial fixo: https://mapeamento-arvores.pages.dev/**

# Campo — inspeção de vegetação

| Componente | Endereço |
| --- | --- |
| Aplicativo de inspeção | [Abrir app](https://mapeamento-arvores.pages.dev/) |
| Painel de gestão, com poda, manutenção e orçamento | [Abrir painel](https://mapeamento-arvores.pages.dev/gestao.html) |
| Documentação técnica e publicações | [hosting/README.md](hosting/README.md) |

Aplicativo para registro de árvores, mapa da rede, operação offline e sincronização.

**Versão:** 4.1.0.

## Publicação

A interface está em `docs/`. No GitHub, abra **Settings → Pages**, escolha **Deploy from a branch**, branch **main**, pasta **/docs**, e salve.

Endereço esperado após ativação: https://JeffinKappaRXRX.github.io/campo-arvores/

O ambiente existente utiliza a API Cloudflare configurada em `docs/config.js`. Novos ambientes precisam de bindings e secrets próprios.

A versão 4.0 inclui mapa compartilhado da equipe, importação CSV/XLSX e pedidos de exclusão com evidência e aprovação administrativa. Veja o [guia da base compartilhada](BASE-COMPARTILHADA.md).

Se o Pages estiver configurado na raiz, `index.html` encaminha para `docs/`.

Siga o [guia completo](LEIA-ME.md) e o [checklist de validação](PUBLICACAO-CHECKLIST.md).

## Dados e credenciais

Não publique fotos, cadastros, backups, GPKGs privados ou chaves de API neste repositório. As credenciais são configuradas como secrets no backend. Dados já salvos no navegador do endereço antigo não migram automaticamente; use o backup descrito no guia.


## Configuração privada removida do código público

Os IDs da pasta e do GPKG e a URL do Apps Script não são distribuídos no repositório. Configure no Worker com `npx wrangler secret put GOOGLE_SCRIPT_URL` e `npx wrangler secret put REDE_CAMPO_ID`. No modelo `docs/google-drive-update.gs.txt`, substitua `CONFIGURE_ID_PASTA_PRIVADA` e `CONFIGURE_ID_GPKG_PRIVADO` apenas no seu projeto privado do Apps Script. Não envie o modelo preenchido para o GitHub.

A lista privada de alimentadores e as cores por identificador não estão incluídas. Carregue essa configuração dentro do aplicativo, junto com a base privada. Os perfis genéricos das quatro camadas foram preservados.


A publicação oficial usa `hosting/pages-worker.js` na Cloudflare Pages. Ela serve a interface de `docs/` do GitHub e encaminha a API por service binding privado `CAMPO_API`. Atualizações em `docs/` mantêm o endereço; aumente a versão do service worker. A integração Git da Cloudflare está indisponível nesta conta; a publicação direta já está configurada.

## ARBORA 4.7.0 — poda, limpeza e painel operacional

- **Nome do programa:** ARBORA identifica o módulo de poda e limpeza. Manutenção e orçamento continuam como módulos próprios da gestão integrada.
- **Conciliação VERA:** a base ativa contém 3.478 árvores com IDs únicos. Destas, 3.376 possuem distância de MT, BT ou AT válida para a previsão; as 102 restantes continuam no parque e aparecem como pendentes de medição, sem exclusão nem duplicação.
- **Filtros:** plano, polo e localidade são globais e encadeados. As telas do BI, poda, manutenção e mapa recebem o mesmo recorte, inclusive quando a ligação ocorre pela chave ou pelo alimentador.
- **Exportação:** o CSV padrão segue exatamente as 17 colunas de `template.csv`, aceita período inicial/final e, quando marcado, acrescenta ID do vão, chave, logradouro, município, perímetro e link da foto.
- **Tempo real:** inclusão, edição, mesclagem, pedido/aprovação de exclusão e importação administrativa publicam uma invalidação para o painel e para o campo. Se o canal em tempo real cair, a consulta periódica permanece como contingência.
- **Medição em celulares simples:** a captura por inclinação mantém a janela rigorosa como primeira opção e oferece estabilização assistida após alguns segundos quando o sensor é mais ruidoso. Régua no mapa e entrada manual continuam como alternativas quando WebXR ou sensores não estão disponíveis no navegador.
- **GeoPackage:** a troca de base fecha conexões anteriores, reserva capacidade antes da importação, evita colisão no arquivo e recupera a base anterior quando a nova não pode ser aberta.

Validação da 4.7.0: todos os verificadores do backend e a suíte de campo/gestão passaram, incluindo tempo real, histórico, GeoPackage, 15 mil registros sintéticos, filtros globais, quatro visões do BI e fallback de mapa offline. Os testes não substituem homologação física em cada modelo de aparelho nem tornam WebXR disponível onde o navegador/fabricante não o oferece.
