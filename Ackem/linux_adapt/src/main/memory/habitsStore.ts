// [habitsStore] — 用户习惯槽
// 职责：存储和查询用户的短时/长时习惯，匹配时间槽，自动升级和降级
// 设计文档：docs/plan/主动策略调度loop详细设计_6_11.md

import { randomUUID } from 'node:crypto'
import { getDatabase } from '../db/database'
import type { UserHabit, HabitType, HabitScope, HabitSource, TimeSlot } from '../extensions/policy/types'

const LONG_TERM_MIN_OCCURRENCES = 3
const LONG_TERM_MIN_WEEKS = 2
const LONG_TERM_BASE_CONFIDENCE = 0.6
const LONG_TERM_CONFIDENCE_INCREMENT = 0.1
const LONG_TERM_CONFIDENCE_CAP = 0.95
const DECAY_WEEKS_THRESHOLD = 4
const DECAY_WEEKLY_RATE = 0.1
const DECAY_SLEEP_THRESHOLD = 0.4
const MAX_SHORT_TERM_PER_DAY = 3

function weekOfYear(ms: number): number {
  const d = new Date(ms)
  const start = new Date(d.getFullYear(), 0, 1)
  return Math.floor((d.getTime() - start.getTime()) / (7 * 86400000))
}

function rowToHabit(row: Record<string, unknown>): UserHabit {
  return {
    id: row.id as string,
    type: row.type as HabitType,
    scope: row.scope as HabitScope,
    weekday: row.weekday as number | null,
    hourStart: row.hour_start as number,
    hourEnd: row.hour_end as number,
    confidence: row.confidence as number,
    occurrenceCount: row.occurrence_count as number,
    firstSeenAt: row.first_seen_at as number,
    lastConfirmedAt: row.last_confirmed_at as number,
    expiresAt: row.expires_at as number | null,
    source: row.source as HabitSource,
    suppressTarget: (row.suppress_target as string) || null,
    note: row.note as string,
    createdAt: row.created_at as number,
    updatedAt: row.updated_at as number,
  }
}

/** 匹配当前时间命中的所有习惯（Loop 每 60s 调用） */
export function matchHabits(dataRoot: string, now: Date = new Date()): UserHabit[] {
  const db = getDatabase(dataRoot)
  if (!db) return []

  const weekday = now.getDay()
  const hour = now.getHours()
  const nowMs = now.getTime()

  const rows = db
    .prepare(
      `SELECT * FROM user_habits
       WHERE (weekday IS NULL OR weekday = ?)
         AND (hour_start <= ? AND hour_end >= ?
              OR hour_start > hour_end AND (hour_start <= ? OR hour_end >= ?))
         AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY
         CASE scope WHEN 'long_term' THEN 0 ELSE 1 END,
         confidence DESC`
    )
    .all(weekday, hour, hour, hour, hour, nowMs) as Array<Record<string, unknown>>

  return rows.map(rowToHabit)
}

/** 查单个习惯 */
export function getHabit(dataRoot: string, id: string): UserHabit | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db.prepare('SELECT * FROM user_habits WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToHabit(row) : null
}

