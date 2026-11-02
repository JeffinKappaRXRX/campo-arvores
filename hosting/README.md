# Publicação no endereço oficial

O endereço fixo é https://mapeamento-arvores.pages.dev/.

Na versão 4.2.0, a entrega direta contém os arquivos alterados da interface. Os demais recursos continuam no GitHub Pages. A API usa o service binding CAMPO_API, sem credenciais na interface.

Após alterar os arquivos em docs/, execute `node hosting/build-release.mjs` e publique hosting/dist/_worker.js no projeto Cloudflare Pages mapeamento-arvores, como Worker avançado, com manifesto de assets vazio e branch main. Preserve o service binding CAMPO_API e as configurações existentes. Inclua na lista de build-release.mjs quaisquer outros arquivos alterados que precisem ser publicados antes do GitHub Pages concluir sua execução.

Somente enviar um commit ao GitHub não substitui os arquivos incluídos nesse pacote. Gere e publique o pacote em cada atualização. O endereço público continua o mesmo. Não inclua senhas, tokens ou arquivos privados da rede nesse pacote.


## Atualizações obrigatórias (4.2.3+)

Sempre execute `node hosting/build-release.mjs` antes de publicar. O build calcula uma impressão dos arquivos da interface, gera uma nova chave do service worker e inclui os scripts da mesma versão no pacote. Isso dispara a detecção de atualização mesmo quando alguém esquecer de incrementar o número exibido no rodapé.

O aplicativo verifica atualizações ao abrir, retornar, reconectar e a cada minuto enquanto está visível. Depois de baixar todos os componentes, pede Atualizar agora e aguarda operações em andamento. O rascunho só libera o recarregamento após concluir a transação local; falha ao preservar os dados mantém a tela aberta. Cadastros, fotos, GPKG e ruas offline não são removidos. Sem internet, a versão já preparada continua disponível.

Na primeira migração das versões anteriores a 4.2.3, reabra a página uma vez para carregar o gerenciador. As versões seguintes já avisam dentro do app.


## Ruas automáticas e alternância de fundo (4.2.4+)

Preparar/importar um GPKG agenda ruas de 30 km da região de trabalho. Bases já instaladas são verificadas na abertura, retorno e reconexão. Uma área completa que ainda cobre o trabalho é reutilizada. A escolha usa árvore atual, GPS disponível, extensão pequena do GPKG ou mapa aproximado; uma base de todo o estado exige localizar a região de trabalho, e não usa cegamente o centro geográfico do Acre. Não é um pacote de ruas de todo o Acre.

O download é serial, usa Web Locks entre abas quando disponível, aguarda respostas 429/erros transitórios e persiste cada parte concluída. Interrupções retomam automaticamente com o app aberto. A área antiga só é substituída em uma transação após completar a nova. Na primeira preparação, partes concluídas podem ser visualizadas com indicação de cobertura parcial. Fechar a aba não continua o download em segundo plano.

A conexão real é verificada a cada 20 segundos enquanto visível, além dos eventos do navegador. Falha de internet ou do híbrido usa ruas salvas; recuperar acesso restaura o híbrido. O ponto da árvore não é modificado. O download manual e a opção de desativar a preparação automática permanecem disponíveis. São dados vetoriais de ruas e localidades do OpenStreetMap, com atribuição, não imagens de satélite nem download de tiles públicos.

## Seleção da rede e medição de campo (4.2.5+)

As camadas de régua, seleção e ruas são passivas: seus canvas não podem interceptar toques destinados à rede. Concluir a régua também oculta seu pane. O mapa e o alfinete atual possuem identificação de proximidade em pixels, limitada às feições já carregadas para a vista; não há varredura do GPKG inteiro. Confirmar um vão copia o ID e substitui o alimentador do cadastro pelo atributo configurado (ou nome compatível de coluna). Não modifica o filtro visual.

O atalho Medir no mapa no medidor de altura abre a régua com retorno ao diálogo. Usar distância e voltar atualiza apenas a distância horizontal e sua proveniência. Base, topo e altura preenchida são preservados; a altura ainda exige confirmação. Voltar sem usar preserva também a distância anterior. A medida cartográfica depende da localização dos dois pontos e não equivale a medir afastamento vertical copa–condutor.

