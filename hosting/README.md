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
