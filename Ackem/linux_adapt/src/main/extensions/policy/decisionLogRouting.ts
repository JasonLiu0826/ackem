// [decisionLogRouting] — 基于近期 decision_log 的规则反馈路由（FIX-020）

import type { RuntimeContext } from '../../context/types'
import type { DecisionLogEntry } from './decisionLogStore'
import type { ProactiveGateResult, ProactiveLevel } from './types'

const HARD_BLOCK_REASONS = new Set(['rifts_active'])

function bumpLevel(level: ProactiveLevel): ProactiveLevel {
  if (level === 'silent') return 'whisper'
  if (level === 'whisper') return 'casual'
  return level
}

function isUserActivelyEngaged(runtime: RuntimeContext): boolean {
  return runtime.user.engagement === 'active_now' || runtime.user.minutesSinceLastChat < 3
}

/**
 * 读取近期日志，在用户持续主动聊天时适度放宽过度保守的 silent/whisper。
 * Embedding 相似路由见 decisionLogStore.DECISION_LOG_EMBEDDING_ROUTING_PLANNED（Phase 6）。
 */
export function applyDecisionLogRouting(input: {
  result: ProactiveGateResult
  recentLogs: DecisionLogEntry[]
  runtime: RuntimeContext | null
  foregroundBusy: boolean
  attentionBudgetExceeded: boolean
}): ProactiveGateResult {
  const { result, recentLogs, runtime } = input
  if (!runtime || recentLogs.length < 3) return result
  if (HARD_BLOCK_REASONS.has(result.reason)) return result
  if (result.reason.startsWith('habit_match:')) return result

  const restrictive = recentLogs
    .slice(0, 6)
    .filter((l) => l.decision === 'silent' || l.decision === 'whisper')
  if (restrictive.length < 3) return result

  if (result.reason === 'foreground_busy' && !input.foregroundBusy) {
    return {
      ...result,
      proactiveLevel: bumpLevel(result.proactiveLevel),
      reason: `${result.reason}+decision_log_route:foreground_cleared`,
    }
  }

  if (result.reason === 'attention_budget' && !input.attentionBudgetExceeded) {
    return {
      ...result,
      proactiveLevel: bumpLevel(result.proactiveLevel),
      reason: `${result.reason}+decision_log_route:budget_recovered`,
    }
  }

  if (!isUserActivelyEngaged(runtime)) return result
  if (result.proactiveLevel !== 'silent' && result.proactiveLevel !== 'whisper') return result

  return {
    ...result,
    proactiveLevel: bumpLevel(result.proactiveLevel),
    reason: `${result.reason}+decision_log_route:user_active`,
  }
}
