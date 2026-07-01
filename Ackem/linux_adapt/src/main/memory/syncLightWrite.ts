import { FactStore } from './factStore'
import { KnowledgeGraph } from './knowledgeGraph'
import { extractFactDrafts, factDraftsToRows } from './lightExtract'
import { writeFactRows } from './factLanding'
import { filterExtractedUserFacts } from './userFactGuard'
import type { EmotionState, L1State, MemoryFact } from '../engine/types'
import type { AdultMemoryPrivacyLevel } from '../prompt/adult-mode'

/** 同步轻量规则写入（毫秒级，供下一轮 context:build 立即可见） */
export function writeSyncLightFacts(args: {
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  l1: L1State
  l2: EmotionState
  store: FactStore
  kg?: KnowledgeGraph
  adultPrivacyLevel?: AdultMemoryPrivacyLevel
}): string[] {
  const { dataRoot, sessionId, turnIndex, userMsg, l1, l2, store, kg, adultPrivacyLevel } = args
  const drafts = extractFactDrafts(userMsg)
  if (drafts.length === 0) return []

  const rows = filterExtractedUserFacts(factDraftsToRows(drafts), userMsg)
  if (rows.length === 0) return []

  const { newFactIds } = writeFactRows({
    dataRoot,
    sessionId,
    turnIndex,
    userMsg,
    rows,
    l1,
    l2,
    store,
    kg,
    adultPrivacyLevel,
  })

  return newFactIds
}

export function collectNewFactIdsForTurn(
  store: FactStore,
  sessionId: string,
  turnIndex: number
): string[] {
  return store
    .listActive()
    .filter((f: MemoryFact) => f.sourceTurnIndex === turnIndex && f.sourceSessionId === sessionId)
    .map((f) => f.id)
}
