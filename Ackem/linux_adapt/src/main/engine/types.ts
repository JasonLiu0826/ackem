export type RelationshipStage = 'STRANGER' | 'FAMILIAR' | 'INTIMATE'

export type Atmosphere = 'warm' | 'neutral' | 'cool'

export type EventType =
  | 'praise'
  | 'tease'
  | 'casual_chat'
  | 'cold'
  | 'hurtful'
  | 'apology'
  | 'vulnerable'
  | 'question'
  | 'extreme_redline'
  // 🆕 成人模式事件（18+）
  | 'adult_flirt'        // 调情：轻度性暗示、挑逗
  | 'adult_dominant'     // 支配：性语境下的指令/掌控
  | 'adult_submissive'   // 臣服：性语境下的服从/请求
  | 'adult_explicit'     // 露骨：明确的性行为表达

export interface Event {
  type: EventType
  intensity: number
  sincerity: number
  isExtremeRedline: boolean
  isAdultContent: boolean                     // 🆕 是否为成人内容
  adultSubtype?: 'flirt' | 'dominant' | 'submissive' | 'explicit' | 'romantic'
}

export interface L1State {
  stage: RelationshipStage
  trust: number
  rifts: number
  affection_momentum: number
  atmosphere: Atmosphere
  consecutivePositiveTurns: number
  turnsSinceLastRift: number
  sharedEventsCount: number
}

export interface Modulation {
  trustMod: number
  riftMod: number
  stageWeight: number
  atmosphere: Atmosphere
}

export interface ExternalAtmosphere {
  level: number   // -1..1 signed momentum, updated at very high alpha
  label: Atmosphere
}

export interface Emotion4D {
  aff: number
  sec: number
  aro: number
  dom: number
}

export interface EmotionState extends Emotion4D {
  primaryLabel: string
  isLocked: boolean
}

export interface MemoryEcho {
  aff: number
  sec: number
  aro: number
  dom: number
}

export interface PersonalityDims {
  T: number
  I: number
  S: number
  O: number
  R: number
}

/** 主人开源六维（M3 LLM 推断） */
export interface UserSixDimensions {
  E: number
  A: number
  D: number
  P: number
  N: number
  O: number
  sourceFiles: string[]
  inferredAt: string
  summary?: string
}

/** 伴侣 TISOR 推断建议 */
export interface CompanionSuggestion extends PersonalityDims {
  confidence: number
  rationale: string
}

export interface InferenceResult {
  userSix: UserSixDimensions
  companionSuggestion: CompanionSuggestion
}

/** 🆕 用户画像 — 自动检测，无需用户选择 */
export interface UserProfile {
  /** 主导原型 */
  dominantArchetype: 'emotional_seeker' | 'repressed_release' | 'explorer' |
                      'romantic_submissive' | 'healing' | 'playful' | 'unknown'
  /** 性表达直接度 0-1：0=包裹在情感中 1=直接粗俗 */
  sexualDirectness: number
  /** 权力偏好 -1~1：-1=纯sub 0=平等 1=纯dom */
  dominancePreference: number
  /** 情感渴求度 0-1 */
  emotionalNeediness: number
  /** 信任轨迹 */
  trustTrajectory: 'building' | 'stable' | 'declining'
  /** 最近 N 轮检测的时间戳 */
  lastUpdated: string
  /** 检测轮次 */
  detectedAtTurn: number
}

export interface PersonalityBaseline {
  T: number; I: number; S: number; O: number; R: number
}

/** OEG：创造者叙事曝光状态（Origin Escalation Guard） */
export type OriginExposureState =
  | 'NORMAL'
  | 'ENTRY'
  | 'EXPLORE'
  | 'DEEP'
  | 'GUARD_COOLDOWN'

export interface OriginExposure {
  state: OriginExposureState
  /** 连续 ackem_creator 语义轮 */
  streak: number
  /** Guard 后禁止 deep expansion 直至该轮次（不含） */
  cooldownUntilTurn: number
  /** 当前轮播周期内已注入的 Canon-M 条目 id（全量轮一遍后才允许重复） */
  canonMDeliveredIds?: string[]
}

