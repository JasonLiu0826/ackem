/**
 * Jarvis memory domain contracts (plan §4, §7, §9).
 * Ledger `InteractionSurface` is desktop | weixin | system.
 * Existing fact provenance `desktop_main` is translated by adapters, not this type.
 */

export type MemoryNature = 'chat' | 'plugin' | 'work' | 'memory_control'

export type InteractionSurface = 'desktop' | 'weixin' | 'system'

export type EvidenceKind =
  | 'runtime_receipt'
  | 'user_correction'
  | 'user_assertion'
  | 'deterministic_rule'
  | 'llm_inference'
  | 'legacy_import'

export type ActionStatus =
  | 'proposed'
  | 'accepted'
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'succeeded'
  | 'failed'
  | 'rejected'
  | 'aborted'
  | 'unknown'

export type MemoryEventType =
  | 'chat.user_message'
  | 'chat.assistant_reply'
  | 'chat.turn_derive_context'
  | 'chat.facts_extracted'
  | 'plan.proposed'
  | 'plan.accepted'
  | 'plan.rejected'
  | 'plugin.accepted'
  | 'plugin.queued'
  | 'plugin.running'
  | 'plugin.waiting_permission'
  | 'plugin.succeeded'
  | 'plugin.failed'
  | 'plugin.aborted'
  | 'plugin.unknown'
  | 'work.accepted'
  | 'work.queued'
  | 'work.running'
  | 'work.waiting_permission'
  | 'work.resumed'
  | 'work.progressed'
  | 'work.succeeded'
  | 'work.failed'
  | 'work.aborted'
  | 'work.unknown'
  | 'memory.corrected'
  | 'memory.muted'
  | 'memory.forgotten'
  | 'memory.deleted'
  | 'route.verdict'

export type MemoryActor = 'user' | 'ackem' | 'plugin_runtime' | 'ackemcode_runtime' | 'system'

export interface MemoryEventMeta {
  eventId: string
  schemaVersion: 1
  sessionId: string
  turnId: string | null
  correlationId: string
  causationEventId: string | null
  nature: MemoryNature
  eventType: MemoryEventType
  surface: InteractionSurface
  actor: MemoryActor
  status: ActionStatus | null
  evidenceKind: EvidenceKind
  confidence: number
  observedAt: string
  occurredAt: string | null
  scheduledFor: string | null
  completedAt: string | null
  timezone: string
  localDate: string
  idempotencyKey: string
}

export interface MemoryEventPayload {
  eventId: string
  summary: string
  content: Record<string, unknown>
  contentHash: string
  redactedAt: string | null
}

export interface MemoryEvent {
  meta: MemoryEventMeta
  payload: MemoryEventPayload
}

export const ACTION_TRANSITIONS: Readonly<Record<ActionStatus, readonly ActionStatus[]>> = {
  proposed: ['accepted', 'rejected'],
  accepted: ['queued', 'running', 'failed', 'aborted'],
  queued: ['running', 'failed', 'aborted'],
  running: ['waiting_permission', 'succeeded', 'failed', 'aborted', 'unknown'],
  waiting_permission: ['running', 'succeeded', 'failed', 'aborted', 'unknown'],
  unknown: ['running', 'waiting_permission', 'succeeded', 'failed', 'aborted'],
  succeeded: [],
  failed: [],
  rejected: [],
  aborted: []
}

export type MemoryRecordCommand =
  | { kind: 'turn.started'; turn: TurnInput }
  | {
      kind: 'turn.finalized'
      turnId: string
      assistantText: string
      occurredAt: string
      deriveContext?: TurnDeriveContext
    }
  | { kind: 'plan.proposed'; turnId: string; plan: PlanEvidence }
  | { kind: 'plan.decided'; turnId: string; planId: string; accepted: boolean }
  | { kind: 'action.created'; action: NewActionRun }
  | { kind: 'action.transitioned'; transition: ActionTransition }
  | { kind: 'runtime.received'; receipt: RuntimeReceipt }
  | { kind: 'memory.controlled'; control: MemoryControlCommand }
  | { kind: 'route.verdict'; turnId: string; verdict: RouteVerdictEvidence }

export type MemoryRecordErrorCode =
  | 'db_unavailable'
  | 'invalid_transition'
  | 'duplicate'
  | 'invalid_input'
  | 'version_conflict'
  | 'terminal_state'
  | 'missing_trusted_receipt'
  | 'stale_runtime_snapshot'

export type MemoryRecordResult =
  | { ok: true; eventIds: string[]; run?: ActionRun; duplicate?: boolean }
  | {
      ok: false
      code: MemoryRecordErrorCode
      message: string
    }

export interface TurnInput {
  sessionId: string
  turnId: string
  correlationId: string
  userText: string
  surface: InteractionSurface
  observedAt: string
  timezone: string
}

/** L0 event snapshot for Tier-B ingest after restart (no process-local PendingChatTurn). */
export type PersistedL0Event = {
  type: string
  intensity: number
  sincerity: number
  isExtremeRedline: boolean
  isAdultContent: boolean
  adultSubtype?: 'flirt' | 'dominant' | 'submissive' | 'explicit' | 'romantic'
}

