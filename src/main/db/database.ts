// [database] — 嵌入式 SQLite 网关（单例 per dataRoot）
// 路径：{dataRoot}/ackem.db（与 layout / settings 的 dataRoot 一致，非固定 /data）

import Database from 'better-sqlite3'
import { mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'
import { databasePath } from './paths'
import { SCHEMA_V1_SQL } from './schemaV1'
import { CURRENT_SCHEMA_VERSION } from './schemaVersion'
import { migrateSchemaV13 } from './schemaV13'
import { migrateSchemaV14 } from './schemaV14'
import { migrateSchemaV15 } from './schemaV15'
import { migrateSchemaV16 } from './schemaV16'
import { migrateSchemaV17 } from './schemaV17'
import { migrateSchemaV18 } from './schemaV18'
import { SCHEMA_V2_SQL } from './schemaV2'
import { SCHEMA_V3_SQL } from './schemaV3'
import { SCHEMA_V4_SQL } from './schemaV4'
import { SCHEMA_V5_SQL } from './schemaV5'
import { SCHEMA_V6_SQL } from './schemaV6'
import { SCHEMA_V7_SQL } from './schemaV7'
import { SCHEMA_V8_SQL } from './schemaV8'
import { SCHEMA_V9_SQL } from './schemaV9'
import { SCHEMA_V10_SQL } from './schemaV10'
import { createLogger } from '../logger'
import { migrateSchemaV11 } from './schemaV11'
import { migrateSchemaV12 } from './schemaV12'
import { importLegacyDataIfNeeded } from './importLegacy'
import { scheduleTransactionLatencySample } from '../memory/audit/auditMetricsStore.js'

const log = createLogger('database')
const pools = new Map<string, Database.Database>()
const legacyImported = new Set<string>()

/** Vitest 批量测试时仅走 JSON，避免 Windows 上 WAL 锁文件；database.test.ts 会设 ACKEM_SQLITE_IN_TEST=1 */
function sqliteEnabled(): boolean {
  if (process.env.ACKEM_DISABLE_SQLITE === '1') return false
  if (process.env.VITEST === 'true' && process.env.ACKEM_SQLITE_IN_TEST !== '1') return false
  return true
}

function applyPragmas(db: Database.Database): void {
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  db.pragma('cache_size = -8000')
}

function setSchemaVersion(db: Database.Database, version: number): void {
  db.prepare(
    `INSERT INTO schema_meta(key, value) VALUES ('user_version', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(version))
}

function runMigrations(db: Database.Database): void {
  db.exec(SCHEMA_V1_SQL)
  const row = db.prepare(`SELECT value FROM schema_meta WHERE key = 'user_version'`).get() as
    | { value: string }
    | undefined
  const current = row ? Number(row.value) : 0
  if (current < 2) {
    db.exec(SCHEMA_V2_SQL)
    setSchemaVersion(db, 2)
  }
  if (current < 3) {
    if (SCHEMA_V3_SQL.trim()) db.exec(SCHEMA_V3_SQL)
    setSchemaVersion(db, 3)
  }
  if (current < 4) {
    db.exec(SCHEMA_V4_SQL)
    setSchemaVersion(db, 4)
  }
  if (current < 5) {
    db.exec(SCHEMA_V5_SQL)
    setSchemaVersion(db, 5)
  }
  if (current < 6) {
    db.exec(SCHEMA_V6_SQL)
    setSchemaVersion(db, 6)
  }
  if (current < 7) {
    db.exec(SCHEMA_V7_SQL)
    setSchemaVersion(db, 7)
  }
  if (current < 8) {
    db.exec(SCHEMA_V8_SQL)
    setSchemaVersion(db, 8)
  }
  if (current < 9) {
    db.exec(SCHEMA_V9_SQL)
    setSchemaVersion(db, 9)
  }
  if (current < 10) {
    db.exec(SCHEMA_V10_SQL)
    setSchemaVersion(db, 10)
  }
  if (current < 11) {
    migrateSchemaV11(db)
    setSchemaVersion(db, 11)
  }
  if (current < 12) {
    migrateSchemaV12(db)
    setSchemaVersion(db, 12)
  }
  if (current < 13) {
    migrateSchemaV13(db)
    setSchemaVersion(db, 13)
  }
  if (current < 14) {
    migrateSchemaV14(db)
    setSchemaVersion(db, 14)
  }
  if (current < 15) {
    migrateSchemaV15(db)
    setSchemaVersion(db, 15)
  }
  if (current < 16) {
    migrateSchemaV16(db)
    setSchemaVersion(db, 16)
  }
  if (current < 17) {
    migrateSchemaV17(db)
    setSchemaVersion(db, 17)
  }
  if (current < 18) {
    migrateSchemaV18(db)
    setSchemaVersion(db, CURRENT_SCHEMA_VERSION)
  }
}

export { CURRENT_SCHEMA_VERSION }

let openFailLogged = false

/** 打开或复用 dataRoot 下的 ackem.db；失败时返回 null（调用方回退 JSON） */
export function getDatabase(dataRoot: string): Database.Database | null {
  if (!sqliteEnabled()) return null
  const cached = pools.get(dataRoot)
  if (cached) return cached

  try {
    const path = databasePath(dataRoot)
    mkdirSync(dirname(path), { recursive: true })
    const db = new Database(path)
    applyPragmas(db)
    runMigrations(db)
    pools.set(dataRoot, db)
    if (!legacyImported.has(dataRoot)) {
      legacyImported.add(dataRoot)
      importLegacyDataIfNeeded(dataRoot)
    }
    return db
  } catch (e) {
    if (!openFailLogged) {
      openFailLogged = true
      const msg = e instanceof Error ? e.message : String(e)
      log.error('open/migrate failed; SQLite unavailable (social agents require DB)', {
        error: msg,
      })
      if (/NODE_MODULE_VERSION/i.test(msg)) {
        log.error(
          'better-sqlite3 ABI mismatch. Electron 运行时: npx electron-builder install-app-deps；Vitest/Node 集成测试: npm rebuild better-sqlite3（二者 ABI 不同，按场景切换）'
        )
      }
    }
    return null
  }
}

export function closeDatabase(dataRoot: string): void {
  const db = pools.get(dataRoot)
  if (!db) return
  const path = databasePath(dataRoot)
  try {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
  } catch {
    /* ignore */
  }
  pools.delete(dataRoot)
  legacyImported.delete(dataRoot)
  for (const suffix of ['-wal', '-shm']) {
    try {
      rmSync(path + suffix, { force: true })
    } catch {
      /* ignore */
    }
  }
}

export function closeAllDatabases(): void {
  for (const root of [...pools.keys()]) closeDatabase(root)
}

export function withTransaction<T>(dataRoot: string, fn: (db: Database.Database) => T): T | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const t0 = performance.now()
  const run = db.transaction(() => fn(db))
  const out = run()
  scheduleTransactionLatencySample(dataRoot, performance.now() - t0)
  return out
}

/** 归档 / memory:clearAll：清空结构化表，保留 schema_meta 与 FTS 壳 */
export function clearStructuredData(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  withTransaction(dataRoot, (d) => {
    d.exec(`
      DELETE FROM memory_fact_evidence;
      DELETE FROM memory_episode_evidence;
      DELETE FROM memory_tombstones;
      DELETE FROM memory_jobs;
      DELETE FROM memory_action_runs;
      DELETE FROM memory_event_payloads;
      DELETE FROM memory_events;
      DELETE FROM memory_associations;
      DELETE FROM temporal_anchors;
      DELETE FROM fact_embeddings;
      DELETE FROM companion_state;
      DELETE FROM chat_history;
      DELETE FROM memory_facts;
      DELETE FROM episodes;
      DELETE FROM procedural_habits;
      DELETE FROM kv_store;
      DELETE FROM knowledge_triples;
      DELETE FROM turn_traces;
      DELETE FROM diary;
      DELETE FROM openforu_runs;
      DELETE FROM openforu_sessions;
      DELETE FROM openforu_workspaces;
      DELETE FROM shared_events;
      DELETE FROM user_habits;
      DELETE FROM foreground_history;
      DELETE FROM decision_log;
      DELETE FROM memory_facts_fts;
      DELETE FROM episodes_fts;
      DELETE FROM social_graph;
      DELETE FROM agents;
    `)
  })
}

export function initDatabase(dataRoot: string): boolean {
  return getDatabase(dataRoot) != null
}
