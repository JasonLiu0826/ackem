/**
 * schemaV11 — 社会系统最小切片
 * 负责：agents 注册表、memory_facts/episodes 溯源列、social_graph、相关索引
 * （本期不做朋友圈/群整表）
 */

import type Database from 'better-sqlite3'

export const SCHEMA_V11_VERSION = 11

const PRIMARY_AGENT_ID = 'default'

function addColumnIfMissing(
  db: Database.Database,
  table: string,
  columnSql: string
): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** 溯源扩列 + agents + social_graph + fact_embeddings.owner（可重复执行） */
export function migrateSchemaV11(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_facts', `owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}'`)
  addColumnIfMissing(db, 'memory_facts', `interaction_surface TEXT NOT NULL DEFAULT 'desktop_main'`)
  addColumnIfMissing(db, 'memory_facts', `counterparty_kind TEXT NOT NULL DEFAULT 'user'`)
  addColumnIfMissing(db, 'memory_facts', `counterparty_id TEXT`)
  addColumnIfMissing(db, 'memory_facts', `involves_user INTEGER NOT NULL DEFAULT 1`)
  addColumnIfMissing(db, 'memory_facts', `occurred_at TEXT`)
  addColumnIfMissing(db, 'memory_facts', `context_json TEXT`)

  addColumnIfMissing(db, 'episodes', `owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}'`)
  addColumnIfMissing(db, 'episodes', `interaction_surface TEXT NOT NULL DEFAULT 'desktop_main'`)
  addColumnIfMissing(db, 'episodes', `counterparty_kind TEXT NOT NULL DEFAULT 'user'`)
  addColumnIfMissing(db, 'episodes', `counterparty_id TEXT`)
  addColumnIfMissing(db, 'episodes', `involves_user INTEGER NOT NULL DEFAULT 1`)
  addColumnIfMissing(db, 'episodes', `occurred_at TEXT`)
  addColumnIfMissing(db, 'episodes', `context_json TEXT`)

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

/** @deprecated 仅供旧测试直接 db.exec；生产路径请用 migrateSchemaV11 */
export const SCHEMA_V11_SQL = `
-- §11a：memory_facts 溯源
ALTER TABLE memory_facts ADD COLUMN owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}';
ALTER TABLE memory_facts ADD COLUMN interaction_surface TEXT NOT NULL DEFAULT 'desktop_main';
ALTER TABLE memory_facts ADD COLUMN counterparty_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE memory_facts ADD COLUMN counterparty_id TEXT;
ALTER TABLE memory_facts ADD COLUMN involves_user INTEGER NOT NULL DEFAULT 1;
ALTER TABLE memory_facts ADD COLUMN occurred_at TEXT;
ALTER TABLE memory_facts ADD COLUMN context_json TEXT;

-- episodes 同步溯源列
ALTER TABLE episodes ADD COLUMN owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}';
ALTER TABLE episodes ADD COLUMN interaction_surface TEXT NOT NULL DEFAULT 'desktop_main';
ALTER TABLE episodes ADD COLUMN counterparty_kind TEXT NOT NULL DEFAULT 'user';
ALTER TABLE episodes ADD COLUMN counterparty_id TEXT;
ALTER TABLE episodes ADD COLUMN involves_user INTEGER NOT NULL DEFAULT 1;
ALTER TABLE episodes ADD COLUMN occurred_at TEXT;
ALTER TABLE episodes ADD COLUMN context_json TEXT;

CREATE INDEX IF NOT EXISTS idx_facts_owner ON memory_facts(owner_agent_id);
CREATE INDEX IF NOT EXISTS idx_facts_surface ON memory_facts(owner_agent_id, interaction_surface);
CREATE INDEX IF NOT EXISTS idx_facts_provenance ON memory_facts(owner_agent_id, interaction_surface, involves_user);
CREATE INDEX IF NOT EXISTS idx_facts_counterparty ON memory_facts(counterparty_kind, counterparty_id);
CREATE INDEX IF NOT EXISTS idx_facts_occurred ON memory_facts(occurred_at);
CREATE INDEX IF NOT EXISTS idx_facts_owner_session ON memory_facts(owner_agent_id, source_session_id);

-- §11b：agents 注册表
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

-- 最小 social_graph（创建时建边；不做 Feed/Tick UI）
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

-- fact_embeddings 归属（推荐一并做）
ALTER TABLE fact_embeddings ADD COLUMN owner_agent_id TEXT NOT NULL DEFAULT '${PRIMARY_AGENT_ID}';
CREATE INDEX IF NOT EXISTS idx_fact_emb_owner ON fact_embeddings(owner_agent_id, model_sig);
`
