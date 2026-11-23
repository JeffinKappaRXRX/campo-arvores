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
