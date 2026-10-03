import type Database from 'better-sqlite3'

export const SCHEMA_V16_VERSION = 16

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** Lease owner token for claim fencing (Task 9). */
export function migrateSchemaV16(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_jobs', 'lease_owner TEXT')
  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_job_effects (
      source_event_id TEXT NOT NULL,
      job_type TEXT NOT NULL,
      derivation_version INTEGER NOT NULL,
      effect_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (source_event_id, job_type, derivation_version, effect_key)
    );
  `)
}
