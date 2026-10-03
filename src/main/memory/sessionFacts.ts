import type { MemoryFact } from './semantic/types.js'

const CROSS_SESSION_SUBCATEGORIES = new Set([
  'BASIC_PROFILE',
  'LIFE_STORY',
  'OUR_BOND',
  'VALUES_BELIEFS',
])

/** Durable facts that should recall across chat sessions (W6 DEBT-1 最小策略). */
export function isCrossSessionFact(f: MemoryFact): boolean {
  const src = f.sourceSessionId?.trim()
  if (!src) return true
  if (f.tier === 'core') return true
  if (f.factLayer === 'consolidated') return true
  if (
    CROSS_SESSION_SUBCATEGORIES.has(f.subcategory) &&
    (f.confidence ?? 0) >= 0.85 &&
    (f.weight ?? 0) >= 2
  ) {
    return true
  }
  return false
}

/** W6 DEBT-1：同会话事实 + 全局/核心/巩固/高置信身份纽带事实 */
export function filterFactsForSession(facts: MemoryFact[], sessionId: string): MemoryFact[] {
  const sid = sessionId.trim() || 'default'
  return facts.filter((f) => {
    if (isCrossSessionFact(f)) return true
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
