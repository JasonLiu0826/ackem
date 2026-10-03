import { randomUUID } from 'node:crypto'
import { getDatabase } from '../../db/database.js'
import { buildEpisodeRecord } from './episodeBuilder.js'
import {
  episodeExistsForTerminalEvent,
  insertEpisodeWithEvidence
} from './episodeRepository.js'
import { shouldProposeEpisode } from './episodePolicy.js'

let workEpisodeFaultHookForTests: ((phase: 'before_insert') => void) | undefined

export function setWorkEpisodeFaultHookForTests(
  hook: ((phase: 'before_insert') => void) | undefined
): void {
  workEpisodeFaultHookForTests = hook
}

export type WorkTerminalEpisodeInput = {
  dataRoot: string
  sessionId: string
  turnId: string | null
  terminalEventId: string
  runSummary: string
}

/** Trusted work/plugin terminal → evidence-backed episode (independent of chat turn count). */
export function tryCreateEpisodeFromWorkTerminal(input: WorkTerminalEpisodeInput): string | null {
  if (episodeExistsForTerminalEvent(input.dataRoot, input.terminalEventId)) {
    return null
  }
  const evidenceEventIds = [input.terminalEventId]
  if (
    !shouldProposeEpisode({
      exchangeCount: 1,
      emotionIntensity: 0.5,
      evidenceEventIds,
      terminalWorkSucceeded: true
    })
  ) {
    return null
  }
  const db = getDatabase(input.dataRoot)
  if (!db) return null
  const createdAt = new Date().toISOString()
  const episodeId = randomUUID()
  workEpisodeFaultHookForTests?.('before_insert')
  const ep = buildEpisodeRecord(
    {
      summary: input.runSummary.slice(0, 480) || '用户完成一项可信工作任务',
      emotionalIntensity: 0.55,
      dominantEmotion: '完成',
      keywords: ['工作', '完成']
    },
    {
      episodeId,
      prevEpisodeId: null,
      sourceSessionId: input.sessionId,
      startTurn: 0,
      endTurn: 0,
      createdAt
    }
  )
  insertEpisodeWithEvidence(input.dataRoot, ep, evidenceEventIds, createdAt)
  return episodeId
}
