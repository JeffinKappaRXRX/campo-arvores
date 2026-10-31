CREATE TABLE IF NOT EXISTS campo_admin_settings(id TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS campo_presence(session_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, name TEXT NOT NULL, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, lat REAL, lon REAL, accuracy REAL, location_at TEXT, sharing INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS campo_presence_seen ON campo_presence(last_seen);
CREATE TABLE IF NOT EXISTS campo_admin_locks(tree_id TEXT PRIMARY KEY, operation_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
CREATE VIEW IF NOT EXISTS campo_admin_history AS
WITH versions AS (
 SELECT seq,tree_id,data,version,deleted,pending,updated_at,actor,
 LAG(data) OVER (PARTITION BY tree_id ORDER BY seq) previous_data,
 LAG(deleted) OVER (PARTITION BY tree_id ORDER BY seq) previous_deleted,
 LAG(pending) OVER (PARTITION BY tree_id ORDER BY seq) previous_pending,
 LAG(actor) OVER (PARTITION BY tree_id ORDER BY seq) previous_actor
 FROM shared_changes
), events AS (
 SELECT *,COALESCE(json_extract(previous_data,'$.lastInspector'),previous_actor) previous_editor,
 CASE WHEN previous_data IS NULL THEN CASE WHEN deleted=1 THEN 'delete' ELSE 'create' END
 WHEN deleted=1 AND COALESCE(previous_deleted,0)=0 THEN 'delete'
 WHEN pending IS NOT NULL AND pending IS NOT previous_pending THEN 'request'
 WHEN previous_pending IS NOT NULL AND pending IS NULL THEN 'review'
 WHEN json_extract(data,'$.lat') IS NOT json_extract(previous_data,'$.lat') OR json_extract(data,'$.lon') IS NOT json_extract(previous_data,'$.lon') OR json_extract(data,'$.inspector') IS NOT json_extract(previous_data,'$.inspector') OR json_extract(data,'$.feeder') IS NOT json_extract(previous_data,'$.feeder') OR json_extract(data,'$.height') IS NOT json_extract(previous_data,'$.height') OR json_extract(data,'$.dap') IS NOT json_extract(previous_data,'$.dap') OR json_extract(data,'$.circ') IS NOT json_extract(previous_data,'$.circ') OR json_extract(data,'$.position') IS NOT json_extract(previous_data,'$.position') OR json_extract(data,'$.pole') IS NOT json_extract(previous_data,'$.pole') OR json_extract(data,'$.span') IS NOT json_extract(previous_data,'$.span') OR json_extract(data,'$.os') IS NOT json_extract(previous_data,'$.os') OR json_extract(data,'$.species') IS NOT json_extract(previous_data,'$.species') OR json_extract(data,'$.note') IS NOT json_extract(previous_data,'$.note') OR json_extract(data,'$.poda') IS NOT json_extract(previous_data,'$.poda') OR json_extract(data,'$.projection') IS NOT json_extract(previous_data,'$.projection') OR json_extract(data,'$.grouped') IS NOT json_extract(previous_data,'$.grouped') OR json_extract(data,'$.mt') IS NOT json_extract(previous_data,'$.mt') OR json_extract(data,'$.bt') IS NOT json_extract(previous_data,'$.bt') OR json_extract(data,'$.at') IS NOT json_extract(previous_data,'$.at') OR json_extract(data,'$.mtDistance') IS NOT json_extract(previous_data,'$.mtDistance') OR json_extract(data,'$.btDistance') IS NOT json_extract(previous_data,'$.btDistance') OR json_extract(data,'$.atDistance') IS NOT json_extract(previous_data,'$.atDistance') OR json_extract(data,'$.photos') IS NOT json_extract(previous_data,'$.photos') OR json_extract(data,'$.area') IS NOT json_extract(previous_data,'$.area') OR json_extract(data,'$.access') IS NOT json_extract(previous_data,'$.access') OR json_extract(data,'$.team') IS NOT json_extract(previous_data,'$.team') OR json_extract(data,'$.plantIdentification') IS NOT json_extract(previous_data,'$.plantIdentification') OR json_extract(data,'$.heightMeasurement') IS NOT json_extract(previous_data,'$.heightMeasurement') OR json_extract(data,'$.measurements') IS NOT json_extract(previous_data,'$.measurements') THEN 'edit' ELSE 'sync' END kind
 FROM versions
)
SELECT *,CASE WHEN kind='edit' AND lower(trim(actor))<>lower(trim(COALESCE(previous_editor,actor))) THEN 1 ELSE 0 END cross_user FROM events;
