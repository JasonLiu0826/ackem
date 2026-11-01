// [qq/qzone] — 说说历史 / 发表计划 / 互动去重持久化
// 与 QQ 渠道其它 store 同构：SQLite 优先，数据库不可用时退化为进程内内存表。

import { getDatabase } from '../../../db/database'
import type { QzonePlan, QzonePostRow, QzonePostSource, QzonePostStatus } from './types'

type PostDbRow = {
  id: number
  self_id: string
  tid: string | null
  content: string
  image_count: number
  ugc_right: number
  source: string
  status: string
  error: string | null
  created_at: string
  published_at: string | null
}

/** SQLite 不可用时的兜底（重启即清空，只保证当次会话 UI 可用） */
const memoryPosts: QzonePostRow[] = []
const memoryPlan = new Map<string, QzonePlan>()
const memoryReacts = new Map<string, boolean>()
let memoryPostId = 1

function db(dataRoot: string) {
  try {
    return getDatabase(dataRoot)
  } catch {
    return null
  }
}

function toRow(row: PostDbRow): QzonePostRow {
  return {
    id: row.id,
    selfId: row.self_id,
    tid: row.tid,
    content: row.content,
    imageCount: row.image_count,
    ugcRight: row.ugc_right,
    source: row.source as QzonePostSource,
    status: row.status as QzonePostStatus,
    error: row.error,
    createdAt: row.created_at,
    publishedAt: row.published_at
  }
}

