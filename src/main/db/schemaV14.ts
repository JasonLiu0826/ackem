import type Database from 'better-sqlite3'

export const SCHEMA_V14_VERSION = 14

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

export function migrateSchemaV14(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_facts', 'revision INTEGER NOT NULL DEFAULT 1')
  addColumnIfMissing(db, 'memory_facts', 'valid_from TEXT')
  addColumnIfMissing(db, 'memory_facts', 'valid_to TEXT')
  addColumnIfMissing(db, 'memory_facts', 'scheduled_for TEXT')
  addColumnIfMissing(db, 'memory_facts', 'timezone TEXT')
  addColumnIfMissing(db, 'memory_facts', 'superseded_by TEXT')
  addColumnIfMissing(db, 'memory_facts', 'derivation_version INTEGER NOT NULL DEFAULT 0')

  db.exec(`
CREATE TABLE IF NOT EXISTS memory_fact_evidence (
  fact_id TEXT NOT NULL REFERENCES memory_facts(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  evidence_role TEXT NOT NULL CHECK(evidence_role IN ('supports','corrects','supersedes')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(fact_id, event_id, evidence_role)
);

CREATE TABLE IF NOT EXISTS memory_episode_evidence (
  episode_id TEXT NOT NULL REFERENCES episodes(id) ON DELETE CASCADE,
  event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  created_at TEXT NOT NULL,
  PRIMARY KEY(episode_id, event_id)
);

CREATE TABLE IF NOT EXISTS memory_tombstones (
  tombstone_id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL CHECK(scope_type IN ('event','fact','episode','topic')),
  scope_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  control_event_id TEXT NOT NULL REFERENCES memory_events(event_id),
  UNIQUE(scope_type, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_evidence_event ON memory_fact_evidence(event_id);
CREATE INDEX IF NOT EXISTS idx_episode_evidence_event ON memory_episode_evidence(event_id);
CREATE INDEX IF NOT EXISTS idx_facts_validity ON memory_facts(status, valid_from, valid_to);
`)
}
