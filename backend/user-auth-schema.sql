CREATE TABLE IF NOT EXISTS campo_users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,phone TEXT UNIQUE,role TEXT NOT NULL CHECK(role IN ('inspector','admin')),blocked INTEGER NOT NULL DEFAULT 0,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campo_user_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,created_at INTEGER NOT NULL,last_seen INTEGER NOT NULL,expires_at INTEGER NOT NULL,FOREIGN KEY(user_id) REFERENCES campo_users(id));
CREATE INDEX IF NOT EXISTS campo_user_session_user ON campo_user_sessions(user_id);
CREATE TABLE IF NOT EXISTS campo_login_nonces(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS campo_auth_keys(id TEXT PRIMARY KEY,kid TEXT NOT NULL,public_jwk TEXT NOT NULL,private_jwk TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campo_auth_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,user_id TEXT,actor_id TEXT NOT NULL,action TEXT NOT NULL,at TEXT NOT NULL,detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campo_presence_identities(session_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,email TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campo_access_requests(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE COLLATE NOCASE,name TEXT NOT NULL,phone TEXT,status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected')),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,reviewed_at TEXT,reviewed_by TEXT);
CREATE INDEX IF NOT EXISTS campo_access_requests_inbox ON campo_access_requests(status,created_at DESC);
