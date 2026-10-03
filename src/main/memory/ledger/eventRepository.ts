import type Database from 'better-sqlite3'

import type {

  EventQuery,

  MemoryEvent,

  MemoryEventMeta,

  MemoryEventPayload,

} from '../contracts.js'

import { IdempotencyConflictError, PayloadEventIdMismatchError } from './errors.js'

import {

  isRedactedPayload,

  REDACTED_CONTENT_HASH,

  REDACTED_CONTENT_JSON,

  REDACTED_SUMMARY,

} from './redaction.js'

import { MAX_REPOSITORY_QUERY_LIMIT, clampQueryLimit } from './queryLimit.js'



export type DbTx = Database.Database



type EventRow = {

  event_id: string

  schema_version: number

  session_id: string

  turn_id: string | null

  correlation_id: string

  causation_event_id: string | null

  nature: string

  event_type: string

  surface: string

  actor: string

  status: string | null

  evidence_kind: string

  confidence: number

  observed_at: string

  occurred_at: string | null

  scheduled_for: string | null

  completed_at: string | null

  timezone: string

  local_date: string

  idempotency_key: string

  summary: string

  content_json: string

  content_hash: string

  redacted_at: string | null

}



function payloadFromRow(row: EventRow): MemoryEventPayload {

  if (isRedactedPayload(row.content_hash, row.redacted_at)) {

    return {

      eventId: row.event_id,

      summary: REDACTED_SUMMARY,

      content: {},

      contentHash: REDACTED_CONTENT_HASH,

      redactedAt: row.redacted_at,

    }

  }

  return {

    eventId: row.event_id,

    summary: row.summary,

    content: JSON.parse(row.content_json) as Record<string, unknown>,

    contentHash: row.content_hash,

    redactedAt: row.redacted_at,

  }

}



function rowToEvent(row: EventRow): MemoryEvent {

  return {

    meta: {

      eventId: row.event_id,

      schemaVersion: 1,

      sessionId: row.session_id,

      turnId: row.turn_id,

      correlationId: row.correlation_id,

      causationEventId: row.causation_event_id,

      nature: row.nature as MemoryEventMeta['nature'],

      eventType: row.event_type as MemoryEventMeta['eventType'],

      surface: row.surface as MemoryEventMeta['surface'],

      actor: row.actor as MemoryEventMeta['actor'],

      status: row.status as MemoryEventMeta['status'],

      evidenceKind: row.evidence_kind as MemoryEventMeta['evidenceKind'],

      confidence: row.confidence,

      observedAt: row.observed_at,

      occurredAt: row.occurred_at,

      scheduledFor: row.scheduled_for,

      completedAt: row.completed_at,

      timezone: row.timezone,

      localDate: row.local_date,

      idempotencyKey: row.idempotency_key,

    },

    payload: payloadFromRow(row),

  }

}



export class EventRepository {

  private readonly insertMeta

  private readonly insertPayload

  private readonly selectByIdempotency

  private readonly selectById

  private readonly selectByCorrelation

  private readonly selectMaxRuntimeRevision

  private readonly redactPayloadStmt



