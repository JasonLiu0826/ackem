// [temporalAwareness/temporalProactiveTrigger] 鈥?鏃堕棿涓诲姩瑙﹀彂淇″彿浜у嚭鑰?
// 鑱岃矗锛氱紪鎺?specialDateDetector + timeDepthCalculator + temporalMemoryBridge锛?
//       浜у嚭 TemporalProactiveSignal锛屼氦缁欑瓥鐣ュ眰缁熶竴鍐崇瓥銆?
// **涓嶇洿鎺ユ敞鍏?psycheBlock**
// 璁捐鏂囨。锛歞ocs/plan/鏃堕棿鏁忔劅涓诲姩璁板繂绯荤粺璁捐_6_11.md 搂3.4

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
  Ackem_birthday: 30,
  birthday: 30,
  first_met_anniversary: 60,
  holiday: 7,
  milestone: 60,
  relationship: 60,
  recurring_memory: 14,
}

const HINT_SORT_ORDER: Record<string, number> = {
  Ackem_birthday: 0,
  first_met_anniversary: 1,
  relationship: 2,
  birthday: 3,
  milestone: 4,
  holiday: 5,
  recurring_memory: 6,
}

function specialDateHintPriority(type: SpecialDate['type']): 'high' | 'normal' | 'low' {
  switch (type) {
    case 'Ackem_birthday':
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
      dateLabel: hintParts.map((p) => p.dateLabel).join(' 路 '),
      narrative: hintParts.map((p) => p.narrative).join(' '),
      priority: mergedPriority,
      expiresAt: new Date(Date.now() + expiryDays * 86400000).toISOString(),
    }
  }

  return { specialDates, memoryBundles, temporalHint }
}