A câmera nativa das fotos continua através do input capture=environment, como preferência traseira sujeita ao navegador/aplicativo do aparelho. O medidor de altura solicita câmera traseira, oferece ampliação central de 1× a 4× e captura uma janela estável de inclinação. Os ângulos usam o eixo óptico traseiro e compensam a orientação da tela. Capturas pendentes expiram, rejeitam movimento/leitura antiga e cancelam ao fechar/refazer. A indicação de sensibilidade geométrica a ±0,5° não é certificação de precisão do sensor. É necessário validar em campo com medidas conhecidas.

### Exportação de unidades — 4.2.6

As distâncias copa–MT/BT/AT são exportadas em centímetros no XLSX individual, XLSX agrupado e nos geradores do consolidado Google Drive. A conversão acontece somente na projeção de exportação: os registros, JSON, API e recibos continuam em metros. Altura da árvore, distância horizontal usada na altura e precisão GPS permanecem em metros; DAP/CAP permanecem em centímetros. A aba Método explicita as unidades. Não renomear cabeçalhos de uma planilha antiga sem converter também as células numéricas (1,25 m = 125 cm).

O código do Apps Script precisa ser salvo e uma nova versão deve ser associada à implantação existente, preservando sua URL. Executar `atualizarConsolidadoCampo` reconstrói o consolidado a partir dos metadados, sem alterar fotos e registros. Arquivos individuais de versões já sincronizadas são imutáveis: as próximas exportações/novas versões usam cm; os antigos permanecem válidos em metros conforme seu cabeçalho.

Os arquivos `.gs.txt` agora fazem parte do release publicado, para que o download do receptor não dependa de uma cópia anterior no GitHub Pages.

### Street View — 4.2.7

O bonequinho Ver rua fica dentro do mapa normal e ampliado. Arrastar o controle até o mapa, arrastar seu marcador ou ativar e tocar escolhe uma posição independente do cadastro. A consulta não altera coordenadas da árvore, referências de poste/vão ou formulários. Todos os caminhos de clique (fundo, pontos, linhas, rótulos e árvores) consomem o modo antes das ações normais. A régua e o Street View são exclusivos; fechar/cancelar libera os cliques normais.

Quando Maps JavaScript já está carregado pelo usuário, usa StreetViewService e StreetViewPanorama no painel do mapa, com procura externa em até 50 m, retorno, tratamento de falta de cobertura, limite de espera e descarte de respostas antigas. Não carrega a API nem cria chave/faturamento para essa função. Na configuração padrão XYZ, usa Maps URLs oficial (`api=1&map_action=pano&viewpoint=...`) no Google Maps/app ou nova guia, preservando o formulário; o link permanece disponível se o navegador bloquear a abertura pelo gesto de arrastar. Sem internet, não inicia consulta. Não armazena imagens Street View para offline. A cobertura e a data das imagens são do Google.

Validação: `node tests/street-view.cjs`, `node tests/field-interactions.cjs`, `node tests/map-hit-test.cjs`, `node tests/app-updates.cjs`; build e verificação sintática do release. Nenhum cadastro real é criado para o teste.

### Administração universal, auditoria e presença — 4.3.0

O painel administrativo usa `/api/admin/universe`: união por ID de todas as linhas atuais do índice privado do Drive e de todas as árvores ativas no D1, sem corte de data/geração nem restrição por aparelho. Nomes/tempos antigos só podem ser atribuídos conforme os metadados e versões existentes. Registros somente locais, ainda não enviados, não estão disponíveis no servidor. A lista é paginada de 50 em 50; exclusão segue em lotes de até 20, com dupla confirmação, validação de versões e bloqueio temporário contra edição concorrente. Registros apenas no Drive também recebem tombstone no D1 para impedir recriação por cópias offline. Nada é excluído automaticamente por ser antigo/teste.

