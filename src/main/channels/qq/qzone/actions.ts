// [qq/qzone] — OneBot 空间动作封装 + 能力探测
//
// 全部走 NapCat / SnowLuma 已实现的扩展动作：
//   send_qzone_msg / get_qzone_msg_list / get_qzone_feeds / like_qzone /
//   comment_qzone / delete_qzone_msg
// 返回值按「宽松解析」处理：不同实现对 msglist、feeds、comments 的字段命名不一致，
// 这里只认最小必需集（tid、content、uin、comment_id），解析不出来就跳过而不是抛错。

import type { OneBotClient } from '../onebot'
import { createLogger } from '../../../logger'
import type { QzoneCapabilities } from './types'

const log = createLogger('qq-qzone-actions')

type Raw = Record<string, unknown>

export type QzoneComment = {
  commentId?: string
  uin?: string
  name?: string
  content: string
  createTime?: number
  /** 楼中楼（部分后端会内联返回） */
  replies?: QzoneComment[]
}

export type QzoneMsg = {
  tid: string
  /** 作者 QQ（说说本人的号） */
  uin?: string
  nickname?: string
  content: string
  createdTime?: number
  abstime?: number
  comments: QzoneComment[]
  likeCount?: number
}

function isObj(v: unknown): v is Raw {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v)
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : []
}

function str(v: unknown): string {
  if (typeof v === 'string') return v
  if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  return ''
}

function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim() && Number.isFinite(Number(v))) return Number(v)
  return undefined
}

/** 从一段可能嵌套的返回里找列表 */
function findList(data: unknown, keys: string[]): unknown[] {
  if (Array.isArray(data)) return data
  if (!isObj(data)) return []
  for (const key of keys) {
    const hit = asArray((data as Raw)[key])
    if (hit.length) return hit
  }
  if (isObj(data.data)) return findList(data.data, keys)
  return []
}

function normalizeComments(raw: unknown): QzoneComment[] {
  return asArray(raw)
    .filter(isObj)
    .map((c) => {
      const replies = normalizeComments(c.replies ?? c.replylist ?? c.replyList)
      const out: QzoneComment = {
        commentId: str(c.commentid ?? c.comment_id ?? c.id ?? c.tid) || undefined,
        uin: str(c.uin ?? c.user_uin ?? c.userid) || undefined,
        name: str(c.name ?? c.nickname) || undefined,
        content: str(c.content ?? c.text),
        createTime: num(c.create_time ?? c.createTime ?? c.time)
      }
      if (replies.length) out.replies = replies
      return out
    })
    .filter((c) => c.content || c.uin)
}

function normalizeMsg(item: unknown): QzoneMsg | null {
  if (!isObj(item)) return null
  const tid = str(item.tid ?? item.id ?? item.feedId ?? item.feed_id ?? item.cellId)
  const content = str(item.content ?? item.text ?? item.summary ?? item.rt_con)
  if (!tid && !content) return null
  return {
    tid,
    uin: str(item.uin ?? item.user_uin ?? item.userId) || undefined,
    nickname: str(item.nickname ?? item.name) || undefined,
    content,
    createdTime: num(item.created_time ?? item.createTime ?? item.time),
    abstime: num(item.abstime ?? item.created_time ?? item.time),
    comments: normalizeComments(item.commentlist ?? item.commentList ?? item.comments),
    likeCount: num(item.like_count ?? item.likeCount ?? item.praiseTimes)
  }
}

export function normalizeQzoneMsgList(data: unknown): QzoneMsg[] {
  return findList(data, ['msglist', 'msgList', 'list', 'feeds', 'items'])
    .map(normalizeMsg)
    .filter((m): m is QzoneMsg => Boolean(m))
}

function unsupported(error: string | undefined): boolean {
  if (!error) return false
  return /不支持|unsupported|unknown action|not ?found|404|1404/i.test(error)
}

/** 一次空间动作的薄封装；所有方法都把失败折叠成 { ok:false, error } */
export class QzoneActions {
  constructor(
    private readonly client: OneBotClient,
    private readonly selfId: string
  ) {}

  get backendSelfId(): string {
    return this.selfId
  }

  async probe(): Promise<QzoneCapabilities> {
    const probedAt = new Date().toISOString()
    const listRes = await this.client.call('get_qzone_msg_list', { pos: 0, num: 1 }, 12_000)
    if (!listRes.ok) {
      return {
        publish: false,
        list: false,
        feeds: false,
        like: false,
        comment: false,
        delete: false,
        probedAt,
        error: unsupported(listRes.error)
          ? '当前协议后端没有 QQ 空间扩展接口（需要 NapCat / SnowLuma 一类支持 send_qzone_msg 的实现）。'
          : listRes.error
      }
    }

    const feedsRes = await this.client.call('get_qzone_feeds', { page_num: 1, count: 1 }, 12_000)
    // 发布动作无法在不发内容的前提下探测，按 NapCat 的动作族整体推断：
    // 列表能读通就认为同一族里的写入动作存在；真写失败时 publish 会带原始错误返回。
    return {
      publish: true,
      list: true,
      feeds: feedsRes.ok,
      like: feedsRes.ok,
      comment: true,
      delete: true,
      probedAt
    }
  }

  async listMine(pos = 0, num = 10): Promise<{ ok: true; items: QzoneMsg[] } | { ok: false; error: string }> {
    const res = await this.client.call('get_qzone_msg_list', { pos, num }, 20_000)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, items: normalizeQzoneMsgList(res.data) }
  }

  async feeds(count = 8): Promise<{ ok: true; items: QzoneMsg[] } | { ok: false; error: string }> {
    const res = await this.client.call('get_qzone_feeds', { page_num: 1, count }, 20_000)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true, items: normalizeQzoneMsgList(res.data) }
  }

  async publish(args: {
    content: string
    images?: string[]
    ugcRight: number
  }): Promise<{ ok: true; tid?: string } | { ok: false; error: string }> {
    const payload: Record<string, unknown> = {
      content: args.content,
      ugc_right: args.ugcRight
    }
    if (args.images?.length) payload.images = args.images

    const res = await this.client.call<Raw>('send_qzone_msg', payload, 30_000)
    if (!res.ok) {
      log.warn('send_qzone_msg failed', { error: res.error })
      return { ok: false, error: res.error }
    }
    const tid = isObj(res.data) ? str(res.data.tid ?? res.data.tid_str) : ''
    return { ok: true, tid: tid || undefined }
  }

  async delete(tid: string): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await this.client.call('delete_qzone_msg', { tid, target_uin: this.selfId }, 20_000)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true }
  }

  async like(args: {
    tid: string
    targetUin: string
    abstime?: number
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const res = await this.client.call(
      'like_qzone',
      { tid: args.tid, target_uin: args.targetUin, abstime: args.abstime ?? 0 },
      20_000
    )
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true }
  }

  async comment(args: {
    tid: string
    targetUin: string
    content: string
    /** 回复楼中楼时给出被回复的评论 */
    replyTo?: { commentId?: string; commentUin?: string }
  }): Promise<{ ok: true } | { ok: false; error: string }> {
    const payload: Record<string, unknown> = {
      tid: args.tid,
      target_uin: args.targetUin,
      content: args.content
    }
    if (args.replyTo?.commentId && args.replyTo.commentUin) {
      payload.comment_id = args.replyTo.commentId
      payload.comment_uin = args.replyTo.commentUin
    }
    const res = await this.client.call('comment_qzone', payload, 20_000)
    if (!res.ok) return { ok: false, error: res.error }
    return { ok: true }
  }
}
