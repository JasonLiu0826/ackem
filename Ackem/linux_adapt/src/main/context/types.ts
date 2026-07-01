/** 扩展 / 引擎共用的运行时上下文类型（可 IPC 序列化） */

export type UserEngagementLevel = 'active_now' | 'recently_active' | 'idle' | 'likely_away'

export type CompanionPresenceMode = 'active' | 'quiet' | 'sleeping'

export type TimeOfDay =
  | 'morning'
  | 'forenoon'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night'

/** 用户在线 / 活跃推断 */
export interface UserRuntimeContext {
  lastActiveAt: string
  minutesSinceLastChat: number
  engagement: UserEngagementLevel
  recentUserSnippets: string[]
}

/** 桌面陪伴在场状态 */
export interface CompanionRuntimeContext {
  mode: CompanionPresenceMode
  idleDurationMs: number
  lastInteractionMs: number
}

/** 本地时钟与时段 */
export interface TimeRuntimeContext {
  localDate: string
  localTime: string
  timeOfDay: TimeOfDay
  hour: number
  minute: number
  isWeekend: boolean
}

/** 生活场景大类（v1 固定枚举） */
export type UserActivityCategory =
  | 'rest'
  | 'work'
  | 'study'
  | 'travel'
  | 'social'
  | 'entertainment'
  | 'daily'
  | 'health'
  | 'unknown'

/** 场景时态：将来 / 进行 / 过去 */
export type ActivityTense = 'future' | 'present' | 'past'

/** 用户生活场景推断（CTX-A） */
export interface UserActivityContext {
  category: UserActivityCategory
  tense: ActivityTense
  /** 人话摘要，如「出游·进行中」 */
  label: string
  /** 0~1；低于 0.4 时 category 应为 unknown */
  confidence: number
  /** 推断依据，供 Trace / 调试 */
  source: string[]
}

/**
 * 扩展模块可见的运行时上下文 — 由 Coordinator 统一构建。
 * Skill / Plugin 通过 SkillInvocation.runtime 或 coordinator.getRuntimeContext() 获取。
 */
export interface RuntimeContext {
  capturedAt: string
  sessionId: string
  user: UserRuntimeContext
  companion: CompanionRuntimeContext
  time: TimeRuntimeContext
  activity: UserActivityContext
}