  constructor(private readonly db: Database.Database) {

    this.insertMeta = db.prepare(`

      INSERT INTO memory_events (

        event_id, schema_version, session_id, turn_id, correlation_id, causation_event_id,

        nature, event_type, surface, actor, status, evidence_kind, confidence,

        observed_at, occurred_at, scheduled_for, completed_at, timezone, local_date, idempotency_key

      ) VALUES (

        @event_id, @schema_version, @session_id, @turn_id, @correlation_id, @causation_event_id,

        @nature, @event_type, @surface, @actor, @status, @evidence_kind, @confidence,

        @observed_at, @occurred_at, @scheduled_for, @completed_at, @timezone, @local_date, @idempotency_key

      )

    `)

    this.insertPayload = db.prepare(`

      INSERT INTO memory_event_payloads (event_id, summary, content_json, content_hash, redacted_at)

      VALUES (@event_id, @summary, @content_json, @content_hash, @redacted_at)

    `)

    this.selectByIdempotency = db.prepare(`

      SELECT e.*, p.summary, p.content_json, p.content_hash, p.redacted_at

      FROM memory_events e

      JOIN memory_event_payloads p ON p.event_id = e.event_id

      WHERE e.idempotency_key = ?

    `)

    this.selectById = db.prepare(`

      SELECT e.*, p.summary, p.content_json, p.content_hash, p.redacted_at

      FROM memory_events e

      JOIN memory_event_payloads p ON p.event_id = e.event_id

      WHERE e.event_id = ?

    `)

    this.selectByCorrelation = db.prepare(`

      SELECT e.*, p.summary, p.content_json, p.content_hash, p.redacted_at

      FROM memory_events e

      JOIN memory_event_payloads p ON p.event_id = e.event_id

      WHERE e.correlation_id = ?

      ORDER BY e.observed_at ASC

      LIMIT ?

    `)

    this.selectMaxRuntimeRevision = db.prepare(`
      SELECT
        json_extract(p.content_json, '$.runtimeRevision') AS runtime_revision,
        json_extract(p.content_json, '$.runtimeObservedAt') AS runtime_observed_at
      FROM memory_events e
      JOIN memory_event_payloads p ON p.event_id = e.event_id
      WHERE e.correlation_id = ?
        AND json_extract(p.content_json, '$.runId') = ?
        AND json_type(p.content_json, '$.runtimeRevision') IN ('integer', 'real')
      ORDER BY json_extract(p.content_json, '$.runtimeRevision') DESC,
               CASE WHEN json_extract(p.content_json, '$.runtimeObservedAt') IS NULL THEN 0 ELSE 1 END DESC,
               json_extract(p.content_json, '$.runtimeObservedAt') DESC
      LIMIT 1
    `)

    this.redactPayloadStmt = db.prepare(`

      UPDATE memory_event_payloads SET

        summary = @summary,

        content_json = @content_json,

        content_hash = @content_hash,

        redacted_at = @redacted_at

      WHERE event_id = @event_id

    `)

  }



  append(

    tx: DbTx,

    event: MemoryEventMeta,

    payload: MemoryEventPayload

  ): 'inserted' | 'duplicate' {

    if (event.eventId !== payload.eventId) {

      throw new PayloadEventIdMismatchError(event.eventId, payload.eventId)

    }

    const existing = this.selectByIdempotency.get(event.idempotencyKey) as EventRow | undefined

    if (existing) {

      if (isRedactedPayload(existing.content_hash, existing.redacted_at)) {

        return 'duplicate'

      }

      if (existing.content_hash !== payload.contentHash) {

        throw new IdempotencyConflictError(event.idempotencyKey)

      }

      return 'duplicate'

    }

    this.insertMeta.run({

      event_id: event.eventId,

      schema_version: event.schemaVersion,

      session_id: event.sessionId,

      turn_id: event.turnId,

      correlation_id: event.correlationId,

      causation_event_id: event.causationEventId,

      nature: event.nature,

      event_type: event.eventType,

      surface: event.surface,

      actor: event.actor,

      status: event.status,

      evidence_kind: event.evidenceKind,

      confidence: event.confidence,

      observed_at: event.observedAt,

      occurred_at: event.occurredAt,

      scheduled_for: event.scheduledFor,

      completed_at: event.completedAt,

      timezone: event.timezone,

      local_date: event.localDate,

      idempotency_key: event.idempotencyKey,

    })

    this.insertPayload.run({

      event_id: payload.eventId,

      summary: payload.summary,

      content_json: JSON.stringify(payload.content),

      content_hash: payload.contentHash,

      redacted_at: payload.redactedAt,

    })

    return 'inserted'

  }



  getById(eventId: string): MemoryEvent | null {

    const row = this.selectById.get(eventId) as EventRow | undefined

    return row ? rowToEvent(row) : null

  }



  listByCorrelation(correlationId: string, limit = 50): MemoryEvent[] {

    const lim = clampQueryLimit(limit)

    const rows = this.selectByCorrelation.all(correlationId, lim) as EventRow[]

    return rows.map(rowToEvent)

  }