Aplicar `backend/admin-schema.sql` ao D1 antes de publicar a API. A migração apenas cria tabelas/índices e a view de histórico; não exclui registros. O histórico usa `shared_changes` existente, incluindo versões anteriores à atualização: diferencia cadastro, edição de conteúdo, reenvio, pedido, análise e exclusão. A ação de um usuário sobre árvore anteriormente editada por outro identifica troca de editor. As taxas e seus denominadores ficam explícitos na interface. Os endpoints de inventário, histórico, presença e exclusão exigem sessão administrativa validada no servidor; o inspetor não recebe esses dados.

Presença começa desabilitada. Apenas o administrador pode habilitar/configurar; cada técnico deve aceitar participar e pode recusar/pausar. GPS é opcional e separado. O app envia sinal a cada 60 s apenas visível, com a última leitura GPS de até 60 s quando compartilhada. Não adiciona rastreador em segundo plano. O painel chama de ativo recentemente o sinal de até 2 minutos. Ao pausar/ocultar/encerrar, tenta marcar inativo e limpar coordenadas; sem rede a última posição expira. A API não apresenta localização de mais de 2 horas; sessões são retidas por até 7 dias. Nomes são informados, não identidades autenticadas: a entrada do inspetor permanece pelo link público. Sessão de presença tem token próprio e não permite consultar terceiros.

Validação: `node backend/build.mjs`, `node backend/verify.mjs`, `node backend/verify-shared.mjs`, `node backend/verify-admin.mjs`, `node tests/admin-productivity.cjs` e testes de regressão do mapa/atualizador. Todas as exclusões e identidades de testes automatizados usam SQLite em memória.

### Homologação e expurgo selecionado — 4.3.1

A seção Homologação · revisão e limpeza fica no topo da Administração, separada dos eventos de auditoria. Seus filtros de classificação, datas, inspetor e busca são independentes dos filtros de produtividade/auditoria. A flag Homologação pode ser marcada por linha, e os selecionados podem receber Homologação, Produção ou ficar sem classificação. A classificação é um metadado administrativo por ID no D1, preservado em novas sincronizações; nenhum cadastro é classificado pela data. `backend/homologacao-schema.sql` cria as tabelas e os gatilhos de histórico, sem alterar cadastros.

Selecionar todos usa todas as páginas do filtro. Classificação e exclusão são executadas em lotes de até 20, com progresso, interrupção dos próximos lotes e parada no primeiro resultado não confirmado. O diálogo de exclusão mostra a distribuição Homologação/Produção/Sem classificação, IDs e exige digitar EXCLUIR. A seleção é congelada na confirmação. Mudanças de classificação/versionamento em outra sessão bloqueiam a exclusão desatualizada. Filtros novos limpam a seleção para evitar itens ocultos inesperados. Não existe expurgo automático.

A exclusão mantém a validação de versões e o bloqueio de edição concorrente, envia pastas e arquivos para a lixeira do Drive, atualiza o Excel consolidado e mantém tombstones no mapa. Derivadas de fotos compartilhadas no D1 são removidas após a confirmação; o histórico administrativo e a evidência de solicitações de exclusão permanecem para auditoria. Cada lote de 20 foi verificado para consumir no máximo 50 consultas D1.

Validação: `node tests/cleanup-selection.cjs`, `node backend/verify-homologacao.mjs`, `node backend/verify-admin.mjs`, `node backend/verify-shared.mjs`, `node backend/verify.mjs`, `node tests/admin-productivity.cjs`, `node tests/app-updates.cjs`, build de API/Pages e verificação sintática. Exclusões dos testes automatizados usam somente SQLite em memória e receptor simulado; nenhum cadastro real foi marcado ou excluído na publicação.


## Versão 4.3.2 — pesquisa e retomada da limpeza

