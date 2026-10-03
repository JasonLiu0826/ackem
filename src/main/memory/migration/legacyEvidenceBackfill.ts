import type Database from 'better-sqlite3'
import { getDatabase, withTransaction } from '../../db/database.js'
import { kvGet, kvSet } from '../../db/repos/kv.js'
import { loadFactsFromDb } from '../../db/repos/memoryFacts.js'
import { capLegacyConfidence } from './legacyConfidencePolicy.js'

const CURSOR_NS = 'memory_migration'
const CURSOR_KEY = 'legacy_evidence_backfill_v1'
const PENDING_NS = 'memory_migration_pending'
const PENDING_KEY = 'link_v1'

let legacyBackfillFaultHookForTests: ((phase: 'after_event_insert') => void) | undefined

export function setLegacyBackfillFaultHookForTests(
  hook: ((phase: 'after_event_insert') => void) | undefined
): void {
  legacyBackfillFaultHookForTests = hook
}

export type LegacyBackfillDryRunReport = {
  legacyFactCount: number
  skippedWithModernEvidence: number
  skippedAlreadyLegacyTagged: number
  domains: Record<string, number>
  cappedConfidence: number
  wouldCreateEvents: number
  potentialConflicts: Array<{ subject: string; factIds: string[] }>
  timeAmbiguity: Array<{ factId: string; createdAt: string; note: string }>
}

export type LegacyBackfillResult = {
  processed: number
  linked: number
  skipped: number
  dryRun: boolean
  remaining: number
}

function countDomains(facts: Array<{ domain: string }>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of facts) {
    out[f.domain] = (out[f.domain] ?? 0) + 1
  }
  return out
}

function hasModernEvidence(db: Database.Database, factId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM memory_fact_evidence fe
       JOIN memory_events e ON e.event_id = fe.event_id
       WHERE fe.fact_id = ?
         AND e.evidence_kind IN ('user_assertion', 'user_correction', 'runtime_receipt', 'llm_inference')
       LIMIT 1`
    )
    .get(factId)
  return Boolean(row)
}

function hasLegacyImportEvidence(db: Database.Database, factId: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM memory_fact_evidence fe
       JOIN memory_events e ON e.event_id = fe.event_id
       WHERE fe.fact_id = ? AND e.evidence_kind = 'legacy_import' LIMIT 1`
    )
    .get(factId)
  return Boolean(row)
}

function legacyEventIdForFact(factId: string): string {
  return `legacy-import-event:${factId}`
}

function isLikelyLegacyImportFact(
  db: Database.Database,
  f: { id: string; sourceSessionId?: string; sourceTurnIndex?: number; createdAt?: string }
): boolean {
  if (hasModernEvidence(db, f.id)) return false
  if (hasLegacyImportEvidence(db, f.id)) return false
  const legacySession = (f.sourceSessionId ?? '').trim() === '' || f.sourceSessionId === 'legacy'
  const preLedger =
    (
      db.prepare(`SELECT COUNT(*) AS c FROM memory_events WHERE observed_at <= ?`).get(f.createdAt ?? '') as {
        c: number
      }
    ).c === 0
  if (legacySession) return true
  if (preLedger) return true
  return false
}

function listLegacyCandidates(dataRoot: string): Array<{ id: string; domain: string; sourceSessionId: string; summary: string; subject: string }> {
  const db = getDatabase(dataRoot)
  if (!db) return []
  return loadFactsFromDb(dataRoot)
    .filter((f) => f.status === 'active')
    .filter((f) => isLikelyLegacyImportFact(db, f))
    .map((f) => ({
      id: f.id,
      domain: f.domain,
      sourceSessionId: f.sourceSessionId ?? 'legacy',
      summary: f.summary,
      subject: f.subject ?? ''
    }))
}

