import { createHash, randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { getDatabase } from '../../db/database.js'
import type {
  MemoryEventMeta,
  MemoryEventPayload,
  MemoryNature,
  MemoryRecordCommand,
  MemoryRecordResult,
  PlanEvidence,
  RouteVerdictEvidence,
  RouteVerdictLayer,
  TurnDeriveContext,
  TurnInput
} from '../contracts.js'
import type { MemorySystem } from '../memorySystem.js'
import {
  CURRENT_DERIVATION_VERSION,
  JOB_TYPE_DERIVE_CHAT_TURN
} from '../derivation/derivationVersion.js'
import { EventRepository } from '../ledger/eventRepository.js'
import { IdempotencyConflictError } from '../ledger/errors.js'
import { JobRepository } from '../jobs/jobRepository.js'
import type { Clock } from '../temporal/clock.js'
import { getClock } from '../temporal/clock.js'
import { zonedLocalDate, zonedLocalMidnightUtc } from '../temporal/zonedDate.js'
import { resolveRelativeLocalDate } from '../temporal/temporalParser.js'
import { classifyChatUserEvidenceKind } from '../derivation/chatUserEvidence.js'
import { composeRecall } from '../recall/recallComposer.js'
import { executeMemoryControl } from '../governance/executeControl.js'
import { loadSettings } from '../../settings.js'

export type ChatTurnContext = {
  turnId: string
  correlationId: string
  sessionId: string
  userText: string
  surface: TurnInput['surface']
  timezone: string
}

function hashContent(content: Record<string, unknown>): string {
  return createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32)
}

function fail(code: 'db_unavailable' | 'invalid_input' | 'duplicate', message: string): MemoryRecordResult {
  return { ok: false, code, message }
}

function readContext(content: Record<string, unknown>): ChatTurnContext | null {
  if (typeof content.turnId !== 'string' || typeof content.correlationId !== 'string') return null
  if (typeof content.sessionId !== 'string' || typeof content.timezone !== 'string') return null
  const surface = content.surface === 'weixin' ? 'weixin' : content.surface === 'system' ? 'system' : 'desktop'
  return {
    turnId: content.turnId,
    correlationId: content.correlationId,
    sessionId: content.sessionId,
    userText: typeof content.userText === 'string' ? content.userText : '',
    surface,
    timezone: content.timezone
  }
}

/**
 * Route v2 §6.1 (Codex 审计整改 #3 二轮): sanitization lives at the MEMORY
 * WRITE BOUNDARY — direct MemorySystem.record callers cannot bypass it.
 * ruleId/motive/planId/pendingConfirm must be safe identifiers; evidence is
 * whitelist-only (lowercase rule tokens, no spaces → no user prose, no path
 * separators → no paths). Anything else is dropped or replaced by a safe
 * placeholder, never redacted-in-place.
 */

const SAFE_ID_RE = /^[a-zA-Z0-9_:\-]{1,64}$/

const ALLOWED_MOTIVES = new Set([
  'chat',
  'ask',
  'use',
  'create',
  'update',
  'work',
  'organize',
  'none',
  'redline',
  'confirm',
  'shortcut',
  'audit_shortcut',
  'unknown'
])

const ALLOWED_FINAL_CHANNELS = new Set(['chat', 'plugin', 'work'])

const ALLOWED_LAYERS = new Set([
  'redline',
  'gate0',
  'catalog',
  'deterministic',
  'residual',
  'probe',
  'normalize',
  'confirm'
])

function safeId(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback
  return SAFE_ID_RE.test(raw) ? raw : fallback
}

/**
 * Structured-identifier口径 (Codex 三轮): verdicts carry identifiers only.
 * Evidence free-text is stripped entirely at the boundary — short English
 * fragments, user prose, paths, all of it. layer must be a known enum value
 * (unknown layers are dropped); finalChannel is validated by the caller.
 */