/** Persisted beside the turn so derive.chat_turn survives restart (no API keys). */
export interface TurnDeriveContext {
  turnIndex: number
  skipIngest?: boolean
  skipLlmExtraction?: boolean
  surface?: InteractionSurface
  ownerAgentId?: string
  l0Event?: PersistedL0Event
  /** Optional deterministic facts (same shape as ingest prefetchedFacts). */
  prefetchedFacts?: Array<{
    domain: string
    subcategory: string
    subject: string
    summary: string
  }>
  /** Session state at finalize time (no secrets); derive must not read live state.json. */
  stateSnapshot?: PersistedTurnStateSnapshot
}

/** Minimal Tier-B ingest inputs frozen at turn.finalized. */
export interface PersistedTurnStateSnapshot {
  relationship: Record<string, unknown>
  emotion: Record<string, unknown>
  totalTurns: number
}

export interface PlanEvidence {
  planId: string
  nature: 'chat' | 'plugin' | 'work'
  intent: string
  targetId: string | null
  summary: string
  requiresConfirmation: boolean
}

/**
 * One routing-layer trace entry (route v2 §6.1). Evidence carries rule
 * identifiers only — never user text, never paths (≤40 chars enforced by
 * the routing mapper, not this type).
 */
export interface RouteVerdictLayer {
  layer:
    | 'redline'
    | 'gate0'
    | 'catalog'
    | 'deterministic'
    | 'residual'
    | 'probe'
    | 'normalize'
    | 'confirm'
  ruleId?: string
  evidence?: string
  candidateCount?: number
  ms: number
}

/**
 * Desensitized routing verdict (route v2 §6.1, Codex D1). The routing layer
 * maps its trace into this shape; the memory domain never imports routing
 * implementations. One verdict per turn, written once after the final
 * channel decision and before plan/action/execute.
 */
export interface RouteVerdictEvidence {
  finalChannel: 'chat' | 'plugin' | 'work'
  motive: string
  layers: RouteVerdictLayer[]
  usedClassifier: boolean
  residualOutcome?: 'ok' | 'timeout' | 'invalid_json' | 'llm_error'
  pendingConfirm?: string
  planId?: string
}

/** Inputs required to execute again after restart. A summary alone is not a queue. */
export interface ActionExecutionInput {
  prompt: string
  cwd?: string
  targetId: string
  extensionId?: string
  params?: Record<string, unknown>
  workKind?: 'job' | 'factory'
  intent?: string
  tag?: string | null
  hostRunId?: string
}

export interface NewActionRun {
  runId: string
  parentRunId: string | null
  nature: 'plugin' | 'work'
  sessionId: string
  turnId: string
  correlationId: string
  planId: string | null
  targetId: string
  initialStatus: 'accepted' | 'queued'
  requestSummary: string
  execution?: ActionExecutionInput
}

export interface ActionTransition {
  runId: string
  fromVersion: number
  toStatus: ActionStatus
  runtimeId?: string
  safeSummary: string
  errorCode?: string
  occurredAt: string
  idempotencyKey: string
}

export type AckemCodeReceipt =
  | { type: 'running' }
  | { type: 'waiting_permission'; requestId: string; reason: string }
  | { type: 'done'; ok: true; resultSummary: string }
  | { type: 'done'; ok: false; errorCode: string }
  | { type: 'aborted' }
  | { type: 'disconnected' }
  | { type: 'abort_requested' }
  | { type: 'unverified'; reason: string }

/** Persisted Runtime receipt. Success is not inferred from a bare done.ok flag. */
export interface TrustedHostReceipt {
  hostRunId: string
  state: 'running' | 'requires_action' | 'succeeded' | 'failed' | 'aborted'
  revision: number
  updatedAt: string
  errorCode?: string
}

export type RuntimeReceipt =
  | {
      source: 'plugin'
      runId: string
      extensionId: string
      at: string
      revision: number
      outcome: 'succeeded'
      summary: string
    }
  | {
      source: 'plugin'
      runId: string
      extensionId: string
      at: string
      revision: number
      outcome: 'failed' | 'aborted' | 'unknown'
      summary: string
      errorCode?: string
    }
  | {
      source: 'plugin'
      runId: string
      extensionId: string
      at: string
      revision: number
      outcome: 'stop_failed'
      summary: string
      errorCode: string
    }
  | {
      source: 'ackemcode'
      runId: string
      codeSessionId: string
      hostRunId: string
      event: AckemCodeReceipt
      at: string
      trustedReceipt?: TrustedHostReceipt
    }

export interface ActionRun {
  runId: string
  parentRunId: string | null
  nature: 'plugin' | 'work'
  sessionId: string
  turnId: string
  correlationId: string
  runtimeId: string | null
  targetId: string
  status: ActionStatus
  version: number
  queueOrder: number | null
  updatedAt: string
  completedAt: string | null
  execution: ActionExecutionInput | null
}

