import { createLlmJsonClient } from '../llmClient'
import type { AppSettings } from '../settings'
import type { Event, TurnTrace } from '../engine/types'
import type { PendingChatTurn } from '../turnPending'
import { workingMemory } from './workingMemory'
import { FactStore, defaultFactsPath } from './factStore'
import { EpisodicStore, defaultEpisodesPath } from './episodicStore'
import { KnowledgeGraph, defaultKgPath } from './knowledgeGraph'
import { MemoryIngestPipeline } from './ingest'
import { finalizeNewFacts } from './finalizeNewFacts'
import { getAssociationIndex } from '../engineCache'
import { createLogger } from '../logger'
import { resolveAdultMemoryPrivacyLevel } from '../prompt/adult-mode'
import { withAgentContext } from '../social/agents/withAgentContext'
import { agentIdFromSessionId } from '../social/agents/agentPaths'
import { channelToInteractionSurface } from './provenance'
import { defaultFullState } from '../engine/state-persistence'
import { defaultPersonalitySlice } from '../personalityPresets'
import type { PersistedTurnStateSnapshot } from './contracts'
import {
  resolveEpisodeEvidenceEventIds,
  sessionTurnHasTrustedWorkTerminal
} from './episodes/episodeEvidence.js'

const log = createLogger('chatTurnIngest')

export type MemoryWriteJobPayload = {
  pending: PendingChatTurn
  dataRoot: string
  assistantText: string
  settings: AppSettings
  /** 同步阶段已写入并 finalize 的事实 id */
  syncFactIds?: string[]
}

type MemoryWriteInnerOptions = {
  /** Persisted derive.chat_turn path must surface ingest failures to the job handler. */
  propagateIngestErrors?: boolean
  onFactsExtracted?: (facts: import('./ingest.js').PrefetchedFact[]) => void | Promise<void>
}

let deriveFactIngestHookForTests: ((info: { factIndex: number; subject: string }) => void) | undefined

export function setDeriveFactIngestHookForTests(
  hook: ((info: { factIndex: number; subject: string }) => void) | undefined
): void {
  deriveFactIngestHookForTests = hook
}

async function runMemoryWriteJobInner(
  payload: MemoryWriteJobPayload,
  innerOpts?: MemoryWriteInnerOptions
): Promise<void> {
  const { pending: p, dataRoot, assistantText, settings, syncFactIds = [] } = payload

  const sid = p.sessionId ?? 'default'
  const recentExchanges = workingMemory.getRecent(sid)
  const exchangesForEpisode = recentExchanges
    .filter((ex) => ex.assistantText)
    .map((ex) => ({ user: ex.userText, assistant: ex.assistantText }))

  const llm = createLlmJsonClient(settings)
  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const epStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
  const kg = new KnowledgeGraph(defaultKgPath(dataRoot))
  kg.load()
  const assocIndex = getAssociationIndex(dataRoot)
  const { getCachedEmbeddingProvider } = await import('../engineCache')
  const provider = getCachedEmbeddingProvider(dataRoot)
  const embedCache = provider?.ready() ? store._embeddingCache : undefined

  const ingest = new MemoryIngestPipeline()
  try {
    const adultPrivacyLevel = resolveAdultMemoryPrivacyLevel({
      adultMode: Boolean(settings.adultContentMode && settings.ageConfirmed18),
      eventType: p.event.type,
      adultSubtype: p.event.adultSubtype,
      userMsg: p.userMsg,
      assistantText
    })
    const ledgerTurnId = p.turnId
    const episodeEvidenceEventIds = ledgerTurnId
      ? resolveEpisodeEvidenceEventIds(dataRoot, sid, ledgerTurnId)
      : []
    const terminalWorkSucceeded = ledgerTurnId
      ? sessionTurnHasTrustedWorkTerminal(dataRoot, sid, ledgerTurnId)
      : false
    await ingest.afterTurnAsync(
      dataRoot,
      p.sessionId,
      p.turnIndex,
      p.userMsg,
      assistantText,
      'zh',
      llm,
      p.newState.relationship,
      p.newState.emotion,
      store,
      p.newState.counters.totalTurns,
      epStore,
      exchangesForEpisode,
      kg,
      assocIndex,
      embedCache,
      {
        skipLlmExtraction: p.skipLlmExtraction,
        prefetchedFacts: p.prefetchedFacts,
        onFactsExtracted: innerOpts?.onFactsExtracted,
        lightDraftsFromSync: true,
        adultPrivacyLevel,
        episodeEvidenceEventIds,
        terminalWorkSucceeded,
      }
    )
  } catch (e) {
    if (innerOpts?.propagateIngestErrors) throw e
    log.error('ingest failed', e)
  }

  store.flush()

  const newFactIds = store
    .listActive()
    .filter((f) => f.sourceTurnIndex === p.turnIndex && f.sourceSessionId === p.sessionId)
    .map((f) => f.id)
    .filter((id) => !syncFactIds.includes(id))

  const newFactsMeta = store
    .listActive()
    .filter((f) => newFactIds.includes(f.id))
    .map((f) => ({ id: f.id, subcategory: f.subcategory }))

  const { changeSetFromEntries } = await import('../db/repos/factIndexPendingRepo.js')
  const pendingEntries = store.takePendingIndexEntries()
  const indexChangeSet = changeSetFromEntries(pendingEntries)
  if (newFactIds.length > 0 || indexChangeSet.updated.length > 0 || indexChangeSet.retired.length > 0) {
    await finalizeNewFacts({
      dataRoot,
      sessionId: p.sessionId,
      turnIndex: p.turnIndex,
      newFactIds,
      facts: newFactsMeta,
      changeSet: indexChangeSet,
      pendingEntries,
      store,
    })
  }

  try {
    await applyActiveForgetIfNeeded(p.userMsg, dataRoot, store)
  } catch (e) {
    log.warn('active forget failed', { error: String(e) })
  }

  try {
    await applyEmergenceAntiRepetition(p, assistantText, dataRoot)
  } catch (e) {
    log.warn('emergence anti-repetition failed', { error: String(e) })
  }
}

