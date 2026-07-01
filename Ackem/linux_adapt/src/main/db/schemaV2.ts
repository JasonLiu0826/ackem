/** Phase 2 — 增量 DDL（自 user_version 1 → 2） */
export const SCHEMA_V2_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_triples (
  id              TEXT PRIMARY KEY,
  subject         TEXT NOT NULL,
  predicate       TEXT NOT NULL,
  object          TEXT NOT NULL,
  confidence      REAL NOT NULL,
  source_fact_ids TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS turn_traces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  date        TEXT NOT NULL,
  session_id  TEXT NOT NULL DEFAULT 'default',
  turn_index  INTEGER NOT NULL DEFAULT 0,
  trace_json  TEXT NOT NULL,
  timestamp   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_traces_date ON turn_traces(date, turn_index);

CREATE TABLE IF NOT EXISTS diary (
  date        TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  meta_json   TEXT,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS openforu_workspaces (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  session_id  TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL,
  user_created INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS openforu_sessions (
  session_id    TEXT PRIMARY KEY,
  workspace_id  TEXT,
  plan_json     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS openforu_runs (
  run_id        TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL,
  kind          TEXT NOT NULL,
  phase         TEXT NOT NULL,
  status        TEXT NOT NULL,
  artifact_kind TEXT,
  strategy      TEXT,
  started_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  error         TEXT,
  run_json      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_events (
  id          TEXT PRIMARY KEY,
  session_id  TEXT,
  event_json  TEXT NOT NULL,
  created_at  TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS memory_facts_fts USING fts5(
  fact_id UNINDEXED,
  subject,
  summary,
  triggers_text,
  tokenize='unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS episodes_fts USING fts5(
  episode_id UNINDEXED,
  summary,
  keywords_text,
  dominant_emotion,
  tokenize='unicode61'
);
`
