export type WeixinAccount = {
  accountId: string
  token: string
  baseUrl: string
  userId?: string
}

export type WeixinMessageItem = {
  type?: number
  text_item?: { text?: string }
}

export type WeixinMessage = {
  seq?: number
  message_id?: number
  from_user_id?: string
  to_user_id?: string
  create_time_ms?: number
  session_id?: string
  message_type?: number
  message_state?: number
  item_list?: WeixinMessageItem[]
  context_token?: string
}

export type GetUpdatesResponse = {
  ret: number
  msgs?: WeixinMessage[]
  get_updates_buf?: string
  longpolling_timeout_ms?: number
  errmsg?: string
}

export type QrcodeResponse = {
  qrcode: string
  qrcode_img_content: string
}

export type QrcodeStatus =
  | 'wait'
  | 'scaned'
  | 'confirmed'
  | 'expired'
  | 'scaned_but_redirect'
  | 'need_verifycode'
  | 'verify_code_blocked'
  | 'binded_redirect'

export type QrcodeStatusResponse = {
  status: QrcodeStatus
  bot_token?: string
  ilink_bot_id?: string
  baseurl?: string
  ilink_user_id?: string
  redirect_host?: string
}

export const ILINK_DEFAULT_BASE = 'https://ilinkai.weixin.qq.com'
export const CHANNEL_VERSION = '2.4.6'
/** 与 @tencent-weixin/openclaw-weixin 对齐，微信侧会显示 OpenClaw 连接状态 */
export const BOT_AGENT = 'OpenClaw/2.4.6'
export const ILINK_APP_ID = 'bot'
export const STALE_TOKEN_RETCODE = -14

/** iLink-App-ClientVersion: major<<16 | minor<<8 | patch，2.4.6 → 132102 */
export function buildIlinkClientVersion(version: string): number {
  const parts = version.split('.').map((p) => parseInt(p, 10))
  const major = parts[0] ?? 0
  const minor = parts[1] ?? 0
  const patch = parts[2] ?? 0
  return ((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff)
}

export const ILINK_APP_CLIENT_VERSION = buildIlinkClientVersion(CHANNEL_VERSION)
