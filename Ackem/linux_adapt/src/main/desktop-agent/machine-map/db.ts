import Database from 'better-sqlite3'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MACHINE_MAP_SCHEMA_SQL } from './schema'

const pools = new Map<string, Database.Database>()

export function machineMapDbPath(dataRoot: string): string {
  return join(dataRoot, 'desktop-agent', 'machine-map.db')
}

export function getMachineMapDb(dataRoot: string): Database.Database | null {
  const cached = pools.get(dataRoot)
  if (cached) return cached

  try {
    const path = machineMapDbPath(dataRoot)
    mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)
    db.pragma('journal_mode = WAL')
    db.pragma('synchronous = NORMAL')
    db.pragma('busy_timeout = 5000')
    db.exec(MACHINE_MAP_SCHEMA_SQL)
    pools.set(dataRoot, db)
    return db
  } catch {
    return null
  }
}

export function closeMachineMapDb(dataRoot: string): void {
  const db = pools.get(dataRoot)
  if (!db) return
  try {
    db.close()
  } catch {
    /* ignore */
  }
  pools.delete(dataRoot)
}

export function createMachineMapDbMemory(): Database.Database {
  const db = new Database(':memory:')
  db.exec(MACHINE_MAP_SCHEMA_SQL)
  return db
}
