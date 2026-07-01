/**
 * FIX-023 — 快速特殊日检测（orchestrator moodBias 路径）
 * 与 detectSpecialDates 规则对齐：相识周年用 computeTimeDepth ±15 天窗口，非仅 MMDD 相等。
 */
import type { FactStore } from '../../memory/factStore'
import { detectHoliday } from './holidayDetector'
import { isAnniversaryWindowActive } from './timeDepthCalculator'

export type FastSpecialDateType =
  | 'ackem_birthday'
  | 'first_met_anniversary'
  | 'birthday'
  | 'holiday_spring'
  | 'holiday_valentine'
  | 'holiday'

function formatTodayMMDD(today: Date): string {
  return `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/**
 * 快速检测今日特殊日类型（FactStore + 节假日，不查 temporal_anchors DB）
 * 供 orchestrator moodBias 使用，避免与 temporalHint 不同步。
 */
export function detectFastSpecialDateType(args: {
  today: Date
  firstMetDate: string | null
  ackemBirthday?: string | null
  factStore: FactStore
}): FastSpecialDateType | null {
  const todayMMDD = formatTodayMMDD(args.today)

  if (args.ackemBirthday && args.ackemBirthday.slice(5, 10) === todayMMDD) {
    return 'ackem_birthday'
  }

  if (isAnniversaryWindowActive(args.firstMetDate, args.today)) {
    return 'first_met_anniversary'
  }

  for (const f of args.factStore.listActive()) {
    if ((f as { ageMeta?: { birthdayMMDD?: string } }).ageMeta?.birthdayMMDD === todayMMDD) {
      return 'birthday'
    }
  }

  const holiday = detectHoliday(args.today)
  if (holiday) {
    if (['春节'].includes(holiday.key)) return 'holiday_spring'
    if (['情人节', '七夕', '520', '521'].includes(holiday.key)) return 'holiday_valentine'
    return 'holiday'
  }

  return null
}
