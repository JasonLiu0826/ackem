// [qq] — OneBot v11 协议类型与 QQ 渠道常量
// ACKM 作为 OneBot 客户端，连接 NapCat / LLOneBot / Lagrange 等实现暴露的 HTTP + WebSocket。
// 这样协议后端可替换，本渠道不绑定具体实现。

/**
 * OneBot v11 消息段。
 * 保持宽松结构：不同实现对 data 字段的扩展不一致，收窄只在消费处做。
 */
export type OneBotSegment = {
  type: string
  data: Record<string, unknown>
}

/** 私聊 / 群聊消息事件 */
export type OneBotMessageEvent = {
  post_type: 'message'
  message_type: 'private' | 'group'
  sub_type?: string
  time?: number
  self_id?: number
  message_id?: number
  message_seq?: number
  user_id?: number
  group_id?: number
  raw_message?: string
  message?: OneBotSegment[] | string
  sender?: {
    user_id?: number
    nickname?: string
    card?: string
    remark?: string
  }
}

/** 好友申请 / 加群申请事件 */
export type OneBotRequestEvent = {
  post_type: 'request'
  request_type: 'friend' | 'group' | string
  time?: number
  self_id?: number
  user_id?: number
  group_id?: number
  comment?: string
  flag?: string
  sub_type?: string
}

/** 心跳 / 生命周期事件 */
export type OneBotMetaEvent = {
  post_type: 'meta_event'
  meta_event_type: 'lifecycle' | 'heartbeat' | string
  time?: number
  self_id?: number
  interval?: number
  status?: { online?: boolean; good?: boolean }
}

/** 通知事件（戳一戳、群成员变动等） */
export type OneBotNoticeEvent = {
  post_type: 'notice'
  notice_type: string
  time?: number
  self_id?: number
  user_id?: number
  group_id?: number
  target_id?: number
  sub_type?: string
}

export type OneBotEvent =
  | OneBotMessageEvent
  | OneBotRequestEvent
  | OneBotMetaEvent
  | OneBotNoticeEvent

/** OneBot API 统一响应壳 */
export type OneBotResponse<T = unknown> = {
  status?: string
  retcode?: number
  data?: T
  msg?: string
  wording?: string
  echo?: string | number
}

/** OneBot 登录号信息（get_login_info） */
export type OneBotLoginInfo = {
  user_id?: number
  nickname?: string
}

/** OneBot 好友条目（get_friend_list） */
export type OneBotFriend = {
  user_id?: number
  nickname?: string
  remark?: string
}

/** QQ 渠道持久化配置：只存连接参数，不存 QQ 密码（登录态在 NapCat 侧） */
export type QqAccount = {
  /** 登录的 QQ 号 */
  selfId: string
  /** 机器人昵称 */
  nickname?: string
  /** OneBot HTTP API 基址，例：http://127.0.0.1:3001 */
  httpBaseUrl: string
  /** OneBot 正向 WebSocket 地址，例：ws://127.0.0.1:3001 */
  wsUrl: string
  /** access_token，未配置时为空 */
  accessToken?: string
}

/** OneBot 默认端口（NapCat 容器默认把 3001 同时用于 HTTP 与 WS） */
export const ONEBOT_DEFAULT_PORT = 3001
export const ONEBOT_DEFAULT_HTTP_BASE = `http://127.0.0.1:${ONEBOT_DEFAULT_PORT}`
export const ONEBOT_DEFAULT_WS_URL = `ws://127.0.0.1:${ONEBOT_DEFAULT_PORT}`

/** 单条消息最大字符数：QQ 单条上限约 4500 字节，中文按 3 字节算留余量 */
export const QQ_MAX_TEXT_PER_MESSAGE = 1400

/** 入站事件去重保留条数 */
export const QQ_SEEN_CAP = 800
