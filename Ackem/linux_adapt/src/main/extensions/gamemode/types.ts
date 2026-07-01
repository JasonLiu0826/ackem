// [extensions/gamemode/types] — 游戏陪伴框架类型定义
//
// GameMode 将现有的 Minecraft 陪伴能力抽象为通用的"游戏事件→情绪触发→伴侣反应"管道。
// 每个游戏通过实现 GameProvider 接口接入，不与引擎内部直接耦合。

import type {
  ExtensionEvent,
  ExtensionLifecycleHooks,
  ExtensionManifestBase,
  ExtensionOpResult,
  EngineSnapshot
} from '../protocols'

// ═══════════════════════════════════════════════════════════════
// RPC 与主进程桥接
// ═══════════════════════════════════════════════════════════════

export interface GameModeInvokeRequest {
  gameId: string
  method: string
  params?: Record<string, unknown>
}

export type GameModeInvokeResult<T = unknown> = ExtensionOpResult<T>

/** 主进程注入：Provider 不得直接 import engine/ 或 memory/ */
export interface GameModeHostBridge {
  getSnapshot(): EngineSnapshot
  getEngineStateForGaming(): import('./providers/minecraft/types').EngineStateForGaming
  runIngameChat(userText: string, recentUserMessages: string[]): Promise<string>
  getPersonalityPresetId(): string
}

/** 游戏专属 RPC（可选） */
export interface GameProviderRpc {
  listMethods(): string[]
  invoke(method: string, params?: Record<string, unknown>): Promise<GameModeInvokeResult<unknown>>
}

/** 模板化反应（可选，由具体游戏实现） */
export interface GameProviderReactionBuilder {
  buildReaction(event: GameEvent): Promise<CompanionReaction | null>
}

// ═══════════════════════════════════════════════════════════════
// 游戏清单
// ═══════════════════════════════════════════════════════════════

export interface GameProviderManifest extends ExtensionManifestBase {
  category: 'gamemode'
  /** 游戏唯一标识（如 "minecraft", "genshin", "stardew_valley"） */
  gameId: string
  /** 游戏显示名 */
  gameName: string
  /** 支持的事件源类型 */
  eventSources: GameEventSourceType[]
  /** 推荐的人格标签（用于匹配适合该游戏的伴侣性格） */
  recommendedPersonalityTags?: string[]
  /** 游戏图标 base64 或相对路径 */
  icon?: string
  /** 对外 RPC 方法名列表 */
  rpcMethods?: string[]
}

// ═══════════════════════════════════════════════════════════════
// 事件源类型
// ═══════════════════════════════════════════════════════════════

export type GameEventSourceType =
  | 'log_file'        // 本地日志文件（tail -f 模式）
  | 'websocket'       // WebSocket 推送
  | 'process_stdout'  // 进程标准输出
  | 'http_poll'       // HTTP 轮询
  | 'memory_scan'     // 内存扫描
  | 'manual'          // 手动触发（用户或外部程序调用 API）

// ═══════════════════════════════════════════════════════════════
// 游戏事件
// ═══════════════════════════════════════════════════════════════

/** 标准化游戏事件 — 所有 GameProvider 必须输出此格式 */
export interface GameEvent {
  /** 事件全局唯一 ID（基于 gameId + 序号 + 时间戳） */
  id: string
  /** 来源游戏 */
  gameId: string
  /** 事件类型（如 "player_death", "diamond_found", "boss_defeated"） */
  type: string
  /** 事件严重程度 [0-1]：0=无关紧要，1=重大事件 */
  severity: number
  /** 事件对玩家的影响倾向：positive/negative/neutral */
  valence: 'positive' | 'negative' | 'neutral'
  /** 原始日志/事件文本 */
  raw: string
  /** ISO 时间戳 */
  timestamp: string
  /** 结构化负载（各游戏自定义字段） */
  payload: Record<string, unknown>
  /** 去重键：用于同一事件的重复检测 */
  dedupKey: string
}

// ═══════════════════════════════════════════════════════════════
// 伴侣反应
// ═══════════════════════════════════════════════════════════════

/** 情绪映射 — 游戏事件 → 情绪偏移 */
export interface EmotionMapping {
  /** 四维情绪偏移量（不是绝对值，是增量） */
  delta: {
    aff: number    // [-100, 100]，正=更喜欢，负=更讨厌
    sec: number    // [-100, 100]，正=更安心，负=更不安
    aro: number    // [-100, 100]，正=更兴奋，负=更平静
    dom: number    // [-100, 100]，正=更想掌控，负=更想顺从
  }
  /** 触发的情绪标签优先级列表 */
  labelPriority: string[]
}

/** 伴侣反应 — 游戏事件触发的完整反应 */
export interface CompanionReaction {
  /** 关联的事件 ID */
  eventId: string
  /** 反应模式 */
  mode: 'action' | 'speech' | 'bubble' | 'action_and_speech' | 'silent'
  /** 动作名称（如 "celebrate", "worry", "cheer", "sulk"） */
  action?: string
  /** 气泡文本（由模板或 LLM 生成） */
  bubble?: string
  /** 情绪映射（传递给引擎） */
  emotion: EmotionMapping
  /** 是否写入情节记忆 */
  shouldRemember: boolean
  /** 记忆摘要（若 shouldRemember=true） */
  memorySummary?: string
  /** 冷却秒数：同一类型事件的最小间隔 */
  cooldownSeconds: number
}

// ═══════════════════════════════════════════════════════════════
// GameProvider 接口 — 每个游戏必须实现的抽象
// ═══════════════════════════════════════════════════════════════

export interface GameProviderConfig {
  /** 游戏安装/运行目录 */
  gameDir?: string
  /** 日志文件路径 */
  logPath?: string
  /** WebSocket URL */
  wsUrl?: string
  /** 额外连接参数 */
  connectionParams?: Record<string, string>
  /** 反应模板目录（相对于 provider 目录） */
  templatesDir?: string
  /** 启用的事件源（覆盖 manifest.eventSources） */
  eventSources?: GameEventSourceType[]
  /** WebSocket 端口 */
  wsPort?: number
}

export interface GameProviderStatus {
  connected: boolean
  gameRunning: boolean
  eventsReceived: number
  reactionsSent: number
  lastEventAt?: string
  errors: string[]
}

export interface GameProvider {
  /** 提供商标识 */
  readonly gameId: string
  /** 清单 */
  readonly manifest: GameProviderManifest
  /** 生命周期钩子 */
  readonly hooks: ExtensionLifecycleHooks

  /** 初始化并连接游戏 */
  connect(config: GameProviderConfig): Promise<void>
  /** 断开连接 */
  disconnect(): Promise<void>
  /** 获取连接状态 */
  getStatus(): GameProviderStatus

  /** 手动推送事件（用于 manual 事件源） */
  pushEvent(event: Omit<GameEvent, 'id' | 'gameId' | 'dedupKey'>): Promise<GameEvent>

  /** 设置事件回调：当新游戏事件到达时，协调器会调用此回调获取反应 */
  onEvent(handler: (event: GameEvent) => Promise<CompanionReaction | null>): void

  /** 更新引擎快照（由协调器在每轮对话后调用） */
  updateSnapshot(snapshot: EngineSnapshot): void

  /** 获取待处理的扩展事件（供协调器收集） */
  drainEvents(): ExtensionEvent[]
}
