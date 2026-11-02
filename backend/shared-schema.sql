PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS shared_trees(id TEXT PRIMARY KEY, data TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, pending TEXT, updated_at TEXT NOT NULL, last_op TEXT NOT NULL, actor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shared_changes(seq INTEGER PRIMARY KEY AUTOINCREMENT, tree_id TEXT NOT NULL, data TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL, pending TEXT, updated_at TEXT NOT NULL, actor TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shared_changes_tree ON shared_changes(tree_id,seq);
CREATE TABLE IF NOT EXISTS shared_photos(tree_id TEXT NOT NULL, asset_id TEXT NOT NULL, image TEXT NOT NULL, PRIMARY KEY(tree_id,asset_id));
CREATE TABLE IF NOT EXISTS shared_deletions(id TEXT PRIMARY KEY, tree_id TEXT NOT NULL, tree_version INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT NOT NULL, actor TEXT NOT NULL, created_at TEXT NOT NULL, evidence TEXT NOT NULL, reviewed_at TEXT, reviewer_note TEXT, archive_status TEXT NOT NULL DEFAULT 'not_requested');
CREATE INDEX IF NOT EXISTS shared_deletions_status ON shared_deletions(status,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS shared_one_pending ON shared_deletions(tree_id) WHERE status='pending';
CREATE TABLE IF NOT EXISTS shared_geocodes(key TEXT PRIMARY KEY, address TEXT NOT NULL, created_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS shared_insert AFTER INSERT ON shared_trees BEGIN INSERT INTO shared_changes(tree_id,data,version,deleted,pending,updated_at,actor) VALUES(NEW.id,NEW.data,NEW.version,NEW.deleted,NEW.pending,NEW.updated_at,NEW.actor); END;
CREATE TRIGGER IF NOT EXISTS shared_update AFTER UPDATE ON shared_trees BEGIN INSERT INTO shared_changes(tree_id,data,version,deleted,pending,updated_at,actor) VALUES(NEW.id,NEW.data,NEW.version,NEW.deleted,NEW.pending,NEW.updated_at,NEW.actor); END;
-- Histórico de origem e vínculos de duplicatas. Mesclar nunca apaga fotos/versões.
CREATE TABLE IF NOT EXISTS shared_baselines(tree_id TEXT PRIMARY KEY,data TEXT NOT NULL,recorded_at TEXT NOT NULL,actor TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS shared_merges(source_id TEXT PRIMARY KEY,target_id TEXT NOT NULL,operation_id TEXT NOT NULL UNIQUE,source_version INTEGER NOT NULL,target_version INTEGER NOT NULL,created_at TEXT NOT NULL,actor TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS shared_merges_target ON shared_merges(target_id,source_id);
CREATE TABLE IF NOT EXISTS shared_local_history(seq INTEGER PRIMARY KEY AUTOINCREMENT,tree_id TEXT NOT NULL,local_version TEXT NOT NULL,data TEXT NOT NULL,received_at TEXT NOT NULL,actor TEXT NOT NULL,UNIQUE(tree_id,local_version));
CREATE INDEX IF NOT EXISTS shared_local_history_tree ON shared_local_history(tree_id,seq);