- Executar `backend/map-search-schema.sql` na mesma D1 antes de publicar a API.
- Lupa dentro do mapa: coordenadas decimais, DMS/DDM e UTM com zona e hemisfério explícitos; SIRGAS2000/GRS80 ou WGS84. SAD69 não é convertido sem parâmetros específicos. Conversor proj4 existente é carregado só quando necessário.
- Sugestões das árvores e rede são locais. A pesquisa GPKG usa o worker existente, com uma solicitação em voo, descarte de respostas antigas e resultados limitados. Não carrega toda a rede na memória.
- Endereços: `/api/map/search`, somente por envio explícito, Photon/OpenStreetMap, até seis resultados, cache de sete dias (máximo mil consultas) e limite global de uma consulta a cada 1,1 s. Não envia GPS. O serviço público não oferece garantia de disponibilidade; pode ser substituído por instância Photon em `MAP_GEOCODER_URL` (HTTPS), sem alterar o app. Em implantação com muitos técnicos, usar instância própria/contratada.
- Rotas: Google Maps URLs para carro, moto, caminhada e bicicleta. Navegação e ETA são do Google, fora do CAMPO; não há API paga configurada para calcular navegação dentro do mapa. Cobertura de moto depende da região.
- Limpeza pela UI passa a usar lotes de dois IDs, com mensagens específicas de timeout e retomada de `pendingDeletes` devolvidas pelo receptor. Tag continua em lotes de até vinte. A versão e a revisão da classificação são conferidas no servidor.
- `runAuthorizedRepositoryCleanup` é uma manutenção privada e de execução única via controle Cloudflare/D1: manifesto explícito de até dois registros/revisões com status `approved`. Nenhuma rota pública dispara o trabalho e nenhum cron permanente é exigido. Preservar o resultado final para auditoria; restaurar as agendas anteriores depois do uso. Não inferir homologação por data.

Validação: `node tests/map-search.cjs`, `node backend/verify-map-search.mjs`, `node backend/verify-homologacao.mjs`; `tests/map-search-ui.cjs` exige jsdom. Demais verificações administrativas, compartilhamento, seleção do mapa e receptor continuam aplicáveis.


## Versão 4.4.0 — identidade verificada e acesso persistente

- Migração aditiva `backend/user-auth-schema.sql`. Não altera árvores ou fotos existentes.
- Cloudflare Access usa OTP no caminho `/entrar`, com política de avaliação externa em `/api/auth/evaluate` e JWKS de resposta em `/api/auth/keys`. O e-mail deve existir e estar ativo em `campo_users`. Não liberar o app com policy `Everyone` ou confiar em um header de e-mail sem validar a assinatura.
- Organização Access: `campo-mapeamento-arvores.cloudflareaccess.com`; aplicação de entrada: `58d8bab0-701b-405d-a91b-52b18288b01c`. Issuer/audience esperados estão fixados em `backend/user-auth.js`. O endpoint de avaliação verifica assinatura RSA e nonce, e responde com JWT assinado; as chaves privadas geradas permanecem em D1 e nunca entram nos assets ou respostas.
- Somente `/entrar` usa o cookie temporário Access. Após conferir assinatura, issuer, audience, e-mail, conta ativa e nonce de uso único vinculado ao navegador, o CAMPO cria sua própria sessão. Cookie `__Host-campo-session`, Secure, HttpOnly, SameSite=Lax; token aleatório de 256 bits; D1 guarda apenas hash SHA256. Validade de um ano renovada durante uso; atualizações e fechamento do navegador não removem a sessão. Limpeza de dados, outro aparelho, saída, revogação ou expiração exigem nova entrada. Não há garantia de login eterno contra expiração do navegador.
- Todas as APIs de dados exigem sessão e conta ativa no servidor. `FIELD_AUTH_REQUIRED=false` é somente para fixtures antigas/ambiente de desenvolvimento isolado. O padrão é exigir autenticação; nunca habilitar false em produção. Cookies são enviados apenas à origem do app. A URL pública workers.dev também exige autenticação para dados.
- A senha administrativa anterior continua para cadastro inicial e recuperação. Em Administração, cadastrar o próprio e-mail com perfil Administrador e depois os inspetores. Não há autocadastro. Bloquear conta revoga sessões; desbloquear não recupera sessões revogadas. O último administrador ativo é protegido contra bloqueio/rebaixamento.
- Nome do inspetor é preenchido pela conta. Autor/identificador/e-mail das edições e solicitações são conferidos no servidor. Acesso offline usa apenas perfil de exibição e dados já salvos; não valida/revoga credenciais sem rede. Ao reconectar, o servidor bloqueia operações imediatamente quando a conta não está ativa.
- Presença de trabalho: aviso na entrada e indicador discreto, sem cartão de escolha. O GPS exige permissão do navegador e é enviado só durante uso ativo/autenticado quando a Administração habilitou presença. Nome é substituído no servidor pela conta real. Não representa rastreamento permanente em segundo plano; sem permissão, registrar indisponibilidade.
- Celular é contato opcional para pesquisa/gestão. Não é método de login nem dispara SMS/WhatsApp. Um provedor e autorização de custos serão necessários para autenticação por mensagem.