/** 写入或更新习惯 */
export function upsertHabit(
  dataRoot: string,
  input: {
    type: HabitType
    scope: HabitScope
    weekday: number | null
    hourStart: number
    hourEnd: number
    confidence?: number
    source: HabitSource
    suppressTarget?: string | null
    note: string
    expiresAt?: number | null
  }
): UserHabit {
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('Database not available')

  const now = Date.now()

  // 短时习惯数量限制：同一天最多 MAX_SHORT_TERM_PER_DAY 条
  if (input.scope === 'short_term') {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)
    const count = (
      db.prepare('SELECT COUNT(*) as cnt FROM user_habits WHERE scope = ? AND created_at >= ?').get('short_term', todayStart.getTime()) as { cnt: number }
    ).cnt
    if (count >= MAX_SHORT_TERM_PER_DAY) {
      // 今日短时习惯已达上限，静默跳过
      return { id: '', type: input.type, scope: input.scope, weekday: input.weekday, hourStart: input.hourStart, hourEnd: input.hourEnd, confidence: 0, occurrenceCount: 0, firstSeenAt: 0, lastConfirmedAt: 0, expiresAt: null, source: input.source, suppressTarget: input.suppressTarget ?? null, note: '', createdAt: 0, updatedAt: 0 } as UserHabit
    }
  }

  // 查是否已有同时间槽的习惯
  const existing = db
    .prepare(
      `SELECT * FROM user_habits
       WHERE type = ? AND weekday IS ? AND hour_start = ? AND hour_end = ?
       LIMIT 1`
    )
    .get(input.type, input.weekday, input.hourStart, input.hourEnd) as Record<string, unknown> | undefined

  if (existing) {
    const newCount = (existing.occurrence_count as number) + 1
    const newConfidence = input.scope === 'long_term'
      ? Math.min(LONG_TERM_CONFIDENCE_CAP, (existing.confidence as number) + LONG_TERM_CONFIDENCE_INCREMENT)
      : (existing.confidence as number)

    db.prepare(
      `UPDATE user_habits
       SET occurrence_count = ?, last_confirmed_at = ?, confidence = ?,
           expires_at = ?, updated_at = ?
       WHERE id = ?`
    ).run(newCount, now, newConfidence, input.expiresAt ?? existing.expires_at, now, existing.id)

    return getHabit(dataRoot, existing.id as string)!
  }

  // 新建
  const id = randomUUID()
  const confidence = input.confidence ?? (input.scope === 'long_term' ? LONG_TERM_BASE_CONFIDENCE : 1.0)

  db.prepare(
    `INSERT INTO user_habits
     (id, type, scope, weekday, hour_start, hour_end, confidence, occurrence_count,
      first_seen_at, last_confirmed_at, expires_at, source, suppress_target, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.type, input.scope, input.weekday, input.hourStart, input.hourEnd,
    confidence, now, now, input.expiresAt ?? null, input.source,
    input.suppressTarget ?? null, input.note, now, now
  )

  return getHabit(dataRoot, id)!
}

/** 短时→长时升级检查（每日跑一次） */
export function promoteShortTermHabits(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0

  const now = Date.now()
  const candidates = db
    .prepare(
      `SELECT * FROM user_habits
       WHERE scope = 'short_term'
         AND occurrence_count >= ?
       ORDER BY type, weekday, hour_start, hour_end`
    )
    .all(LONG_TERM_MIN_OCCURRENCES) as Array<Record<string, unknown>>

  let promoted = 0
  const processed = new Set<string>()

  for (const row of candidates) {
    const key = `${row.type}|${row.weekday}|${row.hour_start}|${row.hour_end}`
    if (processed.has(key)) continue
    processed.add(key)

    // 找同类同一时间槽的所有短时习惯，统计跨越的自然周数
    const siblings = db
      .prepare(
        `SELECT first_seen_at, last_confirmed_at FROM user_habits
         WHERE type = ? AND weekday IS ? AND hour_start = ? AND hour_end = ? AND scope = 'short_term'
         ORDER BY first_seen_at`
      )
      .all(row.type, row.weekday, row.hour_start, row.hour_end) as Array<{ first_seen_at: number; last_confirmed_at: number }>

    if (siblings.length < LONG_TERM_MIN_OCCURRENCES) continue

    const weeks = new Set(siblings.map(s => weekOfYear(s.first_seen_at)))
    if (weeks.size < LONG_TERM_MIN_WEEKS) continue

    // 升级：合并所有短时习惯为一条长时习惯
    const firstSeen = Math.min(...siblings.map(s => s.first_seen_at))
    const lastConfirmed = Math.max(...siblings.map(s => s.last_confirmed_at))
    const totalOccurrences = siblings.length

    db.prepare(
      `UPDATE user_habits
       SET scope = 'long_term', confidence = ?, occurrence_count = ?,
           first_seen_at = ?, last_confirmed_at = ?, expires_at = NULL, updated_at = ?
       WHERE id = ?`
    ).run(LONG_TERM_BASE_CONFIDENCE, totalOccurrences, firstSeen, lastConfirmed, now, row.id)

    // 删除该时间槽的其他短时习惯（已合并）
    for (const s of siblings) {
      if (s.first_seen_at !== row.first_seen_at) {
        db.prepare('DELETE FROM user_habits WHERE type = ? AND weekday IS ? AND hour_start = ? AND hour_end = ? AND scope = ? AND first_seen_at = ?')
          .run(row.type, row.weekday, row.hour_start, row.hour_end, 'short_term', s.first_seen_at)
      }
    }

    promoted++
  }

  return promoted
}

/** 长时习惯降级检查（每周跑一次） */
export function decayLongTermHabits(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0

  const now = Date.now()
  const fourWeeksMs = DECAY_WEEKS_THRESHOLD * 7 * 86400000
  const cutoff = now - fourWeeksMs

  const stale = db
    .prepare(
      `SELECT * FROM user_habits
       WHERE scope = 'long_term'
         AND last_confirmed_at < ?
         AND confidence >= ?`
    )
    .all(cutoff, DECAY_SLEEP_THRESHOLD) as Array<Record<string, unknown>>

  let decayed = 0

  for (const row of stale) {
    const weeksSinceConfirm = Math.floor((now - (row.last_confirmed_at as number)) / (7 * 86400000))
    const decayAmount = (weeksSinceConfirm - DECAY_WEEKS_THRESHOLD + 1) * DECAY_WEEKLY_RATE
    const newConfidence = Math.max(0, (row.confidence as number) - decayAmount)

    if (newConfidence < DECAY_SLEEP_THRESHOLD) {
      // 降级为休眠——撤销长时状态，但不删除数据
      db.prepare(
        `UPDATE user_habits
         SET scope = 'short_term', confidence = ?, updated_at = ?
         WHERE id = ?`
      ).run(newConfidence, now, row.id)
    } else {
      db.prepare(
        `UPDATE user_habits
         SET confidence = ?, updated_at = ?
         WHERE id = ?`
      ).run(newConfidence, now, row.id)
    }
    decayed++
  }

  return decayed
}

/** 清理过期短时习惯（每日跑一次） */
export function cleanupExpired(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0

  const now = Date.now()
  const result = db.prepare('DELETE FROM user_habits WHERE expires_at IS NOT NULL AND expires_at < ?').run(now)
  return result.changes
}

/** 列出所有活跃习惯（调试/设置页用） */
export function listHabits(dataRoot: string): UserHabit[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare('SELECT * FROM user_habits ORDER BY scope DESC, confidence DESC').all() as Array<Record<string, unknown>>
  return rows.map(rowToHabit)
}

/** 删除习惯 */
export function deleteHabit(dataRoot: string, id: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const result = db.prepare('DELETE FROM user_habits WHERE id = ?').run(id)
  return result.changes > 0
}
