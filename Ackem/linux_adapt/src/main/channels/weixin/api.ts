import crypto from 'node:crypto'
import {
  BOT_AGENT,
  CHANNEL_VERSION,
  ILINK_APP_CLIENT_VERSION,
  ILINK_APP_ID,
  ILINK_DEFAULT_BASE,
  STALE_TOKEN_RETCODE,
  type GetUpdatesResponse,
  type QrcodeResponse,
  type QrcodeStatusResponse
} from './types'
import { createLogger } from '../../logger'

const log = createLogger('weixin-api')

function randomWechatUin(): string {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

export function buildWeixinHeaders(token?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    AuthorizationType: 'ilink_bot_token',
    'X-WECHAT-UIN': randomWechatUin(),
    'iLink-App-Id': ILINK_APP_ID,
    'iLink-App-ClientVersion': String(ILINK_APP_CLIENT_VERSION)
  }
  if (token?.trim()) {
    headers.Authorization = `Bearer ${token.trim()}`
  }
  return headers
}

export function buildBaseInfo() {
  return { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT }
}

async function postJson<T>(
  url: string,
  token: string | undefined,
  body: unknown,
  opts?: { timeoutMs?: number; abortSignal?: AbortSignal }
): Promise<T> {
  const controller = opts?.timeoutMs != null ? new AbortController() : undefined
  const timer =
    controller && opts?.timeoutMs != null
      ? setTimeout(() => controller.abort(), opts.timeoutMs)
      : undefined

  let signal = controller?.signal
  if (opts?.abortSignal && controller) {
    if (opts.abortSignal.aborted) controller.abort()
    else opts.abortSignal.addEventListener('abort', () => controller.abort(), { once: true })
  } else if (opts?.abortSignal) {
    signal = opts.abortSignal
  }

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildWeixinHeaders(token),
      body: JSON.stringify(body),
      ...(signal ? { signal } : {})
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`weixin http ${res.status}: ${text.slice(0, 200)}`)
    }
    return (await res.json()) as T
  } finally {
    if (timer != null) clearTimeout(timer)
  }
}

async function getJson<T>(url: string, token?: string): Promise<T> {
  const res = await fetch(url, { method: 'GET', headers: buildWeixinHeaders(token) })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`weixin http ${res.status}: ${text.slice(0, 200)}`)
  }
  return (await res.json()) as T
}

export async function fetchBotQrcode(
  localTokenList: string[] = [],
  baseUrl = ILINK_DEFAULT_BASE
): Promise<QrcodeResponse> {
  const url = `${baseUrl.replace(/\/$/, '')}/ilink/bot/get_bot_qrcode?bot_type=3`
  return postJson(url, undefined, { local_token_list: localTokenList })
}

export async function fetchQrcodeStatus(
  qrcode: string,
  verifyCode?: string,
  baseUrl = ILINK_DEFAULT_BASE
): Promise<QrcodeStatusResponse> {
  const qs = new URLSearchParams({ qrcode })
  if (verifyCode) qs.set('verify_code', verifyCode)
  const url = `${baseUrl.replace(/\/$/, '')}/ilink/bot/get_qrcode_status?${qs}`
  return getJson(url)
}

/** 长轮询收消息；客户端超时视为空轮询并立即重试（对齐 openclaw-weixin） */
export async function fetchUpdates(args: {
  token: string
  baseUrl: string
  getUpdatesBuf: string
  timeoutMs?: number
  abortSignal?: AbortSignal
}): Promise<GetUpdatesResponse> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/ilink/bot/getupdates`
  const timeoutMs = args.timeoutMs ?? 35_000
  try {
    return await postJson<GetUpdatesResponse>(
      url,
      args.token,
      {
        get_updates_buf: args.getUpdatesBuf,
        base_info: buildBaseInfo()
      },
      { timeoutMs, abortSignal: args.abortSignal }
    )
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: args.getUpdatesBuf }
    }
    throw e
  }
}

export function isStaleWeixinToken(resp: { ret?: number; errcode?: number }): boolean {
  return resp.ret === STALE_TOKEN_RETCODE || resp.errcode === STALE_TOKEN_RETCODE
}

export async function sendWeixinMessage(args: {
  token: string
  baseUrl: string
  toUserId: string
  text: string
  contextToken?: string
  clientId?: string
}): Promise<{ ret: number; errmsg?: string }> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/ilink/bot/sendmessage`
  const clientId = args.clientId ?? `openclaw-weixin-${crypto.randomUUID()}`
  return postJson(url, args.token, {
    msg: {
      from_user_id: '',
      to_user_id: args.toUserId,
      client_id: clientId,
      message_type: 2,
      message_state: 2,
      item_list: [{ type: 1, text_item: { text: args.text } }],
      context_token: args.contextToken ?? '',
      run_id: null
    },
    base_info: buildBaseInfo()
  })
}

export async function fetchTypingTicket(args: {
  token: string
  baseUrl: string
  ilinkUserId: string
  contextToken?: string
}): Promise<string | null> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/ilink/bot/getconfig`
  const res = await postJson<{ typing_ticket?: string }>(
    url,
    args.token,
    {
      ilink_user_id: args.ilinkUserId,
      context_token: args.contextToken ?? ''
    },
    { timeoutMs: 10_000 }
  )
  return res.typing_ticket ?? null
}

export async function sendWeixinTyping(args: {
  token: string
  baseUrl: string
  ilinkUserId: string
  typingTicket: string
  status: 1 | 2
}): Promise<void> {
  const url = `${args.baseUrl.replace(/\/$/, '')}/ilink/bot/sendtyping`
  await postJson(
    url,
    args.token,
    {
      ilink_user_id: args.ilinkUserId,
      typing_ticket: args.typingTicket,
      status: args.status
    },
    { timeoutMs: 10_000 }
  )
}

export async function notifyWeixinStart(token: string, baseUrl: string): Promise<{ ret: number }> {
  const url = `${baseUrl.replace(/\/$/, '')}/ilink/bot/msg/notifystart`
  try {
    const res = await postJson<{ ret?: number }>(
      url,
      token,
      { base_info: buildBaseInfo() },
      { timeoutMs: 10_000 }
    )
    if (res.ret != null && res.ret !== 0) {
      log.warn('notifystart non-zero', res)
    }
    return { ret: res.ret ?? 0 }
  } catch (e) {
    log.warn('notifystart failed', e)
    return { ret: -1 }
  }
}

export async function notifyWeixinStop(token: string, baseUrl: string): Promise<void> {
  const url = `${baseUrl.replace(/\/$/, '')}/ilink/bot/msg/notifystop`
  await postJson(url, token, { base_info: buildBaseInfo() }, { timeoutMs: 10_000 }).catch(() => {})
}

export function extractTextFromMessage(msg: import('./types').WeixinMessage): string {
  const items = msg.item_list ?? []
  const parts: string[] = []
  for (const item of items) {
    if (item.type === 1 && item.text_item?.text) parts.push(item.text_item.text)
  }
  return parts.join('\n').trim()
}
