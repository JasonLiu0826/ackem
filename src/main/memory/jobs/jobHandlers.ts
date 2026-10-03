import { createHash, randomUUID } from 'node:crypto'
import type { Event, EventType } from '../../engine/types.js'
import { getDatabase } from '../../db/database.js'
import { loadSettings } from '../../settings.js'
import { createActionCoordinator } from '../actions/actionCoordinator.js'
import { ActionRepository } from '../actions/actionRepository.js'
import type { MemoryEventMeta, PersistedL0Event, RuntimeSnapshot, TrustedHostReceipt } from '../contracts.js'
import { snapshotStatusForReceipt } from '../adapters/ackemCodeMemoryAdapter.js'
import {
  JOB_TYPE_ACTION_RECONCILE,
  JOB_TYPE_DERIVE_ACTION_TERMINAL,
  JOB_TYPE_DERIVE_CHAT_TURN
} from '../derivation/derivationVersion.js'
import { JOB_TYPE_ROUTE_MINE } from '../../route/miningVersion.js'
import { EventRepository } from '../ledger/eventRepository.js'
import {
  executePersistedChatIngest,
  executePersistedChatIngestSingleFact
} from '../chatTurnIngest.js'
import type { PersistedTurnStateSnapshot } from '../contracts.js'
import { applyDerivedFacts, LOST_LEASE_DURING_DERIVE } from '../derivation/applyDerivedFacts.js'
import { deriveEventBatch } from '../derivation/deriveEventBatch.js'
import { priorPluginSuccessCountsForSession } from '../derivation/pluginHistory.js'
import { assertPrefetchedFactsAllowed, prefetchedFactsToLlmDrafts } from '../derivation/validatePrefetchedFacts.js'
import type { PrefetchedFact } from '../ingest.js'
import { JOB_EFFECT_APPLIED, factEffectKey } from './jobEffectKeys.js'
import type { MemoryJobRow } from './jobRepository.js'
import { JobRepository } from './jobRepository.js'
import { episodeExistsForTerminalEvent } from '../episodes/episodeRepository.js'
import { tryCreateEpisodeFromWorkTerminal } from '../episodes/workEpisodeDerivation.js'
import type { MemoryEvent } from '../contracts.js'
import { executeRouteMining } from '../../route/mineWindow.js'

export type JobHandlerDeps = {
  dataRoot: string
  nowIso: string
  leaseGeneration: number
  loadHostReceipt?: (runtimeId: string) => Promise<TrustedHostReceipt | undefined>
}

export type JobHandlerResult = { ok: true } | { ok: false; retryable: boolean; message: string }

function persistedToEngineEvent(l0: PersistedL0Event): Event {
  return {
    type: l0.type as EventType,
    intensity: l0.intensity,
    sincerity: l0.sincerity,
    isExtremeRedline: l0.isExtremeRedline,
    isAdultContent: l0.isAdultContent,
    adultSubtype: l0.adultSubtype
  }
}

function leaseOwnerForJob(job: MemoryJobRow): string {
  return job.lease_owner ?? ''
}

function recordJobEffect(
  jobs: JobRepository,
  job: MemoryJobRow,
  deps: JobHandlerDeps,
  effectKey: string
): 'inserted' | 'duplicate' | 'lost_lease' {
  return jobs.recordEffectIfLeaseValid(
    job.job_id,
    leaseOwnerForJob(job),
    deps.leaseGeneration,
    job.source_event_id,
    job.job_type,
    job.derivation_version,
    effectKey,
    deps.nowIso
  )
}

function extractionCheckpointKey(job: MemoryJobRow): string {
  return `derive.facts:${job.source_event_id}:${job.derivation_version}`
}

function relatedCorrelationEvents(
  events: EventRepository,
  sessionId: string,
  correlationId: string
) {
  return events.listBySessionAndCorrelation(sessionId, correlationId)
}

function extractionFactsFromEvents(related: MemoryEvent[]): PrefetchedFact[] {
  const out: PrefetchedFact[] = []
  for (const ev of related) {
    if (ev.meta.eventType !== 'chat.facts_extracted') continue
    const raw = ev.payload.content.facts
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const fact = item as PrefetchedFact
      if (typeof fact.summary === 'string' && typeof fact.subject === 'string') out.push(fact)
    }
  }
  return out
}

