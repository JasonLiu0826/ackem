// [proactiveGate] — 会话级"该不该说话"决策引擎
// 职责：读取心（情绪+关系）+ 脑（习惯+场景+时间），输出 proactiveLevel
// 设计文档：docs/plan/主动策略调度loop详细设计_6_11.md·§4.2
// 纯规则，零 AI 调用，<1ms

import type { EngineSnapshot } from '../protocols'
import type { RuntimeContext } from '../../context/types'
import type { UserHabit, ProactiveGateResult, DecisionSignalSnapshot } from './types'
import { appendDecisionLog, listRecentDecisionLogs } from './decisionLogStore'
import { applyDecisionLogRouting } from './decisionLogRouting'

const RIFTS_SILENT_THRESHOLD = 2
const AFF_VOLATILITY_WINDOW = 10
const AFF_VOLATILE_THRESHOLD = 20
const AFF_POSITIVE_THRESHOLD = 60
const AFF_LOW_THRESHOLD = 30

let affHistoryWindow: number[] = []

/** orchestrator 每轮在 emotionStep 后把最新 aff 推进来 */
export function pushAffToHistory(aff: number): void {
  affHistoryWindow.push(aff)
  if (affHistoryWindow.length > AFF_VOLATILITY_WINDOW) {
    affHistoryWindow = affHistoryWindow.slice(-AFF_VOLATILITY_WINDOW)
  }
}

/** 重置情绪历史（新会话开始时调用） */
export function resetAffHistory(): void {
  affHistoryWindow = []
}

/** 获取最近 N 轮 aff 历史快照（供情绪涌现模块读取） */
export function getAffHistory(): number[] {
  return [...affHistoryWindow]
}

function computeAffVolatility(): number {
  if (affHistoryWindow.length < 2) return 0
  const mean = affHistoryWindow.reduce((a, b) => a + b, 0) / affHistoryWindow.length
  const variance = affHistoryWindow.reduce((s, v) => s + (v - mean) ** 2, 0) / affHistoryWindow.length
  return Math.sqrt(variance)
}

/** 构建信号快照并写入 decision_log（含规则反馈路由后的最终决策） */
function finalizeGateResult(
  dataRoot: string | undefined,
  snapshot: EngineSnapshot,
  runtime: RuntimeContext | null,
  matchedHabits: UserHabit[],
  baseResult: ProactiveGateResult,
  foregroundBusy: boolean,
  attentionBudgetExceeded: boolean
): ProactiveGateResult {
  if (!dataRoot || !runtime) return baseResult

  const recentLogs = listRecentDecisionLogs(dataRoot, 8)
  const result = applyDecisionLogRouting({
    result: baseResult,
    recentLogs,
    runtime,
    foregroundBusy,
    attentionBudgetExceeded,
  })

  const signal: DecisionSignalSnapshot = {
    aff: snapshot.emotion.aff,
    sec: snapshot.emotion.sec,
    aro: snapshot.emotion.aro,
    dom: snapshot.emotion.dom,
    primaryLabel: snapshot.emotion.primaryLabel,
    trust: snapshot.relationship.trust,
    stage: snapshot.relationship.stage,
    rifts: snapshot.relationship.rifts,
    weekday: new Date().getDay(),
    hour: new Date().getHours(),
    timeOfDay: runtime.time.timeOfDay,
    activityCategory: runtime.activity.category,
    foregroundScene: null,
    matchedHabitIds: matchedHabits.map(h => h.id),
    habitMatchCount: matchedHabits.length,
    attentionBudgetUsed: attentionBudgetExceeded,
  }

  appendDecisionLog(dataRoot, signal, result)
  return result
}

/**
 * 主决策函数。
 * 每 60s tick 调用一次，或在 orchestrator 中每轮对话前调用。
 *
 * @param snapshot 引擎快照（含心·情绪 和 心·关系）
 * @param runtime 运行时上下文（CTX 感官层）
 * @param matchedHabits 当前时间命中的习惯列表（由 habitsStore.match 提供）
 * @param foregroundBusy 前台是否处于会议/PPT/专注
 * @param attentionBudgetExceeded 注意力预算是否已超
 * @param dataRoot 数据目录（写决策日志用）
 */