function buildDryRunAnalytics(
  legacy: Array<{ id: string; subject: string; summary: string; createdAt?: string }>
): Pick<LegacyBackfillDryRunReport, 'potentialConflicts' | 'timeAmbiguity'> {
  const bySubject = new Map<string, string[]>()
  for (const f of legacy) {
    const key = f.subject.trim() || f.summary.slice(0, 24)
    const arr = bySubject.get(key) ?? []
    arr.push(f.id)
    bySubject.set(key, arr)
  }
  const potentialConflicts = [...bySubject.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([subject, factIds]) => ({ subject, factIds }))
  const timeAmbiguity = legacy
    .filter((f) => !f.createdAt || !/T\d{2}:\d{2}/.test(f.createdAt))
    .slice(0, 20)
    .map((f) => ({
      factId: f.id,
      createdAt: f.createdAt ?? '',
      note: 'created_at 缺少可比对 instant，迁移时仅保留日期级语义'
    }))
  return { potentialConflicts, timeAmbiguity }
}

export function dryRunLegacyEvidenceBackfill(dataRoot: string): LegacyBackfillDryRunReport {
  const db = getDatabase(dataRoot)
  const allActive = loadFactsFromDb(dataRoot).filter((f) => f.status === 'active')
  const legacy = listLegacyCandidates(dataRoot)
  const skippedWithModernEvidence =
    db == null ? 0 : allActive.filter((f) => hasModernEvidence(db, f.id)).length
  const skippedAlreadyLegacyTagged =
    db == null ? 0 : allActive.filter((f) => hasLegacyImportEvidence(db, f.id)).length
  const analytics = buildDryRunAnalytics(
    legacy.map((f) => {
      const full = allActive.find((a) => a.id === f.id)
      return { id: f.id, subject: f.subject, summary: f.summary, createdAt: full?.createdAt }
    })
  )
  return {
    legacyFactCount: legacy.length,
    skippedWithModernEvidence,
    skippedAlreadyLegacyTagged,
    domains: countDomains(legacy),
    cappedConfidence: capLegacyConfidence(1),
    wouldCreateEvents: legacy.length,
    ...analytics
  }
}

type PendingLink = { factId: string; eventId: string }

function readPending(dataRoot: string): PendingLink | null {
  const raw = kvGet(dataRoot, PENDING_NS, PENDING_KEY)
  if (!raw) return null
  try {
    const p = JSON.parse(raw) as PendingLink
    if (p?.factId && p?.eventId) return p
  } catch {
    /* ignore */
  }
  return null
}

function writePending(dataRoot: string, pending: PendingLink | null): void {
  if (!pending) {
    kvSet(dataRoot, PENDING_NS, PENDING_KEY, '')
    return
  }
  kvSet(dataRoot, PENDING_NS, PENDING_KEY, JSON.stringify(pending))
}

function insertLegacyEventTx(
  db: Database.Database,
  row: { eventId: string; factId: string; sessionId: string; at: string }
): void {
  db.prepare(
    `INSERT INTO memory_events (
      event_id, schema_version, session_id, turn_id, correlation_id, causation_event_id,
      nature, event_type, surface, actor, status, evidence_kind, confidence,
      observed_at, occurred_at, scheduled_for, completed_at, timezone, local_date, idempotency_key
    ) VALUES (
      ?, 1, ?, NULL, ?, NULL,
      'chat', 'chat.facts_extracted', 'system', 'system', NULL, 'legacy_import', ?,
      ?, ?, NULL, ?, 'UTC', date(?), ?
    )`
  ).run(
    row.eventId,
    row.sessionId,
    `legacy-import:${row.factId}`,
    capLegacyConfidence(1),
    row.at,
    row.at,
    row.at,
    row.at.slice(0, 10),
    `legacy-import:${row.factId}`
  )
}

function linkLegacyEvidenceTx(db: Database.Database, factId: string, eventId: string, at: string): void {
  db.prepare(
    `INSERT INTO memory_fact_evidence (fact_id, event_id, evidence_role, created_at)
     VALUES (?, ?, 'supports', ?)`
  ).run(factId, eventId, at)
}