function sanitizeRouteVerdict(evidence: RouteVerdictEvidence): RouteVerdictEvidence | null {
  if (!ALLOWED_FINAL_CHANNELS.has(evidence.finalChannel)) return null
  const layers: RouteVerdictLayer[] = evidence.layers
    .filter((l) => ALLOWED_LAYERS.has(l.layer))
    .map((l) => {
      const out: RouteVerdictLayer = {
        layer: l.layer,
        ruleId: safeId(l.ruleId, 'unsafe:dropped'),
        ms: Number.isFinite(l.ms) ? Math.max(0, Math.round(l.ms)) : 0
      }
      if (typeof l.candidateCount === 'number' && Number.isFinite(l.candidateCount)) {
        out.candidateCount = l.candidateCount
      }
      return out
    })
  const out: RouteVerdictEvidence = {
    finalChannel: evidence.finalChannel,
    motive: ALLOWED_MOTIVES.has(evidence.motive) ? evidence.motive : 'unknown',
    layers,
    usedClassifier: evidence.usedClassifier === true
  }
  if (
    evidence.residualOutcome &&
    ['ok', 'timeout', 'invalid_json', 'llm_error'].includes(evidence.residualOutcome)
  ) {
    out.residualOutcome = evidence.residualOutcome
  }
  if (evidence.pendingConfirm && SAFE_ID_RE.test(evidence.pendingConfirm)) {
    out.pendingConfirm = evidence.pendingConfirm
  }
  if (evidence.planId && SAFE_ID_RE.test(evidence.planId)) {
    out.planId = evidence.planId
  }
  return out
}

function appendEvent(
  db: Database.Database,
  events: EventRepository,
  meta: MemoryEventMeta,
  content: Record<string, unknown>,
  summary: string
): 'inserted' | 'duplicate' {
  const payload: MemoryEventPayload = {
    eventId: meta.eventId,
    summary,
    content,
    contentHash: hashContent(content),
    redactedAt: null
  }
  return events.append(db, meta, payload)
}

function baseMeta(
  partial: Pick<MemoryEventMeta, 'eventId' | 'sessionId' | 'turnId' | 'correlationId' | 'causationEventId' | 'nature' | 'eventType' | 'surface' | 'actor' | 'status' | 'evidenceKind' | 'observedAt' | 'occurredAt' | 'timezone' | 'localDate' | 'idempotencyKey'> & {
    completedAt?: string | null
  }
): MemoryEventMeta {
  return {
    schemaVersion: 1,
    confidence: 1,
    scheduledFor: null,
    completedAt: partial.completedAt ?? null,
    ...partial
  }
}

export function applyChatMemoryCommand(
  db: Database.Database,
  command: Extract<
    MemoryRecordCommand,
    { kind: 'turn.started' | 'turn.finalized' | 'plan.proposed' | 'plan.decided' | 'route.verdict' }
  >,
  now: Date
): MemoryRecordResult {
  const events = new EventRepository(db)
  const jobs = new JobRepository(db)

  try {
    return db.transaction(() => writeCommand(db, events, jobs, command, now))()
  } catch (e) {
    if (e instanceof IdempotencyConflictError) {
      return fail('duplicate', e.message)
    }
    const msg = e instanceof Error ? e.message : String(e)
    return fail('invalid_input', msg)
  }
}

function writeCommand(
  db: Database.Database,
  events: EventRepository,
  jobs: JobRepository,
  command: Extract<
    MemoryRecordCommand,
    { kind: 'turn.started' | 'turn.finalized' | 'plan.proposed' | 'plan.decided' | 'route.verdict' }
  >,
  now: Date
): MemoryRecordResult {
  if (command.kind === 'turn.started') return writeStarted(db, events, command.turn, now)
  if (command.kind === 'route.verdict') {
    return writeRouteVerdict(db, events, command.turnId, command.verdict, now)
  }
  if (command.kind === 'plan.proposed') return writeProposed(db, events, command.turnId, command.plan, now)
  if (command.kind === 'plan.decided') {
    return writeDecided(db, events, command.turnId, command.planId, command.accepted, now)
  }
  return writeFinalized(
    db,
    events,
    jobs,
    command.turnId,
    command.assistantText,
    command.occurredAt,
    now,
    command.deriveContext
  )
}

function writeStarted(
  db: Database.Database,
  events: EventRepository,
  turn: TurnInput,
  now: Date
): MemoryRecordResult {
  const observedAt = turn.observedAt || now.toISOString()
  const localDate = zonedLocalDate(new Date(observedAt), turn.timezone)
  // 相对时间入账（设计 §8.1）：绑定 observedAt + timezone 解析，绝不在异步任务里重新以“现在”解释；
  // 解析失败（无相对短语或短语超出现有规则）则保持 null
  const resolvedLocalDate = resolveRelativeLocalDate(turn.userText, observedAt, turn.timezone)
  const scheduledFor = resolvedLocalDate
    ? zonedLocalMidnightUtc(resolvedLocalDate, turn.timezone).toISOString()
    : null
  const eventId = randomUUID()
  const content = {
    turnId: turn.turnId,
    correlationId: turn.correlationId,
    sessionId: turn.sessionId,
    userText: turn.userText,
    surface: turn.surface,
    timezone: turn.timezone,
    scheduledFor: scheduledFor ?? null
  }
  const inserted = appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: turn.sessionId,
      turnId: turn.turnId,
      correlationId: turn.correlationId,
      causationEventId: null,
      nature: 'chat',
      eventType: 'chat.user_message',
      surface: turn.surface,
      actor: 'user',
      status: null,
      evidenceKind: classifyChatUserEvidenceKind(turn.userText),
      observedAt,
      occurredAt: observedAt,
      scheduledFor,
      timezone: turn.timezone,
      localDate,
      idempotencyKey: `turn.started:${turn.turnId}`
    }),
    content,
    turn.userText.slice(0, 160) || 'user message'
  )
  if (inserted === 'duplicate') {
    return { ok: true, eventIds: [], duplicate: true }
  }
  return { ok: true, eventIds: [eventId] }
}