export type MemoryTarget =
  | { kind: 'event'; eventId: string }
  | { kind: 'fact'; factId: string }
  | { kind: 'episode'; episodeId: string }
  | { kind: 'topic'; text: string }

export interface CorrectedClaim {
  summary: string
  occurredAt?: string
  scheduledFor?: string
}

export type MemoryControlContextFields = {
  sessionId?: string
  timezone?: string
  turnId?: string | null
}

export type MemoryControlCommand = MemoryControlContextFields &
  (
    | { kind: 'mute'; target: MemoryTarget }
    | { kind: 'correct'; target: MemoryTarget; replacement: CorrectedClaim }
    | { kind: 'forget'; target: MemoryTarget }
    | { kind: 'delete'; target: MemoryTarget; scope: 'memory_only' | 'memory_and_source' }
  )

export type MemoryControlErrorCode =
  | 'source_turn_required'
  | 'source_turn_mismatch'
  | 'projection_failed'

export interface MemoryControlResult {
  ok: boolean
  controlEventId?: string
  invalidated: { facts: number; episodes: number; embeddings: number; associations: number }
  requiresConfirmation?: boolean
  errorCode?: MemoryControlErrorCode
}

export interface MemoryRecoveryReport {
  jobsRecovered: number
  actionsReconciled: number
  actionsUnknown: number
  errors: Array<{ code: string; targetId: string }>
}

export interface DbStatement {
  run: (...params: unknown[]) => unknown
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown
}

/** better-sqlite3 transaction callback handle; stays inside repository/coordinator. */
export interface DbTx {
  prepare: (sql: string) => DbStatement
}

export const IDEMPOTENCY_CONFLICT = 'IDEMPOTENCY_CONFLICT'

export interface EventQuery {
  sessionId?: string
  correlationId?: string
  nature?: MemoryNature
  eventType?: MemoryEventType
  timezone?: string
  localDate?: string
  fromObservedAt?: string
  toObservedAt?: string
  /** Required. Implementations must clamp to 200. */
  limit: number
}

export interface EventRepository {
  append(tx: DbTx, event: MemoryEventMeta, payload: MemoryEventPayload): 'inserted' | 'duplicate'
  getById(eventId: string): MemoryEvent | null
  listByCorrelation(correlationId: string): MemoryEvent[]
  /** All events for one session + correlation (paginated in repository; not session-wide cap). */
  listBySessionAndCorrelation(sessionId: string, correlationId: string): MemoryEvent[]
  query(input: EventQuery): MemoryEvent[]
  redactPayload(tx: DbTx, eventId: string, at: string): void
}

export interface RuntimeSnapshot {
  runId: string
  runtimeId: string
  runtimeRevision: number
  status: Extract<ActionStatus, 'running' | 'waiting_permission' | 'succeeded' | 'failed' | 'aborted'>
  observedAt: string
  errorCode?: string
}

export interface ActionCoordinator {
  create(input: NewActionRun): MemoryRecordResult
  transition(input: ActionTransition): MemoryRecordResult
  cancelQueued(runId: string, expectedVersion: number): MemoryRecordResult
  reorderQueue(sessionId: string, orderedRunIds: string[]): MemoryRecordResult
  promoteNext(sessionId: string): MemoryRecordResult
  getCurrent(runId: string): ActionRun | null
  listOpen(sessionId: string): ActionRun[]
  reconcile(snapshot: RuntimeSnapshot): MemoryRecordResult
}

export interface JobRunReport {
  claimed: number
  succeeded: number
  retried: number
  dead: number
  elapsedMs: number
}

export interface MemoryJobRunner {
  start(): void
  /** Stops claiming; does not wait for in-flight handlers. */
  stop(): void
  runOnce(now: string): Promise<JobRunReport>
  retryDead(jobId: string): void
}

export interface RecallQuery {
  sessionId: string
  text: string
  observedAt: string
  timezone: string
  budgetChars: number
  deadlineMs: number
}

export interface RecallItem {
  id: string
  source: 'action' | 'event' | 'fact' | 'episode' | 'association'
  text: string
  score: number
  confidence: number
  evidenceEventIds: string[]
  occurredAt: string | null
  freshness: 'current' | 'stale' | 'unknown'
}

export interface RecallTrace {
  intent: string[]
  elapsedMs: number
  /** Wall time spent loading candidates (SQLite); does not cancel in-flight SQL when deadlineMs elapses. */
  loadMs?: number
  rankMs?: number
  /** True when query.deadlineMs was exhausted before all pools loaded; partial recall + degradedSources. */
  deadlineExceeded?: boolean
  degradedSources: string[]
  candidateCounts: Record<string, number>
  selected: Array<{ id: string; source: RecallItem['source']; score: number }>
  filtered: Array<{ id: string; reason: string }>
}

export interface RecallBundle {
  currentActions: RecallItem[]
  reliableFacts: RecallItem[]
  relevantEpisodes: RecallItem[]
  temporalContext: RecallItem[]
  uncertain: RecallItem[]
  promptBlock: string
  trace: RecallTrace
}
