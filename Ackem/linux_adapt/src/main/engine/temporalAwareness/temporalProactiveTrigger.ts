// [temporalAwareness/temporalProactiveTrigger] — 时间主动触发信号产出者
// 职责：编排 specialDateDetector + timeDepthCalculator + temporalMemoryBridge，
//       产出 TemporalProactiveSignal，交给策略层统一决策。
// **不直接注入 psycheBlock**
// 设计文档：docs/plan/时间敏感主动记忆系统设计_6_11.md §3.4

import type { SpecialDate } from './specialDateDetector'
import type { MemoryBundle } from './temporalMemoryBridge'
import { recallForSpecialDate } from './temporalMemoryBridge'

export interface TemporalProactiveSignal {
  specialDates: SpecialDate[]
  memoryBundles: Map<string, MemoryBundle>
  temporalHint: TemporalHint | null
}

export interface TemporalHint {
  dateLabel: string
  narrative: string
  priority: 'high' | 'normal' | 'low'
  expiresAt?: string
}

const EXPIRY_DAYS: Record<string, number> = {
  ackem_birthday: 30,
  birthday: 30,
  first_met_anniversary: 60,
  holiday: 7,
  milestone: 60,
  relationship: 60,
  recurring_memory: 14,
}

const HINT_SORT_ORDER: Record<string, number> = {
  ackem_birthday: 0,
  first_met_anniversary: 1,
  relationship: 2,
  birthday: 3,
  milestone: 4,
  holiday: 5,
  recurring_memory: 6,
}

function specialDateHintPriority(type: SpecialDate['type']): 'high' | 'normal' | 'low' {
  switch (type) {
    case 'ackem_birthday':
    case 'first_met_anniversary':
    case 'birthday':
    case 'relationship':
      return 'high'
    case 'milestone':
      return 'normal'
    default:
      return 'low'
  }
}

function priorityRank(priority: 'high' | 'normal' | 'low'): number {
  return priority === 'high' ? 0 : priority === 'normal' ? 1 : 2
}

export function produceTemporalSignal(specialDates: SpecialDate[]): TemporalProactiveSignal {
  const memoryBundles = new Map<string, MemoryBundle>()
  const hintParts: Array<{
    type: SpecialDate['type']
    dateLabel: string
    narrative: string
    priority: 'high' | 'normal' | 'low'
  }> = []

  for (let i = 0; i < specialDates.length; i++) {
    const sd = specialDates[i]
    const bundle = recallForSpecialDate(sd)
    memoryBundles.set(`${sd.type}_${i}`, bundle)

    if (bundle.narrative) {
      hintParts.push({
        type: sd.type,
        dateLabel: sd.title,
        narrative: bundle.narrative,
        priority: specialDateHintPriority(sd.type),
      })
    }
  }

  let temporalHint: TemporalHint | null = null
  if (hintParts.length > 0) {
    hintParts.sort((a, b) => (HINT_SORT_ORDER[a.type] ?? 9) - (HINT_SORT_ORDER[b.type] ?? 9))
    const mergedPriority = hintParts.reduce<'high' | 'normal' | 'low'>(
      (best, part) => (priorityRank(part.priority) < priorityRank(best) ? part.priority : best),
      'low'
    )
    const primaryType = hintParts[0].type
    const expiryDays = EXPIRY_DAYS[primaryType] ?? 14

    temporalHint = {
      dateLabel: hintParts.map((p) => p.dateLabel).join(' · '),
      narrative: hintParts.map((p) => p.narrative).join(' '),
      priority: mergedPriority,
      expiresAt: new Date(Date.now() + expiryDays * 86400000).toISOString(),
    }
  }

  return { specialDates, memoryBundles, temporalHint }
}
