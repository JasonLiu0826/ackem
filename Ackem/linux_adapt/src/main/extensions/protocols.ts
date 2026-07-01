// [extensions/protocols] — 扩展模块与核心引擎的通信协议
//
// 设计原则：
//   1. 扩展模块只能通过本文件定义的接口与引擎交互，禁止直接 import engine/ 或 memory/
//   2. 引擎状态通过只读快照 (EngineSnapshot) 暴露，扩展模块不能直接突变引擎内部状态
//   3. 扩展模块的反馈通过 ExtensionEvent 回传，由 orchestrator 在下一轮 Pre-LLM 中统一处理
//   4. 所有扩展模块的数据写入走白名单路径，不可写入 memory/、companion/ 等引擎权威目录
//
// 版本：1.0.0  |  扩展引擎 API 见 ecosystem/constants ACKEM_ENGINE_API_VERSION
// 应用版本见 manifest.engineVersion；协议版本见 manifest.engineApiVersion

// ═══════════════════════════════════════════════════════════════
// 引擎只读快照 — 扩展模块能看到的引擎状态
// ═══════════════════════════════════════════════════════════════

export interface EnginePersonalitySnapshot {
  presetId: string
  /** 五维人格 [0,100] */
  T: number  // 温柔 Tenderness
  I: number  // 独立 Independence
  S: number  // 敏感 Sensitivity
  O: number  // 开放 Openness
  R: number  // 理性 Rationality
  tags: string[]
  /** 反差比率 [0,1]，仅18+模式 */
  hiddenRatio?: number
}

export interface EngineEmotionSnapshot {
  /** 四维情绪 [-100,100] */
  aff: number  // 喜爱 Affection
  sec: number  // 安全感 Security
  aro: number  // 唤醒度 Arousal
  dom: number  // 支配感 Dominance
  primaryLabel: string
  isLocked: boolean
}

export interface EngineRelationshipSnapshot {
  stage: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  trust: number       // [0,100]
  rifts: number       // 裂痕计数
  atmosphere: 'warm' | 'neutral' | 'cool'
  sharedEventsCount: number
  consecutivePositiveTurns: number
}

export interface EngineMemorySnapshot {
  /** 活跃事实数 */
  activeFactCount: number
  /** 最近 5 条事实摘要（供扩展模块做上下文感知） */
  recentFactSummaries: string[]
  /** 知识图谱节点数 */
  kgNodeCount: number
  /** 情节记忆条目数 */
  episodeCount: number
}

/** 扩展模块可见的引擎全貌 — 只读快照，不可突变 */
export interface EngineSnapshot {
  personality: EnginePersonalitySnapshot
  emotion: EngineEmotionSnapshot
  relationship: EngineRelationshipSnapshot
  memory: EngineMemorySnapshot
  /** 总对话轮数 */
  totalTurns: number
  /** 是否成人模式 */
  adultMode: boolean
  /** 快照生成时间 ISO */
  capturedAt: string
  /** 用户最后活跃 ISO（对话轮次更新） */
  lastActiveAt: string
  /** 当前会话 ID */
  sessionId: string
}

// ═══════════════════════════════════════════════════════════════
// 扩展事件 — 扩展模块向引擎反馈的标准化通道
// ═══════════════════════════════════════════════════════════════

export type ExtensionEventCategory = 'gamemode' | 'plugin' | 'skill'

export interface ExtensionEvent {
  /** 事件唯一 ID */
  id: string
  /** 来源模块 */
  category: ExtensionEventCategory
  /** 来源扩展的 manifest id */
  sourceId: string
  /** 事件类型（各模块自定义） */
  type: string
  /** 事件携带数据 */
  payload: Record<string, unknown>
  /** 情绪提示：建议的情绪调制方向（仅作参考，由引擎最终决定） */
  emotionHint?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  /** 是否需要注入到本轮上下文 */
  injectToContext?: boolean
  /** 注入文本（若 injectToContext=true） */
  contextInjection?: string
  /** 时间戳 ISO */
  timestamp: string
}

// ═══════════════════════════════════════════════════════════════
// 扩展操作结果 — 统一的返回值格式
// ═══════════════════════════════════════════════════════════════

export interface ExtensionOpResult<T = void> {
  ok: boolean
  data?: T
  error?: string
  /** 操作产生的副作用事件（会自动送入引擎） */
  events?: ExtensionEvent[]
}

// ═══════════════════════════════════════════════════════════════
// 扩展生命周期钩子
// ═══════════════════════════════════════════════════════════════