export interface FullState {
  version: string
  relationship: L1State
  emotion: EmotionState
  counters: { totalTurns: number; sharedEventsCount: number; consecutiveMeaningfulTurns: number; lastConsolidationTurn?: number; lastMirrorCheckTurn?: number }
  lastActive: string
  externalAtmosphere: ExternalAtmosphere  // P1-4
  personalityBaseline?: PersonalityBaseline  // P1-1: snapshot of initial preset values for drift clamping
  personality: {
    presetId: string
    hiddenRatio?: number  // 🆕 反差人格暴露度 0-1（gap_moe 人格在18+模式下渐变）
  } & PersonalityDims
  userProfile: UserProfile  // 🆕 自动检测的用户画像
  userSixDimensions?: UserSixDimensions  // M3: LLM 推断主人六维
  companionSuggestion?: CompanionSuggestion  // M3: 伴侣 TISOR 建议（未采纳前）
  desireStack: DesireStack   // P2-1: 欲望栈
  offlineThoughts: OfflineThought[]  // P2-4: 离线思维
  adultState?: string            // 成人状态机：NORMAL/FLIRTING/INTIMATE/AFTERCARE
  adultIntensityBudget?: number  // 成人强度预算 0-60
  adultNegativeLockTurns?: number // 负面事件锁剩余轮数
  adultConsecutiveVulnerableTurns?: number // 成人模式负面锁：连续脆弱倾诉轮数
  adultLastRejectedTurn?: number // 用户最近一次拒绝成人/亲密推进的轮次
  emergencePersistence?: EmergencePersistence // 情绪涌现持久化
  /** 时间感知层：首次有意义互动日期 (ISO "2026-06-11") */
  firstMetDate?: string
  /** 时间感知层：Ackem 生日——首次启动日 (ISO "2026-06-11") */
  ackemBirthday?: string
  /** OEG：创造者叙事曝光控制 */
  originExposure?: OriginExposure
}

// ═══════════════════════════════════════════════════════════
// 心系统 · 情绪涌现 (Emotional Emergence)
// ═══════════════════════════════════════════════════════════

export type EmergenceType =
  | 'timeReflection'
  | 'lateNightEmo'
  | 'existentialWonder'
  | 'attachmentOverflow'
  | 'vulnerabilityReveal'
  | 'desireExpression'

export interface EmergenceState {
  type: EmergenceType
  intensity: number
  flavor: string
  phase: 'rising' | 'sustained' | 'fading' | 'dissolved' | 'broken'
  startedAt: string
  roundsInPhase: number
  hasExpressed: boolean
  context: Record<string, unknown>
}

export interface EmergenceContext {
  emotion: EmotionState
  stage: L1State['stage']
  trust: number
  atmosphere: string
  timeOfDay: string
  daysSinceMet: number
  recentAffHistory: number[]
  recentEventTypes: string[]
  consecutiveMeaningfulTurns: number
  consecutiveVulnerableTurns: number
  lastEmergence: { type: string; turn: number } | null
  lastSameTypeAt: string | null
  lastSameTypeTurn: number | null
  currentTurn: number
}

export interface EmergencePersistence {
  active: EmergenceState | null
  history: Array<{
    type: string
    lastTriggeredAt: string
    lastTriggeredTurn: number
  }>
}

// ═══════════════════════════════════════════════════════════
// P2-1: 欲望栈
// ═══════════════════════════════════════════════════════════
export interface Desire {
  id: string
  topic: string
  category: 'curiosity' | 'concern' | 'share' | 'tease' | 'suggest'
  urgency: number        // 0-10
  status: 'latent' | 'active' | 'expressed' | 'settled'
  sourceTurn: number
  createdAt: string
  /** 标为 expressed 时的轮次（用于自动沉淀） */
  expressedAtTurn?: number
}