function loadStarted(events: EventRepository, turnId: string): ChatTurnContext | null {
  const ev = events.findByIdempotencyKey(`turn.started:${turnId}`)
  if (!ev) return null
  return readContext(ev.payload.content)
}

/**
 * Route v2 §6.1 (Codex D1): one routing verdict per turn, written after the
 * final channel decision. Causation anchors to turn.started; evidence carries
 * rule identifiers only (the routing mapper guarantees no user text).
 */
function writeRouteVerdict(
  db: Database.Database,
  events: EventRepository,
  turnId: string,
  raw: RouteVerdictEvidence,
  now: Date
): MemoryRecordResult {
  const ctx = loadStarted(events, turnId)
  if (!ctx) return fail('invalid_input', `unknown turn: ${turnId}`)
  // Sanitization at the write boundary (整改 #3 二轮/三轮) — direct
  // MemorySystem.record callers are sanitized here too. A forged finalChannel
  // enum makes the whole verdict unwritable.
  const verdict = sanitizeRouteVerdict(raw)
  if (!verdict) return fail('invalid_input', `invalid finalChannel: ${String(raw.finalChannel)}`)
  const started = events.findByIdempotencyKey(`turn.started:${turnId}`)
  const observedAt = now.toISOString()
  const localDate = zonedLocalDate(now, ctx.timezone)
  const eventId = randomUUID()
  const content = {
    turnId,
    correlationId: ctx.correlationId,
    finalChannel: verdict.finalChannel,
    motive: verdict.motive,
    layers: verdict.layers,
    usedClassifier: verdict.usedClassifier,
    residualOutcome: verdict.residualOutcome ?? null,
    pendingConfirm: verdict.pendingConfirm ?? null,
    planId: verdict.planId ?? null
  }
  const inserted = appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: ctx.sessionId,
      turnId,
      correlationId: ctx.correlationId,
      causationEventId: started?.meta.eventId ?? null,
      nature: 'chat',
      eventType: 'route.verdict',
      surface: ctx.surface,
      actor: 'system',
      status: null,
      evidenceKind: 'deterministic_rule',
      observedAt,
      occurredAt: observedAt,
      timezone: ctx.timezone,
      localDate,
      idempotencyKey: `route.verdict:${turnId}`
    }),
    content,
    `route verdict: ${verdict.finalChannel}`
  )
  if (inserted === 'duplicate') return { ok: true, eventIds: [], duplicate: true }
  return { ok: true, eventIds: [eventId] }
}

function writeProposed(
  db: Database.Database,
  events: EventRepository,
  turnId: string,
  plan: PlanEvidence,
  now: Date
): MemoryRecordResult {
  const ctx = loadStarted(events, turnId)
  if (!ctx) return fail('invalid_input', `unknown turn: ${turnId}`)
  const observedAt = now.toISOString()
  const localDate = zonedLocalDate(now, ctx.timezone)
  const started = events.findByIdempotencyKey(`turn.started:${turnId}`)
  const eventId = randomUUID()
  const content = {
    turnId,
    correlationId: ctx.correlationId,
    planId: plan.planId,
    nature: plan.nature,
    intent: plan.intent,
    targetId: plan.targetId,
    summary: plan.summary,
    requiresConfirmation: plan.requiresConfirmation
  }
  const inserted = appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: ctx.sessionId,
      turnId,
      correlationId: ctx.correlationId,
      causationEventId: started?.meta.eventId ?? null,
      nature: plan.nature,
      eventType: 'plan.proposed',
      surface: ctx.surface,
      actor: 'ackem',
      status: 'proposed',
      evidenceKind: 'deterministic_rule',
      observedAt,
      occurredAt: observedAt,
      timezone: ctx.timezone,
      localDate,
      idempotencyKey: `plan.proposed:${turnId}:${plan.planId}`
    }),
    content,
    plan.summary.slice(0, 160) || 'plan proposed'
  )
  if (inserted === 'duplicate') return { ok: true, eventIds: [], duplicate: true }
  return { ok: true, eventIds: [eventId] }
}

