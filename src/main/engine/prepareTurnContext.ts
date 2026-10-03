import { WORKING_MEMORY_CHAR_BUDGET } from './ackemParams'
import { getCachedEmbeddingProvider, ensureFactEmbeddingsReady, getOrCreateEngineCache } from '../engineCache'
import { getCachedTemporalEmbeddings } from '../embedding/preLlmWarmup'
import { computeConversationEmbed } from '../embedding/scoring'
import { detectTemporalSignal } from '../memory/temporalSignalExtractor'
import { computeRelevanceHint } from '../memory/scheduler'
import { deriveTimeOfDay } from '../memory/temporal/timeOfDay.js'
import type { FullState } from './types'
import type { FactStore } from '../memory/factStore'
import type { MemoryRetriever, RetrievalResult } from '../memory/retriever'
import type { TemporalSemanticSignal } from '../memory/temporalSignalExtractor'
import type { IndexSnapshot } from '../indexer'
import { loadSettings } from '../settings'
import { getClock } from '../memory/temporal/clock.js'
import { resolveUserTimezone } from '../memory/temporal/timezonePolicy.js'
import { zonedDateParts, zonedLocalDate } from '../memory/temporal/zonedDate.js'
import { composeRecall } from '../memory/recall/recallComposer.js'
import { resolveRecallComposerMode, type RecallComposerMode } from '../memory/recall/recallConfig.js'
import type { RecallBundle } from '../memory/contracts.js'

export type PreparedTurnContext = {
  queryEmbed?: number[]
  conversationEmbed?: number[]
  msgTemporalSemanticSignal: TemporalSemanticSignal | null
  temporalLabelEmbed?: number[]
  retrieval: RetrievalResult
  embedMs: number
  retrieveMs: number
  recallMs?: number
  recallComposerMode?: RecallComposerMode
  /** Populated in shadow mode: composer output without merging into tierBBlock. */
  recallComposerShadow?: RecallBundle
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
  const nowDate = getClock().now()
  const tzResolved = resolveUserTimezone(loadSettings().timezone)
  const timeZone = tzResolved.timezone
  const zoned = zonedDateParts(nowDate, timeZone)
  const localDate = zonedLocalDate(nowDate, timeZone)
  const temporalCtx = {
    timeOfDay: deriveTimeOfDay(zoned.hour),
    isWeekend: zoned.weekday === 0 || zoned.weekday === 6,
    month: zoned.month,
    season: (() => {
      const m = zoned.month
      return m === 12 || m <= 2 ? 'winter' : m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'autumn'
    })(),
    hour: zoned.hour,
    weekday: zoned.weekday,
    gapHours,
    localDate,
    observedAt: nowDate.toISOString(),
    timeZone,
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
      /* Embedding 失败不影响主流程 */
    }
  }
  const embedMs = Date.now() - tEmbed

  const tRetrieve = Date.now()
  let retrieval = await retriever.retrieve(
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

  const recallComposerMode = resolveRecallComposerMode()
  const recallBudget = Math.min(900, Math.max(400, Math.floor(retrievalBudget * 0.35)))
  let recallMs = 0
  let recallComposerShadow: RecallBundle | undefined

  if (recallComposerMode !== 'off') {
    const tRecall = Date.now()
    const recallBundle = await composeRecall(dataRoot, {
      sessionId,
      text: msg,
      observedAt: temporalCtx.observedAt,
      timezone: temporalCtx.timeZone,
      budgetChars: recallBudget,
      deadlineMs: 50
    })
    recallMs = Date.now() - tRecall

    if (recallComposerMode === 'shadow') {
      recallComposerShadow = recallBundle
    } else if (recallBundle.promptBlock.trim()) {
      const merged =
        `【Recall Composer】\n${recallBundle.promptBlock.trim()}\n\n${retrieval.tierBBlock}`.trim()
      retrieval = {
        ...retrieval,
        tierBBlock: merged.slice(0, retrievalBudget + recallBudget)
      }
    }
  }

  return {
    queryEmbed,
    conversationEmbed,
    msgTemporalSemanticSignal,
    temporalLabelEmbed,
    retrieval,
    embedMs,
    retrieveMs,
    recallMs,
    recallComposerMode,
    recallComposerShadow
  }
}