Validação: `node backend/verify-user-auth.mjs` (RSA real com provedor simulado e SQLite em memória), `NODE_PATH=... node tests/user-access-ui.cjs` (jsdom), verificações existentes. OTP real exige cadastrar primeiro um e-mail autorizado e concluir a entrada com acesso à sua caixa postal. Nenhum e-mail é pré-cadastrado ou mensagem é enviada pela publicação.


## Versão 4.4.1 — entrada exclusiva e solicitação de acesso

- Sem sessão, a interface exibe somente a entrada, o formulário Solicitar liberação e a recuperação administrativa. A classe inicial no HTML bloqueia a tela desde o primeiro carregamento; apenas perfil lembrado no armazenamento não desbloqueia uso online antes da validação. APIs continuam exigindo sessão no servidor. Sessão lembrada permite trabalhar offline; reconectar verifica bloqueio/revogação. Valores locais não são apagados.
- Migração aditiva em `backend/user-auth-schema.sql`: `campo_access_requests` e índice. Solicitação pública (nome, e-mail, celular opcional) não cria sessão nem conta autorizada. E-mail informado ainda não é verificado; a Administração deve conferir a identidade antes de aprovar. O código OTP valida a caixa postal na entrada posterior.
- `/api/auth/request-access` recebe solicitações com resposta genérica sem enumerar contas, limite por IP de 10/h e uma solicitação persistente por e-mail. Repetição não sobrescreve identidade, revive recusas ou desbloqueia contas. Existe limite de 5.000 linhas; operação de alta escala deve usar proteção adicional e política de retenção.
- `/api/admin/access-requests` permite consultar, aprovar como Inspetor ou recusar, com revisão concorrente, auditoria e paginação. Não rebaixa/promove contas existentes nem desbloqueia contas automaticamente. Conflito de celular exige revisão manual. Cadastro administrativo continua disponível para liberar e-mails diretamente e para o primeiro administrador.
- Aviso no cabeçalho e contador persistente de solicitações pendentes, atualizados a cada 30 s enquanto um administrador está com o app visível, ao entrar e ao retornar. Nenhum dado da fila é entregue a inspetores ou visitantes. Não envia e-mail/SMS/push em segundo plano; notificação externa requer configurar canal e destinatário.

Validação: testes de autenticação real com RSA simulado, aprovação/recusa/duplicidade/limites e preservação das permissões; UI com jsdom para bloqueio inicial/revogação, offline, recuperação, envio de solicitação e aviso administrativo. Testes usam banco em memória e não criam usuários no ambiente oficial.


## Versão 4.5.0 — usuário e senha individuais

