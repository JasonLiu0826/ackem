import { getDatabase } from '../../db/database.js'
import { queryWhyStored, summarizeRecallTrace, listFilteredRecallReasons } from './memoryAudit.js'
import type { MemoryAuditMetrics } from './auditDtos.js'
import { kvGet } from '../../db/repos/kv.js'
import {
  readActionReconcileCount,
  readRecallP95Ms,
  readTransactionP95Ms
} from './auditMetricsStore.js'

export function memoryWhyStored(dataRoot: string, factId: string) {
  return queryWhyStored(dataRoot, factId)
}

export function memoryActionTimeline(dataRoot: string, sessionId: string, limit = 40) {
  const db = getDatabase(dataRoot)
  if (!db) return []
  return (
    db
      .prepare(
        `SELECT event_id, event_type, status, observed_at, turn_id
         FROM memory_events
         WHERE session_id = ? AND nature IN ('work','plugin','chat')
         ORDER BY observed_at DESC, event_id DESC
         LIMIT ?`
      )
      .all(sessionId, limit) as Array<{
      event_id: string
      event_type: string
      status: string | null
      observed_at: string
      turn_id: string | null
    }>
  ).map((r) => ({
    eventId: r.event_id,
    eventType: r.event_type,
    status: r.status,
    observedAt: r.observed_at,
    turnId: r.turn_id
  }))
}

export function memoryAuditMetrics(dataRoot: string): MemoryAuditMetrics {
  const db = getDatabase(dataRoot)
  if (!db) {
    return {
      jobBacklog: 0,
      deadJobs: 0,
      projectionRepairCount: 0,
      governanceDeleteCount: 0,
      reconcileCount: 0
    }
  }
  const backlog =
    (db.prepare(`SELECT COUNT(*) AS c FROM memory_jobs WHERE status IN ('pending','running')`).get() as {
      c: number
    }).c ?? 0
  const dead =
    (db.prepare(`SELECT COUNT(*) AS c FROM memory_jobs WHERE status = 'dead'`).get() as { c: number }).c ?? 0
  const projectionRepairCount = Number(kvGet(dataRoot, 'memory_metrics', 'projection_repair_count') ?? '0')
  const governanceDeleteCount =
    (db.prepare(`SELECT COUNT(*) AS c FROM memory_events WHERE event_type = 'memory.deleted'`).get() as {
      c: number
    }).c ?? 0
  return {
    jobBacklog: backlog,
    deadJobs: dead,
    projectionRepairCount,
    governanceDeleteCount,
    recallP95Ms: readRecallP95Ms(dataRoot),
    transactionP95Ms: readTransactionP95Ms(dataRoot),
    reconcileCount: readActionReconcileCount(dataRoot)
  }
}

export type PermanentDeletePreview = {
  targetKind: 'fact' | 'episode'
  targetId: string
  scope: 'memory_only' | 'memory_and_source'
  summary: string
}

export type VerifiedPermanentDeletePreview = {
  ok: boolean
  error?: string
  targetKind?: 'fact' | 'episode'
  targetId?: string
  verifiedSummary?: string
  scope: 'memory_only' | 'memory_and_source'
  impactHint: string
  tombstoneExists?: boolean
}

export function verifyPermanentDeleteTarget(
  dataRoot: string,
  preview: PermanentDeletePreview
): VerifiedPermanentDeletePreview {
  const impactHint =
    preview.scope === 'memory_and_source'
      ? '将删除记忆并擦除来源聊天/事件 payload（需正确 turnId）。'
      : '仅删除记忆条目并写墓碑，保留来源对话。'
  const db = getDatabase(dataRoot)
  if (!db) return { ok: false, error: 'db_unavailable', scope: preview.scope, impactHint }
  if (preview.targetKind === 'fact') {
    const row = db
      .prepare(`SELECT id, summary, status FROM memory_facts WHERE id = ?`)
      .get(preview.targetId) as { id: string; summary: string; status: string } | undefined
    if (!row) return { ok: false, error: 'target_not_found', scope: preview.scope, impactHint }
    const tomb = db
      .prepare(`SELECT 1 FROM memory_tombstones WHERE scope_type = 'fact' AND scope_id = ? LIMIT 1`)
      .get(preview.targetId)
    return {
      ok: true,
      targetKind: 'fact',
      targetId: row.id,
      verifiedSummary: row.summary,
      scope: preview.scope,
      impactHint,
      tombstoneExists: Boolean(tomb)
    }
  }
  const ep = db.prepare(`SELECT id, summary FROM episodes WHERE id = ?`).get(preview.targetId) as
    | { id: string; summary: string }
    | undefined
  if (!ep) return { ok: false, error: 'target_not_found', scope: preview.scope, impactHint }
  return {
    ok: true,
    targetKind: 'episode',
    targetId: ep.id,
    verifiedSummary: ep.summary,
    scope: preview.scope,
    impactHint
  }
}

export function previewPermanentDelete(
  dataRoot: string,
  preview: PermanentDeletePreview
): VerifiedPermanentDeletePreview {
  return verifyPermanentDeleteTarget(dataRoot, preview)
}

export { summarizeRecallTrace, listFilteredRecallReasons }