const FORGET_TRIGGERS = [
  '别提了', '不想聊这个', '过去了', '翻篇了', '别再说了',
  '忘了这件事', '当没说过', '跳过这个话题', '换个话题',
  '不要再问了', '别再提', '已经过去了',
]

async function applyActiveForgetIfNeeded(
  userMsg: string,
  dataRoot: string,
  store: FactStore
): Promise<void> {
  const triggered = FORGET_TRIGGERS.some((t) => userMsg.includes(t))
  if (!triggered) return

  const { executeMemoryControl } = await import('./governance/executeControl.js')
  const { getClock } = await import('./temporal/clock.js')
  const { loadSettings } = await import('../settings.js')
  const sessionId = 'default'
  const at = getClock().now().toISOString()
  const tz = loadSettings().timezone ?? 'Asia/Shanghai'

  const matchFact = (fact: import('./semantic/types.js').MemoryFact): boolean => {
    if (fact.triggers.some((t) => t.length >= 2 && userMsg.includes(t))) return true
    return tokenizeRecallHint(userMsg).some((tok) => fact.summary.includes(tok) && tok.length >= 2)
  }

  const { getCachedEmbeddingProvider } = await import('../engineCache')
  const provider = getCachedEmbeddingProvider(dataRoot)
  if (!provider?.ready()) {
    for (const fact of store.listActive()) {
      if (!matchFact(fact)) continue
      executeMemoryControl(
        dataRoot,
        { sessionId, timezone: tz, observedAt: at },
        { kind: 'forget', target: { kind: 'fact', factId: fact.id }, sessionId }
      )
    }
    store.load()
    return
  }

  const stopwords = new Set(['别', '再', '提', '了', '我', '的', '不', '想', '聊', '这个', '那个', '已经', '过', '去'])
  const topic = userMsg
    .split(/[，。！？、；：\s]+/u)
    .filter((w) => w.length >= 2 && !stopwords.has(w) && !FORGET_TRIGGERS.includes(w))
    .pop()
  if (!topic) return

  const topicEmbed = await provider.embed(topic)
  const allFacts = store.listActive()
  let marked = 0
  for (const fact of allFacts) {
    if (fact.sensitivity === 'avoid') continue
    const factEmbed = store._embeddingCache?.get(fact.id)
    if (!factEmbed) continue
    const { cosineSimilarity } = await import('./factEmbeddingCache')
    const cosine = cosineSimilarity(topicEmbed, factEmbed)
    if (cosine > 0.7) {
      executeMemoryControl(
        dataRoot,
        { sessionId, timezone: tz, observedAt: at },
        { kind: 'forget', target: { kind: 'fact', factId: fact.id }, sessionId }
      )
      marked++
    }
  }
  if (marked > 0) {
    store.load()
    log.info('active forget applied', { topic, marked })
  }
}

function tokenizeRecallHint(text: string): string[] {
  return text.split(/[，。！？、；：\s]+/u).filter((w) => w.length >= 2)
}

async function applyEmergenceAntiRepetition(
  p: MemoryWriteJobPayload['pending'],
  reply: string,
  dataRoot: string
): Promise<void> {
  const active = p.newState.emergencePersistence?.active
  if (!active || active.phase !== 'sustained' || active.hasExpressed) return

  const { getCachedEmbeddingProvider } = await import('../engineCache')
  const provider = getCachedEmbeddingProvider(dataRoot)
  if (!provider?.ready()) {
    const keywordMap: Record<string, RegExp[]> = {
      timeReflection: [/好像.*一阵子|认识.*好久|不知不觉|走了.*很长|时间.*过|已经.*这么久/],
    }
    const patterns = keywordMap[active.type ?? ''] ?? []
    if (patterns.some((pat) => pat.test(reply))) {
      active.hasExpressed = true
    }
    return
  }

  const flavorEmbed = active.context?.flavorEmbed as number[] | undefined
  if (!flavorEmbed || flavorEmbed.length === 0) return

  const replyEmbed = await provider.embed(reply.slice(0, 500))
  const { cosineSimilarity } = await import('./factEmbeddingCache')
  const sim = cosineSimilarity(replyEmbed, flavorEmbed)

  if (sim > 0.65) {
    active.hasExpressed = true
  }
}

