/**
 * [db/schemaCompat] — 双向迁移兼容层
 *
 * 背景：社区版和上游在同一个版本号（V11 / V12）上各自加了不同的表：
 *   - 社区版 V11：qq_account / qq_seen / qq_peer；V12：qq_qzone_*（QQ 空间）
 *   - 上游   V11：agents / social_graph + memory_facts/episodes 溯源列；V12：朋友圈、群组等社会系统表
 *
 * 两边的迁移都只在「版本号小于 N」时执行，于是：
 *   - 上游 V22 数据库切到社区版时，版本号 ≥ 13，社区版 V11/V12 不会跑 → 缺 QQ 相关表；
 *   - 社区版 V12 数据库切到上游时，上游认为 V11/V12 已跑过 → 缺 agents / friend_circle。
 *
 * 解决：打开数据库后无条件执行本兼容层（全部幂等），补齐两边缺失的表。
 * 本文件中的「上游」DDL 与上游仓库 src/main/db/schemaV11.ts / schemaV12.ts 保持同步。
 */
import type Database from 'better-sqlite3'
import { SCHEMA_V11_SQL } from './schemaV11'
import { SCHEMA_V12_SQL } from './schemaV12'

const PRIMARY_AGENT_ID = 'default'

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** 社区版扩展表（V11 QQ 渠道 / V12 QQ 空间），幂等 */
function ensureCommunityExtensionTables(db: Database.Database): void {
  db.exec(SCHEMA_V11_SQL)
  db.exec(SCHEMA_V12_SQL)
}

/** 上游 V11 新增：memory_facts / episodes 溯源列 + agents + social_graph + fact_embeddings 归属 */
function ensureUpstreamV11(db: Database.Database): void {
  const factsCols = [
    `owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}'`,
    `interaction_surface TEXT NOT NULL DEFAULT 'desktop_main'`,
    `counterparty_kind TEXT NOT NULL DEFAULT 'user'`,
    `counterparty_id TEXT`,
    `involves_user INTEGER NOT NULL DEFAULT 1`,
    `occurred_at TEXT`,
    `context_json TEXT`
  ]
  for (const col of factsCols) addColumnIfMissing(db, 'memory_facts', col)
  for (const col of factsCols) addColumnIfMissing(db, 'episodes', col)

  db.exec(`
CREATE INDEX IF NOT EXISTS idx_facts_owner ON memory_facts(owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_facts_surface ON memory_facts(owner_agent_id, interaction_surface);
CREATE INDEX IF NOT EXISTS idx_facts_provenance ON memory_facts(owner_agent_id, interaction_surface, involves_user);
CREATE INDEX IF NOT EXISTS idx_facts_counterparty ON memory_facts(counterparty_kind, counterparty_id);
CREATE INDEX IF NOT EXISTS idx_facts_occurred ON memory_facts(occurred_at);
CREATE INDEX IF NOT EXISTS idx_facts_owner_session ON memory_facts(owner_agent_id, source_session_id);

CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK(kind IN ('primary', 'social_member')),
  origin          TEXT NOT NULL DEFAULT 'builtin'
                    CHECK(origin IN ('builtin', 'user')),
  deletable       INTEGER NOT NULL DEFAULT 1,
  preset_id       TEXT NOT NULL,
  gender          TEXT NOT NULL CHECK(gender IN ('female', 'male')),
  session_id      TEXT NOT NULL UNIQUE,
  se              INTEGER NOT NULL DEFAULT 50 CHECK(se BETWEEN 0 AND 100),
  sp              INTEGER NOT NULL DEFAULT 50 CHECK(sp BETWEEN 0 AND 100),
  so              INTEGER NOT NULL DEFAULT 50 CHECK(so BETWEEN 0 AND 100),
  persona_source  TEXT CHECK(persona_source IN ('preset', 'character_card', 'preset+card')),
  persona_path    TEXT,
  avatar_url      TEXT,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS social_graph (
  agent_a TEXT NOT NULL,
  agent_b TEXT NOT NULL,
  trust REAL NOT NULL DEFAULT 25,
  rifts INTEGER NOT NULL DEFAULT 0,
  momentum REAL NOT NULL DEFAULT 0,
  stage TEXT NOT NULL DEFAULT 'STRANGER',
  atmosphere TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (agent_a, agent_b),
  CHECK(agent_a < agent_b)
);
`)

  addColumnIfMissing(db, 'fact_embeddings', `owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}'`)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_fact_emb_owner ON fact_embeddings(owner_agent_id, model_sig);`)
  addColumnIfMissing(db, 'weixin_account', `bound_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}'`)
}

