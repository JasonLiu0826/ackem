// [autoMirrorCheck] — ingest 后自动镜中检测 + 存量事实抽样矛盾（FIX-015）

import { createLogger } from '../logger'
import { getLastMirrorCheckTurn, setLastMirrorCheckTurn } from '../engine/state-persistence'
import type { LlmClient } from '../engine/types'
import type { FactStore } from './factStore'
import { evaluatePeriodicMemoryAudit } from './autoMirrorPolicy'
import { sampleSimilarFactPairs } from './factContradictionSampler'
import { MemorySelfEditor } from './memorySelfEditor'
import {
  appendMirrorFindings,
  hasMirrorCheckInputs,
  runMirrorCheck,
  type FactContradictionRecord,
} from './mirrorCheckRunner'

const log = createLogger('auto-mirror')

export async function runAutoMirrorAndContradictionCheck(input: {
  dataRoot: string
  sessionId: string
  turn: number
  factStore: FactStore
  llm: LlmClient
  selfFactAddedThisTurn?: boolean
}): Promise<{ mirrorCount: number; factResolved: number; factFlagged: number }> {
  const { dataRoot, sessionId, turn, factStore, llm } = input
  const turnsSince = turn - getLastMirrorCheckTurn(dataRoot, sessionId)

  if (!evaluatePeriodicMemoryAudit({
    turnsSinceLastCheck: turnsSince,
    selfFactAddedThisTurn: input.selfFactAddedThisTurn,
  })) {
    return { mirrorCount: 0, factResolved: 0, factFlagged: 0 }
  }

  setLastMirrorCheckTurn(dataRoot, turn, sessionId)

  let mirrorCount = 0
  let factResolved = 0
  let factFlagged = 0
  const factFlags: Omit<FactContradictionRecord, 'detectedAt' | 'turn'>[] = []
  let mirrorHits: Awaited<ReturnType<typeof runMirrorCheck>> = []

  try {
    if (hasMirrorCheckInputs(dataRoot, factStore)) {
      mirrorHits = await runMirrorCheck(dataRoot, factStore)
      mirrorCount = mirrorHits.length
      if (mirrorCount > 0) {
        log.info('mirror contradictions detected', { count: mirrorCount, turn })
      }
    }

    const pairs = sampleSimilarFactPairs(factStore)
    if (pairs.length > 0) {
      const editor = new MemorySelfEditor()
      await editor.batchResolve(pairs, factStore, llm)
      for (const entry of editor.getEditLog()) {
        if (entry.action === 'flag') {
          factFlagged++
          factFlags.push({
            newFactId: entry.targetFactId,
            existingFactId: entry.relatedFactId ?? '',
            reason: entry.reason,
            action: 'flag',
          })
        } else {
          factResolved++
        }
      }
      if (factResolved > 0 || factFlagged > 0) {
        log.info('periodic fact contradiction scan', { factResolved, factFlagged, turn })
      }
    }

    if (mirrorCount > 0 || factFlags.length > 0) {
      appendMirrorFindings(dataRoot, mirrorHits, factFlags, turn)
    }
  } catch (err) {
    log.warn('auto mirror check failed', { error: String(err), turn })
  }

  return { mirrorCount, factResolved, factFlagged }
}
