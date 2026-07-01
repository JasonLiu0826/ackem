import { captureEmotionalContext } from './memoryBinding'
import type { FactStore } from './factStore'
import type { KnowledgeGraph } from './knowledgeGraph'
import { extractTriples } from './tripleExtractor'
import { extractTriggers } from './triggerExtractor'
import { detectAnchorType, shouldWriteTemporalAnchor, writeTemporalAnchor } from './temporalAnchorPolicy'
import { vetCreatorContradictingFact } from '../canon/canonCreatorIngestGuard'
import type { EmotionState, L1State, MemoryFact } from '../engine/types'
import type { ExtractedFactRow } from './lightExtract/types'
import type { AdultMemoryPrivacyLevel } from '../prompt/adult-mode'

export type WriteFactRowsResult = {
  newFacts: MemoryFact[]
  newFactIds: string[]
}

/** 统一事实落地：写库 + 时间锚点 + 知识图谱三元组 */
export function writeFactRows(args: {
  dataRoot: string
  sessionId: string
  turnIndex: number
  userMsg: string
  rows: ExtractedFactRow[]
  l1: L1State
  l2: EmotionState
  store: FactStore
  kg?: KnowledgeGraph
  adultPrivacyLevel?: AdultMemoryPrivacyLevel
}): WriteFactRowsResult {
  const { dataRoot, sessionId, turnIndex, userMsg, rows, l1, l2, store, kg, adultPrivacyLevel = 'normal' } = args
  if (rows.length === 0) return { newFacts: [], newFactIds: [] }

  const emo = captureEmotionalContext(l1, l2)
  store.load()
  const newFacts: MemoryFact[] = []
  const newFactIds: string[] = []

  for (const f of rows) {
    const canonVet = vetCreatorContradictingFact(f)
    if (canonVet.reject) continue

    const autoTriggers = extractTriggers(f.subject, f.summary)
    const mergedTriggers = [...new Set([...(f.triggers ?? []), ...autoTriggers])]

    if (
      f.subcategory === 'BASIC_PROFILE' &&
      (f.subject === '用户姓名' || f.subject === '用户昵称')
    ) {
      store.downgradeNameFacts(f.subject)
    }

    const result = store.addFactDetailed({
      domain: f.domain,
      subcategory: f.subcategory,
      subject: f.subject,
      summary: f.summary,
      weight: f.weight,
      confidence: f.confidence,
      selfRelevance: f.selfRelevance,
      triggers: mergedTriggers,
      sourceSessionId: sessionId,
      sourceTurnIndex: turnIndex,
      emotionalContext: emo,
      privacyLevel: adultPrivacyLevel,
      ageMeta: f.ageMeta,
    })

    if (shouldWriteTemporalAnchor({
      isNew: result.isNew,
      weight: f.weight ?? 0,
      intensity: emo.intensity,
      fact: result.fact,
      userMsg,
    })) {
      const anchorType = detectAnchorType(result.fact, userMsg)
      writeTemporalAnchor(dataRoot, result.fact, anchorType)
    }

    if (kg) {
      const triples = extractTriples(f.subject, f.summary, result.fact.id, {
        subcategory: f.subcategory,
        ageMeta: f.ageMeta,
      })
      for (const t of triples) {
        kg.add(t)
      }
    }

    if (result.isNew) {
      newFacts.push(result.fact)
      newFactIds.push(result.fact.id)
    }
  }

  return { newFacts, newFactIds }
}
