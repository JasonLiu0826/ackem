import { createHash, randomUUID } from 'node:crypto'

import type Database from 'better-sqlite3'

import { getDatabase } from '../../db/database.js'

import type {

  ActionCoordinator,

  ActionRun,

  ActionTransition,

  MemoryEventMeta,

  MemoryEventPayload,

  MemoryRecordErrorCode,

  MemoryRecordResult,

  NewActionRun,

  RuntimeSnapshot,

} from '../contracts.js'

import {

  CURRENT_DERIVATION_VERSION,

  JOB_TYPE_DERIVE_ACTION_TERMINAL,

} from '../derivation/derivationVersion.js'

import { EventRepository } from '../ledger/eventRepository.js'

import { IdempotencyConflictError } from '../ledger/errors.js'

import { JobRepository } from '../jobs/jobRepository.js'

import type { Clock } from '../temporal/clock.js'

import { getClock } from '../temporal/clock.js'

import { resolveUserTimezone } from '../temporal/timezonePolicy.js'

import { zonedLocalDate } from '../temporal/zonedDate.js'

import { ActionRepository, type ActionRunRow } from './actionRepository.js'

import { actorForTransition, eventTypeForTransition } from './actionEventSemantics.js'

import { isTerminalStatus, validateTransition } from './actionStateMachine.js'

import { compareRuntimeSnapshot, resolveMaxRuntimeRevisionCursor } from './runtimeRevision.js'



function hashContent(content: Record<string, unknown>): string {

  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)

}



export type ActionCoordinatorOptions = {

  clock?: Clock

  timezoneOverride?: string | null

}



export class SqliteActionCoordinator implements ActionCoordinator {

  private readonly clock: Clock

  private readonly timezoneOverride?: string | null



  constructor(

    private readonly dataRoot: string,

    opts: ActionCoordinatorOptions = {}

  ) {

    this.clock = opts.clock ?? getClock()

    this.timezoneOverride = opts.timezoneOverride

  }



  private db(): Database.Database | null {

    return getDatabase(this.dataRoot)

  }



  private fail(code: MemoryRecordErrorCode, message: string): MemoryRecordResult {
    return { ok: false, code, message }
  }



  private nowIso(): string {

    return this.clock.now().toISOString()

  }



  private resolveTimezone(): string {

    return resolveUserTimezone(this.timezoneOverride).timezone

  }



  create(input: NewActionRun): MemoryRecordResult {

    const db = this.db()

    if (!db) return this.fail('db_unavailable', 'SQLite unavailable')

    if (!input.runId?.trim() || !input.sessionId?.trim()) {

      return this.fail('invalid_input', 'runId and sessionId required')

    }

    if (input.initialStatus !== 'accepted' && input.initialStatus !== 'queued') {

      return this.fail('invalid_input', 'initialStatus must be accepted or queued')

    }



    const events = new EventRepository(db)

    const actions = new ActionRepository(db)

    const observedAt = this.nowIso()

    const timezone = this.resolveTimezone()

    const localDate = zonedLocalDate(this.clock.now(), timezone)



    try {

      const eventIds: string[] = []

      const run = db.transaction(() => {

        const requestEventId = randomUUID()

        const content = {

          runId: input.runId,

          toStatus: input.initialStatus,

          safeSummary: input.requestSummary,

          targetId: input.targetId,

          planId: input.planId,

          execution: input.execution ?? null,

        }

        const payload: MemoryEventPayload = {

          eventId: requestEventId,

          summary: input.requestSummary,

          content,

          contentHash: hashContent(content),

          redactedAt: null,

        }

        const meta: MemoryEventMeta = {

          eventId: requestEventId,

          schemaVersion: 1,

          sessionId: input.sessionId,

          turnId: input.turnId,

          correlationId: input.correlationId,

          causationEventId: null,

          nature: input.nature,

          eventType: eventTypeForTransition(input.nature, 'proposed', input.initialStatus),

          surface: 'desktop',

          actor: 'system',

          status: input.initialStatus,

          evidenceKind: 'deterministic_rule',

          confidence: 1,

          observedAt,

          occurredAt: observedAt,

          scheduledFor: null,

          completedAt: null,

          timezone,

          localDate,

          idempotencyKey: `action.create:${input.runId}`,

        }

        const ins = events.append(db, meta, payload)

        if (ins === 'inserted') eventIds.push(requestEventId)



        let queueOrder: number | null = null

        let queuedAt: string | null = null

        if (input.initialStatus === 'queued') {

          queueOrder = actions.maxQueueOrder(input.sessionId) + 1

          queuedAt = observedAt

        }



        const row: ActionRunRow = {

          run_id: input.runId,

          parent_run_id: input.parentRunId,

          nature: input.nature,

          session_id: input.sessionId,

          turn_id: input.turnId,

          correlation_id: input.correlationId,

          plan_id: input.planId,

          runtime_id: null,

          target_id: input.targetId,

          status: input.initialStatus,

          version: 1,

          request_event_id: requestEventId,

          last_event_id: requestEventId,

          queue_order: queueOrder,

          queued_at: queuedAt,

          started_at: null,

          completed_at: null,

          updated_at: observedAt,

          execution_json: input.execution ? JSON.stringify(input.execution) : null,

        }

        actions.insert(db, row)

        return actions.getById(input.runId)!

      })()

      return { ok: true, eventIds, run }

    } catch (e) {

      const msg = e instanceof Error ? e.message : String(e)

      if (/UNIQUE constraint failed.*memory_action_runs\.run_id/i.test(msg)) {

        const existing = new ActionRepository(db).getById(input.runId)
        if (existing) return { ok: true, eventIds: [], duplicate: true, run: existing }
        return this.fail('duplicate', `run already exists: ${input.runId}`)

      }

      if (e instanceof IdempotencyConflictError) throw e

      throw e

    }

  }



