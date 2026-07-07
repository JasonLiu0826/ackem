/**
 * FIX-023 鈥?蹇€熺壒娈婃棩妫€娴嬶紙orchestrator moodBias 璺緞锛?
 * 涓?detectSpecialDates 瑙勫垯瀵归綈锛氱浉璇嗗懆骞寸敤 computeTimeDepth 卤15 澶╃獥鍙ｏ紝闈炰粎 MMDD 鐩哥瓑銆?
 */
import type { FactStore } from '../../memory/factStore'
import { detectHoliday } from './holidayDetector'
import { isAnniversaryWindowActive } from './timeDepthCalculator'

export type FastSpecialDateType =
  | 'Ackem_birthday'
  | 'first_met_anniversary'
  | 'birthday'
  | 'holiday_spring'
  | 'holiday_valentine'
  | 'holiday'

function formatTodayMMDD(today: Date): string {
  return `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
}

/**
 * 蹇€熸娴嬩粖鏃ョ壒娈婃棩绫诲瀷锛團actStore + 鑺傚亣鏃ワ紝涓嶆煡 temporal_anchors DB锛?
 * 渚?orchestrator moodBias 浣跨敤锛岄伩鍏嶄笌 temporalHint 涓嶅悓姝ャ€?
 */
export function detectFastSpecialDateType(args: {
  today: Date
  firstMetDate: string | null
  AckemBirthday?: string | null
  factStore: FactStore
}): FastSpecialDateType | null {
  const todayMMDD = formatTodayMMDD(args.today)

  if (args.AckemBirthday && args.AckemBirthday.slice(5, 10) === todayMMDD) {
    return 'Ackem_birthday'
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
    if (['鏄ヨ妭'].includes(holiday.key)) return 'holiday_spring'
    if (['鎯呬汉鑺?, '涓冨', '520', '521'].includes(holiday.key)) return 'holiday_valentine'
    return 'holiday'
  }

  return null
}
