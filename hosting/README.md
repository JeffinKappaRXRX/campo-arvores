# Publicação no endereço oficial

O endereço fixo é https://mapeamento-arvores.pages.dev/.

Na versão 4.2.0, a entrega direta contém os arquivos alterados da interface. Os demais recursos continuam no GitHub Pages. A API usa o service binding CAMPO_API, sem credenciais na interface.

Após alterar os arquivos em docs/, execute `node hosting/build-release.mjs` e publique hosting/dist/_worker.js no projeto Cloudflare Pages mapeamento-arvores, como Worker avançado, com manifesto de assets vazio e branch main. Preserve o service binding CAMPO_API e as configurações existentes. Inclua na lista de build-release.mjs quaisquer outros arquivos alterados que precisem ser publicados antes do GitHub Pages concluir sua execução.

Somente enviar um commit ao GitHub não substitui os arquivos incluídos nesse pacote. Gere e publique o pacote em cada atualização. O endereço público continua o mesmo. Não inclua senhas, tokens ou arquivos privados da rede nesse pacote.


## Atualizações obrigatórias (4.2.3+)

Sempre execute `node hosting/build-release.mjs` antes de publicar. O build calcula uma impressão dos arquivos da interface, gera uma nova chave do service worker e inclui os scripts da mesma versão no pacote. Isso dispara a detecção de atualização mesmo quando alguém esquecer de incrementar o número exibido no rodapé.

O aplicativo verifica atualizações ao abrir, retornar, reconectar e a cada minuto enquanto está visível. Depois de baixar todos os componentes, pede Atualizar agora e aguarda operações em andamento. O rascunho só libera o recarregamento após concluir a transação local; falha ao preservar os dados mantém a tela aberta. Cadastros, fotos, GPKG e ruas offline não são removidos. Sem internet, a versão já preparada continua disponível.

Na primeira migração das versões anteriores a 4.2.3, reabra a página uma vez para carregar o gerenciador. As versões seguintes já avisam dentro do app.
