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
