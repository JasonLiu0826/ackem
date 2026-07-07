// [temporalAwareness/temporalMemoryBridge] 鈥?鏃堕棿璁板繂妗ユ帴鍣?
// 鑱岃矗锛氫互鏃ユ湡涓虹嚎绱㈡ˉ鎺ュ叧鑱旇蹇嗭紝涓夌骇鍙洖绛栫暐
// 璁捐鏂囨。锛歞ocs/plan/鏃堕棿鏁忔劅涓诲姩璁板繂绯荤粺璁捐_6_11.md 搂3.3

import type { SpecialDate } from './specialDateDetector'
import type { TemporalProactiveSignal } from './temporalProactiveTrigger'
import type { FactStore } from '../../memory/factStore'
import { t } from '../../i18n'

export interface MemoryBundle {
  seedFacts: string[]           // linkedFactIds
  narrative: string | null      // 鍚堟垚鐨勬椂闂村彊浜?
}

/**
 * L1: 鐢熸棩/鍛ㄥ勾/鍏崇郴閿氱偣 鈫?鐩磋繛浜嬪疄 only
 * L2: 鑺傛棩/recurring 鈫?鐩磋繛浜嬪疄锛堣繖閲屽彧杩斿洖linkedFactIds锛屾墿鏁ｇ敱璋冪敤鏂圭敤AssociationIndex鍋氾級
 * L3: 鏅€氭棩/"鍘诲勾浠婂ぉ" 鈫?鍏ㄩ噺锛堣皟鐢ㄦ柟鍙悗缁敤embedding閲嶆帓锛?
 */
export function recallForSpecialDate(
  specialDate: SpecialDate,
  _level?: 1 | 2 | 3
): MemoryBundle {
  const level = _level ?? resolveLevel(specialDate.type)
  const seedFacts = specialDate.linkedFactIds ?? []

  let narrative: string | null = null
  if (specialDate.type === 'Ackem_birthday') {
    narrative = t('specialDate.AckemBirthdayNarrative')
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
    case 'Ackem_birthday':
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
      return 2  // 鏈煡绫诲瀷榛樿涓?L2
  }
}

/** FIX-008: 鐗规畩鏃?memoryBundles.seedFacts 鈫?Tier B 鍏宠仈璁板繂鍧楋紙涓?retriever 琛屾牸寮忎竴鑷达級 */
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
      lines.push(`路 ${fact.subject}锛?{fact.summary}`)
    }
  }
  if (lines.length === 0) return ''
  return `銆愪粖鏃ュ叧鑱旇蹇嗐€慭n${lines.join('\n')}`
}