function userEvidenceEventIdFrom(related: MemoryEvent[]): string | undefined {
  const preferred = related.find(
    (e) =>
      e.meta.eventType === 'chat.user_message' &&
      (e.meta.evidenceKind === 'user_assertion' || e.meta.evidenceKind === 'user_correction')
  )
  return (preferred ?? related.find((e) => e.meta.eventType === 'chat.user_message'))?.meta.eventId
}

function deriveNatureBatch(
  events: EventRepository,
  db: NonNullable<ReturnType<typeof getDatabase>>,
  sessionId: string,
  correlationId: string,
  extraFacts: PrefetchedFact[] = []
) {
  const related = relatedCorrelationEvents(events, sessionId, correlationId)
  const batchIds = new Set(related.map((e) => e.meta.eventId))
  const prior = priorPluginSuccessCountsForSession(db, sessionId, batchIds)
  const userEvidenceEventId = userEvidenceEventIdFrom(related)
  const sourced = [...extractionFactsFromEvents(related), ...extraFacts]
  const llmDrafts = userEvidenceEventId && sourced.length > 0
    ? prefetchedFactsToLlmDrafts(sourced, userEvidenceEventId, related).filter(
        (d) => d.evidenceEventIds.length > 0 && d.domain && d.subcategory && d.subject && d.summary
      )
    : []
  return deriveEventBatch({
    events: related,
    plugin: { priorSuccessCountByTarget: prior },
    llmDrafts: llmDrafts.length > 0 ? llmDrafts : undefined
  })
}

function maybeCreateWorkTerminalEpisode(
  deps: JobHandlerDeps,
  sessionId: string,
  source: MemoryEvent,
  runStatus: string
): { ok: boolean; message?: string } {
  if (runStatus !== 'succeeded' || source.meta.evidenceKind !== 'runtime_receipt') return { ok: true }
  if (episodeExistsForTerminalEvent(deps.dataRoot, source.meta.eventId)) return { ok: true }
  try {
    tryCreateEpisodeFromWorkTerminal({
      dataRoot: deps.dataRoot,
      sessionId,
      turnId: source.meta.turnId,
      terminalEventId: source.meta.eventId,
      runSummary: typeof source.payload.summary === 'string' ? source.payload.summary : '工作任务完成'
    })
    return { ok: true }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, message }
  }
}

async function resumeWorkTerminalEpisodeIfApplied(
  job: MemoryJobRow,
  deps: JobHandlerDeps,
  db: NonNullable<ReturnType<typeof getDatabase>>
): Promise<JobHandlerResult> {
  const events = new EventRepository(db)
  const source = events.getById(job.source_event_id)
  if (!source) return { ok: false, retryable: false, message: 'source event missing' }
  const runId = typeof source.payload.content.runId === 'string' ? source.payload.content.runId : null
  if (!runId) return { ok: false, retryable: false, message: 'runId missing on terminal event' }
  const coordinator = createActionCoordinator(deps.dataRoot)
  const run = coordinator.getCurrent(runId)
  if (!run) return { ok: false, retryable: false, message: `unknown run: ${runId}` }
  const ep = maybeCreateWorkTerminalEpisode(deps, job.session_id, source, run.status)
  if (!ep.ok) return { ok: false, retryable: true, message: ep.message ?? 'episode_derivation_pending' }
  return { ok: true }
}

export async function dispatchJobHandler(job: MemoryJobRow, deps: JobHandlerDeps): Promise<JobHandlerResult> {
  const db = getDatabase(deps.dataRoot)
  if (!db) return { ok: false, retryable: true, message: 'SQLite unavailable' }
  const jobs = new JobRepository(db)
  if (jobs.hasEffect(job.source_event_id, job.job_type, job.derivation_version, JOB_EFFECT_APPLIED)) {
    if (job.job_type === JOB_TYPE_DERIVE_ACTION_TERMINAL) {
      return resumeWorkTerminalEpisodeIfApplied(job, deps, db)
    }
    return { ok: true }
  }
  switch (job.job_type) {
    case JOB_TYPE_DERIVE_CHAT_TURN:
      return handleDeriveChatTurn(job, deps, db, jobs)
    case JOB_TYPE_DERIVE_ACTION_TERMINAL:
      return handleDeriveActionTerminal(job, deps, db, jobs)
    case JOB_TYPE_ACTION_RECONCILE:
      return handleActionReconcile(job, deps, db, jobs)
    case JOB_TYPE_ROUTE_MINE: {
      // Route v2 阶段 2 (Codex D3): 窄接口 — the memory handler only bridges
      // the lease/effect machinery; route semantics live in route/mineWindow.
      const mine = await executeRouteMining(db, job.source_event_id, deps.nowIso)
      if (!mine.ok) return { ok: false, retryable: true, message: mine.error ?? 'route mining failed' }
      const effect = recordJobEffect(jobs, job, deps, JOB_EFFECT_APPLIED)
      if (effect === 'lost_lease') return { ok: false, retryable: false, message: 'lease lost during route mining' }
      return { ok: true }
    }
    default:
      return { ok: false, retryable: false, message: `unsupported job_type: ${job.job_type}` }
  }
}

