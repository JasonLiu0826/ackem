import { readCompanionPresence } from './companionBridge'
import type { RuntimeContext, TimeRuntimeContext } from './types'
import { resolveUserRuntimeContext } from './userPresence'
import { resolveActivityFromEstablishedHabits } from './ctxB2Habits'
import { resolveUserActivity } from './userActivity'
import type { TemporalFactRef } from './planDateWindow'
import { loadTemporalFactsFromDataRoot } from './temporalFacts'
import { getClock } from '../memory/temporal/clock.js'
import { resolveUserTimezone } from '../memory/temporal/timezonePolicy.js'
import { deriveTimeOfDay, formatLocalTimeHHMM } from '../memory/temporal/timeOfDay.js'
import { zonedDateParts, zonedLocalDate } from '../memory/temporal/zonedDate.js'
import { loadSettings } from '../settings'

export type BuildRuntimeContextInput = {
  dataRoot: string
  sessionId: string
  lastActiveAt: string
  now?: Date
  /** 用户有效 IANA 时区；默认 AppSettings.timezone 或系统 IANA */
  timeZone?: string
  memoryFactSummaries?: string[]
  /** 默认从 facts.v2.json 加载 PLANS/COMMITMENTS */
  temporalFacts?: TemporalFactRef[]
  loadTemporalFacts?: boolean
  gameActive?: boolean
}

export function mapTimeContext(now: Date, timeZone: string): TimeRuntimeContext {
  const parts = zonedDateParts(now, timeZone)
  return {
    localDate: zonedLocalDate(now, timeZone),
    localTime: formatLocalTimeHHMM(parts.hour, parts.minute),
    timeOfDay: deriveTimeOfDay(parts.hour),
    hour: parts.hour,
    minute: parts.minute,
    isWeekend: parts.weekday === 0 || parts.weekday === 6,
  }
}

/** 统一构建运行时上下文（Coordinator / IPC / 离线脚本共用） */
export function buildRuntimeContext(input: BuildRuntimeContextInput): RuntimeContext {
  const now = input.now ?? getClock().now()
  const timeZone = input.timeZone ?? resolveUserTimezone(loadSettings().timezone).timezone
  const capturedAt = now.toISOString()
  const time = mapTimeContext(now, timeZone)
  const user = resolveUserRuntimeContext(
    input.dataRoot,
    input.sessionId,
    input.lastActiveAt,
    now
  )

  const activityFromRules = resolveUserActivity({
    recentUserSnippets: user.recentUserSnippets,
    memoryFactSummaries: input.memoryFactSummaries,
    temporalFacts:
      input.temporalFacts ??
      (input.loadTemporalFacts !== false
        ? loadTemporalFactsFromDataRoot(input.dataRoot)
        : undefined),
    time,
    gameActive: input.gameActive,
    now
  })

  const fromHabits = resolveActivityFromEstablishedHabits(input.dataRoot)
  const activity =
    fromHabits && fromHabits.confidence > activityFromRules.confidence
      ? fromHabits
      : activityFromRules

  return {
    capturedAt,
    sessionId: input.sessionId,
    user,
    companion: readCompanionPresence(),
    time,
    activity
  }
}
