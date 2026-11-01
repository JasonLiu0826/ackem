/**
 * [schemaCommunity] — 社区版扩展表（QQ 渠道 / QQ 空间）
 *
 * 说明：上游主线的 V11 / V12 版本号已被「社会系统」（agents / 朋友圈等）占用，
 * 社区版把 QQ 渠道（原 V11）与 QQ 空间（原 V12）的建表语句放在这里，
 * 由 database.ts 的兼容层（schemaCompat.ts）在打开数据库时幂等执行。
 * 这样两条主线可以共用同一套 schema 版本号，互不覆盖。
 */

/** QQ 渠道（OneBot v11）持久化 */
export const SCHEMA_QQ_SQL = `
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

/** QQ 空间（说说自主发表 / 互动）持久化 */
export const SCHEMA_QZONE_SQL = `
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