export interface ExtensionLifecycleHooks {
  /** 扩展加载时调用 */
  onLoad?: (snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
  /** 扩展卸载时调用 */
  onUnload?: () => Promise<ExtensionOpResult>
  /** 引擎状态更新后调用（每轮对话后触发，由协调器调用） */
  onEngineUpdate?: (snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
  /** 用户消息发送前调用（可返回额外的上下文注入） */
  beforeUserMessage?: (userMessage: string, snapshot: EngineSnapshot) => Promise<{
    contextInjections: string[]
  }>
  /** LLM 回复后调用（可用于后处理） */
  afterAssistantMessage?: (assistantMessage: string, snapshot: EngineSnapshot) => Promise<ExtensionOpResult>
}

// ═══════════════════════════════════════════════════════════════
// 扩展清单基础字段 — 所有扩展模块共用
// ═══════════════════════════════════════════════════════════════

export interface EcosystemManifestMeta {
  /** 签名发布者 id，与 trust/publishers.json 键一致 */
  publisherId?: string
  /** ISO 签名时间 */
  signedAt?: string
  /** 分发渠道 */
  channel?: 'stable' | 'beta' | 'dev'
  /** 市场 catalog 条目 id（可选） */
  listingId?: string
}

export interface ExtensionManifestBase {
  /** 唯一标识，格式：scope/name@version（如 "ackem/mc-companion@1.0.0"） */
  id: string
  /** 显示名称 */
  name: string
  /** 版本号 semver */
  version: string
  /** 扩展分类 */
  category: ExtensionEventCategory
  /** 一句话描述 */
  description: string
  /** 作者 */
  author: string
  /** 许可证 SPDX */
  license: string
  /** 主入口文件（相对于扩展包根目录） */
  main: string
  /** 最低 Ackem 应用版本要求（semver range，如 >=0.0.0 <1.0.0） */
  engineVersion: string
  /**
   * 扩展引擎 API 协议版本（semver range，如 ^1.0.0）。
   * community/ 市场扩展必填；ackem/ 与 u/ 建议显式填写。
   */
  engineApiVersion?: string
  /** 生态/marketplace 元数据（community 签名包） */
  ecosystem?: EcosystemManifestMeta
  /** 依赖的其他扩展 id（可选） */
  dependencies?: string[]
  /** 标签 */
  tags?: string[]
  /**
   * 实装完成度（FIX-026 等）：stub=仅预览/通知级反馈，非完整能力。
   * 扩展中心据此显示 Stub 标签，避免用户误以为已实装真语音等。
   */
  implementationStatus?: 'complete' | 'stub' | 'preview' | 'planned' | 'deprecated'
  /** 主页/仓库 URL */
  homepage?: string
  /** 扩展触发调度配置（Extension Dispatch v2.0） */
  dispatch?: DispatchConfig
}

// ═══════════════════════════════════════════════════════════════
// Extension Dispatch v2.0 — dispatch.mode 四分法
// ═══════════════════════════════════════════════════════════════

export type DispatchMode = 'autonomous' | 'always_on' | 'manual' | 'dispatched' | 'engine_event' | 'scheduled'

export type DispatchedSubtype =
  | 'semantic_match'
  | 'keyword_hint'
  | 'llm_function_call'
  | 'relationship_trust'
  | 'emotion_delta'
  | 'system_poll'

export type AutonomousSubtype =
  | 'scheduled'
  | 'interval'
  | 'system_event'
  | 'engine_event'

export type DispatchPersonalityHint =
  | 'encouragement'
  | 'gentle_care'
  | 'playful_tease'
  | 'neutral'
  | 'warm'
  | 'gentle'
  | 'playful'
  | 'dreamy'

export interface DispatchTimeAutonomous {
  rule: string | number
  ruleType: 'cron' | 'interval_ms' | 'daily_at'
}

export interface DispatchConfig {
  mode: DispatchMode
  subtype?: AutonomousSubtype | DispatchedSubtype
  time: {
    active_hours?: string
    cooldown_minutes?: number
    schedule?: DispatchTimeAutonomous
    manual_trigger?: boolean
  }
  habits: string[]
  scenarios: string[]
  summary: string
  keywords: string[]
  /** 保底启动：`/番茄钟` 等，命中即 auto_invoke（不经过 LLM） */
  slash?: string[]
  personality_hint?: DispatchPersonalityHint
}

export type DispatchDecision =
  | 'chat'
  | 'plan'
  | 'ask_plan'
  | 'auto_invoke'
  | 'ask_invoke'
  | 'silent'
  | 'evolve'
  | 'open_surface'
  | 'invoke_surface'

export type SurfaceInvokeDispatchMeta = {
  mode: 'open' | 'open_and_inject'
  skipMainChatLlm?: boolean
}

export interface DispatchResult {
  decision: DispatchDecision
  extensionId?: string
  confidence?: number
  contextInjection?: string
  emotionHint?: {
    affDelta?: number
    secDelta?: number
    aroDelta?: number
    domDelta?: number
  }
  askMessage?: string
  /** OpenForU 新建工作区名称 hint */
  planTopic?: string
  reasoning?: string
  /** Surface 插件 invoke_surface 时的宿主策略 */
  surfaceInvoke?: SurfaceInvokeDispatchMeta
}

export interface DispatchCatalogEntry {
  id: string
  name: string
  category: ExtensionEventCategory
  status: 'planned' | 'installed' | 'active' | 'disabled' | 'error'
  dispatch: DispatchConfig
  lastTriggeredAt?: number
  rejectedInSession?: boolean
}

export type {
  RuntimeContext,
  UserRuntimeContext,
  UserEngagementLevel,
  UserActivityCategory,
  ActivityTense,
  UserActivityContext
} from '../context/types'
export { buildRuntimeContext } from '../context/runtimeContext'
export { buildRuntimeContextHint, buildActivityHint } from '../context/runtimeHints'
export { resolveUserActivity } from '../context/userActivity'
