/** Schema v12 — QQ 空间（说说自主发表 / 互动）持久化 */
export const SCHEMA_V12_SQL = `
CREATE TABLE IF NOT EXISTS qq_qzone_post (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  self_id TEXT NOT NULL,
  tid TEXT,
  content TEXT NOT NULL,
  image_count INTEGER NOT NULL DEFAULT 0,
  ugc_right INTEGER NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL,
  published_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_qq_qzone_post_self_created
  ON qq_qzone_post(self_id, created_at DESC);

CREATE TABLE IF NOT EXISTS qq_qzone_plan (
  self_id TEXT PRIMARY KEY,
  next_publish_at TEXT,
  next_interact_at TEXT,
  daily_date TEXT,
  daily_count INTEGER NOT NULL DEFAULT 0,
  last_publish_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS qq_qzone_react (
  self_id TEXT NOT NULL,
  tid TEXT NOT NULL,
  target_uin TEXT NOT NULL,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (self_id, tid, target_uin, kind)
);
`
