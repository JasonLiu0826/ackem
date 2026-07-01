// [decisionLogStore] — decision_log 读写（FIX-020）
// Phase 6 Embedding 智能路由仍为 future work；当前提供规则反馈路由 + 可观测读取

import { getDatabase } from '../../db/database'
import type { DecisionSignalSnapshot, ProactiveGateResult, ProactiveLevel } from './types'

/** Phase 6：decision_log 信号 Embedding + 相似历史路由 — 尚未实现 */
export const DECISION_LOG_EMBEDDING_ROUTING_PLANNED = true

export type DecisionLogEntry = {
  id: number
  signal: DecisionSignalSnapshot
  decision: ProactiveLevel
  reason: string
  toolDecision: string | null
  userFeedback: string | null
  createdAt: number
}

export function appendDecisionLog(
  dataRoot: string,
  signal: DecisionSignalSnapshot,
  result: ProactiveGateResult
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO decision_log (signal_json, decision, reason, created_at)
     VALUES (?, ?, ?, ?)`
  ).run(JSON.stringify(signal), result.proactiveLevel, result.reason, Date.now())
}

export function listRecentDecisionLogs(dataRoot: string, limit = 20): DecisionLogEntry[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(
    `SELECT id, signal_json, decision, reason, tool_decision, user_feedback, created_at
     FROM decision_log
     ORDER BY created_at DESC
     LIMIT ?`
  ).all(Math.max(1, limit)) as Array<{
    id: number
    signal_json: string
    decision: string
    reason: string
    tool_decision: string | null
    user_feedback: string | null
    created_at: number
  }>

  return rows.map((row) => ({
    id: row.id,
    signal: parseSignal(row.signal_json),
    decision: row.decision as ProactiveLevel,
    reason: row.reason,
    toolDecision: row.tool_decision,
    userFeedback: row.user_feedback,
    createdAt: row.created_at,
  }))
}

export function recordDecisionLogFeedback(
  dataRoot: string,
  id: number,
  feedback: 'accept' | 'dismiss' | 'ignore'
): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const r = db.prepare(
    `UPDATE decision_log SET user_feedback = ? WHERE id = ?`
  ).run(feedback, id)
  return r.changes > 0
}

export function summarizeRecentDecisions(logs: DecisionLogEntry[]): {
  total: number
  byLevel: Record<ProactiveLevel, number>
  topReason: string | null
} {
  const byLevel: Record<ProactiveLevel, number> = {
    silent: 0,
    whisper: 0,
    casual: 0,
    proactive: 0,
  }
  const reasonCounts = new Map<string, number>()
  for (const log of logs) {
    byLevel[log.decision] = (byLevel[log.decision] ?? 0) + 1
    reasonCounts.set(log.reason, (reasonCounts.get(log.reason) ?? 0) + 1)
  }
  let topReason: string | null = null
  let topCount = 0
  for (const [reason, count] of reasonCounts) {
    if (count > topCount) {
      topReason = reason
      topCount = count
    }
  }
  return { total: logs.length, byLevel, topReason }
}

function parseSignal(raw: string): DecisionSignalSnapshot {
  try {
    return JSON.parse(raw) as DecisionSignalSnapshot
  } catch {
    return {
      aff: 0,
      sec: 0,
      aro: 0,
      dom: 0,
      primaryLabel: 'CALM_RATIONAL',
      trust: 0,
      stage: 'STRANGER',
      rifts: 0,
      weekday: 0,
      hour: 0,
      timeOfDay: 'unknown',
      activityCategory: 'unknown',
      foregroundScene: null,
      matchedHabitIds: [],
      habitMatchCount: 0,
      attentionBudgetUsed: false,
    }
  }
}
