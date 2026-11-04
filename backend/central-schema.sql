-- Consolidado de manutenção e orçamento para o painel. Só tabelas novas: nada aqui toca shared_trees nem vera_*.
CREATE TABLE IF NOT EXISTS central_parts(generation TEXT NOT NULL,name TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(generation,name,part));
CREATE TABLE IF NOT EXISTS central_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
-- Solicitação de material e plano de demanda: registro do administrador, não muda com o envio diário.
CREATE TABLE IF NOT EXISTS central_solicitacoes(id TEXT PRIMARY KEY,tipo TEXT NOT NULL,mes_pd TEXT,situacao TEXT NOT NULL,obs TEXT NOT NULL DEFAULT '',itens TEXT NOT NULL,criado_em TEXT NOT NULL,atualizado_em TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_central_solic_data ON central_solicitacoes(criado_em DESC);
-- Data marco e premissas editadas na tela: não mudam com o envio diário.
CREATE TABLE IF NOT EXISTS central_premissas(chave TEXT PRIMARY KEY,valor TEXT NOT NULL,atualizado_em TEXT NOT NULL);
