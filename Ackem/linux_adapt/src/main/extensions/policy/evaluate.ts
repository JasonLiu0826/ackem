import type { DispatchCatalogEntry } from '../protocols'
import type { RuntimeContext } from '../../context/types'
import { buildMemoryRecallContext, findHealthFactLine } from './recallContext'
import {
  isAttentionBudgetExceeded,
  isGlobalDndActive,
  loadAttentionBudget
} from './attentionBudget'
import type {
  ExtensionDecisionContext,
  ExtensionPolicyVerdict,
  MemoryRecallContext
} from './types'
import { shouldSuppressHealthForForeground } from '../../context/foregroundState'
import { DRINK_WATER_SKILL_ID, LATE_NIGHT_SKILL_ID, SEDENTARY_SKILL_ID } from './types'
import { isMaintenanceAutonomous } from '../dispatch/maintenanceAutonomous'

const EMERGENCY_ID_FRAGMENT = 'emergency-companion'
const ACTIVITY_CONFIDENCE_MIN = 0.4

function isEmergencyExtension(extensionId: string): boolean {
  return extensionId.includes(EMERGENCY_ID_FRAGMENT)
}

export function isHealthAutonomous(extensionId: string, dispatchSummary: string): boolean {
  if (
    extensionId === SEDENTARY_SKILL_ID ||
    extensionId === DRINK_WATER_SKILL_ID ||
    extensionId === LATE_NIGHT_SKILL_ID
  ) {
    return true
  }
  return /久坐|喝水|健康|休息|睡眠|深夜/i.test(dispatchSummary)
}

function shouldDeferForActivity(
  runtime: RuntimeContext,
  extensionId: string,
  dispatchSummary: string
): ExtensionPolicyVerdict | null {
  if (!isHealthAutonomous(extensionId, dispatchSummary)) return null
  const { activity } = runtime
  if (activity.confidence < ACTIVITY_CONFIDENCE_MIN) return null

  if (activity.category === 'travel') {
    if (activity.tense === 'present') {
      return { action: 'defer', reason: 'policy:activity_travel_present' }
    }
    if (activity.tense === 'future') {
      return { action: 'defer', reason: 'policy:activity_travel_future' }
    }
  }
  if (activity.category === 'rest' && activity.tense === 'present') {
    return { action: 'defer', reason: 'policy:activity_rest_present' }
  }
  return null
}

export function evaluateExtensionPolicy(
  ctx: ExtensionDecisionContext,
  dataRoot: string
): ExtensionPolicyVerdict {
  const budget = loadAttentionBudget(dataRoot)
  const now = ctx.nowMs ?? Date.now()
  return evaluateExtensionPolicyWithBudget(ctx, budget, now)
}

export function evaluateExtensionPolicyWithBudget(
  ctx: ExtensionDecisionContext,
  budget: ReturnType<typeof loadAttentionBudget>,
  now: number
): ExtensionPolicyVerdict {
  const { runtime, extensionId, dispatch, memory } = ctx

  if (isMaintenanceAutonomous(extensionId)) {
    return { action: 'allow', reason: 'policy:maintenance_bypass' }
  }

  if (isEmergencyExtension(extensionId)) {
    return { action: 'allow', reason: 'policy:emergency_bypass' }
  }

  if (isGlobalDndActive(budget, now)) {
    return { action: 'skip', reason: 'policy:global_dnd' }
  }

  if (isAttentionBudgetExceeded(budget, now)) {
    return { action: 'defer', reason: 'policy:attention_budget' }
  }

  if (
    shouldSuppressHealthForForeground() &&
    isHealthAutonomous(extensionId, dispatch.summary)
  ) {
    return { action: 'skip', reason: 'policy:foreground_busy' }
  }

  if (runtime.user.engagement === 'active_now' && isHealthAutonomous(extensionId, dispatch.summary)) {
    return { action: 'defer', reason: 'policy:recent_activity' }
  }

  const activityVerdict = shouldDeferForActivity(runtime, extensionId, dispatch.summary)
  if (activityVerdict) return activityVerdict

  if (isHealthAutonomous(extensionId, dispatch.summary) && findHealthFactLine(memory)) {
    return { action: 'allow', reason: 'policy:personalize_health' }
  }

  return { action: 'allow', reason: 'policy:allow' }
}

export function buildExtensionDecisionContext(input: {
  entry: DispatchCatalogEntry
  snapshot: import('../protocols').EngineSnapshot
  runtime: RuntimeContext
  dataRoot: string
  nowMs?: number
}): ExtensionDecisionContext {
  const memory = buildMemoryRecallContext(input.snapshot)
  const budget = loadAttentionBudget(input.dataRoot)
  const now = input.nowMs ?? Date.now()

  return {
    extensionId: input.entry.id,
    dispatch: input.entry.dispatch,
    mode: input.entry.dispatch.mode,
    snapshot: input.snapshot,
    memory,
    runtime: input.runtime,
    session: {
      lastUserMessageAt: new Date(input.snapshot.lastActiveAt).getTime(),
      rejectedRecently: input.entry.rejectedInSession
    },
    nowMs: now
  }
}

/** scheduler 用：带 dataRoot 的判决 + 预算状态 */
export function evaluateAutonomousExtensionPolicy(input: {
  entry: DispatchCatalogEntry
  snapshot: import('../protocols').EngineSnapshot
  runtime: RuntimeContext
  dataRoot: string
  nowMs?: number
}): ExtensionPolicyVerdict {
  const ctx = buildExtensionDecisionContext(input)
  return evaluateExtensionPolicy(ctx, input.dataRoot)
}

export type PolicyTracePayload = {
  policyVerdict: ExtensionPolicyVerdict
  activity: RuntimeContext['activity']
}

export function buildPolicyTracePayload(
  verdict: ExtensionPolicyVerdict,
  runtime: RuntimeContext
): PolicyTracePayload {
  return {
    policyVerdict: verdict,
    activity: {
      category: runtime.activity.category,
      tense: runtime.activity.tense,
      confidence: runtime.activity.confidence,
      label: runtime.activity.label,
      source: runtime.activity.source
    }
  }
}