function findProposal(db: Database.Database, planId: string, turnId: string) {
  const sql = turnId
    ? `SELECT e.event_id, e.correlation_id, e.session_id, e.turn_id, e.timezone, e.surface, p.content_json
       FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type = 'plan.proposed'
         AND json_extract(p.content_json, '$.planId') = ?
         AND json_extract(p.content_json, '$.turnId') = ?
       ORDER BY e.observed_at DESC
       LIMIT 1`
    : `SELECT e.event_id, e.correlation_id, e.session_id, e.turn_id, e.timezone, e.surface, p.content_json
       FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type = 'plan.proposed'
         AND json_extract(p.content_json, '$.planId') = ?
       ORDER BY e.observed_at DESC
       LIMIT 1`
  const params = turnId ? [planId, turnId] : [planId]
  return db.prepare(sql).get(...params) as
    | {
        event_id: string
        correlation_id: string
        session_id: string
        turn_id: string | null
        timezone: string
        surface: TurnInput['surface']
        content_json: string
      }
    | undefined
}

function writeDecided(
  db: Database.Database,
  events: EventRepository,
  turnId: string,
  planId: string,
  accepted: boolean,
  now: Date
): MemoryRecordResult {
  const proposal = findProposal(db, planId, turnId)
  if (!proposal) return fail('invalid_input', `unknown plan: ${planId}`)
  // 确认决定是 final：同一 planId 已有相反方向的 plan.decided 时，拒绝本次写入
  const priorDecision = db
    .prepare(
      `SELECT e.event_type FROM memory_events e
       JOIN memory_event_payloads p ON p.event_id = e.event_id
       WHERE e.event_type IN ('plan.accepted','plan.rejected')
         AND json_extract(p.content_json, '$.planId') = ?
       ORDER BY e.observed_at DESC
       LIMIT 1`
    )
    .get(planId) as { event_type: 'plan.accepted' | 'plan.rejected' } | undefined
  const expectedType = accepted ? 'plan.accepted' : 'plan.rejected'
  if (priorDecision && priorDecision.event_type !== expectedType) {
    return fail('invalid_input', `plan ${planId} was already ${priorDecision.event_type === 'plan.accepted' ? 'accepted' : 'rejected'} (decision is final)`)
  }
  const contentJson = JSON.parse(proposal.content_json) as Record<string, unknown>
  const nature = (contentJson.nature === 'plugin' || contentJson.nature === 'work' ? contentJson.nature : 'chat') as MemoryNature
  const resolvedTurnId = proposal.turn_id || (typeof contentJson.turnId === 'string' ? contentJson.turnId : turnId)
  const observedAt = now.toISOString()
  const localDate = zonedLocalDate(now, proposal.timezone)
  const eventId = randomUUID()
  const eventType = accepted ? 'plan.accepted' : 'plan.rejected'
  const content = {
    turnId: resolvedTurnId,
    correlationId: proposal.correlation_id,
    planId,
    accepted
  }
  const inserted = appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: proposal.session_id,
      turnId: resolvedTurnId,
      correlationId: proposal.correlation_id,
      causationEventId: proposal.event_id,
      nature,
      eventType,
      surface: proposal.surface,
      actor: 'user',
      status: accepted ? 'accepted' : 'rejected',
      evidenceKind: 'user_assertion',
      observedAt,
      occurredAt: observedAt,
      timezone: proposal.timezone,
      localDate,
      idempotencyKey: `plan.decided:${proposal.correlation_id}:${planId}:${accepted ? 'accepted' : 'rejected'}`
    }),
    content,
    accepted ? 'plan accepted' : 'plan rejected'
  )
  if (inserted === 'duplicate') return { ok: true, eventIds: [], duplicate: true }
  return { ok: true, eventIds: [eventId] }
}

function enqueueDerive(
  db: Database.Database,
  jobs: JobRepository,
  sourceEventId: string,
  sessionId: string,
  nowIso: string
): void {
  jobs.enqueue(db, {
    job_id: randomUUID(),
    source_event_id: sourceEventId,
    session_id: sessionId,
    job_type: JOB_TYPE_DERIVE_CHAT_TURN,
    derivation_version: CURRENT_DERIVATION_VERSION,
    status: 'pending',
    attempts: 0,
    available_at: nowIso,
    lease_until: null,
    lease_owner: null,
    lease_generation: 0,
    last_error: null,
    created_at: nowIso,
    updated_at: nowIso
  })
}

