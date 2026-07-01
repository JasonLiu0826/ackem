import type { EngineSnapshot } from '../../../protocols'
import { buildMemoryRecallContext, findHealthFactLine } from '../../../policy/recallContext'

export type BuildProactiveMessageInput = {
  snapshot: EngineSnapshot
  templatePool: string[]
  factPattern?: RegExp
}

function findFactLine(
  snapshot: EngineSnapshot,
  pattern?: RegExp
): string | null {
  const recall = buildMemoryRecallContext(snapshot)
  if (pattern) {
    const line =
      recall.relevantFacts.find((s) => pattern.test(s)) ??
      recall.recentFactSummaries.find((s) => pattern.test(s))
    return line?.trim() ? line.trim().slice(0, 80) : null
  }
  return findHealthFactLine(recall)
}

/** 从模板池随机选文案，可选注入记忆事实 */
export function buildProactiveMessage(input: BuildProactiveMessageInput): string {
  const { snapshot, templatePool, factPattern } = input
  const base = templatePool[Math.floor(Math.random() * templatePool.length)]!
  const fact = findFactLine(snapshot, factPattern)
  if (!fact) return base
  return `记得你提到过：${fact}。${base}`
}

export function buildHealthEmotionHint(): { affDelta: number; secDelta: number } {
  return { affDelta: 1, secDelta: 1 }
}
