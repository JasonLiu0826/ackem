// [qq] — 连接配置校验与连通性探测
//
// QQ 与微信的登录模型不同：QQ 的扫码登录发生在协议后端（NapCat 容器）里，
// ACKM 侧只需要「填地址 + 填 token + 测试连通」。因此这里没有二维码流程。

import { OneBotClient } from './onebot'
import type { OneBotLoginInfo, QqAccount } from './types'
import { ONEBOT_DEFAULT_HTTP_BASE, ONEBOT_DEFAULT_WS_URL } from './types'

export type QqConnectionInput = {
  httpBaseUrl?: string
  wsUrl?: string
  accessToken?: string
  selfId?: string
  nickname?: string
}

/** 补默认值并做基础校验；校验失败返回可读原因 */
export function normalizeQqConnection(input: QqConnectionInput): {
  ok: true
  account: QqAccount
} | { ok: false; error: string } {
  const httpBaseUrl = (input.httpBaseUrl?.trim() || ONEBOT_DEFAULT_HTTP_BASE).replace(/\/+$/, '')
  const wsUrl = (input.wsUrl?.trim() || ONEBOT_DEFAULT_WS_URL).trim()
  const accessToken = input.accessToken?.trim() || undefined
  const selfId = input.selfId?.trim() || ''

  for (const [label, value] of [
    ['HTTP 地址', httpBaseUrl],
    ['WebSocket 地址', wsUrl]
  ] as const) {
    if (!/^https?:\/\/|^wss?:\/\//i.test(value)) {
      return { ok: false, error: `${label}格式不对，应以 http:// 或 ws:// 开头` }
    }
  }

  return {
    ok: true,
    account: {
      selfId,
      nickname: input.nickname?.trim() || undefined,
      httpBaseUrl,
      wsUrl,
      accessToken
    }
  }
}

export type QqProbeResult =
  | { ok: true; selfId: string; nickname: string; online: boolean }
  | { ok: false; error: string }

/**
 * 探测连通性：调用 get_login_info 确认 token 与 HTTP 地址可用。
 * 这一步不启动 WS 监听，可以安全地在设置页反复点击。
 */
export async function probeQqConnection(input: QqConnectionInput): Promise<QqProbeResult> {
  const normalized = normalizeQqConnection(input)
  if (!normalized.ok) return { ok: false, error: normalized.error }

  const account = normalized.account
  const client = new OneBotClient({
    httpBaseUrl: account.httpBaseUrl,
    wsUrl: account.wsUrl,
    accessToken: account.accessToken,
    onEvent: () => {}
  })

  // 用户可能只开了 WebSocket 端口（官方 compose 默认只映射 3001）。
  // 先把 WS 连起来，这样 HTTP 不可达时 call() 能自动回退到 WS。
  let settled = false
  const connected = new Promise<void>((resolve) => {
    void (async () => {
      client.start()
      // 最多等 4 秒建立连接；连不上也继续，让 HTTP 有机会成功
      for (let i = 0; i < 20 && !settled; i++) {
        if (client.isConnected()) break
        await new Promise((r) => setTimeout(r, 200))
      }
      settled = true
      resolve()
    })()
  })
  await connected

  try {
    const login = await client.call<OneBotLoginInfo>('get_login_info', {}, 10_000)
    if (!login.ok) {
      return {
        ok: false,
        error: `连不上 OneBot：${login.error}（确认 NapCat 已启动、端口可达、access_token 一致）`
      }
    }

    const data = login.data ?? {}
    const selfId = String(data.user_id ?? account.selfId ?? '')
    const nickname = String(data.nickname ?? account.nickname ?? '')
    if (!selfId) {
      return { ok: false, error: 'OneBot 返回了空账号，确认 QQ 已扫码登录' }
    }

    // get_status 部分实现不支持，失败不影响主流程
    const status = await client.call<{ online?: boolean; good?: boolean }>('get_status', {}, 5_000)
    const online = status.ok ? status.data?.online !== false : true

    return { ok: true, selfId, nickname: nickname || selfId, online }
  } finally {
    client.stop()
  }
}

/** 搭建连接对象用于登录信息二次确认（供启动时刷新昵称） */
export function buildQqClient(account: QqAccount): OneBotClient {
  return new OneBotClient({
    httpBaseUrl: account.httpBaseUrl,
    wsUrl: account.wsUrl,
    accessToken: account.accessToken,
    onEvent: () => {}
  })
}
