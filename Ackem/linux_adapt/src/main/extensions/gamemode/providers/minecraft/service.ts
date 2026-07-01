// [extensions/gamemode/providers/minecraft/service] — MC 子系统统一服务层

import { createLogger } from '../../../../logger'
import type { GameModeHostBridge, GameModeInvokeResult } from '../../types'
import type { GameEvent, CompanionReaction } from '../../types'
import type { McGameEvent } from './types'
import { mcEventToGameEvent, snapshotToEngineStateForGaming } from './adapters'
import { MINECRAFT_RPC_METHODS, type MinecraftRpcMethod } from './rpc-methods'

const log = createLogger('mc-service')

export type McEventHandler = (
  event: GameEvent
) => Promise<CompanionReaction | null>

export class MinecraftGameService {
  private bridge: GameModeHostBridge
  private onGameEvent: McEventHandler | null = null
  private wsPort = 19532

  constructor(bridge: GameModeHostBridge) {
    this.bridge = bridge
  }

  setEventHandler(handler: McEventHandler | null): void {
    this.onGameEvent = handler
  }

  listMethods(): string[] {
    return [...MINECRAFT_RPC_METHODS]
  }

  async invoke(method: string, params: Record<string, unknown> = {}): Promise<GameModeInvokeResult<unknown>> {
    try {
      const m = method as MinecraftRpcMethod
      switch (m) {
        case 'react':
          return { ok: true, data: await this.react(params.event as McGameEvent) }
        case 'parseLog':
          return { ok: true, data: await this.parseLog(String(params.line ?? '')) }
        case 'getWsStatus':
          return { ok: true, data: await this.getWsStatus() }
        case 'syncEngineState':
          await this.syncEngineState()
          return { ok: true, data: { ok: true } }
        case 'botStart':
          await this.botStart(params as { host: string; port?: number; username: string; password?: string })
          return { ok: true, data: { ok: true } }
        case 'botStop':
          await this.botStop()
          return { ok: true, data: { ok: true } }
        case 'botStatus':
          return { ok: true, data: await this.botStatus() }
        case 'botDebug':
          return { ok: true, data: await this.botDebug() }
        case 'logStart':
          return { ok: true, data: await this.logStart(String(params.logPath ?? '')) }
        case 'logStop':
          await this.logStop()
          return { ok: true, data: { ok: true } }
        case 'logStatus':
          return { ok: true, data: await this.logStatus() }
        default:
          return { ok: false, error: `Unknown method: ${method}` }
      }
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  ensureWsServer(port = 19532): void {
    this.wsPort = port
    void import('./mc-ws-server.js').then(m => m.startMcWsServer(port))
  }

  registerRendererPush(fn: (channel: string, payload: unknown) => void): void {
    void import('./mc-ws-server.js').then(m => m.setRendererPush(fn))
  }

  async syncEngineState(): Promise<void> {
    const engine = this.bridge.getEngineStateForGaming()
    const { setEngineStateForMc } = await import('./mc-log-watcher.js')
    setEngineStateForMc(engine)
    try {
      const { setEngineState } = await import('./mc-bot.js')
      setEngineState(engine)
    } catch { /* bot optional */ }
  }

  private async react(event: McGameEvent) {
    const { selectReaction } = await import('./script-engine.js')
    const state = this.bridge.getEngineStateForGaming()
    return selectReaction(event, state)
  }

  private async parseLog(line: string) {
    const { parseLogLine } = await import('./mc-event-parser.js')
    return parseLogLine(line)
  }

  private async getWsStatus() {
    const { getMcStatus } = await import('./mc-ws-server.js')
    return getMcStatus()
  }

  private async botStart(cfg: { host: string; port?: number; username: string; password?: string }) {
    await this.syncEngineState()
    const { startBot, setBotCallbacks, botSendChat } = await import('./mc-bot.js')
    const bridge = this.bridge

    setBotCallbacks({
      onChatMessage: (username, message) => {
        void this.handleBotChat(username, message, botSendChat)
      },
      onEvent: (event, reaction) => {
        if (reaction) {
          // 游戏内台词已由 mc-bot emitMcGameEvent 发送；此处只推 UI / 引擎，避免重复刷屏
          void (async () => {
            const { pushMcEventToRenderer } = await import('./mc-ws-server.js')
            pushMcEventToRenderer(event?.type ?? 'mc:bot_event', reaction)
            if (event && this.onGameEvent) {
              const gameEvent = mcEventToGameEvent(event)
              await this.onGameEvent(gameEvent)
            }
          })()
        }
      },
      onError: (err) => {
        log.error('mc-bot error', err)
      }
    })

    await startBot({
      host: cfg.host,
      port: cfg.port ?? 25565,
      username: cfg.username,
      password: cfg.password,
      ackemWsUrl: `ws://localhost:${this.wsPort}`,
      tickIntervalMs: 500,
      autoCombat: true,
      autoFollow: true,
      autoMine: false
    })
  }

  private async handleBotChat(
    username: string,
    message: string,
    botSendChat: (text: string) => void
  ): Promise<void> {
    try {
      const { parseChatCommand, isMcGameplayMessage, formatInventoryContext } = await import('./mc-commands.js')
      const {
        getBotInventory,
        getCurrentGameState,
        getBotInstance,
        executeBotActions
      } = await import('./mc-bot.js')

      const gs = getCurrentGameState()
      const bi = getBotInstance()
      const inventory = getBotInventory()
      const heldItem = (bi as { heldItem?: { name?: string } } | null)?.heldItem
      const heldItemName = heldItem?.name?.replace(/^minecraft:/, '').toLowerCase() ?? null
      const playerPos = gs?.playerPosition ?? bi?.entity?.position ?? { x: 0, y: 0, z: 0 }
      const botPos = gs?.botPosition ?? bi?.entity?.position ?? { x: 0, y: 0, z: 0 }

      const cmdResult = parseChatCommand(
        message,
        inventory,
        this.bridge.getPersonalityPresetId(),
        { x: playerPos.x, y: playerPos.y, z: playerPos.z },
        { x: botPos.x, y: botPos.y, z: botPos.z },
        heldItemName
      )

      if (cmdResult) {
        if (cmdResult.type === 'reply') {
          botSendChat(cmdResult.message)
          return
        }
        if (cmdResult.type === 'actions' || cmdResult.type === 'both') {
          if (cmdResult.type === 'both' && cmdResult.message) {
            botSendChat(cmdResult.message)
          }
          await executeBotActions(cmdResult.actions)
          if (cmdResult.type === 'actions' && cmdResult.reply) {
            botSendChat(cmdResult.reply)
          }
          return
        }
      }

      if (isMcGameplayMessage(message)) {
        botSendChat('没听懂要哪种物品，说具体点，比如「给我钻石」或「你背包有什么」。')
        return
      }

      const invCtx = formatInventoryContext(inventory, heldItemName)
      const userText = `${username} 在游戏里对你说：${message}\n【你当前携带】${invCtx}\n请用简短中文在游戏聊天里回复（不超过60字）。不要写英文物品ID；背包里没有的东西就说没有，不要编造。`

      const replyText = await this.bridge.runIngameChat(userText, [message])
      if (replyText) botSendChat(replyText)
    } catch (err) {
      log.error('mc-bot chat callback error', err)
      try { botSendChat('（暂时没法好好说话…）') } catch { /* ignore */ }
    }
  }

  private async botStop() {
    const { stopBot } = await import('./mc-bot.js')
    await stopBot()
  }

  private async botStatus() {
    const { getBotStatus } = await import('./mc-bot.js')
    return getBotStatus() ?? { connected: false }
  }

  private async botDebug() {
    const { getBotDebugSnapshot } = await import('./mc-bot.js')
    return getBotDebugSnapshot()
  }

  async logStart(logPath: string) {
    this.ensureWsServer(this.wsPort)
    await this.syncEngineState()
    const { startMcLogWatcher } = await import('./mc-log-watcher.js')

    startMcLogWatcher(logPath, async (mcEvent, reactionText) => {
      if (!mcEvent) return
      const gameEvent = mcEventToGameEvent(mcEvent)
      if (this.onGameEvent) {
        await this.onGameEvent(gameEvent)
      }
      if (reactionText) {
        log.info('mc-log reaction', { text: reactionText.slice(0, 80) })
      }
    })

    return { ok: true, path: logPath }
  }

  async logStop() {
    const { stopMcLogWatcher } = await import('./mc-log-watcher.js')
    stopMcLogWatcher()
  }

  async logStatus() {
    const { isMcWatcherActive } = await import('./mc-log-watcher.js')
    return { active: isMcWatcherActive() }
  }

  async disconnect(): Promise<void> {
    await this.logStop()
    await this.botStop()
  }
}
