// [temporalAwareness/temporalMemoryBridge] — 时间记忆桥接器
// 职责：以日期为线索桥接关联记忆，三级召回策略
// 设计文档：docs/plan/时间敏感主动记忆系统设计_6_11.md §3.3

import type { SpecialDate } from './specialDateDetector'
import type { TemporalProactiveSignal } from './temporalProactiveTrigger'
import type { FactStore } from '../../memory/factStore'
import { t } from '../../i18n'

export interface MemoryBundle {
  seedFacts: string[]           // linkedFactIds
  narrative: string | null      // 合成的时间叙事
}

/**
 * L1: 生日/周年/关系锚点 → 直连事实 only
 * L2: 节日/recurring → 直连事实（这里只返回linkedFactIds，扩散由调用方用AssociationIndex做）
 * L3: 普通日/"去年今天" → 全量（调用方可后续用embedding重排）
 */
export function recallForSpecialDate(
  specialDate: SpecialDate,
  _level?: 1 | 2 | 3
): MemoryBundle {
  const level = _level ?? resolveLevel(specialDate.type)
  const seedFacts = specialDate.linkedFactIds ?? []

  let narrative: string | null = null
  if (specialDate.type === 'ackem_birthday') {
    narrative = t('specialDate.ackemBirthdayNarrative')
  } else if (specialDate.type === 'first_met_anniversary' && specialDate.timeDepth) {
    narrative = t('specialDate.firstMetNarrative', { label: specialDate.timeDepth.label })
  } else if (specialDate.type === 'birthday') {
    narrative = t('specialDate.birthdayNarrative', { name: specialDate.subject ?? 'ta' })
  } else if (specialDate.type === 'holiday') {
    narrative = t('specialDate.holidayNarrative', { name: specialDate.title })
  } else if (specialDate.type === 'milestone') {
    narrative = t('specialDate.milestoneNarrative')
  }

  return {
    seedFacts: level >= 2 ? seedFacts : seedFacts.slice(0, 5),
    narrative,
  }
}

function resolveLevel(type: SpecialDate['type']): 1 | 2 | 3 {
  switch (type) {
    case 'ackem_birthday':
    case 'first_met_anniversary':
    case 'birthday':
    case 'relationship':
      return 1
    case 'holiday':
    case 'recurring_memory':
      return 2
    case 'milestone':
      return 3
    default:
      return 2  // 未知类型默认为 L2
  }
}

/** FIX-008: 特殊日 memoryBundles.seedFacts → Tier B 关联记忆块（与 retriever 行格式一致） */
export function buildTemporalSeedTierBBlock(
  signal: TemporalProactiveSignal,
  factStore: FactStore
): string {
  if (!signal.temporalHint || signal.temporalHint.priority === 'low') return ''

  const seen = new Set<string>()
  const lines: string[] = []
  for (const bundle of signal.memoryBundles.values()) {
    for (const id of bundle.seedFacts) {
      if (!id || seen.has(id)) continue
      seen.add(id)
      const fact = factStore.getById(id)
      if (!fact || fact.status !== 'active') continue
      lines.push(`· ${fact.subject}：${fact.summary}`)
    }
  }
  if (lines.length === 0) return ''
  return `【今日关联记忆】\n${lines.join('\n')}`
}