function writeDeriveContext(
  db: Database.Database,
  events: EventRepository,
  ctx: ChatTurnContext,
  turnId: string,
  derive: TurnDeriveContext,
  observedAt: string,
  localDate: string
): void {
  const eventId = randomUUID()
  const content = { turnId, correlationId: ctx.correlationId, ...derive }
  appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: ctx.sessionId,
      turnId,
      correlationId: ctx.correlationId,
      causationEventId: null,
      nature: 'chat',
      eventType: 'chat.turn_derive_context',
      surface: derive.surface ?? ctx.surface,
      actor: 'system',
      status: null,
      evidenceKind: 'deterministic_rule',
      observedAt,
      occurredAt: observedAt,
      timezone: ctx.timezone,
      localDate,
      idempotencyKey: `turn.derive_context:${turnId}`
    }),
    content,
    'turn derive context'
  )
}

function writeFinalized(
  db: Database.Database,
  events: EventRepository,
  jobs: JobRepository,
  turnId: string,
  assistantText: string,
  occurredAt: string,
  now: Date,
  deriveContext?: TurnDeriveContext
): MemoryRecordResult {
  const ctx = loadStarted(events, turnId)
  if (!ctx) return fail('invalid_input', `unknown turn: ${turnId}`)
  const started = events.findByIdempotencyKey(`turn.started:${turnId}`)!
  const observedAt = occurredAt || now.toISOString()
  const localDate = zonedLocalDate(new Date(observedAt), ctx.timezone)
  if (deriveContext) {
    writeDeriveContext(db, events, ctx, turnId, deriveContext, observedAt, localDate)
  }
  const text = assistantText.trim()
  if (!text) {
    enqueueDerive(db, jobs, started.meta.eventId, ctx.sessionId, observedAt)
    return { ok: true, eventIds: [] }
  }
  const eventId = randomUUID()
  const content = {
    turnId,
    correlationId: ctx.correlationId,
    assistantText: text
  }
  const inserted = appendEvent(
    db,
    events,
    baseMeta({
      eventId,
      sessionId: ctx.sessionId,
      turnId,
      correlationId: ctx.correlationId,
      causationEventId: started.meta.eventId,
      nature: 'chat',
      eventType: 'chat.assistant_reply',
      surface: ctx.surface,
      actor: 'ackem',
      status: null,
      evidenceKind: 'llm_inference',
      observedAt,
      occurredAt,
      completedAt: occurredAt,
      timezone: ctx.timezone,
      localDate,
      idempotencyKey: `turn.finalized:${turnId}`
    }),
    content,
    text.slice(0, 160)
  )
  const sourceId = inserted === 'inserted' ? eventId : started.meta.eventId
  const assistant = events.findByIdempotencyKey(`turn.finalized:${turnId}`)
  enqueueDerive(db, jobs, assistant?.meta.eventId ?? sourceId, ctx.sessionId, observedAt)
  if (inserted === 'duplicate') return { ok: true, eventIds: [], duplicate: true }
  return { ok: true, eventIds: [eventId] }
}

/** Ledger writer for chat turn commands. Other record kinds stay for later tasks. */
export function createChatLedgerMemorySystem(dataRoot: string, clock: Clock = getClock()): MemorySystem {
  return {
    record(command) {
      const db = getDatabase(dataRoot)
      if (!db) return fail('db_unavailable', 'SQLite unavailable')
      if (
        command.kind !== 'turn.started' &&
        command.kind !== 'turn.finalized' &&
        command.kind !== 'plan.proposed' &&
        command.kind !== 'plan.decided' &&
        command.kind !== 'route.verdict'
      ) {
        return fail('invalid_input', `chat ledger does not record ${command.kind}`)
      }
      return applyChatMemoryCommand(db, command, clock.now())
    },
    async recall(query) {
      return composeRecall(dataRoot, query)
    },
    async control(command) {
      const now = clock.now()
      const tz = command.timezone ?? loadSettings().timezone ?? 'Asia/Shanghai'
      return executeMemoryControl(
        dataRoot,
        {
          sessionId: command.sessionId ?? 'default',
          timezone: tz,
          observedAt: now.toISOString(),
          turnId: command.turnId ?? null
        },
        command
      )
    },
    async recover() {
      return { jobsRecovered: 0, actionsReconciled: 0, actionsUnknown: 0, errors: [] }
    }
  }
}
