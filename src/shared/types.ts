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
  dataRootMode: DataRootMode
  llmProvider: LlmProvider
  openaiBaseUrl: string
  openaiApiKey: string
  anthropicBaseUrl: string
  anthropicApiVersion: string
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
  /** 天气感知 Skill 默认城市（空则使用 Shanghai） */
  weatherCity?: string
  // ── i18n ──
  /** 界面语言 */
  locale?: 'zh' | 'en'
  // ── Embedding 模型配置 ──
  /** 当前激活的本地 embedding 模型 ID；'none' = 不加载本地模型 */
  embeddingActiveModel?: 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh' | 'none'
  /** 远程 embedding API 地址（可选） */
  embeddingRemoteUrl?: string
  /** 远程 embedding 模型名（可选） */
  embeddingRemoteModel?: string
  /** 异步多消息（多波 API）总开关；关则回退单轮 + [SPLIT] */
  asyncMultiMessageEnabled?: boolean
  /** Wave0 使用本地 OpenAI 兼容端点（Ollama / LM Studio） */
  localChatEnabled?: boolean
  localChatBaseUrl?: string
  localChatModel?: string
  /** Wave0 短句 token 上限 */
  localChatMaxTokens?: number
  /** 启用微信 iLink 消息通道（需已扫码绑定） */
  weixinChannelEnabled?: boolean
  /** 微信主动触达（3h 双端空闲 + 进程在线 + 非睡觉时段） */
  weixinProactiveEnabled?: boolean
  /** 启用 QQ（OneBot v11）消息通道（需已连接协议后端） */
  qqChannelEnabled?: boolean
  /** QQ 主动触达（复用微信的活跃度门控） */
  qqProactiveEnabled?: boolean

  /** ── QQ 空间（说说）── */
  /** 自主发说说总开关 */
  qzoneAutoEnabled?: boolean
  /** 试运行：只生成与记录，不真正发表 */
  qzoneDryRun?: boolean
  /** 每天最多发几条（0 = 不限） */
  qzoneDailyLimit?: number
  /** 两条之间至少间隔多少分钟 */
  qzoneMinIntervalMinutes?: number
  /** 活跃时段起点（0-23，含） */
  qzoneActiveStartHour?: number
  /** 活跃时段终点（0-23，不含；小于起点表示跨夜） */
  qzoneActiveEndHour?: number
  /** 可见范围 */
  qzoneVisibility?: QzoneVisibilitySetting
  /** 文案风格 */
  qzoneStyle?: QzoneStyleSetting
  /** 配一张表情包（来自 qq-memes/） */
  qzoneWithImage?: boolean
  /** 发完在最近的 QQ 私聊里提一句 */
  qzoneSyncToChat?: boolean
  /** 逛空间互动（点赞 / 评论 / 回评论） */
  qzoneInteractEnabled?: boolean
  /** 给好友动态点赞的概率 0-1 */
  qzoneLikeProb?: number
  /** 给好友动态评论的概率 0-1 */
  qzoneCommentProb?: number
  /** 桌面主动骚扰：随机 1/2/4/10 分钟发消息（与渐进式空闲主动并存，默认关） */
  companionHarassEnabled?: boolean
  /** ── 电脑助手（实验）── */
  desktopAgentEnabled?: boolean
  desktopAgentRiskAccepted?: boolean
  desktopAgentAllowAppControl?: boolean
  desktopAgentAllowFileWrite?: boolean
  desktopAgentAllowDownload?: boolean
  desktopAgentAllowInstall?: boolean
  desktopAgentAllowDocumentRead?: boolean
  desktopAgentAllowDelete?: boolean
  /** 默认下载目录；空则 ~/Downloads/AckemDownloads */
  desktopAgentDownloadDir?: string
  /** 允许从 QQ / 微信 远程使用电脑助手（默认关；开启后远端消息可驱动本机操作，仍需桌面确认） */
  desktopAgentRemoteChannelsEnabled?: boolean
  /** 机主 QQ 号（首次私聊进入待确认；桌面端确认后才生效，只响应此人） */
  channelOwnerQqId?: string
  /** 待确认的 QQ 机主候选（首个私聊者；桌面确认前不入主流程） */
  channelOwnerPendingQqId?: string
  /** 机主微信 id（首次私聊进入待确认；桌面端确认后才生效，只响应此人） */
  channelOwnerWeixinId?: string
  /** 待确认的微信机主候选（首个私聊者；桌面确认前不入主流程） */
  channelOwnerPendingWeixinId?: string
  /** Ackem Code 派工权限模式（远程渠道另受 desktopAgentRemoteChannelsEnabled 约束） */
  ackemcodePermissionMode?: 'default' | 'plan' | 'acceptEdits' | 'auto' | 'bypassPermissions' | 'dontAsk'
  /** 软件更新下载线路 */
  updateChannel?: 'auto' | 'github' | 'gitee'
  /** 用户跳过的版本号 */
  updateSkippedVersion?: string
  /** 上次检查更新时间 ISO */
  updateLastCheckAt?: string
}