export interface DesireStack {
  slots: (Desire | null)[]  // max 5 active, null = empty slot
}

// P2-4: 离线思维
export interface OfflineThought {
  id: string
  content: string     // first-person thought
  createdAt: string
  delivered: boolean
}

export interface ExpressionParams {
  mode: 'NORMAL' | 'SILENT_CANDIDATE'
  proximity: 'CLOSE' | 'NEUTRAL' | 'COOL' | 'DEFENSIVE'
  tone: string
  length: 'SHORT' | 'MEDIUM' | 'LONG'
}

export interface TurnTrace {
  turn: number
  l0: { type: EventType; intensity: number; sincerity?: number }
  l0_5?: { intent: WorkIntent; confidence: number; proactive: boolean }
  dispatch?: {
    decision: string
    extensionId?: string
    confidence?: number
    reasoning?: string
  }
  l1: { trust: number; rifts: number; stage: RelationshipStage; atmosphere?: Atmosphere }
  l2: { aff: number; sec: number; aro: number; dom: number; label: string }
  l3: {
    silent: boolean
    tierBChars: number
    factsUsed?: number
    embeddingHits?: number
    /** FIX-024：关联扩散增量（asc+） */
    associationHits?: number
    /** FIX-024：关联图激活边数（act） */
    associationActivations?: number
    episodesUsed?: number
    /** FIX-006：本轮话题仲裁胜出来源 */
    topicSource?: string
    /** FIX-021：情绪涌现类型（timeReflection 等，与特殊日期提示独立） */
    emergenceType?: EmergenceType | null
    /** FIX-021：specialDateDetector 检测到的日期标签（未注入时也记录，排查 T7 互斥） */
    temporalHintDetected?: string | null
    /** FIX-021：本轮实际注入 psycheBlock 的特殊日期标签 */
    temporalHintInjected?: string | null
    /** 本轮实际注入 psycheBlock 的涌现提示（按 marker / topic 来源判定） */
    emergenceHintInjected?: boolean
    /** OEG：创造者叙事曝光状态 */
    originState?: OriginExposureState
    originStreak?: number
    /** 本轮注入的 Canon-M 条数 */
    originCanonMEntries?: number
    /** 本轮轮播注入的 Canon-M 条目 id */
    originCanonMEntryId?: string | null
    /** 本轮是否开启新一轮 Canon-M 全量轮播 */
    originCanonMCycleReset?: boolean
    /** 本轮注入的 Canon-M 条目 category */
    originCanonMEntryCategory?: string | null
    /** 语境匹配到的 Canon-M 类型（空 = 未按类型过滤） */
    originCanonMMatchedCategories?: string[]
    originGuardInjected?: boolean
    originFatherRef?: 'ackem_creator' | 'user_family' | 'ambiguous' | null
    originFatherScore?: number
    originFatherSource?: 'calibration' | 'anchor'
    /** CANON-M-3：本轮跳过 Tier B ingest（创造者自述） */
    originSkipIngest?: boolean
    /** 记忆审计短路：FactStore 精选/全量读取 */
    memoryAudit?: {
      mode: string
      factsListed: number
      factsHidden: number
      episodesListed: number
      timelineCount: number
      paginated?: boolean
      page?: number
    }
  }
  l4: { wrote: boolean }
  l5?: { toolCalls: string[] }
  ms?: {
    total: number
    embed?: number
    retrieve?: number
    psyche?: number
    dispatch?: number
  }
  /** 本轮 wall-clock 时间（ISO），供日记/检索按时刻过滤 */
  timestamp?: string
}

export interface EmotionalContext {
  valence: number
  intensity: number
  relStage: RelationshipStage
  trust: number
  atmosphere: Atmosphere
}

export type MemoryFactStatus = 'active' | 'retired'
export type FactLayer = 'raw' | 'consolidated'
export type MemoryTier = 'core' | 'archival'

