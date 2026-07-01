import { getTimeContext } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'
import { readCompanionPresence } from './companionBridge'
import { formatLocalTime, localDateString } from './localTime'
import type { RuntimeContext, TimeRuntimeContext } from './types'
import { resolveUserRuntimeContext } from './userPresence'
import { resolveActivityFromEstablishedHabits } from './ctxB2Habits'
import { resolveUserActivity } from './userActivity'
import type { TemporalFactRef } from './planDateWindow'
import { loadTemporalFactsFromDataRoot } from './temporalFacts'

export type BuildRuntimeContextInput = {
  dataRoot: string
  sessionId: string
  lastActiveAt: string
  now?: Date
  memoryFactSummaries?: string[]
  /** 默认从 facts.v2.json 加载 PLANS/COMMITMENTS */
  temporalFacts?: TemporalFactRef[]
  loadTemporalFacts?: boolean
  gameActive?: boolean
}

function mapTimeContext(now: Date): TimeRuntimeContext {
  const tc = getTimeContext(now)
  return {
    localDate: localDateString(now),
    localTime: formatLocalTime(now),
    timeOfDay: tc.timeOfDay,
    hour: tc.hour,
    minute: tc.minute,
    isWeekend: tc.isWeekend
  }
}

/** 统一构建运行时上下文（Coordinator / IPC / 离线脚本共用） */
export function buildRuntimeContext(input: BuildRuntimeContextInput): RuntimeContext {
  const now = input.now ?? new Date()
  const capturedAt = now.toISOString()
  const time = mapTimeContext(now)
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
