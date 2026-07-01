export type {
  RuntimeContext,
  UserRuntimeContext,
  UserEngagementLevel,
  CompanionRuntimeContext,
  CompanionPresenceMode,
  TimeRuntimeContext,
  TimeOfDay,
  UserActivityCategory,
  ActivityTense,
  UserActivityContext
} from './types'

export {
  localDateString,
  formatLocalTime,
  startOfLocalDayMs,
  endOfLocalDayMs,
  localDateFromIso,
  isWithinLocalDayWindow
} from './localTime'

export {
  resolveUserEngagement,
  loadRecentUserSnippets,
  resolveUserRuntimeContext
} from './userPresence'

export { resolveUserActivity, type ResolveUserActivityInput } from './userActivity'
export {
  parseDateRangeFromText,
  parsePlanWindowsFromFacts,
  resolveActivityFromTemporalFacts,
  tenseForPlanWindow,
  toLocalDayKey,
  type TemporalFactRef,
  type ParsedPlanWindow
} from './planDateWindow'
export { loadTemporalFactsFromDataRoot, temporalFactsPath } from './temporalFacts'
export { buildRuntimeContext, type BuildRuntimeContextInput } from './runtimeContext'
export {
  buildRuntimeContextHint,
  buildUserPresenceHintFromRuntime,
  buildActivityHint
} from './runtimeHints'
export { setCompanionPresenceProvider, type CompanionPresenceSnapshot } from './companionBridge'
