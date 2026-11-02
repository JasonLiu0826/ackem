// [shared/types] — 跨进程共享类型定义
// 仅包含纯类型，不依赖 Node.js 或 DOM API

export type PresetGender = 'female' | 'male'

export type LlmProvider = 'openai' | 'anthropic'

export type DataRootMode = 'portable' | 'localappdata'

export type ApiKeyHeaderMode = 'bearer' | 'x-api-key'

export type PersonalityConfigMode = 'manual' | 'inferred'

/** QQ 空间说说可见范围：公开 / 好友 / 仅自己 */
export type QzoneVisibilitySetting = 'public' | 'friends' | 'private'

/** QQ 空间说说文案风格：自动 / 日记 / 随想 / 玩梗 / 深夜 */
export type QzoneStyleSetting = 'auto' | 'diary' | 'musing' | 'meme' | 'night'

/** 主人开源六维（0–100） */
export type UserSixDimensions = {
  E: number
  A: number
  D: number
  P: number
  N: number
  O: number
  /** 推断依据文件（相对 dataRoot） */
  sourceFiles: string[]
  inferredAt: string
  summary?: string
}

/** 伴侣 TISOR 推断建议 */
export type CompanionSuggestion = {
  T: number
  I: number
  S: number
  O: number
  R: number
  confidence: number
  rationale: string
}

/** 知情同意文案版本，须与 docs/架构总览_5_24更新.md 同步 */
export const INFERENCE_CONSENT_VERSION = 1

