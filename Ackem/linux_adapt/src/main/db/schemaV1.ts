export const SCHEMA_VERSION = 3

export const SCHEMA_V1_SQL = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS companion_state (
  session_id  TEXT NOT NULL PRIMARY KEY,
  version     TEXT NOT NULL,
  state_json  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS chat_history (
  session_id  TEXT NOT NULL PRIMARY KEY,
  rows_json   TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS memory_facts (
  id                  TEXT PRIMARY KEY,
  domain              TEXT NOT NULL,
  subcategory         TEXT NOT NULL,
  subject             TEXT NOT NULL,
  summary             TEXT NOT NULL,
  weight              REAL NOT NULL,
  confidence          REAL NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  emotional_context   TEXT NOT NULL,
  self_relevance      REAL NOT NULL,
  triggers            TEXT NOT NULL,
  triggers_text       TEXT NOT NULL DEFAULT '',
  update_trail        TEXT NOT NULL,
  source_session_id   TEXT NOT NULL,
  source_turn_index   INTEGER NOT NULL,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  derived_from        TEXT,
  fact_layer          TEXT DEFAULT 'raw',
  tier                TEXT DEFAULT 'archival'
);
CREATE INDEX IF NOT EXISTS idx_facts_status ON memory_facts(status);
CREATE INDEX IF NOT EXISTS idx_facts_domain ON memory_facts(domain, subcategory);
CREATE INDEX IF NOT EXISTS idx_facts_session ON memory_facts(source_session_id);

CREATE TABLE IF NOT EXISTS episodes (
  id                  TEXT PRIMARY KEY,
  summary             TEXT NOT NULL,
  emotional_intensity REAL NOT NULL,
  dominant_emotion    TEXT NOT NULL,
  keywords            TEXT NOT NULL,
  prev_episode_id     TEXT,
  source_session_id   TEXT NOT NULL,
  start_turn          INTEGER NOT NULL,
  end_turn            INTEGER NOT NULL,
  created_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(source_session_id);

CREATE TABLE IF NOT EXISTS procedural_habits (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  ts    TEXT NOT NULL,
  text  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kv_store (
  namespace   TEXT NOT NULL,
  key         TEXT NOT NULL,
  value       TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  PRIMARY KEY (namespace, key)
);
`
