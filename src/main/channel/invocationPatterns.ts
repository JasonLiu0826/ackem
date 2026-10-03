import type { CatalogEntry } from './catalogTypes'
import { HARVESTED_INVOCATION } from './invocationHarvest'

/** 清单层调用式。只有唯一命中才能高分。模型不参与。 */
export const DEFAULT_INVOCATION: Record<string, RegExp[]> = {
  time: [
    /能不能开始\s*\d+\s*分钟/,
    /开始\s*\d+\s*分钟/,
    /倒计时\s*\d+\s*(?:分钟|min)?/,
    /start\s+(?:a\s+)?(?:timer|pomodoro)(?:\s+for)?\s+\d+/i,
    /start\s+\d+\s*(?:minutes|minute|min)\b/i
  ],
  weather: [/what's the weather/i, /what is the weather/i, /weather (?:today|now|forecast)/i],
  remind: [/remind me (?:to|in)\b/i, /提醒我\s*\d+\s*分钟/]
}

export function compileInvocationPattern(raw: string): RegExp | null {
  const s = raw.trim()
  if (!s || s.length > 80) return null
  const escaped = s
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\\{n\\\}/gi, '\\s*(\\d+)\\s*')
    .replace(/\\\{duration\\\}/gi, '\\s*(\\d+)\\s*')
    .replace(/\\\{query\\\}/gi, '\\s*([^\\s，。]{1,40})\\s*')
  try {
    return new RegExp(escaped, 'i')
  } catch {
    return null
  }
}

export function invocationPatternsFor(entry: CatalogEntry): RegExp[] {
  const declared = (entry.invocationPatterns ?? [])
    .map(compileInvocationPattern)
    .filter((p): p is RegExp => Boolean(p))
  const defaults = entry.capabilityTag ? (DEFAULT_INVOCATION[entry.capabilityTag] ?? []) : []
  const harvested = (entry.capabilityTag ? (HARVESTED_INVOCATION[entry.capabilityTag] ?? []) : [])
    .map(compileInvocationPattern)
    .filter((p): p is RegExp => Boolean(p))
  return [...declared, ...defaults, ...harvested]
}