- Substitui o código por e-mail por `/api/auth/login` no próprio CAMPO. E-mail é apenas contato e pode ser usado como identificador alternativo; não se considera verificado e nenhuma mensagem é enviada. Usuário único de 3–50 caracteres (`a-z`, números, `.`, `_`, `-`), sem diferença entre maiúsculas e minúsculas. Senhas de 12–128 caracteres; frases são aceitas sem regras artificiais de composição.
- Executar as três últimas instruções de `backend/user-auth-schema.sql` (tabelas `campo_user_credentials`, `campo_password_limits` e índice) antes da API. Migração aditiva; preserva árvores, fotos, solicitações e identidades. Contas anteriores precisam receber usuário/senha pelo administrador; não há senha padrão nem conversão automática para conta autorizada.
- Hash somente no servidor com sal aleatório de 128 bits, PBKDF2-SHA256 no limite WebCrypto Workers de 100.000 iterações e HMAC-SHA256 prévio com pepper secreto, separado por contexto. D1 contém só hash/sal, nunca senha. O pepper deriva de `ADMIN_SESSION_SECRET`: preservar esse secret; sua troca exige redefinir as senhas e as sessões. Um ambiente com KDF externo dedicado pode migrar para Argon2id no futuro.
- Tentativas limitadas de forma atômica em D1: 10/min por IP e 10/15 min por identificador, respostas idênticas para conta inexistente, bloqueada ou senha incorreta, custo criptográfico também no identificador desconhecido. Não armazenar corpos de login ou novas senhas em logs.
- Sessão aleatória de 256 bits com cookie Secure/HttpOnly/SameSite=Lax e hash em D1, duração renovável de um ano; continua entre fechamentos/atualizações. Sair, bloquear, redefinir senha ou revogar aparelhos encerra a sessão. Limpar dados ou trocar de navegador exige novo login. Conta é validada a cada API. Perfil lembrado permite trabalho offline; o bloqueio central passa a valer ao reconectar.
- Administração inicial/recuperação mantém a senha administrativa anterior. Criar a primeira conta como Administrador, depois as contas de inspetor. Editar usuário com campo de senha vazio preserva a senha; preenchê-lo redefine e revoga todas as sessões. Nenhum hash/sal/senha aparece nas listagens. Não é possível bloquear/rebaixar o último administrador ativo.
- Solicitações/avisos de acesso continuam. Aprovar exige definir usuário e senha, cria somente Inspetor, não desbloqueia nem redefine conta existente. Administrador entrega credenciais diretamente ao destinatário; não há envio automático. O próprio usuário conectado pode alterar sua senha atual e desconectar os demais aparelhos.
- Rotas de autenticação OTP foram aposentadas (410); `/api/auth/start` retorna à tela do CAMPO para clientes antigos. A aplicação Access antiga de `/entrar` fica sem uso; não afrouxar políticas para tentar reutilizá-la.
- API e Pages precisam ser publicados juntos após `node backend/build.mjs` e `node hosting/build-release.mjs`. O service worker detecta o novo conteúdo e preserva o rascunho antes de atualizar.

Validação: `node backend/verify-user-auth.mjs` usa SQLite em memória e criptografia real para criação, colisões/rollback, login, permissões, bloqueio, redefinição, alteração própria, revogação, origem e limites; `NODE_PATH=... node tests/user-access-ui.cjs` verifica tela bloqueada, sessão lembrada/offline, erros de login, solicitação/aprovação e limpeza de campos secretos. Nenhuma identidade de teste é criada no banco de produção.


## Versão 4.5.1 — gestão de contas, senhas visíveis e avisos

- Migração aditiva: última instrução de `backend/user-auth-schema.sql` cria `campo_user_lifecycle`. Não altera contas ou cadastros existentes. Publicar a migração antes da API.
- Excluir usuário exige Administração no servidor, ID/revisão e confirmação EXCLUIR. Marca a conta como excluída/bloqueada, remove credenciais e sessões, encerra presença e mantém inspeções/fotos/autoria/auditoria. Guarda contra exclusão concorrente ou do último administrador ativo. Nenhuma conta é removida automaticamente.
- Filtro Excluídos permite restaurar com novo usuário/senha. O e-mail continua reservado ao ID histórico; a restauração não recupera sessões/credenciais antigas. Senhas novas continuam sendo hashes com sal/pepper.
- Mostrar/ocultar senha nos campos de login, administração, nova conta e modais de alteração/aprovação, inclusive os inseridos posteriormente. Só revela o que foi digitado no campo; não há consulta de senha armazenada. Fecha/envia diálogo, troca de edição e saída da página retornam ao modo oculto.
- Sessão comum permanece válida no servidor até revogação, saída, bloqueio, exclusão ou redefinição de senha. `expires_at` é metadado da concessão do cookie, não encerra por si só a sessão D1. Cookie de 400 dias, renovado durante uso; o navegador ainda pode expirar/remover cookies. Não usar armazenamento JS como substituto do cookie HttpOnly. A recuperação administrativa por senha segue com bearer de 8 h por aba.
- Consulta leve `/api/admin/access-requests?summary=1` retorna só quantidade pendente e ID da última solicitação, sem lista de contatos. Consulta a cada 10 s com app visível e, quando avisos estão habilitados, tenta também enquanto em segundo plano. Navegadores podem limitar/suspender essas consultas. Não é push remoto nem garantia de entrega com o app fechado.
- Administração tem Ativar avisos neste aparelho. Permissão do navegador solicitada apenas por clique explícito. Usa service worker/showNotification quando disponível, ou Notification desktop. Avisos têm apenas contagem e são deduplicados por última solicitação no aparelho. Clicar abre o painel administrativo após autenticação. Não adiciona serviços pagos ou envia mensagens externas. Para evitar espera, criar contas conhecidas antes do início do trabalho.

