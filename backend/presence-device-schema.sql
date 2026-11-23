CREATE TABLE IF NOT EXISTS campo_presence_devices (
 session_id TEXT PRIMARY KEY REFERENCES campo_presence(session_id) ON DELETE CASCADE,
 model TEXT,
 system TEXT NOT NULL,
 version TEXT
);