export function evaluateProactiveGate(input: {
  snapshot: EngineSnapshot
  runtime: RuntimeContext | null
  matchedHabits: UserHabit[]
  foregroundBusy: boolean
  attentionBudgetExceeded: boolean
  dataRoot?: string
}): ProactiveGateResult {
  const { snapshot, runtime, matchedHabits, foregroundBusy, attentionBudgetExceeded } = input
  const affVolatility = computeAffVolatility()
  const aff = snapshot.emotion.aff
  const stage = snapshot.relationship.stage
  const rifts = snapshot.relationship.rifts

  // ① 命中长时习惯且 type=dnd/busy → silent
  const longTermBlockers = matchedHabits.filter(
    h => h.scope === 'long_term' && (h.type === 'dnd' || h.type === 'busy_meeting' || h.type === 'busy_focus')
  )
  if (longTermBlockers.length > 0) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'silent',
      reason: `habit_match:${longTermBlockers[0].note}`,
      adjustedCooldownMs: 30 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ② rifts ≥ 2（刚吵过架）→ silent 或 whisper
  if (rifts >= RIFTS_SILENT_THRESHOLD) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'silent',
      reason: 'rifts_active',
      adjustedCooldownMs: 15 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ③ 前台检测到会议/PPT → silent
  if (foregroundBusy) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'silent',
      reason: 'foreground_busy',
      adjustedCooldownMs: 15 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ④ 注意力预算超标 → whisper
  if (attentionBudgetExceeded) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'whisper',
      reason: 'attention_budget',
      adjustedCooldownMs: 10 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ⑤ 情绪剧烈波动 + 负面 → whisper
  if (affVolatility > AFF_VOLATILE_THRESHOLD && aff < AFF_LOW_THRESHOLD) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'whisper',
      reason: 'emotion_volatile_negative',
      adjustedCooldownMs: 10 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ⑥ 情绪剧烈波动 + 正面 + 关系亲密 → proactive
  if (affVolatility > AFF_VOLATILE_THRESHOLD && aff > AFF_POSITIVE_THRESHOLD && stage === 'INTIMATE') {
    const result: ProactiveGateResult = {
      proactiveLevel: 'proactive',
      reason: 'emotion_volatile_positive_intimate',
      adjustedCooldownMs: 5 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ⑦ 时间触发
  if (runtime) {
    const timeOfDay = runtime.time.timeOfDay

    // 深夜 + 用户未主动说话 → whisper
    if ((timeOfDay === 'late_night' || timeOfDay === 'night') && runtime.user.engagement !== 'active_now') {
      const result: ProactiveGateResult = {
        proactiveLevel: 'whisper',
        reason: 'time_late_night',
        adjustedCooldownMs: 20 * 60_000,
      }
      if (input.dataRoot) {
        return finalizeGateResult(
          input.dataRoot, snapshot, runtime, matchedHabits, result,
          foregroundBusy, attentionBudgetExceeded
        )
      }
      return result
    }

    // 周末早上 + 关系 FAMILIAR+ → proactive
    if (runtime.time.isWeekend && timeOfDay === 'morning' && stage !== 'STRANGER') {
      const result: ProactiveGateResult = {
        proactiveLevel: 'proactive',
        reason: 'time_weekend_morning',
        adjustedCooldownMs: 5 * 60_000,
      }
      if (input.dataRoot) {
        return finalizeGateResult(
          input.dataRoot, snapshot, runtime, matchedHabits, result,
          foregroundBusy, attentionBudgetExceeded
        )
      }
      return result
    }
  }

  // ⑧ 短时习惯检查
  const shortTermDnd = matchedHabits.filter(
    h => h.scope === 'short_term' && (h.type === 'dnd' || h.type === 'rest')
  )
  if (shortTermDnd.length > 0) {
    const result: ProactiveGateResult = {
      proactiveLevel: 'whisper',
      reason: `short_term_habit:${shortTermDnd[0].note}`,
      adjustedCooldownMs: 10 * 60_000,
    }
    if (input.dataRoot && runtime) {
      return finalizeGateResult(
        input.dataRoot, snapshot, runtime, matchedHabits, result,
        foregroundBusy, attentionBudgetExceeded
      )
    }
    return result
  }

  // ⑨ 默认 → casual
  const result: ProactiveGateResult = {
    proactiveLevel: 'casual',
    reason: 'default',
    adjustedCooldownMs: 60_000,
  }
  if (input.dataRoot && runtime) {
    return finalizeGateResult(
      input.dataRoot, snapshot, runtime, matchedHabits, result,
      foregroundBusy, attentionBudgetExceeded
    )
  }
  return result
}