Validação: testes de autenticação, exclusão/restauração, revogação e último administrador em SQLite isolado; UI com jsdom para confirmação, filtros, senhas e permissão/deduplicação de avisos; testes existentes de administração, sincronização, atualização e Pages. Nenhum usuário real é excluído na publicação.


## Versão 4.5.2 — salvamento, rascunho e volume de dados

- Score de identificação é apenas informativo; score zero, baixo ou indisponível não bloqueia escolha nem gravação. A seleção fica compacta, com outras sugestões recolhidas e botões de continuar/preservar. Preenchimento manual registra a decisão do inspetor. Regras essenciais de sincronização continuam: fotos, localização, altura e referências/distâncias quando aplicáveis. Aviso de unidade de distância permanece inline, sem confirmação impeditiva.
- `draft-store.js` serializa/coalesce gravações do rascunho, captura estado imutável, verifica leitura após gravação antes da atualização e não revive rascunhos descartados por gravações antigas. Usa o mesmo banco `campo-vegetacao`, versão 1, store `meta`, chave `draft`. Não altera o armazenamento de uma inspeção já aberta na versão anterior.
- Salvar rascunho sem sair funciona mesmo com campos incompletos. Salvar e continuar editando grava a inspeção sem resetar o formulário. Atualizações futuras podem ser adiadas após preservar o formulário; ativação só ocorre após gravação/conferência. Uma versão anterior ainda usa seu próprio gerenciador de atualização para a primeira passagem. Não garantir preservação de dados que nunca chegaram a ser gravados no aparelho sem acesso ao navegador original.
- Salvamento tem trava contra envio duplo, mensagem inline, checkpoint antes do processamento, limite de espera ao decodificar imagem, liberação no finally e preservação após falha. Alterações feitas enquanto fotos são preparadas não são descartadas pelo reset. Reutiliza cópia anotada se os metadados do carimbo não mudaram. Envio remoto é iniciado depois do commit local, sem manter a trava de salvar enquanto espera o Drive.
- Um botão da fila de identificação dentro do formulário passou a type=button para não provocar submit involuntário.
- Mapeamentos: 50 cartões por página, busca sobre a coleção completa com debounce de 150 ms. Exportações e fila de envio continuam incluindo a coleção completa. O catálogo local ainda mantém originais em memória nesta arquitetura: volumes de fotos muito altos exigem um próximo passo de carregamento sob demanda e medição em aparelhos reais.
- Marcadores: só a área visível ampliada em 10%, pool reutilizável, até 600 elementos por vista e criação em blocos de 50 por frame. Vistas densas agrupam todos os pontos em células de tela com contagem, sem truncar a coleção; tocar no grupo amplia sua extensão. Pesquisa e zoom continuam disponíveis.
- Pull compartilhado: uma consulta em voo por aba, gravação do cache uma vez por lote de páginas e nenhum redesenho/cache sem alteração. Atualiza somente o cadastro confirmado em memória, evitando ler todas as fotos de IndexedDB a cada árvore enviada. Mantém cursores, versões, operações idempotentes e tratamento de conflitos.

