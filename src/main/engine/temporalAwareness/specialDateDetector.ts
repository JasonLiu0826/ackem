// [temporalAwareness/specialDateDetector] 鈥?鐗规畩鏃ユ湡妫€娴嬪櫒
// 鑱岃矗锛氳仛鍚?鏁版嵁婧愪骇鍑轰粖澶╃殑鐗规畩鏃ユ湡鍒楄〃锛岀函鑱氬悎閫昏緫
// 鏁版嵁婧愮殑DB鏌ヨ鐢辫皟鐢ㄦ柟锛坥rchestrator/scheduler锛夎礋璐?
// 璁捐鏂囨。锛歞ocs/plan/鏃堕棿鏁忔劅涓诲姩璁板繂绯荤粺璁捐_6_11.md 搂3.1

import type { HolidayInfo } from './holidayDetector'
import { detectHoliday } from './holidayDetector'
import { computeTimeDepth, type TimeDepthResult, isAnniversaryWindowActive } from './timeDepthCalculator'
import { t } from '../../i18n'

export interface SpecialDate {
  type: 'Ackem_birthday' | 'first_met_anniversary' | 'birthday' | 'milestone' | 'holiday' | 'relationship' | 'recurring_memory'
  title: string
  subject?: string
  daysSince?: number
  yearsSince?: number
  timeDepth?: TimeDepthResult
  linkedFactIds?: string[]
  emotionalIntensity?: number
}

export interface BirthdayEntry {
  subject: string
  birthdayMMDD: string
}

export interface AnchorEntry {
  anchor_date: string
  anchor_type: string
  linked_fact_ids: string
  emotional_intensity: number
}

export function detectSpecialDates(args: {
  today: Date
  firstMetDate: string | null
  AckemBirthday?: string | null
  birthdays: BirthdayEntry[]
  temporalAnchors: AnchorEntry[]
}): SpecialDate[] {
  const todayMMDD = `${String(args.today.getMonth() + 1).padStart(2, '0')}-${String(args.today.getDate()).padStart(2, '0')}`
  const results: SpecialDate[] = []

  // 鈺愨晲鈺?婧?: Ackem 鑷繁鐨勭敓鏃?鈺愨晲鈺?
  if (args.AckemBirthday) {
    const AckemMMDD = args.AckemBirthday.slice(5, 10)
    if (AckemMMDD === todayMMDD) {
      const timeDepth = computeTimeDepth(args.AckemBirthday, args.today)
      const yearsSince = timeDepth?.yearsSince ?? 0
      results.push({
        type: 'Ackem_birthday',
        title: t(yearsSince === 1 ? 'specialDate.AckemBirthday.1' : 'specialDate.AckemBirthday.n', { n: yearsSince }),
        yearsSince,
        emotionalIntensity: Math.min(1.0, 0.7 + yearsSince * 0.05),
      })
    }
  }

  // 鈺愨晲鈺?婧?: 鐩歌瘑鍛ㄥ勾锛坈omputeTimeDepth 卤15 澶╃獥鍙ｏ紝涓?moodBias 蹇€熻矾寰勪竴鑷达級 鈺愨晲鈺?
  if (isAnniversaryWindowActive(args.firstMetDate, args.today)) {
    const timeDepth = computeTimeDepth(args.firstMetDate, args.today)!
    const anniversaryYears = Math.max(timeDepth.yearsSince, Math.round(timeDepth.daysSince / 365.2425))
    if (anniversaryYears >= 1) {
      results.push({
        type: 'first_met_anniversary',
        title: t(anniversaryYears === 1 ? 'specialDate.firstAnniversary.1' : 'specialDate.firstAnniversary.n', {
          n: anniversaryYears,
        }),
        daysSince: timeDepth.daysSince,
        yearsSince: anniversaryYears,
        timeDepth,
        emotionalIntensity: Math.min(0.95, 0.6 + anniversaryYears * 0.1),
      })
    }
  }

  // 鈺愨晲鈺?婧?: 鐢熸棩锛坰ubject+MMDD鍘婚噸锛?鈺愨晲鈺?
  const seen = new Set<string>()
  for (const b of args.birthdays) {
    if (b.birthdayMMDD !== todayMMDD) continue
    const key = `${b.subject}_${b.birthdayMMDD}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      type: 'birthday',
      title: t('specialDate.birthday', { name: b.subject }),
      subject: b.subject,
      emotionalIntensity: 1.0,
    })
  }

  // 鈺愨晲鈺?婧?: temporal_anchors (recurring/milestone/relationship) 鈺愨晲鈺?
  for (const a of args.temporalAnchors) {
    if (a.anchor_type === 'fuzzy') continue
    const anchorMMDD = a.anchor_date.slice(5, 10)
    if (anchorMMDD !== todayMMDD) continue

    let type: SpecialDate['type'] = 'recurring_memory'
    if (a.anchor_type === 'relationship') type = 'relationship'
    else if (a.anchor_type === 'milestone') type = 'milestone'

    let linkedFactIds: string[] = []
    try { linkedFactIds = JSON.parse(a.linked_fact_ids) } catch { /* malformed JSON */ }

    results.push({
      type,
      title: type === 'relationship' ? t('specialDate.relationship') : type === 'milestone' ? t('specialDate.milestone') : t('specialDate.recurring'),
      linkedFactIds,
      emotionalIntensity: a.emotional_intensity,
    })
  }

  // 鈺愨晲鈺?婧?: 鑺傚亣鏃?鈺愨晲鈺?
  const holiday = detectHoliday(args.today)
  if (holiday) {
    results.push({
      type: 'holiday',
      title: t('holiday.' + holiday.key),
      emotionalIntensity: holiday.category === 'traditional' ? 0.9 : 0.7,
    })
  }

  // 鈺愨晲鈺?鎺掑簭 鈺愨晲鈺?
  const typeOrder: Record<string, number> = {
    Ackem_birthday: 0,
    first_met_anniversary: 0,
    relationship: 0,
    birthday: 1,
    milestone: 2,
    holiday: 3,
    recurring_memory: 4,
  }
  results.sort((a, b) => {
    const oa = typeOrder[a.type] ?? 5
    const ob = typeOrder[b.type] ?? 5
    if (oa !== ob) return oa - ob
    return (b.emotionalIntensity ?? 0) - (a.emotionalIntensity ?? 0)
  })

  return results
}