export type AppSettings = {
  /** Internal coordination policy; normal task controls remain input and stop. */
  taskPolicy?: {maxAttempts?:number;maxDurationMs?:number;maxModelCallsPerAttempt?:number;notificationIntervalMs?:number;stopConfirmationMs?:number;maxContextTokens?:number;maxCostUsd?:number}
  updateChannel?: import('./updateTypes').UpdateChannel
  updateLastCheckAt?: string
  dataRootMode: DataRootMode
  llmProvider: LlmProvider
  openaiBaseUrl: string
  openaiApiKey: string
  anthropicBaseUrl: string
  anthropicApiVersion: string
  /** Default true, including settings saved before this option existed. */
  outputTokensAuto?: boolean
  anthropicMaxTokens: number
  model: string
  timeoutMs: number
  ageConfirmed18: boolean
  adultContentMode: boolean
  /** 成人记忆隐私：enhanced=关闭成人模式后 intimate/explicit 不注入 */
  adultPrivacyLevel?: 'standard' | 'enhanced'
  tierBDiaryDays: number
  singleFileSoftLimitBytes: number
  memoryBudgetChars: number
  companionName: string
  companionSystemHint: string
  companionGender: PresetGender
  personalityPresetId: string
  /** Freya 人格对用户的称呼（用户自填，默认「亲爱的」） */
  freyaPetName?: string
  /** 性格配置：手动 preset 或从导入推断 */
  personalityConfigMode: PersonalityConfigMode
  /** 知情同意文案版本（推断 IPC 校验用） */
  inferenceConsentVersion: number
  apiKeyHeaderMode: ApiKeyHeaderMode
  llmExtraHeadersJson: string
  disableChatTools: boolean
  activeSessionId?: string
  /** MC Bot 上次连接的主机 */
  mcBotHost?: string
  /** MC Bot 上次连接的端口 */
  mcBotPort?: number
  /** MC Bot 账号名 */
  mcBotUsername?: string
  /** MC 日志文件路径 */
  mcLogPath?: string
  /** 当前覆盖伴侣形象的 skin 插件 id；空=内置 Canvas 几何形象 */
  activeCompanionSkinPluginId?: string
  /** OpenForU 专用模型（与聊天模型隔离） */
  openforuBaseUrl?: string
  openforuApiKey?: string
  openforuModel?: string
  openforuTemperature?: number
  openforuMaxTokens?: number
  /** Agent Core 主循环；AC-0 起默认 true */
  openforuAgentCoreEnabled?: boolean
  /** AC-1：auto | deterministic | hybrid_skill | hybrid_inject */
  openforuGenerateStrategy?: import('./openforuAgentTypes').OpenForUGenerateStrategySetting
  /** 内置 AckemCode 使用独立模型；关则与聊天共用网址、密钥和模型 */
  ackemcodeIndependentLlm?: boolean
  ackemcodeBaseUrl?: string
  ackemcodeApiKey?: string
  ackemcodeModel?: string
  /** 天气感知 Skill 默认城市（空则使用 Shanghai） */
  weatherCity?: string
  // ── i18n ──
  /** 界面语言 */
  locale?: 'zh' | 'en'
  /** IANA 时区 override（记忆/本地日历）；空则每轮使用系统 IANA 时区 */
  timezone?: string
  // ── Embedding 模型配置 ──
  /** 当前激活的本地 embedding 模型 ID；'none' = 不加载本地模型 */
  embeddingActiveModel?: 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh' | 'none'
  /** 远程 embedding API 地址（可选） */
  embeddingRemoteUrl?: string
  /** 远程 embedding 模型名（可选） */
  embeddingRemoteModel?: string
  /** 异步多消息（多波 API）总开关；关则回退单轮 + [SPLIT] */
  asyncMultiMessageEnabled?: boolean
  companionInteractionMode?: 'assistant' | 'companionship'
  companionshipProactiveEnabled?: boolean
  companionshipQuietHours?: boolean
  /** Wave0 使用本地 OpenAI 兼容端点（Ollama / LM Studio） */
  localChatEnabled?: boolean
  localChatBaseUrl?: string
  localChatModel?: string
  /** Wave0 短句 token 上限 */
  localChatMaxTokens?: number
  /** 启用微信 iLink 消息通道（需已扫码绑定） */
  weixinChannelEnabled?: boolean
  /** 启用 QQ（OneBot v11）消息通道（需已连接协议后端） */
  qqChannelEnabled?: boolean
  /** QQ 主动触达（复用微信的活跃度门控） */
  qqProactiveEnabled?: boolean
  /** QQ 空间：总开关（默认关） */
  qzoneAutoEnabled?: boolean
  /** QQ 空间：试运行（只生成不发表） */
  qzoneDryRun?: boolean
  /** QQ 空间：每日上限 */
  qzoneDailyLimit?: number
  /** QQ 空间：两条之间最小间隔（分钟） */
  qzoneMinIntervalMinutes?: number
  /** QQ 空间：活跃时段开始小时 */
  qzoneActiveStartHour?: number
  /** QQ 空间：活跃时段结束小时 */
  qzoneActiveEndHour?: number
  /** QQ 空间：可见范围 */
  qzoneVisibility?: QzoneVisibilitySetting
  /** QQ 空间：文案风格 */
  qzoneStyle?: QzoneStyleSetting
  /** QQ 空间：是否配图 */
  qzoneWithImage?: boolean
  /** QQ 空间：发完在 QQ 里提一句 */
  qzoneSyncToChat?: boolean
  /** QQ 空间：互动开关 */
  qzoneInteractEnabled?: boolean
  /** QQ 空间：点赞概率 */
  qzoneLikeProb?: number
  /** QQ 空间：评论概率 */
  qzoneCommentProb?: number
  /** 允许已绑定机主通过 QQ / 微信向 AckemCode 派工（默认关） */
  workRemoteChannelsEnabled?: boolean
  /** 机主 QQ 号（确认后才生效） */
  channelOwnerQqId?: string
  /** 待确认的 QQ 机主候选 */
  channelOwnerPendingQqId?: string
  /** 机主微信 id（确认后才生效） */
  channelOwnerWeixinId?: string
  /** 待确认的微信机主候选 */
  channelOwnerPendingWeixinId?: string
  /** Ackem Code 派工权限模式 */
  ackemcodePermissionMode?: 'default' | 'plan' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk'
  /** 微信主动触达（3h 双端空闲 + 进程在线 + 非睡觉时段） */
  weixinProactiveEnabled?: boolean
  /** 桌面主动骚扰：随机 1/2/4/10 分钟发消息（与渐进式空闲主动并存，默认关） */
  companionHarassEnabled?: boolean
  /** v1.1.0 主动问候频率 */
  proactiveFrequency?: 'low' | 'medium' | 'high'
  /** v1.1.0 主动问候展示：纯弹窗 / 纯聊天 / 两者 */
  proactiveDisplayMode?: 'notify_only' | 'chat_only' | 'both'
  /** v1.1.0 主动问候上下文关联比例 0–1 */
  proactiveContextRatio?: number
  /** v1.1.0 用户刚发言后顺延主动问候（毫秒） */
  proactiveUserQuietMs?: number
  /** v1.1.0 启用主动问候总开关 */
  proactiveEnabled?: boolean
  /** v1.1.0 桌面回复镜像到微信 */
  weixinMirrorEnabled?: boolean
  /** v1.1.0 LLM 配置预设 */
  llmProfiles?: import('../main/settings/llmProfiles').LlmProfile[]
  activeChatProfileId?: string
  activeOpenForUProfileId?: string
  activeImageGenProfileId?: string
  /** v1.1.0 生图 */
  imageGenEnabled?: boolean
  imageGenProvider?: 'openai_compatible' | 'sd_webui' | 'unset'
  imageGenBaseUrl?: string
  imageGenModel?: string
  imageGenApiKey?: string
  imageGenDefaultSize?: '512x512' | '1024x1024'
  imageGenPromptEnhancementEnabled?: boolean
}
