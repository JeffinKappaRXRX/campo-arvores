CREATE TABLE IF NOT EXISTS campo_place_cache(cache_key TEXT PRIMARY KEY, data TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS campo_place_expiry ON campo_place_cache(expires_at);
CREATE TABLE IF NOT EXISTS campo_search_limit(id TEXT PRIMARY KEY, next_at INTEGER NOT NULL);