/** 上游 V12 新增：朋友圈 / 互动 / 好友 / 群组等社会系统表，幂等 */
function ensureUpstreamV12(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS friend_circle (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, content TEXT NOT NULL, emotion_label TEXT, emotion_valence REAL, created_at TEXT NOT NULL, last_interaction_at TEXT, offline_generated INTEGER NOT NULL DEFAULT 0, content_source TEXT NOT NULL DEFAULT 'template', provenance_json TEXT);
CREATE INDEX IF NOT EXISTS idx_fc_created ON friend_circle(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fc_author ON friend_circle(author_id, created_at DESC);
CREATE TABLE IF NOT EXISTS fc_interactions (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','agent')), actor_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('like','comment')), content TEXT, sentiment REAL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_like_once ON fc_interactions(post_id,actor_kind,actor_id) WHERE type='like';
CREATE INDEX IF NOT EXISTS idx_fc_int_post ON fc_interactions(post_id);
CREATE TABLE IF NOT EXISTS user_friendships (id TEXT PRIMARY KEY,user_id TEXT NOT NULL DEFAULT 'local',agent_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),requested_at TEXT NOT NULL,responded_at TEXT,UNIQUE(user_id,agent_id));
CREATE TABLE IF NOT EXISTS social_events (id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_se_time ON social_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_se_type ON social_events(type);
CREATE TABLE IF NOT EXISTS notification_reads (user_id TEXT NOT NULL DEFAULT 'local',event_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
CREATE TABLE IF NOT EXISTS social_daily_stats (day TEXT PRIMARY KEY,tick_count INTEGER NOT NULL DEFAULT 0,llm_calls INTEGER NOT NULL DEFAULT 0,posts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS user_blocks (user_id TEXT NOT NULL DEFAULT 'local',agent_id TEXT NOT NULL,block_type TEXT NOT NULL CHECK(block_type IN ('mute','block')),created_at TEXT NOT NULL,PRIMARY KEY(user_id,agent_id));
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_kind TEXT NOT NULL CHECK(owner_kind IN ('user','agent')),owner_id TEXT NOT NULL,created_at TEXT NOT NULL,dissolved_at TEXT);
CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL,member_kind TEXT NOT NULL CHECK(member_kind IN ('user','agent')),member_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL,PRIMARY KEY(group_id,member_kind,member_id));
CREATE TABLE IF NOT EXISTS group_messages (id TEXT PRIMARY KEY,group_id TEXT NOT NULL,sender_kind TEXT NOT NULL CHECK(sender_kind IN ('user','agent','system')),sender_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_gm_group_time ON group_messages(group_id,created_at);
CREATE TABLE IF NOT EXISTS group_join_requests (id TEXT PRIMARY KEY,group_id TEXT NOT NULL,user_id TEXT NOT NULL DEFAULT 'local',status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),requested_at TEXT NOT NULL,responded_at TEXT);
CREATE TABLE IF NOT EXISTS achievements (achievement_id TEXT PRIMARY KEY,unlocked_at TEXT NOT NULL,payload TEXT);
CREATE TABLE IF NOT EXISTS achievement_progress (key TEXT PRIMARY KEY,value REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
`)
}

/**
 * 打开数据库后调用：双向补齐缺失的表（全部幂等，可重复执行）。
 * 不修改 schema_meta 版本号——版本号只由各自主线的迁移链推进，
 * 这样上游 V22 的库切过来不会被降级，社区版 V12 的库交给上游时也能顺利升到 V22。
 */
export function ensureCompatTables(db: Database.Database): void {
  ensureCommunityExtensionTables(db)
  ensureUpstreamV11(db)
  ensureUpstreamV12(db)
}