export interface MemoryFact {
  id: string
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight: number
  confidence: number
  status: MemoryFactStatus
  emotionalContext: EmotionalContext
  selfRelevance: number
  triggers: string[]
  updateTrail: string[]
  sourceSessionId: string
  sourceTurnIndex: number
  createdAt: string
  updatedAt: string
  /** O3: IDs of facts this insight was derived from (for consolidated facts only) */
  derivedFrom?: string[]
  /** O3: raw = directly extracted, consolidated = LLM-synthesized insight */
  factLayer?: FactLayer
  /** B: core = always injected, archival = competes for budget (default) */
  tier?: MemoryTier
  /** 主动遗忘标记：normal=默认，avoid=用户不想被提起（不主动注入） */
  sensitivity?: 'normal' | 'avoid'
  /** 成人记忆隐私：关闭成人模式后 intimate/explicit 不注入 prompt */
  privacyLevel?: 'normal' | 'intimate' | 'explicit'
  /** 年龄动态计算元数据（从 age_* 列组装） */
  ageMeta?: AgeMeta
}

/** 年龄动态计算元数据 */
export interface AgeMeta {
  age: number
  birthdayMMDD?: string
  birthYear?: number
  recordedAt: string
  isEstimate: boolean
}

// ═══════════════════════════════════════════════════════════
// 情节记忆 (Episodic Memory)
// ═══════════════════════════════════════════════════════════
export interface Episode {
  id: string
  /** 1-3 sentence narrative summary of this conversation segment */
  summary: string
  /** 0-1 emotional intensity of the episode */
  emotionalIntensity: number
  /** dominant emotion label during this episode */
  dominantEmotion: string
  /** retrieval keywords */
  keywords: string[]
  /** links to previous episode for narrative continuity */
  prevEpisodeId: string | null
  sourceSessionId: string
  startTurn: number
  endTurn: number
  createdAt: string
}

// ═══════════════════════════════════════════════════════════
// C: 知识图谱 + 矛盾检测
// ═══════════════════════════════════════════════════════════
export interface Triple {
  id: string
  subject: string
  predicate: string
  object: string
  confidence: number
  sourceFactIds: string[]
  createdAt: string
}

export interface ContradictionCheck {
  conflictingFactId: string | null
  judgment: 'conflict' | 'reinforce' | 'unrelated'
  action: 'keep_new' | 'keep_old' | 'merge' | 'flag'
  reason: string
}

export type PendingFact = {
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers: string[]
  ageMeta?: { age: number; birthdayMMDD?: string; birthYear?: number; recordedAt: string; isEstimate: boolean }
}

export interface ExtractionResult {
  facts: PendingFact[]
}

export interface LlmClient {
  chatCompletionJson(params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    temperature: number
    max_tokens?: number
  }): Promise<string>
}

// ═══════════════════════════════════════════════════════════
// L0.5: 工作意图识别
// ═══════════════════════════════════════════════════════════
export type WorkIntent =
  | 'search_web'
  | 'read_file'
  | 'write_file'
  | 'run_command'
  | 'none'

export interface WorkIntentResult {
  intent: WorkIntent
  confidence: number       // 0-1
  proactive: boolean       // 引擎主动判断用户需要帮助，而非用户明确要求
  extractedQuery?: string  // 提取的搜索词 / 文件路径 / 命令
  filePath?: string        // 文件操作的目标路径
  /** search_web 时：web_search 联网 vs 知识整理纸面卡（不二次搜索） */
  delivery?: 'web_search' | 'knowledge_card'
}

// ═══════════════════════════════════════════════════════════
// L5: 工具执行结果
// ═══════════════════════════════════════════════════════════
export interface ToolResult {
  toolName: string
  success: boolean
  content: string          // 返回给 LLM 的结果文本
  summary: string          // 给用户的简短摘要（UI 通知用）
  memoryHint?: string      // 用于自动记忆记录的关键信息
}

export interface ToolCallRecord {
  toolName: string
  args: Record<string, unknown>
  result: ToolResult
  timestamp: string
}
