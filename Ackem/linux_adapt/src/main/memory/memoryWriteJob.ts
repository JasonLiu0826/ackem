import { createLlmJsonClient } from '../llmClient'
import type { AppSettings } from '../settings'
import type { PendingChatTurn } from '../turnPending'
import { workingMemory } from './workingMemory'
import { FactStore, defaultFactsPath } from './factStore'
import { EpisodicStore, defaultEpisodesPath } from './episodicStore'
import { KnowledgeGraph, defaultKgPath } from './knowledgeGraph'
import { MemoryIngestPipeline } from './ingest'
import { resolveTierBIngestSkip } from './tierBIngestPolicy'
import { finalizeNewFacts, notifyMemoryUpdated } from './finalizeNewFacts'
import { getAssociationIndex } from '../engineCache'
import { createLogger } from '../logger'
import { resolveAdultMemoryPrivacyLevel } from '../prompt/adult-mode'

const log = createLogger('memoryWriteJob')

export type MemoryWriteJobPayload = {
  pending: PendingChatTurn
  dataRoot: string
  assistantText: string
  settings: AppSettings
  /** 同步阶段已写入并 finalize 的事实 id */
  syncFactIds?: string[]
}

const sessionQueues = new Map<string, { chain: Promise<void> }>()

function queueForSession(sessionId: string): { chain: Promise<void> } {
  let q = sessionQueues.get(sessionId)
  if (!q) {
    q = { chain: Promise.resolve() }
    sessionQueues.set(sessionId, q)
  }
  return q
}

async function runMemoryWriteJob(payload: MemoryWriteJobPayload): Promise<void> {
  const { pending: p, dataRoot, assistantText, settings, syncFactIds = [] } = payload

  if (resolveTierBIngestSkip({
    skipIngest: p.skipIngest,
    userMsg: p.userMsg,
    trace: p.trace,
  })) {
    if (p.trace?.l3?.originSkipIngest) {
      log.info('CANON-M-3 skip Tier B ingest', {
        turn: p.turnIndex,
        originState: p.trace.l3.originState,
      })
    }
    notifyMemoryUpdated({
      sessionId: p.sessionId,
      turnIndex: p.turnIndex,
      newFactCount: syncFactIds.length,
    })
    return
  }

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
        lightDraftsFromSync: true,
        adultPrivacyLevel,
      }
    )
  } catch (e) {
    log.error('ingest failed', e)
  }

  const newFactIds = store
    .listActive()
    .filter((f) => f.sourceTurnIndex === p.turnIndex && f.sourceSessionId === p.sessionId)
    .map((f) => f.id)
    .filter((id) => !syncFactIds.includes(id))

  const newFactsMeta = store
    .listActive()
    .filter((f) => newFactIds.includes(f.id))
    .map((f) => ({ id: f.id, subcategory: f.subcategory }))

  if (newFactIds.length > 0) {
    await finalizeNewFacts({
      dataRoot,
      sessionId: p.sessionId,
      turnIndex: p.turnIndex,
      newFactIds,
      facts: newFactsMeta,
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

  const { getCachedEmbeddingProvider } = await import('../engineCache')
  const provider = getCachedEmbeddingProvider(dataRoot)
  if (!provider?.ready()) return

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
      store.updateFact(fact.id, { sensitivity: 'avoid' })
      marked++
    }
  }
  if (marked > 0) log.info('active forget applied', { topic, marked })
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

/** 入队后台记忆写入（不阻塞聊天管线） */
export function enqueueMemoryWrite(payload: MemoryWriteJobPayload): void {
  const sid = payload.pending.sessionId ?? 'default'
  const q = queueForSession(sid)
  q.chain = q.chain
    .then(() => runMemoryWriteJob(payload))
    .catch((e) => log.error('memory write job failed', e))
}

/** Vitest / 集成测试：等待所有 session 队列排空 */
export async function drainAllMemoryWriteJobs(): Promise<void> {
  await Promise.all([...sessionQueues.values()].map((q) => q.chain))
}

export function resetMemoryWriteQueuesForTests(): void {
  sessionQueues.clear()
}