async function handleDeriveChatTurn(
  job: MemoryJobRow,
  deps: JobHandlerDeps,
  db: NonNullable<ReturnType<typeof getDatabase>>,
  jobs: JobRepository
): Promise<JobHandlerResult> {
  const events = new EventRepository(db)
  const source = events.getById(job.source_event_id)
  if (!source) return { ok: false, retryable: false, message: 'source event missing' }

  const turnId =
    source.meta.turnId ??
    (typeof source.payload.content.turnId === 'string' ? source.payload.content.turnId : null)
  if (!turnId) return { ok: false, retryable: false, message: 'turnId missing on source event' }

  const started = events.findByIdempotencyKey(`turn.started:${turnId}`)
  if (!started) return { ok: false, retryable: true, message: 'turn.started missing' }

  const ctx = started.payload.content
  const sessionId = typeof ctx.sessionId === 'string' ? ctx.sessionId : job.session_id
  const userMsg = typeof ctx.userText === 'string' ? ctx.userText : ''
  const deriveEv = events.findByIdempotencyKey(`turn.derive_context:${turnId}`)
  const derive = deriveEv?.payload.content ?? {}
  const turnIndex = typeof derive.turnIndex === 'number' ? derive.turnIndex : 0
  const skipIngest = derive.skipIngest === true
  const skipLlmExtraction = derive.skipLlmExtraction === true
  const ingestSurface: 'desktop' | 'weixin' =
    derive.surface === 'weixin' ? 'weixin' : 'desktop'
  const l0Raw = derive.l0Event as PersistedL0Event | undefined
  if (!l0Raw || typeof l0Raw.type !== 'string') {
    return { ok: false, retryable: false, message: 'derive context missing l0Event' }
  }
  const engineEvent = persistedToEngineEvent(l0Raw)

  const finalized = events.findByIdempotencyKey(`turn.finalized:${turnId}`)
  const assistantEv = events.query({
    sessionId,
    limit: 50
  }).find((e) => e.meta.eventType === 'chat.assistant_reply' && e.meta.turnId === turnId)
  const assistantText =
    typeof finalized?.payload.content.assistantText === 'string'
      ? finalized.payload.content.assistantText
      : typeof assistantEv?.payload.content.assistantText === 'string'
        ? assistantEv.payload.content.assistantText
        : ''

  const settings = loadSettings()
  const stateSnapshot = derive.stateSnapshot as PersistedTurnStateSnapshot | undefined
  const prefetched = Array.isArray(derive.prefetchedFacts)
    ? (derive.prefetchedFacts as Array<{
        domain: string
        subcategory: string
        subject: string
        summary: string
      }>)
    : []
  const checkpoint = events.findByIdempotencyKey(extractionCheckpointKey(job))
  const checkpointFacts = checkpoint?.payload.content.facts
  if (checkpoint && !Array.isArray(checkpointFacts)) {
    return { ok: false, retryable: false, message: 'extraction checkpoint missing facts' }
  }
  const frozenFacts = checkpoint ? checkpointFacts as typeof prefetched : prefetched

  const ingestBase = {
    dataRoot: deps.dataRoot,
    sessionId,
    turnId,
    turnIndex,
    userMsg,
    assistantText,
    settings,
    skipIngest,
    surface: ingestSurface,
    ownerAgentId: typeof derive.ownerAgentId === 'string' ? derive.ownerAgentId : undefined,
    engineEvent,
    stateSnapshot
  }

  const relatedForValidation = relatedCorrelationEvents(events, sessionId, source.meta.correlationId)
  const userEvidenceEventId = started.meta.eventId

  try {
    if (frozenFacts.length > 0) {
      assertPrefetchedFactsAllowed(frozenFacts, relatedForValidation, userEvidenceEventId)
      for (let i = 0; i < frozenFacts.length; i++) {
        const fact = frozenFacts[i]!
        const effectKey = factEffectKey(fact)
        if (jobs.hasEffect(job.source_event_id, job.job_type, job.derivation_version, effectKey)) {
          continue
        }
        await executePersistedChatIngestSingleFact({
          ...ingestBase,
          skipLlmExtraction: true,
          fact,
          factIndex: i
        })
        const recorded = recordJobEffect(jobs, job, deps, effectKey)
        if (recorded === 'lost_lease') {
          return { ok: false, retryable: true, message: 'lost lease before fact effect' }
        }
      }
    } else if (!skipIngest && checkpoint) {
      await executePersistedChatIngest({ ...ingestBase, skipLlmExtraction: true })
    } else if (!skipIngest) {
      await executePersistedChatIngest({
        ...ingestBase,
        skipLlmExtraction,
        onFactsExtracted: (facts) => {
          assertPrefetchedFactsAllowed(facts, relatedForValidation, userEvidenceEventId)
          const content = { turnId, sourceEventId: job.source_event_id,
            derivationVersion: job.derivation_version, facts }
          const eventId = randomUUID()
          const meta: MemoryEventMeta = {
            eventId, schemaVersion: 1, sessionId, turnId,
            correlationId: source.meta.correlationId,
            causationEventId: job.source_event_id,
            nature: 'chat', eventType: 'chat.facts_extracted',
            surface: started.meta.surface, actor: 'ackem', status: null,
            evidenceKind: 'llm_inference', confidence: 0.7,
            observedAt: deps.nowIso, occurredAt: deps.nowIso,
            scheduledFor: null, completedAt: null,
            timezone: started.meta.timezone, localDate: started.meta.localDate,
            idempotencyKey: extractionCheckpointKey(job)
          }
          const write = jobs.withValidLease(job.job_id, leaseOwnerForJob(job),
            deps.leaseGeneration, (tx) => events.append(tx, meta, {
              eventId, summary: 'turn fact extraction checkpoint', content,
              contentHash: createHash('sha256').update(JSON.stringify(content)).digest('hex').slice(0, 32),
              redactedAt: null
            }))
          if (!write.ok) throw new Error('lost lease before extraction checkpoint')
        }
      })
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, retryable: true, message }
  }

  const relatedForNature = relatedCorrelationEvents(events, sessionId, source.meta.correlationId)
  const chatEvidenceIds = new Set(
    relatedForNature.filter((e) => e.meta.nature === 'chat').map((e) => e.meta.eventId)
  )
  const natureBatch = deriveNatureBatch(events, db, sessionId, source.meta.correlationId, frozenFacts)
  if (natureBatch.llmRejected) {
    return { ok: false, retryable: true, message: natureBatch.llmRejected }
  }
  const chatNatureCandidates = natureBatch.candidates.filter((c) =>
    c.evidenceEventIds.every((id) => chatEvidenceIds.has(id))
  )
  if (chatNatureCandidates.length > 0) {
    try {
      await applyDerivedFacts(deps.dataRoot, chatNatureCandidates, {
        sessionId,
        turnIndex,
        lease: {
          jobs,
          jobId: job.job_id,
          leaseOwner: leaseOwnerForJob(job),
          leaseGeneration: deps.leaseGeneration
        }
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, retryable: true, message: message === LOST_LEASE_DURING_DERIVE ? message : message }
    }
  }

  const applied = recordJobEffect(jobs, job, deps, JOB_EFFECT_APPLIED)
  if (applied === 'lost_lease') {
    return { ok: false, retryable: true, message: 'lost lease before effect' }
  }
  return { ok: true }
}

async function handleDeriveActionTerminal(
  job: MemoryJobRow,
  deps: JobHandlerDeps,
  db: NonNullable<ReturnType<typeof getDatabase>>,
  jobs: JobRepository
): Promise<JobHandlerResult> {
  const events = new EventRepository(db)
  const source = events.getById(job.source_event_id)
  if (!source) return { ok: false, retryable: false, message: 'source event missing' }
  const runId = typeof source.payload.content.runId === 'string' ? source.payload.content.runId : null
  if (!runId) return { ok: false, retryable: false, message: 'runId missing on terminal event' }
  const coordinator = createActionCoordinator(deps.dataRoot)
  const run = coordinator.getCurrent(runId)
  if (!run) return { ok: false, retryable: false, message: `unknown run: ${runId}` }
  if (!['succeeded', 'failed', 'aborted'].includes(run.status)) {
    return { ok: false, retryable: true, message: `run not terminal: ${run.status}` }
  }
  const batch = deriveNatureBatch(events, db, job.session_id, source.meta.correlationId)
  if (batch.llmRejected) {
    return { ok: false, retryable: true, message: batch.llmRejected }
  }
  const leaseOwner = leaseOwnerForJob(job)
  const leaseCtx = {
    jobs,
    jobId: job.job_id,
    leaseOwner,
    leaseGeneration: deps.leaseGeneration
  }
  if (batch.candidates.length > 0) {
    try {
      await applyDerivedFacts(deps.dataRoot, batch.candidates, {
        sessionId: job.session_id,
        lease: leaseCtx,
        finalizeInSameLease: (tx) =>
          jobs.recordEffect(
            tx,
            job.source_event_id,
            job.job_type,
            job.derivation_version,
            JOB_EFFECT_APPLIED,
            deps.nowIso
          )
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { ok: false, retryable: true, message }
    }
    const ep = maybeCreateWorkTerminalEpisode(deps, job.session_id, source, run.status)
    if (!ep.ok) return { ok: false, retryable: true, message: ep.message ?? 'episode_derivation_pending' }
    return { ok: true }
  }

  const applied = recordJobEffect(jobs, job, deps, JOB_EFFECT_APPLIED)
  if (applied === 'lost_lease') {
    return { ok: false, retryable: true, message: 'lost lease before effect' }
  }
  const ep = maybeCreateWorkTerminalEpisode(deps, job.session_id, source, run.status)
  if (!ep.ok) return { ok: false, retryable: true, message: ep.message ?? 'episode_derivation_pending' }
  return { ok: true }
}

async function handleActionReconcile(
  job: MemoryJobRow,
  deps: JobHandlerDeps,
  db: NonNullable<ReturnType<typeof getDatabase>>,
  jobs: JobRepository
): Promise<JobHandlerResult> {
  const events = new EventRepository(db)
  const source = events.getById(job.source_event_id)
  if (!source) return { ok: false, retryable: false, message: 'source event missing' }
  const runId = typeof source.payload.content.runId === 'string' ? source.payload.content.runId : null
  if (!runId) return { ok: false, retryable: false, message: 'runId missing on reconcile event' }

  const actions = new ActionRepository(db)
  const row = actions.getRow(runId)
  if (!row) return { ok: false, retryable: false, message: `unknown run: ${runId}` }

  if (row.nature !== 'work' || !row.runtime_id) {
    return { ok: false, retryable: false, message: 'reconcile job requires work run with runtime_id' }
  }

  const loadReceipt = deps.loadHostReceipt
  if (!loadReceipt) {
    return { ok: false, retryable: true, message: 'runtime receipt loader unavailable' }
  }

  let receipt: TrustedHostReceipt | undefined
  try {
    receipt = await loadReceipt(row.runtime_id)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { ok: false, retryable: true, message }
  }

  if (!receipt || receipt.hostRunId !== runId) {
    return { ok: false, retryable: true, message: 'no matching runtime receipt' }
  }

  const status = snapshotStatusForReceipt(receipt.state)
  if (!status) {
    return { ok: false, retryable: true, message: 'receipt not reconcilable' }
  }

  const snapshot: RuntimeSnapshot = {
    runId,
    runtimeId: row.runtime_id,
    runtimeRevision: receipt.revision,
    status,
    observedAt: receipt.updatedAt,
    errorCode: receipt.errorCode
  }

  const coordinator = createActionCoordinator(deps.dataRoot)
  const result = coordinator.reconcile(snapshot)
  if (!result.ok) {
    const retryable = result.code === 'stale_runtime_snapshot' || result.code === 'missing_trusted_receipt'
    return { ok: false, retryable, message: result.message }
  }

  const applied = recordJobEffect(jobs, job, deps, JOB_EFFECT_APPLIED)
  if (applied === 'lost_lease') {
    return { ok: false, retryable: true, message: 'lost lease before effect' }
  }
  return { ok: true }
}
