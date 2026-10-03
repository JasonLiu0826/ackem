import type Database from 'better-sqlite3'

export const SCHEMA_V17_VERSION = 17

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** Monotonic fence per claim; complete/fail must match owner + generation (Task 9). */
export function migrateSchemaV17(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_jobs', 'lease_generation INTEGER NOT NULL DEFAULT 0')
}
