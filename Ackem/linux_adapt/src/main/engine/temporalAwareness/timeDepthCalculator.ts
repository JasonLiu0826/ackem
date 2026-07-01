// [temporalAwareness/timeDepthCalculator] — 时间深度计算器
// 职责：输入相识日期和今天，输出"过了多久"的自然语言描述
// 纯函数，零 I/O，<0.1ms
// 设计文档：docs/plan/时间敏感主动记忆系统设计_6_11.md §3.2

import { t } from '../../i18n'

export interface TimeDepthResult {
  label: string
  /** i18n key，用于翻译 */
  labelKey: string
  /** i18n 插值参数 */
  labelParams?: Record<string, number>
  emotionalWeight: number
  isExactYear: boolean
  isMilestone: boolean
  yearsSince: number
  daysSince: number
}

export function computeTimeDepth(firstMetDate: string | null, today: Date): TimeDepthResult | null {
  if (!firstMetDate) return null

  // 手动解析 ISO 日期字符串为本地时间，避免 new Date(string) 按 UTC 解析导致的差一错误
  const parsed = parseLocalDate(firstMetDate)
  if (!parsed) return null

  const firstMs = new Date(parsed.year, parsed.month - 1, parsed.day).getTime()
  const todayMs = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const daysSince = Math.floor((todayMs - firstMs) / 86400000)
  if (daysSince < 0 || isNaN(daysSince)) return null

  const diffYears = daysSince / 365.2425
  const yearsSince = Math.floor(diffYears)
  const nearestYear = Math.round(diffYears)
  const isMilestone = [1, 2, 3, 5, 10].includes(nearestYear) && nearestYear >= 1

  // 距上一个整年（使用 floor）的距离，用于判断"快到了"还是"刚过去"
  const daysSinceLastAnniversary = daysSince - yearsSince * 365.2425
  const distanceToNearestYear = daysSince - nearestYear * 365.2425

  let labelKey: string
  let labelParams: Record<string, number> | undefined
  let emotionalWeight: number
  let isExactYear = false

  if (nearestYear >= 1 && Math.abs(distanceToNearestYear) <= 15) {
    isExactYear = true
    labelKey = nearestYear === 1 ? 'timeDepth.exactYear' : 'timeDepth.exactYears'
    labelParams = nearestYear === 1 ? undefined : { n: nearestYear }
    emotionalWeight = Math.min(0.95, 0.8 + nearestYear * 0.05)
  } else if (daysSince < 30) {
    labelKey = 'timeDepth.justMet'
    emotionalWeight = 0.3
  } else if (daysSince < 90) {
    labelKey = 'timeDepth.overMonth'
    emotionalWeight = 0.4
  } else if (daysSince < 180) {
    labelKey = 'timeDepth.halfYear'
    emotionalWeight = 0.5
  } else if (daysSince < 365) {
    labelKey = 'timeDepth.overHalfYear'
    emotionalWeight = 0.6
  } else if (daysSinceLastAnniversary <= 90) {
    // 刚过周年（距上次整年 ≤ 90 天）
    labelKey = yearsSince === 1 ? 'timeDepth.justOverYear' : 'timeDepth.justOverYears'
    labelParams = yearsSince === 1 ? undefined : { n: yearsSince }
    emotionalWeight = Math.min(0.95, 0.75 + yearsSince * 0.03)
  } else if (daysSinceLastAnniversary > 275) {
    // 快到下一个周年（距上次整年 > 275 天 = 距下次 < 90 天）
    labelKey = 'timeDepth.almostNextYear'
    labelParams = { n: yearsSince + 1 }
    emotionalWeight = Math.min(0.95, 0.78 + yearsSince * 0.04)
  } else {
    // 周年之间的大段中间地带
    labelKey = yearsSince <= 1 ? 'timeDepth.overYear' : 'timeDepth.overYears'
    labelParams = yearsSince <= 1 ? undefined : { n: yearsSince }
    emotionalWeight = Math.min(0.9, 0.7 + yearsSince * 0.04)
  }

  const label = t(labelKey, labelParams)

  return { label, labelKey, labelParams, emotionalWeight, isExactYear, isMilestone, yearsSince, daysSince }
}

/** 整周年 ±15 天窗口内且已满 1 年 — detectSpecialDates 与 moodBias 快速路径共用 */
export function isAnniversaryWindowActive(firstMetDate: string | null, today: Date): boolean {
  const timeDepth = computeTimeDepth(firstMetDate, today)
  if (!timeDepth?.isExactYear) return false
  const anniversaryYears = Math.max(timeDepth.yearsSince, Math.round(timeDepth.daysSince / 365.2425))
  return anniversaryYears >= 1
}

function parseLocalDate(str: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str)
  if (!m) return null
  const year = Number(m[1]), month = Number(m[2]), day = Number(m[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}
