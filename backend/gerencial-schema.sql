CREATE TABLE IF NOT EXISTS campo_gerencial_acessos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  entrou_em TEXT NOT NULL,
  expira_em INTEGER NOT NULL,
  token_hash TEXT UNIQUE,
  saiu_em TEXT
);
