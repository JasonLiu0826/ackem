// [extensions/gamemode/coordinator] — 游戏陪伴协调器
//
// 职责：
//   1. 管理多个 GameProvider 的生命周期
//   2. 将游戏事件路由到对应的 Provider
//   3. 收集反应并通过 ExtensionEvent 回传给主 IPC
//   4. **绝不直接修改引擎状态** — 只产出 ExtensionEvent 供 orchestrator 消费
//
// 与核心引擎的边界：
//   - 读取：通过 EngineSnapshot（只读快照）
//   - 写入：通过 ExtensionEvent（由 orchestrator 在 runPreLlmTurn 中统一处理）
//   - 数据：写入 data/gamemode/，不触碰 memory/、companion/ 等引擎目录

import type {
  EngineSnapshot,
  ExtensionEvent
} from '../protocols'
import type {
  GameProvider,
  GameProviderManifest,
  GameProviderConfig,
  GameProviderStatus,
  GameEvent,
  CompanionReaction,
  GameModeInvokeResult,
  GameProviderRpc,
  GameProviderReactionBuilder
} from './types'

// ═══════════════════════════════════════════════════════════════
// 协调器
// ═══════════════════════════════════════════════════════════════

export interface GameModeCoordinatorState {
  providers: Map<string, GameProvider>
  activeGameId: string | null
  engineSnapshot: EngineSnapshot | null
  pendingEvents: ExtensionEvent[]
}

export class GameModeCoordinator {
  private providers = new Map<string, GameProvider>()
  private activeGameId: string | null = null
  private engineSnapshot: EngineSnapshot | null = null
  private pendingEvents: ExtensionEvent[] = []

  // ═══════════════════════════════════════════════════════════
  // Provider 管理
  // ═══════════════════════════════════════════════════════════

  /** 注册一个 GameProvider（由插件系统或内置加载器调用） */
  async registerProvider(provider: GameProvider): Promise<void> {
    if (this.providers.has(provider.gameId)) {
      throw new Error(`GameProvider '${provider.gameId}' already registered`)
    }
    this.providers.set(provider.gameId, provider)

    // 设置事件回调
    provider.onEvent(async (event: GameEvent) => {
      return this.handleGameEvent(event)
    })
  }

  /** 注销 GameProvider */
  async unregisterProvider(gameId: string): Promise<void> {
    const provider = this.providers.get(gameId)
    if (!provider) return
    await provider.disconnect()
    this.providers.delete(gameId)
    if (this.activeGameId === gameId) {
      this.activeGameId = null
    }
  }

  /** 列出所有已注册的 GameProvider 清单 */
  listProviders(): GameProviderManifest[] {
    return Array.from(this.providers.values()).map(p => p.manifest)
  }

  // ═══════════════════════════════════════════════════════════
  // 连接管理
  // ═══════════════════════════════════════════════════════════

  /** 激活并连接指定游戏 */
  async activateGame(gameId: string, config: GameProviderConfig): Promise<void> {
    const provider = this.providers.get(gameId)
    if (!provider) {
      throw new Error(`GameProvider '${gameId}' not registered`)
    }

    // 先断开当前活跃游戏
    if (this.activeGameId && this.activeGameId !== gameId) {
      await this.providers.get(this.activeGameId)?.disconnect()
    }

    await provider.connect(config)
    this.activeGameId = gameId

    if (provider.hooks.onLoad) {
      await provider.hooks.onLoad(this.engineSnapshot!)
    }
  }

  /** 断开当前活跃游戏 */
  async deactivateGame(): Promise<void> {
    if (!this.activeGameId) return
    const provider = this.providers.get(this.activeGameId)
    if (provider) {
      await provider.disconnect()
      if (provider.hooks.onUnload) {
        await provider.hooks.onUnload()
      }
    }
    this.activeGameId = null
  }

  /** 调用指定游戏的 RPC 方法 */
  async invoke(
    gameId: string,
    method: string,
    params?: Record<string, unknown>
  ): Promise<GameModeInvokeResult<unknown>> {
    const provider = this.providers.get(gameId)
    if (!provider) {
      return { ok: false, error: `GameProvider '${gameId}' not registered` }
    }
    const rpc = provider as unknown as GameProviderRpc
    if (typeof rpc.invoke !== 'function') {
      return { ok: false, error: `GameProvider '${gameId}' does not support RPC` }
    }
    return rpc.invoke(method, params ?? {})
  }

