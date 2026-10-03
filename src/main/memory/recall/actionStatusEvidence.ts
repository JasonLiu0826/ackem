import type Database from 'better-sqlite3'

const REQUEST_PHASE_TYPES = new Set([
  'work.proposed',
  'work.accepted',
  'work.queued',
  'plugin.accepted',
  'plugin.queued',
  'plan.proposed',
  'plan.accepted'
])

const NON_RECEIPT_PROGRESS_TYPES = new Set(['work.progressed', 'work.resumed'])

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'aborted'])

type StatusEventRow = {
  event_id: string
  event_type: string
  evidence_kind: string
}

function statusReceiptEventType(nature: 'work' | 'plugin', status: string): string | null {
  const p = nature === 'work' ? 'work' : 'plugin'
  switch (status) {
    case 'running':
      return `${p}.running`
    case 'waiting_permission':
      return `${p}.waiting_permission`
    case 'succeeded':
      return `${p}.succeeded`
    case 'failed':
      return `${p}.failed`
    case 'aborted':
      return `${p}.aborted`
    case 'unknown':
      return `${p}.unknown`
    case 'queued':
      return `${p}.queued`
    case 'accepted':
      return `${p}.accepted`
    default:
      return null
  }
}

function isRuntimeStatusReceipt(
  ev: StatusEventRow,
  nature: 'work' | 'plugin',
  runStatus: string
): boolean {
  if (REQUEST_PHASE_TYPES.has(ev.event_type) || NON_RECEIPT_PROGRESS_TYPES.has(ev.event_type)) {
    return false
  }
  const wantType = statusReceiptEventType(nature, runStatus)
  if (!wantType || ev.event_type !== wantType) return false
  if (TERMINAL_STATUSES.has(runStatus)) {
    return ev.evidence_kind === 'runtime_receipt'
  }
  return ev.evidence_kind === 'runtime_receipt'
}

/** Status receipt event id for ActionRun recall (never request/proposal or non-receipt progress). */
export function resolveActionStatusEvidenceEventIds(
  db: Database.Database,
  row: {
    last_event_id: string
    request_event_id: string
    correlation_id: string
    nature: 'work' | 'plugin'
    status: string
  }
): string[] {
  const last = db
    .prepare(`SELECT event_id, event_type, evidence_kind FROM memory_events WHERE event_id = ?`)
    .get(row.last_event_id) as StatusEventRow | undefined

  if (
    last &&
    last.event_id !== row.request_event_id &&
    isRuntimeStatusReceipt(last, row.nature, row.status)
  ) {
    return [last.event_id]
  }

  const wantType = statusReceiptEventType(row.nature, row.status)
  if (wantType) {
    const hit = db
      .prepare(
        `SELECT event_id FROM memory_events
         WHERE correlation_id = ? AND event_type = ? AND evidence_kind = 'runtime_receipt'
         ORDER BY observed_at DESC LIMIT 1`
      )
      .get(row.correlation_id, wantType) as { event_id: string } | undefined
    if (hit && hit.event_id !== row.request_event_id) {
      return [hit.event_id]
    }
  }

  return []
}
