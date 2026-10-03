import type Database from 'better-sqlite3'

export const SCHEMA_V13_VERSION = 13

export const SCHEMA_V13_SQL = `
CREATE TABLE IF NOT EXISTS memory_events (
  event_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  session_id TEXT NOT NULL,
  turn_id TEXT,
  correlation_id TEXT NOT NULL,
  causation_event_id TEXT,
  nature TEXT NOT NULL CHECK(nature IN ('chat','plugin','work','memory_control')),
  event_type TEXT NOT NULL,
  surface TEXT NOT NULL CHECK(surface IN ('desktop','weixin','system')),
  actor TEXT NOT NULL,
  status TEXT,
  evidence_kind TEXT NOT NULL,
  confidence REAL NOT NULL CHECK(confidence >= 0 AND confidence <= 1),
  observed_at TEXT NOT NULL,
  occurred_at TEXT,
  scheduled_for TEXT,
  completed_at TEXT,
  timezone TEXT NOT NULL,
  local_date TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS memory_event_payloads (
  event_id TEXT PRIMARY KEY REFERENCES memory_events(event_id) ON DELETE CASCADE,
  summary TEXT NOT NULL,
  content_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  redacted_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_action_runs (
  run_id TEXT PRIMARY KEY,
  parent_run_id TEXT REFERENCES memory_action_runs(run_id),
  nature TEXT NOT NULL CHECK(nature IN ('plugin','work')),
  session_id TEXT NOT NULL,
  turn_id TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  plan_id TEXT,
  runtime_id TEXT,
  target_id TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  request_event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  last_event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  queue_order INTEGER,
  queued_at TEXT,
  started_at TEXT,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(nature, runtime_id)
);

CREATE TABLE IF NOT EXISTS memory_jobs (
  job_id TEXT PRIMARY KEY,
  source_event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  session_id TEXT NOT NULL,
  job_type TEXT NOT NULL,
  derivation_version INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending','running','succeeded','failed','dead')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TEXT NOT NULL,
  lease_until TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(source_event_id, job_type, derivation_version)
);

CREATE INDEX IF NOT EXISTS idx_memory_events_session_time
  ON memory_events(session_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_events_kind_time
  ON memory_events(nature, event_type, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_events_correlation
  ON memory_events(correlation_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_memory_events_local_calendar
  ON memory_events(timezone, local_date, event_type);
CREATE INDEX IF NOT EXISTS idx_memory_actions_session_status
  ON memory_action_runs(session_id, status, queue_order, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_memory_jobs_claim
  ON memory_jobs(status, available_at, lease_until);
`

/** 可重复执行：CREATE IF NOT EXISTS + 索引。 */
export function migrateSchemaV13(db: Database.Database): void {
  db.exec(SCHEMA_V13_SQL)
}
