CREATE TABLE IF NOT EXISTS campo_gerencial_acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  entrou_em TEXT NOT NULL,
  expira_em INTEGER NOT NULL,
  token_hash TEXT UNIQUE,
  saiu_em TEXT
);

CREATE TABLE IF NOT EXISTS campo_gerencial_vitrine (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  inspector_ids TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS campo_gerencial_equipes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL COLLATE NOCASE UNIQUE
);

CREATE TABLE IF NOT EXISTS campo_gerencial_equipe_membros (
  user_id TEXT PRIMARY KEY REFERENCES campo_users(id),
  equipe_id TEXT NOT NULL REFERENCES campo_gerencial_equipes(id)
);
