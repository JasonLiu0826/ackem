/** Schema v11 — QQ（OneBot v11）通道持久化 */
export const SCHEMA_V11_SQL = `
CREATE TABLE IF NOT EXISTS qq_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  self_id TEXT NOT NULL,
  nickname TEXT,
  http_base_url TEXT NOT NULL,
  ws_url TEXT NOT NULL,
  access_token TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS qq_seen (
  self_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  seen_at TEXT NOT NULL,
  PRIMARY KEY (self_id, message_id)
);
CREATE TABLE IF NOT EXISTS qq_peer (
  peer_id TEXT PRIMARY KEY,
  nickname TEXT,
  last_seen_at TEXT NOT NULL
);
`
