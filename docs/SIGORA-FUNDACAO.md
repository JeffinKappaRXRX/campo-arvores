# SIGORA — Fundação técnica V0.1

**Nome:** Sistema Inteligente de Gestão, Otimização de Recursos e Ativos.
**Estado:** especificação inicial; não homologado e não ativado na produção.
**Relação com ARBORA:** produtos distintos e integrados; ARBORA é a fonte especializada em vegetação, SIGORA consolida inteligência de manutenção geral.
**Regra de interface:** manter a aba atual **Manutenção** até a entrega funcional e validação técnica do SIGORA.

## Evidências da inspeção inicial (código main)

- `docs/gestao.html`: módulos ARBORA, Manutenção e Orçamento; manutenção já inclui monitor, carteira, programação, transformadores, carregamento, reincidência, DEC e plano ideal.
- `docs/gestao-central.js`: carrega `central.html` em iframe autenticado.
- `docs/central-core.js`: dados em arquivos compactados por geração; cache IndexedDB e filtros por dimensões.
- `docs/central-man.js`: análises de ocorrências, OS, criticidade, reincidência e recomendação de serviços.
- `docs/central-plan.js`: carteira de programação, custos estimados, restrições de carregamento e rota heurística.
- `docs/central-orc.js`: SIGCO, previsão, realizado, desembolso e custos.
- `backend/central-schema.sql`: armazenamento de bases consolidadas, solicitações e premissas.

**Limite da inspeção:** presença de tela ou cálculo não prova correção, completude da fonte, causalidade ou qualidade preditiva. É preciso auditar contratos, fórmulas, proveniência e dados reais autorizados.

## Princípios obrigatórios

1. **Fonte e proveniência:** cada indicador possui origem, data de corte, granularidade, versão e regra de transformação.
2. **Separar fatos, estimativas e decisões:** observação não é previsão; previsão não é prescrição.
3. **Incerteza explícita:** ausência de dado não equivale a risco zero; não usar imputação silenciosa.
4. **Sem dupla contagem:** identificar correlações entre ocorrências, DEC, reincidência, clientes e vegetação.
5. **Otimização com restrições reais:** orçamento, classificação CAPEX/OPEX, equipes, competências, material, desligamentos, segurança e janelas.
6. **Recomendação explicável:** evidências, critérios, alternativas, custo e benefício incremental.
7. **Governança:** aprovações humanas, trilha de auditoria, segregação de permissões, versões e rollback.
8. **Avaliação contrafactual:** estimar benefício com método validado; não declarar DEC/FEC evitado como fato.
9. **Não interferir no ARBORA:** consumir interfaces/visões autorizadas; não reescrever tabelas operacionais.
10. **Segurança de dados:** não copiar bases corporativas, credenciais, fotos privadas ou dados pessoais para repositório público.

## Contrato lógico inicial de uma intervenção candidata

- `intervention_id`, `asset_id`, `asset_type`, `feeder_id`, `network_segment_id`, `geo_ref`
- `problem_type`, `evidence_ids[]`, `source_cutoff`, `data_quality`
- `risk_probability` (nullable), `impact_estimate` (nullable), `confidence_band`
- `alternatives[]`: serviço, custo de material, mão de obra, janela, equipe, materiais, restrições, benefício esperado e incerteza
- `capex_opex_classification` com justificativa e validação contábil
- `decision_status`: proposta, em análise, aprovada, rejeitada, programada, executada, verificada
- `decision_explanation`, `model_version`, `approved_by`, `audit_log`

## Motor decisório: etapas

1. Integrar dados e resolver identificadores de ativos, chaves, alimentadores e OS.
2. Construir candidatos por evidências; separar duplicidades e intervenções mutuamente excludentes.
3. Calcular risco e impacto com critérios rastreáveis e intervalos de incerteza.
4. Gerar alternativas técnicas válidas e custos totais; nunca recomendar ação incompatível com segurança ou topologia.
5. Resolver carteira com restrições e objetivos explícitos (confiabilidade, risco, custo, capacidade), exibindo fronteira de Pareto quando pertinente.
6. Simular cenários e impactos esperados; submeter à aprovação.
7. Integrar OS, programação, execução, orçamento realizado e monitoramento posterior.
8. Recalibrar com dados históricos, evitando vazamento temporal em testes.

## Marcos e critérios de aceite

**M0 — Auditoria:** catálogo de tabelas e campos, cardinalidades, chaves, origem, atualização, regras, lacunas e testes de qualidade.
**M1 — Ranking explicável:** saída reproduzível por ativo/trecho; justificativa, dados faltantes e testes de sensibilidade.
**M2 — Prescrição:** alternativas e restrições técnicas verificadas por engenharia.
**M3 — Carteira otimizada:** restrições financeiras/operacionais, cenários e explicação das escolhas; comparação com baseline.
**M4 — Ciclo fechado:** OS→execução→custo→resultado e auditoria.
**M5 — Predição validada:** backtesting temporal, calibração, métricas e monitoramento de degradação.

## Próxima implementação

Inventariar o manifesto das bases `central`, verificar quais dimensões de ARBORA/VERA são acessíveis sem duplicação e testar regras atuais de criticidade, custos e previsão em amostra anonimizada e autorizada. Criar o motor de priorização como módulo isolado, com testes sintéticos, antes de expor recomendações no painel.
