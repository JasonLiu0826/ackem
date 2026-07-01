/** Schema v9 — 微信 iLink 通道持久化 */
export const SCHEMA_V9_SQL = `
CREATE TABLE IF NOT EXISTS weixin_account (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  account_id TEXT NOT NULL,
  token TEXT NOT NULL,
  base_url TEXT NOT NULL,
  user_id TEXT,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS weixin_sync (
  account_id TEXT PRIMARY KEY,
  get_updates_buf TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS weixin_context (
  peer_id TEXT PRIMARY KEY,
  context_token TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS weixin_seen (
  message_id INTEGER PRIMARY KEY
);
`
