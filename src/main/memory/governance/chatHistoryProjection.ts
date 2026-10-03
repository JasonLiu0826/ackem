import type Database from 'better-sqlite3'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  hasChatHistoryRow,
  loadChatHistoryFromDb,
  saveChatHistoryToDb
} from '../../db/repos/chatHistory.js'
import { kvGet, kvSet } from '../../db/repos/kv.js'
import { engineSessionId } from '../../session/canonical.js'

type ChatRow = {
  kind?: string
  turnId?: string
  content?: string
  role?: string
}

let legacyChatWriteHookForTests: ((filePath: string, body: string) => void) | undefined

export function setLegacyChatWriteHookForTests(
  hook: ((filePath: string, body: string) => void) | undefined
): void {
  legacyChatWriteHookForTests = hook
}

function legacyPath(dataRoot: string, sessionId: string): string {
  const sid = sessionId || engineSessionId()
  return join(dataRoot, 'companion', `chat-history-${sid}.json`)
}

function writeLegacyFile(filePath: string, rows: unknown[]): void {
  const body = JSON.stringify(rows, null, 2)
  legacyChatWriteHookForTests?.(filePath, body)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, body, 'utf-8')
}

/** One-time: seed DB from legacy JSON when no chat_history row exists (never after DB owns session). */
export function hydrateChatHistoryFromLegacyIfNeeded(dataRoot: string, sessionId: string): boolean {
  if (hasChatHistoryRow(dataRoot, sessionId)) return false
  const path = legacyPath(dataRoot, sessionId)
  if (!existsSync(path)) return false
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown
    if (!Array.isArray(parsed)) return false
    saveChatHistoryToDb(dataRoot, sessionId, parsed)
    return true
  } catch {
    return false
  }
}

function loadChatRowsInTx(db: Database.Database, sessionId: string): ChatRow[] {
  const row = db
    .prepare(`SELECT rows_json FROM chat_history WHERE session_id = ?`)
    .get(sessionId) as { rows_json: string } | undefined
  if (!row) return []
  try {
    const parsed = JSON.parse(row.rows_json) as unknown
    return Array.isArray(parsed) ? (parsed as ChatRow[]) : []
  } catch {
    return []
  }
}

function saveChatRowsInTx(db: Database.Database, sessionId: string, rows: unknown[]): void {
  const trimmed = rows.slice(-2000)
  const updatedAt = new Date().toISOString()
  db.prepare(
    `INSERT INTO chat_history(session_id, rows_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       rows_json = excluded.rows_json,
       updated_at = excluded.updated_at`
  ).run(sessionId, JSON.stringify(trimmed), updatedAt)
}

/** Authoritative purge using the same SQLite handle as the open control transaction. */
export function purgeTurnFromDbTx(
  db: Database.Database,
  dataRoot: string,
  sessionId: string,
  turnId: string
): number {
  hydrateChatHistoryFromLegacyIfNeeded(dataRoot, sessionId)
  let fromDb = loadChatRowsInTx(db, sessionId)
  if (fromDb.length === 0) {
    hydrateChatHistoryFromLegacyIfNeeded(dataRoot, sessionId)
    fromDb = loadChatRowsInTx(db, sessionId)
  }
  if (fromDb.length === 0) return 0
  const kept: ChatRow[] = []
  let removed = 0
  for (const raw of fromDb) {
    if (raw?.kind === 'message' && raw.turnId === turnId) {
      removed += 1
      continue
    }
    kept.push(raw)
  }
  if (removed > 0) {
    saveChatRowsInTx(db, sessionId, kept)
  }
  return removed
}

/** SQLite chat_history is authoritative; filter a turn (post-commit / tests). */
export function purgeTurnFromDb(dataRoot: string, sessionId: string, turnId: string): number {
  hydrateChatHistoryFromLegacyIfNeeded(dataRoot, sessionId)
  const fromDb = loadChatHistoryFromDb(dataRoot, sessionId) as ChatRow[]
  if (fromDb.length === 0) return 0
  const kept: ChatRow[] = []
  let removed = 0
  for (const raw of fromDb) {
    if (raw?.kind === 'message' && raw.turnId === turnId) {
      removed += 1
      continue
    }
    kept.push(raw)
  }
  if (removed > 0) {
    saveChatHistoryToDb(dataRoot, sessionId, kept)
  }
  return removed
}

function canonicalLegacyBody(rows: unknown[]): string {
  return JSON.stringify(rows, null, 2)
}

/** True when SQLite owns chat_history but companion JSON body diverges from DB. */
export function isLegacyChatProjectionStale(dataRoot: string, sessionId: string): boolean {
  if (!hasChatHistoryRow(dataRoot, sessionId)) return false
  const dbRows = loadChatHistoryFromDb(dataRoot, sessionId)
  const expected = canonicalLegacyBody(dbRows)
  const path = legacyPath(dataRoot, sessionId)
  if (!existsSync(path)) return true
  try {
    return readFileSync(path, 'utf-8') !== expected
  } catch {
    return true
  }
}

/** Project DB rows to legacy JSON with retries (runs after DB commit). */
export function projectLegacyChatHistoryFromDb(
  dataRoot: string,
  sessionId: string,
  opts: { maxAttempts?: number } = {}
): { ok: boolean; attempts: number } {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 3)
  const rows = loadChatHistoryFromDb(dataRoot, sessionId)
  const path = legacyPath(dataRoot, sessionId)
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      writeLegacyFile(path, rows)
      return { ok: true, attempts: attempt }
    } catch {
      if (attempt >= maxAttempts) return { ok: false, attempts: attempt }
    }
  }
  return { ok: false, attempts: maxAttempts }
}

/** Best-effort heal when DB is authoritative but legacy JSON lagged or failed earlier. */
export function reconcileLegacyChatProjectionFromDb(
  dataRoot: string,
  sessionId: string,
  opts: { maxAttempts?: number } = {}
): { status: 'skipped' | 'repaired' | 'failed'; attempts: number } {
  if (!isLegacyChatProjectionStale(dataRoot, sessionId)) {
    return { status: 'skipped', attempts: 0 }
  }
  const proj = projectLegacyChatHistoryFromDb(dataRoot, sessionId, opts)
  if (proj.ok) {
    const prev = Number(kvGet(dataRoot, 'memory_metrics', 'projection_repair_count') ?? '0')
    kvSet(dataRoot, 'memory_metrics', 'projection_repair_count', String(prev + 1))
    return { status: 'repaired', attempts: proj.attempts }
  }
  return { status: 'failed', attempts: proj.attempts }
}

/** @deprecated use purgeTurnFromDb + projectLegacyChatHistoryFromDb */
export function purgeTurnFromUnifiedHistory(
  dataRoot: string,
  sessionId: string,
  turnId: string
): { dbRemoved: number; jsonRemoved: number } {
  const dbRemoved = purgeTurnFromDb(dataRoot, sessionId, turnId)
  const proj = projectLegacyChatHistoryFromDb(dataRoot, sessionId)
  return { dbRemoved, jsonRemoved: proj.ok ? dbRemoved : 0 }
}
