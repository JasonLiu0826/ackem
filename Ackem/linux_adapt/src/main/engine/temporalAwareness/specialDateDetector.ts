// [temporalAwareness/specialDateDetector] — 特殊日期检测器
// 职责：聚合4数据源产出今天的特殊日期列表，纯聚合逻辑
// 数据源的DB查询由调用方（orchestrator/scheduler）负责
// 设计文档：docs/plan/时间敏感主动记忆系统设计_6_11.md §3.1

import type { HolidayInfo } from './holidayDetector'
import { detectHoliday } from './holidayDetector'
import { computeTimeDepth, type TimeDepthResult, isAnniversaryWindowActive } from './timeDepthCalculator'
import { t } from '../../i18n'

export interface SpecialDate {
  type: 'ackem_birthday' | 'first_met_anniversary' | 'birthday' | 'milestone' | 'holiday' | 'relationship' | 'recurring_memory'
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
  ackemBirthday?: string | null
  birthdays: BirthdayEntry[]
  temporalAnchors: AnchorEntry[]
}): SpecialDate[] {
  const todayMMDD = `${String(args.today.getMonth() + 1).padStart(2, '0')}-${String(args.today.getDate()).padStart(2, '0')}`
  const results: SpecialDate[] = []

  // ═══ 源0: Ackem 自己的生日 ═══
  if (args.ackemBirthday) {
    const ackemMMDD = args.ackemBirthday.slice(5, 10)
    if (ackemMMDD === todayMMDD) {
      const timeDepth = computeTimeDepth(args.ackemBirthday, args.today)
      const yearsSince = timeDepth?.yearsSince ?? 0
      results.push({
        type: 'ackem_birthday',
        title: t(yearsSince === 1 ? 'specialDate.ackemBirthday.1' : 'specialDate.ackemBirthday.n', { n: yearsSince }),
        yearsSince,
        emotionalIntensity: Math.min(1.0, 0.7 + yearsSince * 0.05),
      })
    }
  }

  // ═══ 源1: 相识周年（computeTimeDepth ±15 天窗口，与 moodBias 快速路径一致） ═══
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

  // ═══ 源2: 生日（subject+MMDD去重） ═══
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

  // ═══ 源3: temporal_anchors (recurring/milestone/relationship) ═══
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

  // ═══ 源4: 节假日 ═══
  const holiday = detectHoliday(args.today)
  if (holiday) {
    results.push({
      type: 'holiday',
      title: t('holiday.' + holiday.key),
      emotionalIntensity: holiday.category === 'traditional' ? 0.9 : 0.7,
    })
  }

  // ═══ 排序 ═══
  const typeOrder: Record<string, number> = {
    ackem_birthday: 0,
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
