/** 日记 Skill 专用：写作模式与定时策略（非全局 runtime） */

import { formatLocalTime, localDateString } from '../../../../context/localTime'

export type { DiaryWriteMode, DiaryTrigger } from './diaryTimeTypes'
export type { DiaryTimeContext } from './diaryTimeTypes'

import type { DiaryTimeContext, DiaryTrigger, DiaryWriteMode } from './diaryTimeTypes'

export const DIARY_EVENING_START_HOUR = 18
export const DIARY_NIGHT_END_HOUR = 5

export function isEveningDiaryWindow(d: Date): boolean {
  const h = d.getHours()
  return h >= DIARY_EVENING_START_HOUR || h < DIARY_NIGHT_END_HOUR
}

export function resolveDiaryWriteMode(
  targetDate: string,
  generatedAt: Date,
  trigger: DiaryTrigger
): DiaryWriteMode {
  if (trigger === 'scheduled' || trigger === 'snapshot') {
    return 'full_day'
  }

  const todayLocal = localDateString(generatedAt)
  if (targetDate !== todayLocal) {
    return 'backfill'
  }

  if (isEveningDiaryWindow(generatedAt)) {
    return 'full_day'
  }

  return 'partial_day'
}

export function resolveDiaryTimeContext(input: {
  targetDate: string
  generatedAt?: Date
  trigger?: DiaryTrigger
}): DiaryTimeContext {
  const generatedAt = input.generatedAt ?? new Date()
  const trigger = input.trigger ?? 'manual'
  return {
    targetDate: input.targetDate,
    generatedAt,
    trigger,
    mode: resolveDiaryWriteMode(input.targetDate, generatedAt, trigger)
  }
}

export function hoursUntilLocalDayEnd(d: Date): number {
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
  return Math.max(0, Math.ceil((end.getTime() - d.getTime()) / 3_600_000))
}

export { formatLocalTime, localDateString } from '../../../../context/localTime'

export function shouldForceDiaryOverwrite(
  trigger: DiaryTrigger,
  mode: DiaryWriteMode,
  explicitForce?: boolean
): boolean {
  if (explicitForce) return true
  return trigger === 'scheduled' && mode === 'full_day'
}

export function shouldRunScheduledDiary(
  diaryFileExists: boolean,
  writeMode: DiaryWriteMode | undefined
): boolean {
  if (!diaryFileExists) return true
  return writeMode === 'partial_day'
}
