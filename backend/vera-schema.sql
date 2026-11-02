-- Base VERA corrigida (planilha Árvores_VERA): cópia para consulta no painel de gestão.
-- Não altera shared_trees: as inspeções do aplicativo de campo continuam na própria tabela.
CREATE TABLE IF NOT EXISTS vera_trees(generation TEXT NOT NULL,id TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(generation,id));
CREATE TABLE IF NOT EXISTS vera_thumbs(id TEXT PRIMARY KEY,image TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vera_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
-- Conferência pela foto das inspeções do campo. Fica à parte: não altera o cadastro em shared_trees.
CREATE TABLE IF NOT EXISTS vera_field_review(tree_id TEXT PRIMARY KEY,verificacao TEXT NOT NULL CHECK(verificacao IN ('CONFIRMADA','NÃO CONFIRMADA')),obs TEXT NOT NULL DEFAULT '',actor TEXT NOT NULL,updated_at TEXT NOT NULL);
