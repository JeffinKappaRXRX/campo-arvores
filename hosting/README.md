# Publicação no endereço oficial

O endereço fixo é https://mapeamento-arvores.pages.dev/.

Na versão 4.2.0, a entrega direta contém os arquivos alterados da interface. Os demais recursos continuam no GitHub Pages. A API usa o service binding CAMPO_API, sem credenciais na interface.

Após alterar os arquivos em docs/, execute `node hosting/build-release.mjs` e publique hosting/dist/_worker.js no projeto Cloudflare Pages mapeamento-arvores, como Worker avançado, com manifesto de assets vazio e branch main. Preserve o service binding CAMPO_API e as configurações existentes. Inclua na lista de build-release.mjs quaisquer outros arquivos alterados que precisem ser publicados antes do GitHub Pages concluir sua execução.

Somente enviar um commit ao GitHub não substitui os arquivos incluídos nesse pacote. Gere e publique o pacote em cada atualização. O endereço público continua o mesmo. Não inclua senhas, tokens ou arquivos privados da rede nesse pacote.
