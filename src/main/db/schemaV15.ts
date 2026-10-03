import type Database from 'better-sqlite3'

export const SCHEMA_V15_VERSION = 15

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** Queued work must keep the inputs needed to execute after restart. */
export function migrateSchemaV15(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_action_runs', 'execution_json TEXT')
}
