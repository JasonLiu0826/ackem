import type Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import type { GamesFindingsReport, GameFinding } from '../../../shared/investigation'
import type { MachineMapEntryCategory, MachineMapScanStatus } from '../../../shared/machineMap'
import { attachReportMeta, mergeGameFindings, makeGameFinding } from '../investigation/findingsMerge'

export type MapEntryRow = {
  id: string
  category: MachineMapEntryCategory
  display_name: string
  path: string
  source: string
  confidence: string
  scan_run_id: string
  first_seen_at: string
  last_verified_at: string
  dedupe_key: string
  active: number
}

export type UpsertEntryInput = {
  category: MachineMapEntryCategory
  displayName: string
  path: string
  source: string
  confidence: 'high' | 'medium' | 'low'
  scanRunId: string
  dedupeKey: string
}

export function createScanRun(
  db: Database.Database,
  trigger: string,
  stepsTotal: number
): string {
  const id = `run-${Date.now()}-${randomUUID().slice(0, 8)}`
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO scan_runs(id, trigger, status, steps_total, steps_done, started_at)
     VALUES (?, ?, 'running', ?, 0, ?)`
  ).run(id, trigger, stepsTotal, now)
  return id
}

export function updateScanRunProgress(
  db: Database.Database,
  runId: string,
  stepsDone: number,
  currentStep: string
): void {
  db.prepare(
    `UPDATE scan_runs SET steps_done = ?, current_step = ? WHERE id = ?`
  ).run(stepsDone, currentStep, runId)
}

export function finishScanRun(
  db: Database.Database,
  runId: string,
  status: 'complete' | 'error',
  error?: string
): void {
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE scan_runs SET status = ?, finished_at = ?, error = ? WHERE id = ?`
  ).run(status, now, error ?? null, runId)
  if (status === 'complete') {
    setMeta(db, 'last_complete_at', now)
    setMeta(db, 'last_scan_run_id', runId)
  }
}

export function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare(
    `INSERT INTO map_meta(key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value)
}

export function getMeta(db: Database.Database, key: string): string | null {
  const row = db.prepare(`SELECT value FROM map_meta WHERE key = ?`).get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function upsertMapEntry(db: Database.Database, input: UpsertEntryInput): void {
  const now = new Date().toISOString()
  const existing = db
    .prepare(`SELECT id FROM map_entries WHERE dedupe_key = ?`)
    .get(input.dedupeKey) as { id: string } | undefined

  if (existing) {
    db.prepare(
      `UPDATE map_entries SET
        display_name = ?, path = ?, source = ?, confidence = ?,
        scan_run_id = ?, last_verified_at = ?, active = 1, category = ?
       WHERE dedupe_key = ?`
    ).run(
      input.displayName,
      input.path,
      input.source,
      input.confidence,
      input.scanRunId,
      now,
      input.category,
      input.dedupeKey
    )
    return
  }

  db.prepare(
    `INSERT INTO map_entries(
      id, category, display_name, path, source, confidence,
      scan_run_id, first_seen_at, last_verified_at, dedupe_key, active
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    randomUUID(),
    input.category,
    input.displayName,
    input.path,
    input.source,
    input.confidence,
    input.scanRunId,
    now,
    now,
    input.dedupeKey
  )
}

export function deactivateGamesNotInRun(db: Database.Database, scanRunId: string): void {
  db.prepare(
    `UPDATE map_entries SET active = 0
     WHERE category = 'game' AND scan_run_id != ? AND active = 1`
  ).run(scanRunId)
}

export function countActive(db: Database.Database, category: MachineMapEntryCategory): number {
  const row = db
    .prepare(`SELECT COUNT(*) AS c FROM map_entries WHERE category = ? AND active = 1`)
    .get(category) as { c: number }
  return row.c
}

export function getLatestScanStatus(db: Database.Database): MachineMapScanStatus {
  const row = db
    .prepare(`SELECT status FROM scan_runs ORDER BY started_at DESC LIMIT 1`)
    .get() as { status: string } | undefined
  if (!row) return 'idle'
  if (row.status === 'running') return 'running'
  if (row.status === 'error') return 'error'
  if (row.status === 'complete') return 'complete'
  return 'idle'
}

export function listActiveGames(db: Database.Database): MapEntryRow[] {
  return db
    .prepare(
      `SELECT * FROM map_entries WHERE category = 'game' AND active = 1 ORDER BY display_name COLLATE NOCASE`
    )
    .all() as MapEntryRow[]
}

export function mapRowsToGamesFindings(rows: MapEntryRow[]): GamesFindingsReport {
  const raw: GameFinding[] = []
  for (const r of rows) {
    const f = makeGameFinding(
      r.display_name,
      r.path,
      r.source as GameFinding['source'],
      r.confidence as GameFinding['confidence']
    )
    if (f) raw.push(f)
  }
  const merged = mergeGameFindings(raw)
  return attachReportMeta(merged, [...new Set(rows.map((r) => r.path))], [])
}

export function upsertGamesFromReport(
  db: Database.Database,
  report: GamesFindingsReport,
  scanRunId: string
): void {
  for (const g of report.games) {
    upsertMapEntry(db, {
      category: 'game',
      displayName: g.displayName,
      path: g.path,
      source: g.source,
      confidence: g.confidence,
      scanRunId,
      dedupeKey: g.dedupeKey
    })
  }
}
