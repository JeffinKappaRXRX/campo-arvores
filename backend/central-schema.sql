-- Consolidado de manutenção e orçamento para o painel. Só tabelas novas: nada aqui toca shared_trees nem vera_*.
CREATE TABLE IF NOT EXISTS central_parts(generation TEXT NOT NULL,name TEXT NOT NULL,part INTEGER NOT NULL,body TEXT NOT NULL,PRIMARY KEY(generation,name,part));
CREATE TABLE IF NOT EXISTS central_meta(key TEXT PRIMARY KEY,value TEXT NOT NULL);
