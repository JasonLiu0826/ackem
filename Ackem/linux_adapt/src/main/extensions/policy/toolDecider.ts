// [toolDecider] — 工具调用决策
// 职责：基于习惯置信度 + 用户偏好，决定工具调用策略
// 设计文档：docs/plan/主动策略调度loop详细设计_6_11.md·§4.4
// 纯规则

import type { ToolDecision, UserHabit } from './types'
import type { EngineSnapshot, DispatchCatalogEntry } from '../protocols'
import { getDatabase } from '../../db/database'

/**
 * 判断是否该为某个扩展触发工具调用。
 *
 * @param entry 扩展 catalog 条目
 * @param snapshot 引擎快照
 * @param matchedHabits 当前命中习惯
 * @param dataRoot 数据目录
 * @returns suppress / ask / auto_invoke
 */
export function decideToolAction(input: {
  entry: DispatchCatalogEntry
  snapshot: EngineSnapshot
  matchedHabits: UserHabit[]
  dataRoot: string
}): ToolDecision {
  const { entry, matchedHabits, dataRoot } = input

  // 匹配到长时习惯且类型为 busy_meeting/busy_focus → 会议/专注期间抑制
  const longTermBusy = matchedHabits.filter(
    h => h.scope === 'long_term' && (h.type === 'busy_meeting' || h.type === 'busy_focus')
  )
  if (longTermBusy.length > 0) return 'suppress'

  // 匹配到短时习惯且类型为 rest → 休息时不调用工具
  const shortTermRest = matchedHabits.filter(
    h => h.scope === 'short_term' && h.type === 'rest'
  )
  if (shortTermRest.length > 0) return 'suppress'

  // 查用户是否曾拒绝此扩展
  const rejected = isExtensionRejected(dataRoot, entry.id)
  if (rejected) return 'suppress'

  // 查用户是否曾允许过 → 可以更激进
  const allowed = isExtensionAllowed(dataRoot, entry.id)

  // 长时习惯置信度高 → 自动调用
  if (longTermBusy.length === 0) {
    const highConfHabits = matchedHabits.filter(
      h => h.scope === 'long_term' && h.confidence >= 0.85
    )
    if (highConfHabits.length > 0 && allowed) return 'auto_invoke'
  }

  // 用户曾允许过 → 问一下
  if (allowed) return 'ask'

  // 默认：不确定就不动
  return 'suppress'
}

function isExtensionRejected(dataRoot: string, extensionId: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const row = db.prepare(
    `SELECT value FROM kv_store WHERE key = ?`
  ).get(`userPref:reject:${extensionId}`) as { value: string } | undefined
  return row?.value === '1'
}

function isExtensionAllowed(dataRoot: string, extensionId: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const row = db.prepare(
    `SELECT value FROM kv_store WHERE key = ?`
  ).get(`userPref:allow:${extensionId}`) as { value: string } | undefined
  return row?.value === '1'
}
