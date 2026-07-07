// [extensions/gamemode/providers/minecraft/provider] 鈥?Minecraft GameProvider

import type {
  GameProvider,
  GameProviderManifest,
  GameProviderConfig,
  GameProviderStatus,
  GameEvent,
  CompanionReaction,
  GameModeHostBridge,
  GameModeInvokeResult,
  GameProviderRpc,
  GameProviderReactionBuilder
} from '../../types'
import type { ExtensionEvent, EngineSnapshot } from '../../../protocols'
import type { McGameEvent } from './types'
import { mcEventToGameEvent, reactionResultToCompanion, snapshotToEngineStateForGaming } from './adapters'
import { MINECRAFT_RPC_METHODS } from './rpc-methods'
import { MinecraftGameService } from './service'

export const MINECRAFT_MANIFEST: GameProviderManifest = {
  id: 'Ackem/mc-companion@0.2.0',
  name: 'Minecraft 闄即',
  version: '0.2.0',
  category: 'gamemode',
  gameId: 'minecraft',
  gameName: 'Minecraft',
  eventSources: ['log_file', 'manual', 'websocket'],
  description: '涓?Minecraft 鎻愪緵 AI 浼翠荆闄即锛氭棩蹇楄В鏋愩€佷簨浠跺弽搴斻€丅ot 鎺у埗',
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'provider.ts',
  engineVersion: '0.1.0',
  tags: ['minecraft', 'gaming', 'companion'],
  recommendedPersonalityTags: ['蹇犵姮', '娲绘臣', '鍌插▏', '娓╂煍', '鍏冩皵'],
  rpcMethods: [...MINECRAFT_RPC_METHODS]
}

export class MinecraftProvider implements GameProvider, GameProviderRpc, GameProviderReactionBuilder {
  readonly gameId = 'minecraft'
  readonly manifest = MINECRAFT_MANIFEST

  private readonly service: MinecraftGameService
  private bridge: GameModeHostBridge
  private config: GameProviderConfig | null = null
  private eventHandler: ((event: GameEvent) => Promise<CompanionReaction | null>) | null = null
  private snapshot: EngineSnapshot | null = null
  private pendingEvents: ExtensionEvent[] = []

  private status: GameProviderStatus = {
    connected: false,
    gameRunning: false,
    eventsReceived: 0,
    reactionsSent: 0,
    errors: []
  }

  constructor(bridge: GameModeHostBridge) {
    this.bridge = bridge
    this.service = new MinecraftGameService(bridge)
    this.service.setEventHandler(async (event) => {
      if (this.eventHandler) {
        return this.eventHandler(event)
      }
      return null
    })
  }

  hooks = {
    onLoad: async (snapshot: EngineSnapshot) => {
      this.snapshot = snapshot
      await this.service.syncEngineState()
      return { ok: true }
    },
    onUnload: async () => {
      await this.disconnect()
      return { ok: true }
    },
    onEngineUpdate: async (snapshot: EngineSnapshot) => {
      this.snapshot = snapshot
      await this.service.syncEngineState()
      return { ok: true }
    }
  }

  async connect(config: GameProviderConfig): Promise<void> {
    this.config = config
    const port = config.wsPort ?? 19532
    this.service.ensureWsServer(port)
    await this.service.syncEngineState()

    if (config.logPath && (config.eventSources?.includes('log_file') ?? true)) {
      await this.service.logStart(config.logPath)
    }

    this.status.connected = true
    this.status.gameRunning = true
  }

  async disconnect(): Promise<void> {
    await this.service.disconnect()
    this.status.connected = false
    this.status.gameRunning = false
  }

  getStatus(): GameProviderStatus {
    return { ...this.status }
  }

  onEvent(handler: (event: GameEvent) => Promise<CompanionReaction | null>): void {
    this.eventHandler = handler
    this.service.setEventHandler(handler)
  }

  updateSnapshot(snapshot: EngineSnapshot): void {
    this.snapshot = snapshot
    void this.service.syncEngineState()
  }

  drainEvents(): ExtensionEvent[] {
    const events = [...this.pendingEvents]
    this.pendingEvents = []
    return events
  }

  async pushEvent(event: Omit<GameEvent, 'id' | 'gameId' | 'dedupKey'>): Promise<GameEvent> {
    const fullEvent: GameEvent = {
      ...event,
      id: `mc-manual-${Date.now()}-${this.status.eventsReceived}`,
      gameId: 'minecraft',
      dedupKey: `mc-${event.type}-${Date.now()}`
    }
    this.status.eventsReceived++
    this.status.lastEventAt = new Date().toISOString()

    if (this.eventHandler) {
      try {
        const reaction = await this.eventHandler(fullEvent)
        if (reaction) {
          this.status.reactionsSent++
          this.enqueueExtensionEvent(fullEvent, reaction)
        }
      } catch (err) {
        this.status.errors.push(`reaction error: ${String(err)}`)
      }
    }

    return fullEvent
  }

  async buildReaction(event: GameEvent): Promise<CompanionReaction | null> {
    const mc: McGameEvent = {
      type: event.type,
      raw: event.raw,
      timestamp: event.timestamp,
      payload: event.payload as McGameEvent['payload']
    }
    const state = this.snapshot
      ? snapshotToEngineStateForGaming(this.snapshot)
      : this.bridge.getEngineStateForGaming()
    const { selectReaction } = await import('./script-engine.js')
    const result = selectReaction(mc, state)
    return reactionResultToCompanion(result, event)
  }

  listMethods(): string[] {
    return this.service.listMethods()
  }

  async invoke(method: string, params?: Record<string, unknown>): Promise<GameModeInvokeResult<unknown>> {
    return this.service.invoke(method, params ?? {})
  }

  ensureWsServer(port = 19532): void {
    this.service.ensureWsServer(port)
  }

  registerRendererPush(fn: (channel: string, payload: unknown) => void): void {
    this.service.registerRendererPush(fn)
  }

  private enqueueExtensionEvent(event: GameEvent, reaction: CompanionReaction): void {
    this.pendingEvents.push({
      id: `mc-reaction-${event.id}`,
      category: 'gamemode',
      sourceId: this.manifest.id,
      type: event.type,
      payload: { reaction: reaction as unknown as Record<string, unknown> },
      emotionHint: {
        affDelta: reaction.emotion.delta.aff,
        secDelta: reaction.emotion.delta.sec,
        aroDelta: reaction.emotion.delta.aro,
        domDelta: reaction.emotion.delta.dom
      },
      injectToContext: reaction.shouldRemember,
      contextInjection: reaction.shouldRemember
        ? `[Minecraft] ${reaction.memorySummary ?? reaction.bubble ?? event.raw}`
        : reaction.bubble
          ? `[Minecraft] ${reaction.bubble}`
          : undefined,
      timestamp: new Date().toISOString()
    })
  }
}
