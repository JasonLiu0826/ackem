// [qq/qzone] — QQ 空间（说说）类型与常量
//
// 参考实现：
// - DeepSeek 大肥鱼（Aurabot）用 OneBot 扩展动作 `send_qzone_msg` 发「空间日记」，
//   在独立的后台会话里结合当天聊天流水写文案，再定时逛好友动态点赞/评论。
// - dsh_qzone_sticker 把「每天几条、两条隔多久、公开还是仅自己」做成了设置项。
// ACKM 这里同样走 OneBot 扩展动作（NapCat 已实现 send_qzone_msg 与整套 qzone_* 动作），
// 因此不需要额外起浏览器、也不碰任何账号密码；协议后端不支持时明确报能力缺失。

import type { QzoneStyleSetting, QzoneVisibilitySetting } from '../../../../shared/types'

export type { QzoneStyleSetting, QzoneVisibilitySetting }

/** 可见范围 → QQ 空间的 ugc_right */
export const QZONE_UGC_RIGHT: Record<QzoneVisibilitySetting, number> = {
  public: 1,
  friends: 4,
  private: 64
}

/** 单条说说正文上限（QQ 空间正文远长于聊天，这里给一个保守值） */
export const QZONE_MAX_TEXT = 800
/** 自动生成时希望落在的长度区间 */
export const QZONE_SOFT_MIN = 40
export const QZONE_SOFT_MAX = 260

/** 协议后端对空间动作的支持情况（探测结果，缓存到本次进程） */
export type QzoneCapabilities = {
  /** send_qzone_msg */
  publish: boolean
  /** get_qzone_msg_list */
  list: boolean
  /** get_qzone_feeds */
  feeds: boolean
  /** like_qzone */
  like: boolean
  /** comment_qzone */
  comment: boolean
  /** delete_qzone_msg */
  delete: boolean
  probedAt?: string
  error?: string
}

export type QzonePostStatus = 'published' | 'failed' | 'dry_run'
export type QzonePostSource = 'auto' | 'manual'

export type QzonePostRow = {
  id: number
  selfId: string
  tid?: string | null
  content: string
  imageCount: number
  ugcRight: number
  source: QzonePostSource
  status: QzonePostStatus
  error?: string | null
  createdAt: string
  publishedAt?: string | null
}

/** 发表节奏与当日计数（按登录 QQ 号分开记） */
export type QzonePlan = {
  selfId: string
  nextPublishAt?: string | null
  nextInteractAt?: string | null
  dailyDate?: string | null
  dailyCount: number
  lastPublishAt?: string | null
  updatedAt?: string
}

export type QzoneStatus = {
  connected: boolean
  selfId?: string
  nickname?: string
  enabled: boolean
  dryRun: boolean
  dailyLimit: number
  dailyCount: number
  minIntervalMinutes: number
  activeHours: { start: number; end: number }
  visibility: QzoneVisibilitySetting
  style: QzoneStyleSetting
  withImage: boolean
  syncToChat: boolean
  interactEnabled: boolean
  likeProb: number
  commentProb: number
  nextPublishAt?: string | null
  lastPublishedAt?: string | null
  caps: QzoneCapabilities
  memeCount: number
  lastError?: string | null
}

export type QzoneDraft = {
  text: string
  mood: string
  style: QzoneStyleSetting
  /** 建议配图（本地表情包路径），实际发不发由设置决定 */
  imagePath?: string | null
}

export type QzonePublishInput = {
  content: string
  visibility?: QzoneVisibilitySetting
  withImage?: boolean
  dryRun?: boolean
  source?: QzonePostSource
}

export type QzonePublishResult = {
  ok: boolean
  dryRun?: boolean
  tid?: string
  error?: string
  post?: QzonePostRow
}

export type QzoneInteractionSummary = {
  liked: number
  commented: number
  replied: number
  skipped: number
  error?: string
}
