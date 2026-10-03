import { getDatabase } from '../../db/database.js'
import type { RecallTrace } from '../contracts.js'

export type WhyStoredRow = {
  factId: string
  summary: string
  status: string
  evidenceEventIds: string[]
  evidenceKinds: string[]
}

export type WhyRecalledRow = {
  id: string
  source: string
  score: number
  filterReason?: string
}

export function queryWhyStored(dataRoot: string, factId: string): WhyStoredRow | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const fact = db
    .prepare(`SELECT id, summary, status FROM memory_facts WHERE id = ?`)
    .get(factId) as { id: string; summary: string; status: string } | undefined
  if (!fact) return null
  const ev = db
    .prepare(
      `SELECT fe.event_id, e.evidence_kind FROM memory_fact_evidence fe
       JOIN memory_events e ON e.event_id = fe.event_id
       WHERE fe.fact_id = ?`
    )
    .all(factId) as Array<{ event_id: string; evidence_kind: string }>
  return {
    factId: fact.id,
    summary: fact.summary,
    status: fact.status,
    evidenceEventIds: ev.map((r) => r.event_id),
    evidenceKinds: ev.map((r) => r.evidence_kind)
  }
}

export function summarizeRecallTrace(trace: RecallTrace): WhyRecalledRow[] {
  return trace.selected.map((s) => ({
    id: s.id,
    source: s.source,
    score: s.score
  }))
}

export function listFilteredRecallReasons(trace: RecallTrace): Array<{ id: string; reason: string }> {
  return trace.filtered.map((f) => ({ id: f.id, reason: f.reason }))
}
