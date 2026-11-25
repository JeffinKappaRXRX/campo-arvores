CREATE TABLE IF NOT EXISTS campo_tree_corrections (
 id TEXT PRIMARY KEY,
 tree_id TEXT NOT NULL,
 assignee TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','cancelled')),
 base_version INTEGER NOT NULL,
 data TEXT NOT NULL,
 dispatched_at TEXT NOT NULL,
 closed_at TEXT,
 closed_by TEXT,
 closed_version INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS campo_tree_corrections_pending ON campo_tree_corrections(tree_id) WHERE status='pending';
CREATE INDEX IF NOT EXISTS campo_tree_corrections_assignee ON campo_tree_corrections(assignee,status,dispatched_at);
CREATE INDEX IF NOT EXISTS campo_tree_corrections_tree ON campo_tree_corrections(tree_id,dispatched_at DESC);
