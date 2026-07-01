import type { MemoryFact } from '../engine/types'

/** W6 DEBT-1 最小：构建快照时仅使用当前会话写入的事实，避免跨会话泄漏 */
export function filterFactsForSession(facts: MemoryFact[], sessionId: string): MemoryFact[] {
  const sid = sessionId.trim() || 'default'
  return facts.filter((f) => {
    const src = f.sourceSessionId?.trim()
    if (!src) return true
    return src === sid
  })
}

export function summariesForSession(facts: MemoryFact[], sessionId: string, limit: number): string[] {
  return filterFactsForSession(facts, sessionId)
    .slice(0, limit)
    .map((f) => f.summary)
}