Validação: `tests/draft-preservation.cjs` (1.000 edições coalescidas, ordem, falha e descarte), `tests/inspection-save.cjs` (jsdom + IndexedDB simulado, seleção 47,3%/zero, foto inválida, edição concorrente, não esperar rede, 15.000 cadastros com DOM de 50 cartões), `tests/shared-performance.cjs` (15.000 pontos, pull deduplicado, cache apenas com mudanças, limite de vista/chunks), `tests/update-draft-ui.cjs` (conferência antes de ativar, falha sem recarregar, adiar). São cenários sintéticos, não benchmark de usuários simultâneos nem garantia de capacidade de Cloudflare/Apps Script/Drive. Nenhum dado de produção é alterado para esses testes.
## CAMPO 4.5.3 — painel de gestão e acesso à rede

O painel do PC fica em `/gestao.html`, com o mesmo usuário/senha de administrador. O aplicativo de campo mantém seu formulário e seus dados locais. O painel não importa registros/fotos para a base IndexedDB do inspetor: consulta o servidor, recebe até 50 linhas por página e até 600 pontos/grupos no mapa. Fotos são buscadas ao abrir o cadastro; o cache em memória guarda no máximo seis imagens. Os arquivos `gestao*` não entram no precache offline do app de inspeção.

As duas interfaces leem a mesma D1. Não existe uma segunda base para alimentar. Com o painel aberto e online, `/api/control/revision` verifica alterações a cada 10 s; alterações confirmadas na base compartilhada provocam atualização dos indicadores e do mapa. Registros salvos offline aparecem após sincronização. O inventário legado do Drive é lido com cache de 60 s no servidor, com uma única leitura em andamento por isolate; falhas preservam a última consulta e são informadas. `Atualizar` pede uma conferência do inventário. Nenhum contador do painel representa dados ainda presos offline em outro aparelho.

Indicadores: cadastros, indivíduos/vegetação agrupada, média/mediana de tempo ativo, tempos medidos, horas ativas, cadastros por hora, necessidade de poda, identificação e preenchimento pendentes, fotos, volume diário/por inspetor/por alimentador e posição relativa à rede. Dia/mês usam Rio Branco. Tempo desconhecido é excluído da média. Auditoria, presença, pedidos de exclusão, classificação e limpeza usam as mesmas rotas administrativas existentes, com confirmação e controle de versão. O painel não cria inspeções.

O mapa reaproveita o leitor GPKG, índice espacial OPFS, perfis, cores e seleção amarela da rede. Apenas a configuração local da rede é lida; nenhum cadastro/foto local é carregado. A rede já instalada abre automaticamente; download central e arquivo próprio estão no menu do mapa. Em caso de duas abas disputando o mesmo GPKG, o bloqueio existente permanece e o painel informa como retomar. A camada de árvores vem do servidor e as fotos não acompanham os pontos.

Correção de autenticação: o worker de download usa explicitamente cookies da mesma origem e recebe a sessão administrativa de recuperação somente em memória, para instalações já abertas. Essa credencial é removida antes de persistir a configuração do GPKG. O login administrativo de recuperação também emite cookie Secure/HttpOnly de oito horas para a mesma origem. Login individual e logout limpam esse cookie para evitar herança de privilégios. Bloqueio/exclusão de contas continuam validados no servidor. O login individual persistente não mudou.

Validação: `node backend/build.mjs`, `node backend/verify-control.mjs`, verificadores de autenticação/admin/rede/compartilhamento e testes CJS. O teste de controle usa 15.001 registros fictícios em SQLite em memória e verifica união Drive/D1, filtros, paginação, agrupamento completo, fotos sob demanda, denominador de tempo, atualização da mesma árvore e ausência de mutações. `tests/network-session.cjs` verifica cookies/bearer em memória, sanitização e rejeição de outra origem. `tests/control-ui.cjs` verifica restrição ao admin e isolamento do aplicativo de campo. Isso não é um teste de 50 usuários simultâneos nem certifica capacidade de armazenamento para 130 mil árvores.

`tests/preview-control.mjs` serve exclusivamente dados fictícios para QA visual. Não publica contas, não importa credenciais e não altera dados reais. A conferência visual usou essa simulação, com indicação explícita de dados fictícios.