/** Idempotent legacy evidence backfill; never creates action runs. Not auto-run on DB open. */
export function runLegacyEvidenceBackfill(
  dataRoot: string,
  opts: { dryRun?: boolean; batchSize?: number; maxBatches?: number } = {}
): LegacyBackfillResult {
  const dryRun = opts.dryRun ?? false
  const batchSize = Math.max(1, opts.batchSize ?? 50)
  const maxBatches = Math.max(1, opts.maxBatches ?? 1)
  const db = getDatabase(dataRoot)
  if (!db) return { processed: 0, linked: 0, skipped: 0, dryRun, remaining: 0 }

  const candidates = listLegacyCandidates(dataRoot)
  if (dryRun) {
    return {
      processed: Math.min(batchSize, candidates.length),
      linked: 0,
      skipped: 0,
      dryRun: true,
      remaining: candidates.length
    }
  }

  let processed = 0
  let linked = 0
  let skipped = 0
  const at = new Date().toISOString()

  const pending = readPending(dataRoot)
  if (pending?.factId && pending.eventId) {
    const eventExists = db.prepare(`SELECT 1 FROM memory_events WHERE event_id = ?`).get(pending.eventId)
    if (eventExists && !hasLegacyImportEvidence(db, pending.factId)) {
      withTransaction(dataRoot, (tx) => {
        linkLegacyEvidenceTx(tx as unknown as Database.Database, pending.factId, pending.eventId, at)
      })
      linked += 1
      kvSet(dataRoot, CURSOR_NS, CURSOR_KEY, pending.factId)
    }
    writePending(dataRoot, null)
  }

  const cursorRaw = kvGet(dataRoot, CURSOR_NS, CURSOR_KEY)
  let cursor = cursorRaw ?? ''
  const batchFacts = candidates.filter((f) => f.id > cursor).slice(0, batchSize * maxBatches)

  for (const f of batchFacts) {
    if (hasLegacyImportEvidence(db, f.id)) {
      skipped += 1
      cursor = f.id
      continue
    }
    const eventId = legacyEventIdForFact(f.id)
    try {
      const eventExists = db.prepare(`SELECT 1 FROM memory_events WHERE event_id = ?`).get(eventId)
      if (!eventExists) {
        withTransaction(dataRoot, (tx) => {
          insertLegacyEventTx(tx as unknown as Database.Database, {
            eventId,
            factId: f.id,
            sessionId: f.sourceSessionId,
            at
          })
        })
        processed += 1
        legacyBackfillFaultHookForTests?.('after_event_insert')
      }
      withTransaction(dataRoot, (tx) => {
        linkLegacyEvidenceTx(tx as unknown as Database.Database, f.id, eventId, at)
      })
      linked += 1
      cursor = f.id
      kvSet(dataRoot, CURSOR_NS, CURSOR_KEY, cursor)
    } catch (e) {
      const eventExists = db.prepare(`SELECT 1 FROM memory_events WHERE event_id = ?`).get(eventId)
      if (eventExists) {
        writePending(dataRoot, { factId: f.id, eventId })
      }
      const remaining = candidates.filter((x) => x.id > cursor && !hasLegacyImportEvidence(db, x.id)).length
      return { processed, linked, skipped, dryRun: false, remaining }
    }
  }

  const remaining = candidates.filter((x) => x.id > cursor && !hasLegacyImportEvidence(db, x.id)).length
  return { processed, linked, skipped, dryRun: false, remaining }
}

/** Continue until backlog drained (explicit migration runner). */
export function runLegacyEvidenceBackfillUntilDone(
  dataRoot: string,
  opts: { batchSize?: number; maxRounds?: number } = {}
): LegacyBackfillResult {
  const maxRounds = opts.maxRounds ?? 200
  let total: LegacyBackfillResult = { processed: 0, linked: 0, skipped: 0, dryRun: false, remaining: 1 }
  for (let i = 0; i < maxRounds && total.remaining > 0; i++) {
    const round = runLegacyEvidenceBackfill(dataRoot, {
      batchSize: opts.batchSize ?? 50,
      maxBatches: 1
    })
    total = {
      processed: total.processed + round.processed,
      linked: total.linked + round.linked,
      skipped: total.skipped + round.skipped,
      dryRun: false,
      remaining: round.remaining
    }
    if (round.processed === 0 && round.linked === 0) break
  }
  return total
}
