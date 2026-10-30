# Campo 4.0 — base compartilhada

O mapa da equipe usa uma base D1 privada na Cloudflare, acessível pelo link do aplicativo, sem código de equipe. Quem tiver o link pode consultar e atualizar árvores e baixar a rede. As operações administrativas continuam exigindo senha. As credenciais continuam no servidor. O Google Drive mantém os arquivos de cada cadastro e a planilha consolidada já existentes.

## Uso do técnico

1. Abra **Mapeamentos → Abrir mapa de todas as árvores**.
2. Toque na árvore para ver os dados e **Editar árvore**. Ajuste a localização e as medidas no formulário e salve.
3. Com internet e o app aberto, o mapa consulta alterações a cada 15 segundos. Sem internet, mantém a última cópia disponível; edições ficam neste aparelho até a reconexão. O botão **Atualizar equipe** consulta imediatamente.
4. Cadastros incompletos continuam sujeitos às regras de preenchimento existentes. Compartilhar o mapa e confirmar os arquivos no Drive são estados separados; confira ambos antes de limpar o aparelho.
5. Se outra pessoa editar a mesma versão, o envio é bloqueado com aviso. Exporte seu ZIP se quiser guardar a versão local e use **Revisar versão mais recente da equipe** para conferir e reaplicar a alteração. Nenhuma versão vence silenciosamente.

O mapa reúne árvores compartilhadas e os cadastros locais ainda pendentes. Fotos compartilhadas são cópias reduzidas para consulta e edição; originais permanecem no aparelho de coleta e no Drive após confirmação. Cadastros de outro aparelho precisam de conexão para carregar as fotos antes da edição. A cópia offline do mapa contém os dados, sem baixar automaticamente todas as fotos da equipe.

## Solicitar exclusão

No cartão da árvore, toque em **Solicitar exclusão**. Preencha nome e motivo e fotografe o local. O app exige uma leitura atual de GPS, registra horário e precisão e anota esses dados na foto. Se a localização estiver bloqueada, autorize-a e selecione a foto novamente.

O endereço é consultado automaticamente via OpenStreetMap/Nominatim quando houver conexão e disponibilidade. É uma referência aproximada, não um endereço certificado. Sem resposta, o GPS fica registrado e o administrador pode receber o endereço quando abrir a evidência mais tarde. Fotos escolhidas da galeria recebem a localização e o horário da coleta pelo app; isso não certifica o local ou o horário original da fotografia.

Pedidos offline ficam neste aparelho até o envio. A árvore continua no mapa até aprovação. Os nomes dos técnicos são declarados no formulário: o acesso de equipe compartilhado não autentica uma identidade individual.

## Administração

Entre com a senha administrativa já utilizada e abra **Administração → Base compartilhada**.

- **Importar CSV ou Excel `.xlsx`**: primeira aba, cabeçalho na primeira linha, uma árvore por linha. `ID`, `LATITUDE` e `LONGITUDE` são obrigatórios. O template também aceita `ESPECIE`, `ALTURA`, `DATA`, `POSTE`, `DT BT`, `DT MT`, `DT AT`, `FOTO`, `AREA`, `DAP`, `ACESSO`, `EQUIPE`, `OBSERVACAO` e `ALIMENTADOR`.
- CSV aceita ponto e vírgula ou vírgula como separador, números decimais com vírgula em células delimitadas corretamente e UTF-8 ou Windows-1252. Excel antigo `.xls` deve ser salvo como `.xlsx`.
- A tela informa erros e a quantidade de inclusões e atualizações antes de publicar. Corrija todas as linhas com erro. IDs devem ser estáveis e únicos (no Excel, use texto para preservar zeros à esquerda); mudar o ID representa outra árvore. Importações concorrentes podem exigir nova conferência do arquivo.
- Campos importados correspondentes ao template atualizam os valores da árvore. Colunas ausentes preservam o valor existente; células vazias em uma coluna presente podem limpar o campo correspondente. Não use ID de outra árvore.
- A coluna `FOTO` é uma referência de arquivo ou link. O app não baixa links automaticamente. Uma base importada pode ter informações incompletas; o técnico completa o formulário antes de sincronizar arquivos novos no Drive.
- **Trazer cadastros existentes do Drive**: carrega os registros do repositório administrativo e prepara os ainda ausentes no mapa. Confirme em **Publicar árvores para a equipe**. Os arquivos originais continuam no Drive; as fotos não são copiadas automaticamente por essa importação.
- **Solicitações de exclusão**: veja a evidência e aprove ou rejeite. Se a árvore mudou depois da solicitação, a aprovação é bloqueada: rejeite e peça nova avaliação.

Ao aprovar, a árvore sai do mapa da equipe e uma marca de exclusão impede o reenvio por aparelhos antigos. O servidor também tenta remover a pasta e a linha consolidada pelo receptor Google existente. Se o Drive não confirmar, aparece limpeza pendente, com botão para tentar novamente. A evidência e o histórico da decisão são preservados na base privada; não são apagados com a árvore. A remoção do mapa propaga quando os aparelhos se reconectam.

## Operação

Banco D1: binding `SHARED_DB`; esquema em `backend/shared-schema.sql`. Mantenha os bindings, secrets e permissões já configurados. Para novo ambiente, execute o SQL e informe o identificador do banco no Wrangler. Não publique senhas ou códigos de equipe.

Esta implementação usa consultas periódicas, não WebSockets. Os limites gratuitos da Cloudflare e do Google continuam valendo; fotos, evidências e histórico consomem armazenamento. Monitore o uso no painel. Exportações ZIP existentes continuam disponíveis. A base central deve entrar na rotina de backup administrativa.

## Validação da versão

Foram verificados: autenticação e isolamento administrativo, esquema SQLite, controle de versões e conflitos, reenvio idempotente, GPS/foto obrigatórios, aprovação e marca de exclusão, leitura do template, CSV e XLSX e inicialização da interface. Faça o ensaio de campo com dois aparelhos antes de liberar para toda a equipe: criar, editar, desconectar, reconectar, solicitar exclusão, rejeitar e aprovar.
