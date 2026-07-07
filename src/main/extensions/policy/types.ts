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

export const SEDENTARY_SKILL_ID = 'Ackem/sedentary-reminder@0.0.1'
export const DRINK_WATER_SKILL_ID = 'Ackem/drink-water-reminder@0.0.1'
export const LATE_NIGHT_SKILL_ID = 'Ackem/late-night-reminder@0.0.1'

/** 鐢ㄦ埛瀵规煇鎵╁睍鐨勯暱鏈熼€夋嫨锛圝P-B4锛?*/
export type ExtensionPreference = 'allow' | 'deny'

export interface UserExtensionProfile {
  /** 璁颁綇閫夋嫨锛氫互鍚庤嚜鍔ㄥ厑璁?/ 涓嶅啀璇㈤棶鎴栧尮閰?*/
  extensionPreference: Record<string, ExtensionPreference>
  /** 涓存椂闈欓煶鏌愭墿灞曠洿鍒版椂闂存埑 ms */
  extensionSnoozeUntil: Record<string, number>
  /** 涓婃鎷掔粷鏃堕棿鎴筹紙鏈浣忔椂鐢ㄤ簬闄嶆潈锛?*/
  lastRejectAt: Record<string, number>
}

// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?
// 涔犳儻妲界被鍨嬶紙涓诲姩绛栫暐璋冨害 Loop 澧炲己锛?
// 鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺愨晲鈺?

export type HabitType = 'dnd' | 'busy_meeting' | 'busy_focus' | 'rest' | 'active' | 'suppress_type'
export type HabitScope = 'short_term' | 'long_term'
export type HabitSource = 'explicit' | 'foreground_detect' | 'dismiss_pattern' | 'time_pattern'

export interface TimeSlot {
  weekday: number | null   // 0=鍛ㄦ棩 ~ 6=鍛ㄥ叚锛宯ull=涓嶉檺鏄熸湡
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

/** proactiveLevel锛歀oop 鍐冲畾绠″璇ヤ笉璇ヤ富鍔ㄨ璇?*/
export type ProactiveLevel = 'silent' | 'whisper' | 'casual' | 'proactive'

/** 宸ュ叿璋冪敤鍐崇瓥 */
export type ToolDecision = 'suppress' | 'ask' | 'auto_invoke'

/** proactiveGate 杈撳嚭 */
export interface ProactiveGateResult {
  proactiveLevel: ProactiveLevel
  reason: string
  adjustedCooldownMs: number
}

/** 璁板綍鍦?decision_log 涓殑淇″彿蹇収锛圥hase 6 Embedding 璺敱棰勭暀锛?*/
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
