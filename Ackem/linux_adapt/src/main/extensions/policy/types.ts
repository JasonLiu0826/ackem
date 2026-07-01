import type { DispatchConfig, DispatchMode, EngineSnapshot } from '../protocols'
import type { RuntimeContext } from '../../context/types'

export type ExtensionPolicyAction = 'allow' | 'defer' | 'skip' | 'boost'

export interface MemoryRecallContext {
  recentFactSummaries: string[]
  relevantFacts: string[]
  episodicSnippets: string[]
  userPreferences: string[]
  relationshipStage: EngineSnapshot['relationship']['stage']
}

export interface ExtensionPolicyVerdict {
  action: ExtensionPolicyAction
  reason: string
  adjustedCooldownMs?: number
  contextInjectionPrefix?: string
  confidenceDelta?: number
}

export interface ExtensionDecisionContext {
  extensionId: string
  dispatch: DispatchConfig
  mode: DispatchMode
  snapshot: EngineSnapshot
  memory: MemoryRecallContext
  runtime: RuntimeContext
  session: {
    lastUserMessageAt?: number
    rejectedRecently?: boolean
  }
  nowMs?: number
}

export interface AttentionBudgetState {
  proactiveMessagesPerHour: number
  lastProactiveAt: number[]
  globalDnd?: { until?: number; reason?: string }
  categoryCooldown?: Record<string, number>
}

export const DEFAULT_PROACTIVE_PER_HOUR = 3

export const SEDENTARY_SKILL_ID = 'ackem/sedentary-reminder@0.0.1'
export const DRINK_WATER_SKILL_ID = 'ackem/drink-water-reminder@0.0.1'
export const LATE_NIGHT_SKILL_ID = 'ackem/late-night-reminder@0.0.1'

/** 用户对某扩展的长期选择（JP-B4） */
export type ExtensionPreference = 'allow' | 'deny'

export interface UserExtensionProfile {
  /** 记住选择：以后自动允许 / 不再询问或匹配 */
  extensionPreference: Record<string, ExtensionPreference>
  /** 临时静音某扩展直到时间戳 ms */
  extensionSnoozeUntil: Record<string, number>
  /** 上次拒绝时间戳（未记住时用于降权） */
  lastRejectAt: Record<string, number>
}

// ═══════════════════════════════════════════════════════════
// 习惯槽类型（主动策略调度 Loop 增强）
// ═══════════════════════════════════════════════════════════

export type HabitType = 'dnd' | 'busy_meeting' | 'busy_focus' | 'rest' | 'active' | 'suppress_type'
export type HabitScope = 'short_term' | 'long_term'
export type HabitSource = 'explicit' | 'foreground_detect' | 'dismiss_pattern' | 'time_pattern'

export interface TimeSlot {
  weekday: number | null   // 0=周日 ~ 6=周六，null=不限星期
  hourStart: number        // 0-23
  hourEnd: number          // 0-23
}

export interface UserHabit {
  id: string
  type: HabitType
  scope: HabitScope
  weekday: number | null
  hourStart: number
  hourEnd: number
  confidence: number
  occurrenceCount: number
  firstSeenAt: number
  lastConfirmedAt: number
  expiresAt: number | null
  source: HabitSource
  suppressTarget: string | null
  note: string
  createdAt: number
  updatedAt: number
}

/** proactiveLevel：Loop 决定管家该不该主动说话 */
export type ProactiveLevel = 'silent' | 'whisper' | 'casual' | 'proactive'

/** 工具调用决策 */
export type ToolDecision = 'suppress' | 'ask' | 'auto_invoke'

/** proactiveGate 输出 */
export interface ProactiveGateResult {
  proactiveLevel: ProactiveLevel
  reason: string
  adjustedCooldownMs: number
}

/** 记录在 decision_log 中的信号快照（Phase 6 Embedding 路由预留） */
export interface DecisionSignalSnapshot {
  aff: number
  sec: number
  aro: number
  dom: number
  primaryLabel: string
  trust: number
  stage: string
  rifts: number
  weekday: number
  hour: number
  timeOfDay: string
  activityCategory: string
  foregroundScene: string | null
  matchedHabitIds: string[]
  habitMatchCount: number
  attentionBudgetUsed: boolean
}