/**
 * Run Tier-B ingest from ledger + persisted derive context (Task 9).
 * Settings are loaded from disk; no secrets are stored on memory_jobs.
 */
function resolvePersistedTurnState(args: {
  settings: AppSettings
  stateSnapshot?: PersistedTurnStateSnapshot
}): import('../engine/types.js').FullState {
  const base = defaultFullState(defaultPersonalitySlice(args.settings))
  const snap = args.stateSnapshot
  if (!snap) return base
  return {
    ...base,
    relationship: snap.relationship as unknown as typeof base.relationship,
    emotion: snap.emotion as unknown as typeof base.emotion,
    counters: { ...base.counters, totalTurns: snap.totalTurns }
  }
}

async function runPersistedIngestPayload(
  args: {
    dataRoot: string
    sessionId: string
    turnId?: string | null
    turnIndex: number
    userMsg: string
    assistantText: string
    settings: AppSettings
    skipIngest?: boolean
    skipLlmExtraction?: boolean
    surface?: 'desktop' | 'weixin'
    ownerAgentId?: string
    syncFactIds?: string[]
    engineEvent: Event
    prefetchedFacts?: import('./ingest.js').PrefetchedFact[]
    onFactsExtracted?: (facts: import('./ingest.js').PrefetchedFact[]) => void | Promise<void>
    stateSnapshot?: PersistedTurnStateSnapshot
  },
  innerOpts: MemoryWriteInnerOptions
): Promise<void> {
  const state = resolvePersistedTurnState({
    settings: args.settings,
    stateSnapshot: args.stateSnapshot
  })
  const pending: PendingChatTurn = {
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    turnId: args.turnId ?? undefined,
    turnIndex: args.turnIndex,
    userMsg: args.userMsg,
    newState: state,
    skipIngest: args.skipIngest ?? false,
    trace: { l3: { originSkipIngest: Boolean(args.skipIngest), originState: state } } as unknown as TurnTrace,
    event: args.engineEvent,
    surface: args.surface ?? 'desktop',
    ownerAgentId: args.ownerAgentId,
    skipLlmExtraction: args.skipLlmExtraction ?? Boolean(args.prefetchedFacts?.length),
    prefetchedFacts: args.prefetchedFacts
  }
  const ownerAgentId = pending.ownerAgentId ?? agentIdFromSessionId(args.sessionId)
  const interactionSurface = channelToInteractionSurface(
    pending.surface ?? 'desktop',
    pending.interactionSurface,
    ownerAgentId
  )
  await withAgentContext(
    ownerAgentId,
    () =>
      runMemoryWriteJobInner(
        {
          pending,
          dataRoot: args.dataRoot,
          assistantText: args.assistantText,
          settings: args.settings,
          syncFactIds: args.syncFactIds ?? []
        },
        { ...innerOpts, onFactsExtracted: args.onFactsExtracted }
      ),
    { interactionSurface }
  )
}

export async function executePersistedChatIngest(args: {
  dataRoot: string
  sessionId: string
  turnId: string
  turnIndex: number
  userMsg: string
  assistantText: string
  settings: AppSettings
  skipIngest?: boolean
  skipLlmExtraction?: boolean
  surface?: 'desktop' | 'weixin'
  ownerAgentId?: string
  syncFactIds?: string[]
  engineEvent: Event
  prefetchedFacts?: import('./ingest.js').PrefetchedFact[]
  onFactsExtracted?: (facts: import('./ingest.js').PrefetchedFact[]) => void | Promise<void>
  stateSnapshot?: PersistedTurnStateSnapshot
}): Promise<void> {
  await runPersistedIngestPayload(args, { propagateIngestErrors: true })
}

/** One prefetched fact per call; used for per-effect idempotency on derive.chat_turn. */
export async function executePersistedChatIngestSingleFact(
  args: Parameters<typeof executePersistedChatIngest>[0] & {
    fact: import('./ingest.js').PrefetchedFact
    factIndex: number
  }
): Promise<void> {
  deriveFactIngestHookForTests?.({ factIndex: args.factIndex, subject: args.fact.subject })
  await runPersistedIngestPayload(
    {
      ...args,
      prefetchedFacts: [args.fact],
      skipLlmExtraction: true
    },
    { propagateIngestErrors: true }
  )
}

