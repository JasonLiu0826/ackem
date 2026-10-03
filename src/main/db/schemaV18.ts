import type Database from 'better-sqlite3'

export const SCHEMA_V18_VERSION = 18

function addColumnIfMissing(db: Database.Database, table: string, columnSql: string): void {
  const colName = columnSql.trim().split(/\s+/)[0]
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  if (cols.some((c) => c.name === colName)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnSql}`)
}

/** Monotonic fact revision for index pending generations (Task 10). */
export function migrateSchemaV18(db: Database.Database): void {
  addColumnIfMissing(db, 'memory_facts', 'index_revision INTEGER NOT NULL DEFAULT 1')
  db.prepare(`UPDATE memory_facts SET index_revision = 1 WHERE index_revision IS NULL OR index_revision < 1`).run()
}
