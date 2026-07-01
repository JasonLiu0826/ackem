import type { EngineSnapshot } from '../protocols'
import type { MemoryRecallContext } from './types'

const HEALTH_HINTS = /腰|颈椎|久坐|健康|眼疲劳|休息|拉伸|喝水/i
const PREF_HINTS = /pref:|偏好|勿扰|别提醒|不要提醒/i

function filterFacts(summaries: string[], pattern: RegExp, limit: number): string[] {
  return summaries.filter((s) => pattern.test(s)).slice(0, limit)
}

/** JP-A：从引擎快照只读组装记忆召回包（不 import memory/） */
export function buildMemoryRecallContext(
  snapshot: EngineSnapshot,
  options?: { extraSummaries?: string[] }
): MemoryRecallContext {
  const merged = [
    ...snapshot.memory.recentFactSummaries,
    ...(options?.extraSummaries ?? [])
  ]

  return {
    recentFactSummaries: merged.slice(0, 8),
    relevantFacts: filterFacts(merged, HEALTH_HINTS, 3),
    episodicSnippets: [],
    userPreferences: filterFacts(merged, PREF_HINTS, 3),
    relationshipStage: snapshot.relationship.stage
  }
}

export function findHealthFactLine(recall: MemoryRecallContext): string | null {
  const line = recall.relevantFacts[0] ?? recall.recentFactSummaries.find((s) => HEALTH_HINTS.test(s))
  return line?.trim() ? line.trim().slice(0, 80) : null
}

/** JP-B1：dispatched Step2 统一记忆块（Tier B + 画像要点） */
export function buildDispatchMemoryBlock(
  snapshot: EngineSnapshot,
  tierBBlock?: string,
  options?: { extraSummaries?: string[] }
): string {
  const recall = buildMemoryRecallContext(snapshot, options)
  const parts: string[] = []
  const tier = tierBBlock?.trim()
  if (tier) parts.push(`[检索记忆]\n${tier}`)
  const policyLines = [
    ...recall.relevantFacts.slice(0, 3),
    ...recall.userPreferences.slice(0, 2)
  ]
  if (policyLines.length) {
    parts.push(`[画像/偏好要点]\n${policyLines.join('\n')}`)
  }
  if (recall.relationshipStage) {
    parts.push(`关系阶段：${recall.relationshipStage}`)
  }
  return parts.join('\n\n').slice(0, 1200)
}