  listBySessionAndCorrelation(sessionId: string, correlationId: string): MemoryEvent[] {
    const out: MemoryEvent[] = []
    const pageSize = MAX_REPOSITORY_QUERY_LIMIT
    let afterObservedAt: string | undefined
    let afterEventId: string | undefined
    for (;;) {
      const clauses = ['e.session_id = ?', 'e.correlation_id = ?']
      const params: unknown[] = [sessionId, correlationId]
      if (afterObservedAt !== undefined && afterEventId !== undefined) {
        clauses.push('(e.observed_at > ? OR (e.observed_at = ? AND e.event_id > ?))')
        params.push(afterObservedAt, afterObservedAt, afterEventId)
      }
      const sql = `
      SELECT e.*, p.summary, p.content_json, p.content_hash, p.redacted_at
      FROM memory_events e
      JOIN memory_event_payloads p ON p.event_id = e.event_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY e.observed_at ASC, e.event_id ASC
      LIMIT ?
    `
      const rows = this.db.prepare(sql).all(...params, pageSize) as EventRow[]
      if (rows.length === 0) break
      out.push(...rows.map(rowToEvent))
      if (rows.length < pageSize) break
      const last = rows[rows.length - 1]!
      afterObservedAt = last.observed_at
      afterEventId = last.event_id
    }
    return out
  }

  findByIdempotencyKey(idempotencyKey: string): MemoryEvent | null {
    const row = this.selectByIdempotency.get(idempotencyKey) as EventRow | undefined
    return row ? rowToEvent(row) : null
  }

  /** Highest runtime revision for one run. Not capped by repository list limits. */
  maxRuntimeRevisionCursor(
    correlationId: string,
    runId: string
  ): { runtimeRevision: number; runtimeObservedAt: string | null } | null {
    const row = this.selectMaxRuntimeRevision.get(correlationId, runId) as
      | { runtime_revision: number; runtime_observed_at: string | null }
      | undefined
    if (!row || typeof row.runtime_revision !== 'number' || !Number.isFinite(row.runtime_revision)) {
      return null
    }
    return {
      runtimeRevision: row.runtime_revision,
      runtimeObservedAt: typeof row.runtime_observed_at === 'string' ? row.runtime_observed_at : null,
    }
  }



  query(input: EventQuery): MemoryEvent[] {

    const lim = clampQueryLimit(input.limit)

    const clauses: string[] = []

    const params: unknown[] = []

    if (input.sessionId) {

      clauses.push('e.session_id = ?')

      params.push(input.sessionId)

    }

    if (input.correlationId) {

      clauses.push('e.correlation_id = ?')

      params.push(input.correlationId)

    }

    if (input.nature) {

      clauses.push('e.nature = ?')

      params.push(input.nature)

    }

    if (input.eventType) {

      clauses.push('e.event_type = ?')

      params.push(input.eventType)

    }

    if (input.timezone) {

      clauses.push('e.timezone = ?')

      params.push(input.timezone)

    }

    if (input.localDate) {

      clauses.push('e.local_date = ?')

      params.push(input.localDate)

    }

    if (input.fromObservedAt) {

      clauses.push('e.observed_at >= ?')

      params.push(input.fromObservedAt)

    }

    if (input.toObservedAt) {

      clauses.push('e.observed_at <= ?')

      params.push(input.toObservedAt)

    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : ''

    const sql = `

      SELECT e.*, p.summary, p.content_json, p.content_hash, p.redacted_at

      FROM memory_events e

      JOIN memory_event_payloads p ON p.event_id = e.event_id

      ${where}

      ORDER BY e.observed_at DESC

      LIMIT ?

    `

    const rows = this.db.prepare(sql).all(...params, lim) as EventRow[]

    return rows.map(rowToEvent)

  }



  redactPayload(tx: DbTx, eventId: string, at: string): void {

    this.redactPayloadStmt.run({

      event_id: eventId,

      summary: REDACTED_SUMMARY,

      content_json: REDACTED_CONTENT_JSON,

      content_hash: REDACTED_CONTENT_HASH,

      redacted_at: at,

    })

  }

}


