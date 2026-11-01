// [qq] — OneBot v11 客户端（HTTP 动作调用 + 正向 WebSocket 事件流）
//
// 设计取舍：
// - ACKM 只做「客户端」，不内置任何 QQ 协议实现。NapCat / LLOneBot / Lagrange
//   都以 OneBot v11 暴露同样的 HTTP + WS，换后端只改连接参数。
// - HTTP 用于调用动作（发消息、拉好友列表），WS 用于接收事件（消息、申请、心跳）。
// - 断线自动重连，指数退避；心跳静默超时也判定为断线。

import { WebSocket } from 'ws'
import { createLogger } from '../../logger'
import { normalizeSegments } from './cqCode'
import type { OneBotEvent, OneBotResponse } from './types'

const log = createLogger('qq-onebot')

/** 心跳静默多久判定为断线（OneBot 默认心跳间隔 5s，这里留足余量） */
const HEARTBEAT_SILENCE_MS = 90_000
const RECONNECT_BASE_MS = 1_000
const RECONNECT_MAX_MS = 30_000
const DEFAULT_CALL_TIMEOUT_MS = 15_000

export type OneBotClientOptions = {
  httpBaseUrl: string
  wsUrl: string
  accessToken?: string
  onEvent: (event: OneBotEvent) => void
  onConnected?: () => void
  onDisconnected?: (reason: string) => void
}

export type OneBotCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; retcode?: number; error: string }

export class OneBotClient {
  private ws: WebSocket | null = null
  private stopped = false
  private connectedFlag = false
  private reconnectAttempt = 0
  private reconnectTimer: NodeJS.Timeout | null = null
  private heartbeatTimer: NodeJS.Timeout | null = null
  private lastEventAt = 0
  /** WS 发动作时按 echo 关联响应 */
  private pending = new Map<
    string,
    { resolve: (v: OneBotCallResult<unknown>) => void; timer: NodeJS.Timeout }
  >()

  constructor(private readonly opts: OneBotClientOptions) {}

  get httpBaseUrl(): string {
    return this.opts.httpBaseUrl.replace(/\/+$/, '')
  }

  isConnected(): boolean {
    return this.connectedFlag
  }

  /** 建立 WS 连接并开始事件监听；重复调用是幂等的 */
  start(): void {
    if (this.stopped) this.stopped = false
    if (this.ws && (this.connectedFlag || this.ws.readyState === WebSocket.CONNECTING)) return
    this.openSocket()
    this.startHeartbeatWatch()
  }

  /** 主动断开，不再重连 */
  stop(): void {
    this.stopped = true
    this.clearReconnect()
    this.stopHeartbeatWatch()
    this.rejectAllPending('client stopped')
    const ws = this.ws
    this.ws = null
    this.connectedFlag = false
    if (ws) {
      try {
        ws.removeAllListeners()
        ws.close()
      } catch {
        /* ignore */
      }
    }
  }

  /**
   * 调用 OneBot 动作。
   * 两条通道：优先 HTTP（NapCat 的 httpServers），HTTP 不可达时回退 WS（websocketServers）。
   * 这样用户只开 WebSocket 一个端口也能用，部署最简。
   * 失败统一返回结构化结果，不抛异常，便于上层做降级文案。
   */
  async call<T = unknown>(
    action: string,
    params: Record<string, unknown> = {},
    timeoutMs = DEFAULT_CALL_TIMEOUT_MS
  ): Promise<OneBotCallResult<T>> {
    const viaHttp = await this.callHttp<T>(action, params, Math.min(timeoutMs, 8_000))
    if (viaHttp.ok) return viaHttp

    // 业务层失败（retcode 非 0）直接返回；只有传输层失败才回退 WS
    if (viaHttp.retcode != null) return viaHttp
    if (!this.connectedFlag) return viaHttp

    const viaWs = await this.callWs<T>(action, params, timeoutMs)
    if (viaWs.ok) return viaWs
    if (viaHttp.error.includes('fetch failed') || viaHttp.error.includes('ECONNREFUSED')) {
      return {
        ok: false,
        error: `${viaHttp.error}；WebSocket 通道也没响应（${viaWs.error}）。确认 NapCat 已开启 onebot 服务端口。`
      }
    }
    return viaWs
  }