  /** 获取当前活跃游戏状态 */
  getActiveStatus(): { gameId: string | null; status: GameProviderStatus | null } {
    if (!this.activeGameId) return { gameId: null, status: null }
    const provider = this.providers.get(this.activeGameId)
    return {
      gameId: this.activeGameId,
      status: provider?.getStatus() ?? null
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 引擎同步
  // ═══════════════════════════════════════════════════════════

  /**
   * 更新引擎快照（由主 IPC 在每轮 Pre-LLM 后调用）。
   * 不直接修改引擎 — 只更新本地的只读副本并通知 Provider。
   */
  updateEngineSnapshot(snapshot: EngineSnapshot): void {
    this.engineSnapshot = snapshot
    for (const provider of this.providers.values()) {
      provider.updateSnapshot(snapshot)
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 事件处理
  // ═══════════════════════════════════════════════════════════

  /** 处理游戏事件的内部回调 */
  private async handleGameEvent(event: GameEvent): Promise<CompanionReaction | null> {
    const provider = this.providers.get(event.gameId)
    if (!provider) return null

    let reaction: CompanionReaction | null = null
    const builder = provider as GameProvider & GameProviderReactionBuilder
    if (typeof builder.buildReaction === 'function') {
      try {
        reaction = await builder.buildReaction(event)
      } catch {
        reaction = null
      }
    }

    if (!reaction) {
      reaction = {
        eventId: event.id,
        mode: 'bubble',
        bubble: this.generateQuickBubble(event),
        emotion: {
          delta: {
            aff: event.valence === 'positive' ? 2 : event.valence === 'negative' ? -1 : 0,
            sec: event.valence === 'positive' ? 1 : event.valence === 'negative' ? -2 : 0,
            aro: 2,
            dom: 0
          },
          labelPriority: event.valence === 'positive'
            ? ['EXCITED', 'HAPPY']
            : ['CONCERNED', 'ANXIOUS']
        },
        shouldRemember: event.severity > 0.5,
        memorySummary: event.severity > 0.5
          ? `[${event.gameId}] ${event.raw.slice(0, 120)}`
          : undefined,
        cooldownSeconds: 10
      }
    }

    const extEvent: ExtensionEvent = {
      id: `gamemode-${event.id}`,
      category: 'gamemode',
      sourceId: provider.manifest.id,
      type: event.type,
      payload: { ...event.payload, reactionText: reaction.bubble },
      timestamp: event.timestamp,
      injectToContext: Boolean(reaction.bubble || reaction.shouldRemember),
      contextInjection: reaction.shouldRemember
        ? `[游戏·${event.gameId}] ${reaction.memorySummary ?? reaction.bubble ?? event.raw}`
        : reaction.bubble
          ? `[游戏·${event.gameId}] ${reaction.bubble}`
          : `[游戏事件] ${event.gameId}: ${event.raw}`,
      emotionHint: {
        affDelta: reaction.emotion.delta.aff,
        secDelta: reaction.emotion.delta.sec,
        aroDelta: reaction.emotion.delta.aro,
        domDelta: reaction.emotion.delta.dom
      }
    }

    this.pendingEvents.push(extEvent)
    return reaction
  }

  private generateQuickBubble(event: GameEvent): string {
    const bubbles: Record<string, string[]> = {
      positive: ['哇！', '好耶~', '太棒了！', '厉害！'],
      negative: ['啊……', '小心！', '没事吧？', '唔…'],
      neutral: ['嗯？', '我在看呢~', '继续加油~']
    }
    const pool = bubbles[event.valence] ?? bubbles.neutral
    return pool[Math.floor(Math.random() * pool.length)]
  }

  // ═══════════════════════════════════════════════════════════
  // 事件收集 — 供 orchestrator / IPC 调用
  // ═══════════════════════════════════════════════════════════

  /** 读取待处理事件（不清空） */
  collectPendingEvents(): ExtensionEvent[] {
    return [...this.pendingEvents]
  }

  /** 获取并清空待处理的扩展事件 */
  drainEvents(): ExtensionEvent[] {
    const events = [...this.pendingEvents]
    for (const provider of this.providers.values()) {
      events.push(...provider.drainEvents())
    }
    this.pendingEvents = []
    return events
  }

  /**
   * 获取本轮上下文注入文本（合并所有 Provider 的注入）。
   * 由 context.ts 在拼装系统提示时调用。
   */
  getContextInjections(): string[] {
    return this.pendingEvents
      .filter(e => e.injectToContext && e.contextInjection)
      .map(e => e.contextInjection!)
  }
}

/** 全局单例 */
export const gameModeCoordinator = new GameModeCoordinator()
