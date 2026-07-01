// [extensions/snapshot] — FullState → EngineSnapshot（扩展模块只读视图）

import type { AppSettings } from '../settings'
import type { FullState } from '../engine/types'
import type { EngineSnapshot } from './protocols'
import { PERSONALITY_PRESETS } from '../personalityPresets'
import { FactStore, defaultFactsPath } from '../memory/factStore'
import { EpisodicStore, defaultEpisodesPath } from '../memory/episodicStore'
import { KnowledgeGraph, defaultKgPath } from '../memory/knowledgeGraph'
import { filterFactsForSession, summariesForSession } from '../memory/sessionFacts'
import type { MemoryFact } from '../engine/types'

export type EngineMemoryMeta = {
  activeFactCount: number
  recentFactSummaries: string[]
  kgNodeCount: number
  episodeCount: number
}

/** 从已加载事实列表构建会话级 memory 元数据（count 与 summaries 同源） */
export function buildMemoryMetaFromFacts(
  facts: MemoryFact[],
  sessionId: string,
  kgNodeCount = 0,
  episodeCount = 0
): EngineMemoryMeta {
  const sid = sessionId.trim() || 'default'
  const sessionFacts = filterFactsForSession(facts, sid)
  return {
    activeFactCount: sessionFacts.length,
    recentFactSummaries: summariesForSession(facts, sid, 5),
    kgNodeCount,
    episodeCount
  }
}

/** 从 dataRoot 加载 store 并构建会话级 memory 元数据 */
export function buildMemoryMeta(dataRoot: string, sessionId: string): EngineMemoryMeta {
  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const epStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
  const kg = new KnowledgeGraph(defaultKgPath(dataRoot))
  kg.load()
  return buildMemoryMetaFromFacts(
    store.listActive(),
    sessionId,
    kg.listAll().length,
    epStore.listAll().length
  )
}

export function buildEngineSnapshot(
  state: FullState,
  settings: AppSettings,
  memoryMeta?: EngineMemoryMeta
): EngineSnapshot {
  const preset = PERSONALITY_PRESETS.find(p => p.id === state.personality.presetId)
  const tags = preset?.tags ?? []

  return {
    personality: {
      presetId: state.personality.presetId,
      T: state.personality.T,
      I: state.personality.I,
      S: state.personality.S,
      O: state.personality.O,
      R: state.personality.R,
      tags,
      hiddenRatio: state.personality.hiddenRatio
    },
    emotion: {
      aff: state.emotion.aff,
      sec: state.emotion.sec,
      aro: state.emotion.aro,
      dom: state.emotion.dom,
      primaryLabel: state.emotion.primaryLabel,
      isLocked: state.emotion.isLocked
    },
    relationship: {
      stage: state.relationship.stage,
      trust: state.relationship.trust,
      rifts: state.relationship.rifts,
      atmosphere: state.relationship.atmosphere,
      sharedEventsCount: state.relationship.sharedEventsCount,
      consecutivePositiveTurns: state.relationship.consecutivePositiveTurns
    },
    memory: {
      activeFactCount: memoryMeta?.activeFactCount ?? 0,
      recentFactSummaries: memoryMeta?.recentFactSummaries ?? [],
      kgNodeCount: memoryMeta?.kgNodeCount ?? 0,
      episodeCount: memoryMeta?.episodeCount ?? 0
    },
    totalTurns: state.counters.totalTurns,
    adultMode: Boolean(settings.adultContentMode && settings.ageConfirmed18),
    capturedAt: new Date().toISOString(),
    lastActiveAt: state.lastActive,
    sessionId: settings.activeSessionId || 'default'
  }
}
