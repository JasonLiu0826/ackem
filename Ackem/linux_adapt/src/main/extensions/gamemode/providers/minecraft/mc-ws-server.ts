// [gaming/mc-ws-server] — MC WebSocket 服务
// 职责：在 ws://localhost:19532 监听 Mineflayer bot 或外部客户端连接
// 引用：./types, ./mc-event-parser, ./script-engine

import { WebSocketServer, WebSocket } from 'ws'
import type { McGameEvent, EngineStateForGaming, ReactionResult } from './types'
import { classifyEmotion, selectReaction } from './script-engine'
import { createLogger } from '../../../../logger'

const log = createLogger('mc-ws')

let wss: WebSocketServer | null = null
let clients = new Set<WebSocket>()

/** MC 日志监听的当前状态 */
export type McWatcherStatus = {
  running: boolean
  wsPort: number
  wsClients: number
  logPath?: string
  lastEvent?: McGameEvent
  lastReaction?: string
}

let status: McWatcherStatus = {
  running: false,
  wsPort: 19532,
  wsClients: 0
}

export function getMcStatus(): McWatcherStatus {
  return { ...status, wsClients: clients.size }
}

/**
 * 启动 WebSocket 服务
 */
export function startMcWsServer(port = 19532): WebSocketServer {
  if (wss) return wss

  wss = new WebSocketServer({ port })
  status.running = true
  status.wsPort = port

  wss.on('listening', () => {
    log.info('listening', { url: `ws://localhost:${port}` })
  })

  wss.on('connection', (ws) => {
    clients.add(ws)
    status.wsClients = clients.size
    log.info('client connected', { total: clients.size })

    ws.on('close', () => {
      clients.delete(ws)
      status.wsClients = clients.size
      log.info('client disconnected', { total: clients.size })
    })

    ws.on('error', (err) => {
      log.error('client error', { message: err.message })
      clients.delete(ws)
      status.wsClients = clients.size
    })

    // 接收客户端消息（游戏状态上报等）
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString())
        if (msg.type !== 'game_state') {
          log.debug('received message', { type: msg.type ?? 'unknown' })
        }
      } catch {
        // 忽略非 JSON 消息
      }
    })
  })

  wss.on('error', (err) => {
    log.error('server error', { message: err.message })
    status.running = false
  })

  return wss
}

/**
 * 停止 WebSocket 服务
 */
export function stopMcWsServer(): void {
  if (!wss) return
  for (const ws of clients) {
    ws.close(1001, 'Server shutting down')
  }
  clients.clear()
  wss.close()
  wss = null
  status.running = false
  status.wsClients = 0
}

/** 渲染进程推送回调（由主进程注册） */
type RendererPushFn = (channel: string, payload: unknown) => void
let rendererPush: RendererPushFn | null = null
const pendingMcEvents: Array<{ event: unknown; reaction: unknown }> = []

/** 注册渲染进程推送回调（ipc.ts 中设置，以便 WebContents.send 到渲染进程） */
export function setRendererPush(fn: RendererPushFn): void {
  rendererPush = fn
  for (const ev of pendingMcEvents) {
    try {
      fn('mc:event', ev)
      fn('ext:gamemode:event', { gameId: 'minecraft', event: ev.event, reaction: ev.reaction })
    } catch { /* ignore */ }
  }
  pendingMcEvents.length = 0
}

/**
 * 向所有客户端广播消息，同时推送到渲染进程
 */
export function broadcastMcEvent(event: McGameEvent, reaction?: ReactionResult): void {
  const eventData = {
    type: event.type,
    raw: event.raw,
    payload: event.payload,
    timestamp: event.timestamp
  }
  const reactionData = reaction ? {
    text: reaction.text,
    isEasterEgg: reaction.isEasterEgg,
    emotionGroup: reaction.emotionGroup
  } : null

  const payload = JSON.stringify({ type: 'game_event', event: eventData, reaction: reactionData })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }

  // 推送到 Electron 渲染进程 → ChatPage 紫色气泡
  if (reactionData?.text) {
    const payload = { gameId: 'minecraft', event: eventData, reaction: reactionData }
    if (rendererPush) {
      try {
        rendererPush('mc:event', { event: eventData, reaction: reactionData })
        rendererPush('ext:gamemode:event', payload)
      } catch { /* ignore push errors */ }
    } else {
      pendingMcEvents.push({ event: eventData, reaction: reactionData })
    }
  }
}

/**
 * 通用渲染进程推送 — bot 模式事件和日志事件共用
 * 在 ChatPage 显示紫色气泡
 */
/** 推送 Bot 实机调试快照到渲染进程（McPage 调试面板） */
export function pushMcDebugToRenderer(snapshot: import('./mc-bot-state.js').McBotDebugSnapshot): void {
  if (rendererPush) {
    try {
      rendererPush('mc:botDebug', snapshot)
    } catch { /* ignore */ }
  }
}

export function pushMcEventToRenderer(eventType: string, reactionText: string, extra?: Record<string, unknown>): void {
  if (!reactionText) return
  const eventData = { type: eventType, raw: '', payload: extra ?? {}, timestamp: new Date().toISOString() }
  const reactionData = { text: reactionText, isEasterEgg: false, emotionGroup: 'CALM' }
  const payload = { gameId: 'minecraft', event: eventData, reaction: reactionData }
  if (rendererPush) {
    try {
      rendererPush('mc:event', { event: eventData, reaction: reactionData })
      rendererPush('ext:gamemode:event', payload)
    } catch { /* ignore */ }
  } else {
    pendingMcEvents.push({ event: eventData, reaction: reactionData })
  }
}

/**
 * 向所有客户端发送聊天回复
 */
export function broadcastMcChatReply(message: string): void {
  const payload = JSON.stringify({ type: 'chat_reply', message })
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload)
    }
  }
}
