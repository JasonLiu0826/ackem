import { WORKING_MEMORY_CHAR_BUDGET } from './AckemParams'
import { getCachedEmbeddingProvider, ensureFactEmbeddingsReady, getOrCreateEngineCache } from '../engineCache'
import { getCachedTemporalEmbeddings } from '../embedding/preLlmWarmup'
import { computeConversationEmbed } from '../embedding/scoring'
import { detectTemporalSignal } from '../memory/temporalSignalExtractor'
import { computeRelevanceHint } from '../memory/scheduler'
import { getTimeContext } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'
import type { FullState } from './types'
import type { FactStore } from '../memory/factStore'
import type { MemoryRetriever, RetrievalResult } from '../memory/retriever'
import type { TemporalSemanticSignal } from '../memory/temporalSignalExtractor'
import type { IndexSnapshot } from '../indexer'

export type PreparedTurnContext = {
  queryEmbed?: number[]
  conversationEmbed?: number[]
  msgTemporalSemanticSignal: TemporalSemanticSignal | null
  temporalLabelEmbed?: number[]
  retrieval: RetrievalResult
  embedMs: number
  retrieveMs: number
}

export async function prepareTurnContext(args: {
  msg: string
  state: FullState
  factStore: FactStore
  retriever: MemoryRetriever
  sessionId: string
  turnIndex: number
  memoryBudgetChars: number
  recentUserMessages?: string[]
  dataRoot: string
  index?: IndexSnapshot | null
  adultMode?: boolean
}): Promise<PreparedTurnContext> {
  const {
    msg,
    state,
    factStore,
    retriever,
    sessionId,
    turnIndex,
    memoryBudgetChars,
    recentUserMessages = [],
    dataRoot,
    index = null,
    adultMode = false,
  } = args

  const retrievalBudget = Math.max(1500, memoryBudgetChars - WORKING_MEMORY_CHAR_BUDGET)
  const relevanceHint = computeRelevanceHint(state.relationship, state.emotion, turnIndex)
  const gapHours = (Date.now() - new Date(state.lastActive).getTime()) / 3600000
  const nowDate = new Date()
  const temporalCtx = {
    timeOfDay: getTimeContext().timeOfDay,
    isWeekend: [0, 6].includes(nowDate.getDay()),
    month: nowDate.getMonth() + 1,
    season: (() => {
      const m = nowDate.getMonth() + 1
      return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
    })(),
    hour: nowDate.getHours(),
    weekday: nowDate.getDay(),
    gapHours,
    localDate: nowDate.toISOString().slice(0, 10),
  }

  let embeddingProvider = getCachedEmbeddingProvider(dataRoot)
  if (!embeddingProvider?.ready() && index) {
    const entry = getOrCreateEngineCache(dataRoot, index)
    await ensureFactEmbeddingsReady(entry)
    embeddingProvider = getCachedEmbeddingProvider(dataRoot)
  }

  let queryEmbed: number[] | undefined
  let conversationEmbed: number[] | undefined
  let msgTemporalSemanticSignal: TemporalSemanticSignal | null = null
  let temporalLabelEmbed: number[] | undefined
  const tEmbed = Date.now()

  if (embeddingProvider?.ready()) {
    try {
      const recentMsgs = recentUserMessages.slice(-3).filter(Boolean)
      const [qEmb, convEmb] = await Promise.all([
        embeddingProvider.embed(msg),
        recentMsgs.length > 0
          ? computeConversationEmbed(recentMsgs, embeddingProvider)
          : Promise.resolve(undefined),
      ])
      queryEmbed = qEmb
      conversationEmbed = convEmb

      const temporalEmbeddings = await getCachedTemporalEmbeddings(embeddingProvider)
      msgTemporalSemanticSignal = detectTemporalSignal(qEmb, temporalEmbeddings)
      if (msgTemporalSemanticSignal?.label) {
        temporalLabelEmbed = temporalEmbeddings.get(msgTemporalSemanticSignal.label)
      }
    } catch {
      /* Embedding 澶辫触涓嶅奖鍝嶄富娴佺▼ */
    }
  }
  const embedMs = Date.now() - tEmbed

  const tRetrieve = Date.now()
  const retrieval = await retriever.retrieve(
    msg,
    relevanceHint,
    retrievalBudget,
    state.emotion.aff / 100,
    state.emotion.aff,
    temporalCtx,
    queryEmbed,
    msgTemporalSemanticSignal,
    sessionId,
    temporalLabelEmbed,
    adultMode
  )
  const retrieveMs = Date.now() - tRetrieve

  return {
    queryEmbed,
    conversationEmbed,
    msgTemporalSemanticSignal,
    temporalLabelEmbed,
    retrieval,
    embedMs,
    retrieveMs,
  }
}