  transition(input: ActionTransition): MemoryRecordResult {

    return this.applyStatusChange({

      runId: input.runId,

      expectedVersion: input.fromVersion,

      toStatus: input.toStatus,

      idempotencyKey: input.idempotencyKey,

      safeSummary: input.safeSummary,

      errorCode: input.errorCode,

      occurredAt: input.occurredAt,

      runtimeId: input.runtimeId,

      trustedReceipt: false,

      runtimeRevision: undefined,

      runtimeObservedAt: undefined,

    })

  }



  reconcile(snapshot: RuntimeSnapshot): MemoryRecordResult {

    return this.applyStatusChange({

      runId: snapshot.runId,

      expectedVersion: undefined,

      toStatus: snapshot.status,

      idempotencyKey: `runtime:${snapshot.runId}:${snapshot.runtimeId}:${snapshot.runtimeRevision}`,

      safeSummary: `runtime ${snapshot.status}`,

      errorCode: snapshot.errorCode,

      occurredAt: snapshot.observedAt,

      runtimeId: snapshot.runtimeId,

      trustedReceipt: true,

      runtimeRevision: snapshot.runtimeRevision,

      runtimeObservedAt: snapshot.observedAt,

    })

  }



  private applyStatusChange(args: {

    runId: string

    expectedVersion: number | undefined

    toStatus: ActionTransition['toStatus']

    idempotencyKey: string

    safeSummary: string

    errorCode?: string

    occurredAt: string

    runtimeId?: string

    trustedReceipt: boolean

    runtimeRevision?: number

    runtimeObservedAt?: string

  }): MemoryRecordResult {

    const db = this.db()

    if (!db) return this.fail('db_unavailable', 'SQLite unavailable')



    if (!new ActionRepository(db).getRow(args.runId)) {
      return this.fail('invalid_input', `unknown run: ${args.runId}`)
    }

    try {
      return db.transaction(() => {
        const row = new ActionRepository(db).getRow(args.runId)!
        return this.applyStatusChangeInTx(db, row, args)
      })()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'VERSION_CONFLICT') {
        return this.fail('version_conflict', 'concurrent update lost optimistic lock')
      }
      if (e instanceof IdempotencyConflictError) {
        return this.fail('duplicate', e.message)
      }
      return this.fail('invalid_input', msg)
    }
  }

  /** Caller must run inside an open SQLite transaction. */
  private applyStatusChangeInTx(
    db: Database.Database,
    row: ActionRunRow,
    args: {
      runId: string
      expectedVersion?: number
      toStatus: ActionTransition['toStatus']
      idempotencyKey: string
      safeSummary: string
      errorCode?: string
      occurredAt: string
      runtimeId?: string
      trustedReceipt: boolean
      runtimeRevision?: number
      runtimeObservedAt?: string
    }
  ): MemoryRecordResult {
    const events = new EventRepository(db)
    const actions = new ActionRepository(db)
    const jobs = new JobRepository(db)

    if (args.expectedVersion !== undefined && row.version !== args.expectedVersion) {
      return this.fail('version_conflict', `expected version ${args.expectedVersion}, got ${row.version}`)
    }

    if (args.trustedReceipt && args.runtimeRevision !== undefined) {
      const cursor = resolveMaxRuntimeRevisionCursor(events, row.correlation_id, args.runId)
      const verdict = compareRuntimeSnapshot(cursor, {
        runtimeRevision: args.runtimeRevision,
        observedAt: args.runtimeObservedAt ?? args.occurredAt,
      })
      if (verdict === 'duplicate') {
        return { ok: true, eventIds: [], duplicate: true, run: actions.getById(args.runId)! }
      }
      if (verdict === 'stale') {
        return this.fail('stale_runtime_snapshot', 'runtime snapshot older than last applied receipt')
      }
    }

    if (isTerminalStatus(row.status)) {
      return this.fail('terminal_state', `run ${args.runId} is terminal (${row.status})`)
    }

    if (row.runtime_id && args.runtimeId && row.runtime_id !== args.runtimeId) {
      return this.fail('invalid_input', 'runtimeId mismatch for run')
    }

    const validation = validateTransition(row.status, args.toStatus, {
      trustedReceipt: args.trustedReceipt,
    })
    if (!validation.ok) {
      return this.fail(validation.code, `cannot transition ${row.status} -> ${args.toStatus}`)
    }

    const fromStatus = row.status
    const observedAt = args.trustedReceipt ? args.occurredAt : this.nowIso()
    const timezone = this.resolveTimezone()
    const localDate = zonedLocalDate(new Date(observedAt), timezone)

    const eventIds: string[] = []
    const eventId = randomUUID()
    const content: Record<string, unknown> = {
      runId: args.runId,
      fromStatus,
      toStatus: args.toStatus,
      safeSummary: args.safeSummary,
    }
    if (args.errorCode) content.errorCode = args.errorCode
    if (args.runtimeId) content.runtimeId = args.runtimeId
    if (args.trustedReceipt && args.runtimeRevision !== undefined) {
      content.runtimeRevision = args.runtimeRevision
      content.runtimeObservedAt = args.runtimeObservedAt ?? args.occurredAt
    }

    const payload: MemoryEventPayload = {
      eventId,
      summary: args.safeSummary,
      content,
      contentHash: hashContent(content),
      redactedAt: null,
    }
    const meta: MemoryEventMeta = {
      eventId,
      schemaVersion: 1,
      sessionId: row.session_id,
      turnId: row.turn_id,
      correlationId: row.correlation_id,
      causationEventId: row.last_event_id,
      nature: row.nature,
      eventType: eventTypeForTransition(row.nature, fromStatus, args.toStatus),
      surface: 'desktop',
      actor: actorForTransition(row.nature, args.trustedReceipt),
      status: args.toStatus,
      evidenceKind: args.trustedReceipt ? 'runtime_receipt' : 'deterministic_rule',
      confidence: 1,
      observedAt,
      occurredAt: args.occurredAt,
      scheduledFor: null,
      completedAt: isTerminalStatus(args.toStatus) ? args.occurredAt : null,
      timezone,
      localDate,
      idempotencyKey: args.idempotencyKey,
    }

    const appendResult = events.append(db, meta, payload)
    if (appendResult === 'inserted') eventIds.push(eventId)
    else return { ok: true, eventIds: [], duplicate: true, run: actions.getById(args.runId)! }

    const nextVersion = row.version + 1
    let queueOrder = row.queue_order
    let queuedAt = row.queued_at
    let startedAt = row.started_at
    let completedAt = row.completed_at
    const runtimeId = args.runtimeId ?? row.runtime_id

    if (args.toStatus === 'queued' && queueOrder == null) {
      queueOrder = actions.maxQueueOrder(row.session_id) + 1
      queuedAt = observedAt
    }
    if (args.toStatus === 'running' && !startedAt) startedAt = observedAt
    if (isTerminalStatus(args.toStatus)) completedAt = args.occurredAt
    if (args.toStatus !== 'queued') queueOrder = null

    const ok = actions.updateWithVersion(db, {
      run_id: row.run_id,
      parent_run_id: row.parent_run_id,
      nature: row.nature,
      session_id: row.session_id,
      turn_id: row.turn_id,
      correlation_id: row.correlation_id,
      plan_id: row.plan_id,
      runtime_id: runtimeId,
      target_id: row.target_id,
      status: args.toStatus,
      version: nextVersion,
      request_event_id: row.request_event_id,
      last_event_id: eventId,
      queue_order: queueOrder,
      queued_at: queuedAt,
      started_at: startedAt,
      completed_at: completedAt,
      updated_at: observedAt,
      execution_json: row.execution_json ?? null,
      expected_version: row.version,
    })
    if (!ok) throw new Error('VERSION_CONFLICT')

    if (isTerminalStatus(args.toStatus)) {
      const now = observedAt
      jobs.enqueue(db, {
        job_id: randomUUID(),
        source_event_id: eventId,
        session_id: row.session_id,
        job_type: JOB_TYPE_DERIVE_ACTION_TERMINAL,
        derivation_version: CURRENT_DERIVATION_VERSION,
        status: 'pending',
        attempts: 0,
        available_at: now,
        lease_until: null,
        lease_owner: null,
        lease_generation: 0,
        last_error: null,
        created_at: now,
        updated_at: now,
      })
    }

    return { ok: true, eventIds, run: actions.getById(args.runId)! }
  }



  cancelQueued(runId: string, expectedVersion: number): MemoryRecordResult {

    const row = this.db() ? new ActionRepository(this.db()!).getRow(runId) : null

    if (!row) return this.fail('invalid_input', `unknown run: ${runId}`)

    if (row.status !== 'queued') {

      return this.fail('invalid_transition', 'cancelQueued requires queued status')

    }

    return this.transition({

      runId,

      fromVersion: expectedVersion,

      toStatus: 'aborted',

      safeSummary: 'queued run cancelled',

      occurredAt: this.nowIso(),

      idempotencyKey: `action.cancel:${runId}:v${expectedVersion}`,

    })

  }



  reorderQueue(sessionId: string, orderedRunIds: string[]): MemoryRecordResult {
    const db = this.db()
    if (!db) return this.fail('db_unavailable', 'SQLite unavailable')

    const actions = new ActionRepository(db)
    const events = new EventRepository(db)
    const queued = actions.listQueued(sessionId)
    if (queued.length === 0 && orderedRunIds.length === 0) {
      return { ok: true, eventIds: [] }
    }
    const queuedIds = new Set(queued.map((r) => r.run_id))

    if (orderedRunIds.length !== queued.length) {
      return this.fail('invalid_input', 'orderedRunIds must include all queued runs exactly once')
    }
    if (new Set(orderedRunIds).size !== orderedRunIds.length) {
      return this.fail('invalid_input', 'orderedRunIds must not contain duplicates')
    }
    for (const id of orderedRunIds) {
      if (!queuedIds.has(id)) {
        return this.fail('invalid_input', `run ${id} is not queued in session`)
      }
    }

    const observedAt = this.nowIso()
    const timezone = this.resolveTimezone()
    const localDate = zonedLocalDate(new Date(observedAt), timezone)
    const head = actions.getRow(orderedRunIds[0]!)!

    try {
      return db.transaction((): MemoryRecordResult => {
        const current = actions.listQueued(sessionId)
        if (
          current.length !== orderedRunIds.length ||
          current.some((row) => !orderedRunIds.includes(row.run_id))
        ) {
          throw new Error('QUEUE_CHANGED')
        }
        const already =
          current.length === orderedRunIds.length &&
          current.every((row, index) => row.run_id === orderedRunIds[index])
        const orderKey = `action.reorder:${sessionId}:${orderedRunIds.join(',')}`
        const prior = events.findByIdempotencyKey(orderKey)
        if (prior && already) {
          return { ok: true, eventIds: [], duplicate: true }
        }

        const idempotencyKey = prior
          ? `${orderKey}:since:${current.map((row) => `${row.run_id}@${row.version}`).join('|')}`
          : orderKey
        const eventId = randomUUID()
        const content = {
          sessionId,
          orderedRunIds,
          kind: 'queue_reordered',
        }
        const payload: MemoryEventPayload = {
          eventId,
          summary: 'session work queue reordered',
          content,
          contentHash: hashContent(content),
          redactedAt: null,
        }
        const meta: MemoryEventMeta = {
          eventId,
          schemaVersion: 1,
          sessionId,
          turnId: head.turn_id,
          correlationId: head.correlation_id,
          causationEventId: head.last_event_id,
          nature: head.nature,
          eventType: 'work.progressed',
          surface: 'desktop',
          actor: 'system',
          status: 'queued',
          evidenceKind: 'deterministic_rule',
          confidence: 1,
          observedAt,
          occurredAt: observedAt,
          scheduledFor: null,
          completedAt: null,
          timezone,
          localDate,
          idempotencyKey,
        }
        if (events.append(db, meta, payload) !== 'inserted') {
          return { ok: true, eventIds: [], duplicate: true }
        }

        for (const [index, runId] of orderedRunIds.entries()) {
          const row = actions.getRow(runId)!
          if (row.status !== 'queued') throw new Error('QUEUE_CHANGED')
          const ok = actions.updateWithVersion(db, {
            ...row,
            queue_order: index + 1,
            last_event_id: eventId,
            updated_at: observedAt,
            expected_version: row.version,
            version: row.version + 1,
          })
          if (!ok) throw new Error('VERSION_CONFLICT')
        }
        return { ok: true, eventIds: [eventId] }
      })()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'VERSION_CONFLICT') {
        return this.fail('version_conflict', 'reorder lost optimistic lock')
      }
      if (msg === 'QUEUE_CHANGED') {
        return this.fail('invalid_transition', 'queue membership changed during reorder')
      }
      return this.fail('invalid_input', msg)
    }
  }

  promoteNext(sessionId: string): MemoryRecordResult {
    const db = this.db()
    if (!db) return this.fail('db_unavailable', 'SQLite unavailable')

    type TxOutcome =
      | { kind: 'empty' }
      | { kind: 'done'; result: MemoryRecordResult }

    try {
      const outcome = db.transaction((): TxOutcome => {
        const actions = new ActionRepository(db)
        if (actions.sessionHasInFlightRunner(sessionId)) {
          return {
            kind: 'done',
            result: this.fail('invalid_transition', 'session already has an in-flight run'),
          }
        }
        const queued = actions.listQueued(sessionId)
        if (queued.length === 0) return { kind: 'empty' }
        const head = queued[0]!
        const row = actions.getRow(head.run_id)
        if (!row || row.status !== 'queued') {
          return {
            kind: 'done',
            result: this.fail('invalid_transition', 'queue head is no longer queued'),
          }
        }
        const result = this.applyStatusChangeInTx(db, row, {
          runId: row.run_id,
          expectedVersion: row.version,
          toStatus: 'running',
          idempotencyKey: `action.promote:${sessionId}:${row.run_id}:v${row.version}`,
          safeSummary: 'promoted from session queue',
          occurredAt: this.nowIso(),
          trustedReceipt: false,
        })
        return { kind: 'done', result }
      })()

      if (outcome.kind === 'empty') return { ok: true, eventIds: [] }
      return outcome.result
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg === 'VERSION_CONFLICT') {
        return this.fail('version_conflict', 'concurrent update lost optimistic lock')
      }
      return this.fail('invalid_input', msg)
    }
  }



  getCurrent(runId: string): ActionRun | null {

    const db = this.db()

    if (!db) return null

    return new ActionRepository(db).getById(runId)

  }



  listOpen(sessionId: string): ActionRun[] {

    const db = this.db()

    if (!db) return []

    return new ActionRepository(db).listOpen(sessionId, 200)

  }

}



export function createActionCoordinator(

  dataRoot: string,

  opts?: ActionCoordinatorOptions

): ActionCoordinator {

  return new SqliteActionCoordinator(dataRoot, opts)

}