  private async callHttp<T>(
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<OneBotCallResult<T>> {
    const url = `${this.httpBaseUrl}/${action}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const token = this.opts.accessToken?.trim()
      if (token) headers.Authorization = `Bearer ${token}`

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(params),
        signal: controller.signal
      })

      if (!res.ok) {
        const text = await res.text().catch(() => '')
        return { ok: false, error: `http ${res.status}: ${text.slice(0, 160)}` }
      }

      const body = (await res.json()) as OneBotResponse<T>
      const retcode = body.retcode ?? 0
      const succeeded = body.status === 'ok' || (retcode === 0 && body.status !== 'failed')
      if (!succeeded) {
        return {
          ok: false,
          retcode,
          error: body.msg || body.wording || `retcode ${retcode}`
        }
      }
      return { ok: true, data: body.data as T }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        return { ok: false, error: `timeout after ${timeoutMs}ms` }
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) }
    } finally {
      clearTimeout(timer)
    }
  }

  /** 通过 WS 发动作，靠 echo 关联响应 */
  private callWs<T>(
    action: string,
    params: Record<string, unknown>,
    timeoutMs: number
  ): Promise<OneBotCallResult<T>> {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve({ ok: false, error: 'websocket not open' })
    }

    const echo = `ackem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    return new Promise<OneBotCallResult<T>>((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(echo)
        resolve({ ok: false, error: `ws timeout after ${timeoutMs}ms` })
      }, timeoutMs)
      timer.unref?.()

      this.pending.set(echo, {
        resolve: (v) => resolve(v as OneBotCallResult<T>),
        timer
      })

      try {
        ws.send(JSON.stringify({ action, params, echo }))
      } catch (e) {
        clearTimeout(timer)
        this.pending.delete(echo)
        resolve({ ok: false, error: e instanceof Error ? e.message : String(e) })
      }
    })
  }

  /** WS 响应帧（带 echo）交给等待中的调用方；返回 true 表示这是响应而非事件 */
  private settlePending(parsed: Record<string, unknown>): boolean {
    const echo = parsed.echo
    if (typeof echo !== 'string') return false
    const entry = this.pending.get(echo)
    if (!entry) return false

    clearTimeout(entry.timer)
    this.pending.delete(echo)

    const retcode = typeof parsed.retcode === 'number' ? parsed.retcode : 0
    const status = typeof parsed.status === 'string' ? parsed.status : undefined
    const succeeded = status === 'ok' || (retcode === 0 && status !== 'failed')

    if (succeeded) {
      entry.resolve({ ok: true, data: parsed.data })
    } else {
      entry.resolve({
        ok: false,
        retcode,
        error:
          (typeof parsed.msg === 'string' && parsed.msg) ||
          (typeof parsed.wording === 'string' && parsed.wording) ||
          `retcode ${retcode}`
      })
    }
    return true
  }

  /** 逐段发送消息；segment 由上层用 cqCode.ts 构建 */
  async sendPrivateMessage(userId: string | number, message: unknown[]): Promise<OneBotCallResult<{ message_id?: number }>> {
    return this.call('send_private_msg', { user_id: Number(userId), message })
  }

  async sendGroupMessage(groupId: string | number, message: unknown[]): Promise<OneBotCallResult<{ message_id?: number }>> {
    return this.call('send_group_msg', { group_id: Number(groupId), message })
  }

  // ── 内部 ────────────────────────────────────────────────

  /** 断开时把所有等待中的 WS 调用立即结清，避免调用方挂到超时 */
  private rejectAllPending(reason: string): void {
    for (const [, entry] of this.pending) {
      clearTimeout(entry.timer)
      entry.resolve({ ok: false, error: reason })
    }
    this.pending.clear()
  }

  private buildWsUrl(): string {
    const raw = this.opts.wsUrl.trim()
    const token = this.opts.accessToken?.trim()
    if (!token) return raw
    try {
      const url = new URL(raw)
      url.searchParams.set('access_token', token)
      return url.toString()
    } catch {
      // wsUrl 不是合法 URL 时原样返回，让底层连接报错暴露配置问题
      return raw
    }
  }

  /** 日志脱敏：去掉 query（access_token）与账号密码，防止 token 泄漏进日志文件 */
  private redactUrl(u: string): string {
    try {
      const url = new URL(u)
      url.search = ''
      url.username = ''
      url.password = ''
      return url.toString()
    } catch {
      return u
    }
  }

  private openSocket(): void {
    const url = this.buildWsUrl()
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
    } catch (e) {
      log.error('ws construct failed', { url: this.redactUrl(url), error: String(e) })
      this.scheduleReconnect()
      return
    }
    this.ws = ws

    ws.on('open', () => {
      if (this.stopped) {
        try {
          ws.close()
        } catch {
          /* ignore */
        }
        return
      }
      this.connectedFlag = true
      this.reconnectAttempt = 0
      this.lastEventAt = Date.now()
      log.info('onebot ws connected', { url: this.redactUrl(url) })
      this.opts.onConnected?.()
    })

    ws.on('message', (data) => {
      this.lastEventAt = Date.now()
      this.handleRawMessage(data)
    })

    ws.on('close', (code, reasonBuf) => {
      const reason = reasonBuf?.toString?.() || `code ${code}`
      this.connectedFlag = false
      this.ws = null
      if (this.stopped) return
      log.warn('onebot ws closed', { code, reason })
      this.opts.onDisconnected?.(reason)
      this.scheduleReconnect()
    })

    ws.on('error', (err) => {
      this.connectedFlag = false
      log.warn('onebot ws error', { error: err instanceof Error ? err.message : String(err) })
      // close 事件会随后触发并负责重连；这里不重复调度
    })
  }

  private handleRawMessage(data: unknown): void {
    let text: string
    if (typeof data === 'string') text = data
    else if (Buffer.isBuffer(data)) text = data.toString('utf-8')
    else if (Array.isArray(data)) text = Buffer.concat(data as Buffer[]).toString('utf-8')
    else text = String(data)

    if (!text.trim()) return

    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      log.debug('non-json ws frame ignored')
      return
    }

    const events = Array.isArray(parsed) ? parsed : [parsed]
    for (const item of events) {
      if (!item || typeof item !== 'object') continue
      // 带 echo 的帧是动作响应，先交给等待中的调用方，不再当事件分发
      if (this.settlePending(item as Record<string, unknown>)) continue

      const event = item as OneBotEvent
      // 消息段的 message 字段偶有 string 形式，归一成数组后再分发
      if (event.post_type === 'message' && 'message' in event) {
        const msgEvent = event as { message?: unknown }
        if (typeof msgEvent.message === 'string') {
          ;(event as { message?: unknown }).message = normalizeSegments(msgEvent.message)
        }
      }
      try {
        this.opts.onEvent(event)
      } catch (e) {
        log.error('event handler threw', e)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.stopped) return
    this.clearReconnect()
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempt, RECONNECT_MAX_MS)
    this.reconnectAttempt += 1
    log.info('onebot reconnect scheduled', { delay, attempt: this.reconnectAttempt })
    const timer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.stopped) this.openSocket()
    }, delay)
    timer.unref?.()
    this.reconnectTimer = timer
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  private startHeartbeatWatch(): void {
    this.stopHeartbeatWatch()
    const timer = setInterval(() => {
      if (this.stopped) return
      if (!this.connectedFlag) return
      if (Date.now() - this.lastEventAt <= HEARTBEAT_SILENCE_MS) return
      log.warn('onebot heartbeat silence, forcing reconnect')
      this.connectedFlag = false
      const ws = this.ws
      this.ws = null
      try {
        ws?.terminate()
      } catch {
        /* ignore */
      }
      this.opts.onDisconnected?.('heartbeat timeout')
      this.scheduleReconnect()
    }, 30_000)
    timer.unref?.()
    this.heartbeatTimer = timer
  }

  private stopHeartbeatWatch(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }
}