export function insertQzonePost(
  dataRoot: string,
  args: {
    selfId: string
    tid?: string | null
    content: string
    imageCount: number
    ugcRight: number
    source: QzonePostSource
    status: QzonePostStatus
    error?: string | null
    createdAt?: string
  }
): QzonePostRow {
  const createdAt = args.createdAt ?? new Date().toISOString()
  const publishedAt = args.status === 'published' ? new Date().toISOString() : null
  const conn = db(dataRoot)

  if (!conn) {
    const row: QzonePostRow = {
      id: memoryPostId++,
      selfId: args.selfId,
      tid: args.tid ?? null,
      content: args.content,
      imageCount: args.imageCount,
      ugcRight: args.ugcRight,
      source: args.source,
      status: args.status,
      error: args.error ?? null,
      createdAt,
      publishedAt
    }
    memoryPosts.unshift(row)
    if (memoryPosts.length > 200) memoryPosts.length = 200
    return row
  }

  const info = conn
    .prepare(
      `INSERT INTO qq_qzone_post
         (self_id, tid, content, image_count, ugc_right, source, status, error, created_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      args.selfId,
      args.tid ?? null,
      args.content,
      args.imageCount,
      args.ugcRight,
      args.source,
      args.status,
      args.error ?? null,
      createdAt,
      publishedAt
    )
  return {
    id: Number(info.lastInsertRowid),
    selfId: args.selfId,
    tid: args.tid ?? null,
    content: args.content,
    imageCount: args.imageCount,
    ugcRight: args.ugcRight,
    source: args.source,
    status: args.status,
    error: args.error ?? null,
    createdAt,
    publishedAt
  }
}

export function listQzonePosts(dataRoot: string, selfId: string, limit = 20): QzonePostRow[] {
  const conn = db(dataRoot)
  if (!conn) {
    return memoryPosts.filter((p) => p.selfId === selfId).slice(0, limit)
  }
  const rows = conn
    .prepare(
      `SELECT id, self_id, tid, content, image_count, ugc_right, source, status, error,
              created_at, published_at
         FROM qq_qzone_post WHERE self_id = ? ORDER BY id DESC LIMIT ?`
    )
    .all(selfId, limit) as PostDbRow[]
  return rows.map(toRow)
}

export function getQzonePost(dataRoot: string, id: number): QzonePostRow | null {
  const conn = db(dataRoot)
  if (!conn) return memoryPosts.find((p) => p.id === id) ?? null
  const row = conn
    .prepare(
      `SELECT id, self_id, tid, content, image_count, ugc_right, source, status, error,
              created_at, published_at
         FROM qq_qzone_post WHERE id = ?`
    )
    .get(id) as PostDbRow | undefined
  return row ? toRow(row) : null
}

export function deleteQzonePost(dataRoot: string, id: number): void {
  const conn = db(dataRoot)
  if (!conn) {
    const idx = memoryPosts.findIndex((p) => p.id === id)
    if (idx >= 0) memoryPosts.splice(idx, 1)
    return
  }
  conn.prepare(`DELETE FROM qq_qzone_post WHERE id = ?`).run(id)
}

/** 最近几条说说正文，用作「别和上一条太像」的去重参考 */
export function recentQzoneContents(dataRoot: string, selfId: string, limit = 5): string[] {
  return listQzonePosts(dataRoot, selfId, limit)
    .filter((p) => p.status !== 'failed')
    .map((p) => p.content.trim())
    .filter(Boolean)
}

export function loadQzonePlan(dataRoot: string, selfId: string): QzonePlan {
  const conn = db(dataRoot)
  if (!conn) {
    return memoryPlan.get(selfId) ?? { selfId, dailyCount: 0 }
  }
  const row = conn
    .prepare(
      `SELECT self_id, next_publish_at, next_interact_at, daily_date, daily_count, last_publish_at
         FROM qq_qzone_plan WHERE self_id = ?`
    )
    .get(selfId) as
    | {
        self_id: string
        next_publish_at: string | null
        next_interact_at: string | null
        daily_date: string | null
        daily_count: number
        last_publish_at: string | null
      }
    | undefined
  if (!row) return { selfId, dailyCount: 0 }
  return {
    selfId,
    nextPublishAt: row.next_publish_at,
    nextInteractAt: row.next_interact_at,
    dailyDate: row.daily_date,
    dailyCount: row.daily_count,
    lastPublishAt: row.last_publish_at
  }
}

export function saveQzonePlan(dataRoot: string, plan: QzonePlan): void {
  const updatedAt = new Date().toISOString()
  const conn = db(dataRoot)
  if (!conn) {
    memoryPlan.set(plan.selfId, { ...plan, updatedAt })
    return
  }
  conn
    .prepare(
      `INSERT INTO qq_qzone_plan
         (self_id, next_publish_at, next_interact_at, daily_date, daily_count, last_publish_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(self_id) DO UPDATE SET
         next_publish_at = excluded.next_publish_at,
         next_interact_at = excluded.next_interact_at,
         daily_date = excluded.daily_date,
         daily_count = excluded.daily_count,
         last_publish_at = excluded.last_publish_at,
         updated_at = excluded.updated_at`
    )
    .run(
      plan.selfId,
      plan.nextPublishAt ?? null,
      plan.nextInteractAt ?? null,
      plan.dailyDate ?? null,
      plan.dailyCount,
      plan.lastPublishAt ?? null,
      updatedAt
    )
}

export type QzoneReactKind = 'like' | 'comment' | 'reply'

/** 互动去重：true 表示此前已经对这个 tid 做过同类互动 */
export function hasQzoneReacted(
  dataRoot: string,
  args: { selfId: string; tid: string; targetUin: string; kind: QzoneReactKind }
): boolean {
  const key = `${args.selfId}|${args.tid}|${args.targetUin}|${args.kind}`
  const conn = db(dataRoot)
  if (!conn) return memoryReacts.has(key)
  const row = conn
    .prepare(
      `SELECT 1 AS hit FROM qq_qzone_react
        WHERE self_id = ? AND tid = ? AND target_uin = ? AND kind = ?`
    )
    .get(args.selfId, args.tid, args.targetUin, args.kind)
  return Boolean(row)
}

export function markQzoneReacted(
  dataRoot: string,
  args: { selfId: string; tid: string; targetUin: string; kind: QzoneReactKind }
): void {
  const key = `${args.selfId}|${args.tid}|${args.targetUin}|${args.kind}`
  const conn = db(dataRoot)
  if (!conn) {
    memoryReacts.set(key, true)
    return
  }
  conn
    .prepare(
      `INSERT OR IGNORE INTO qq_qzone_react(self_id, tid, target_uin, kind, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(args.selfId, args.tid, args.targetUin, args.kind, new Date().toISOString())
}
