/**
 * TurnPlan — 贾维斯式「一轮理解」统一契约（L0 中枢）
 *
 * 取代多条正则管线各自为政：规则层只产出 prior，LLM 产出 TurnPlan，
 * Task Frame / Dispatch / Create 均消费同一份结果。
 */

import {
  buildFormatHintFromDelivery,
  detectTaskFrameRules,
  taskFrameFromRules,
  type TaskDeliveryFormat,
  type TaskGoal,
  type UserTaskFrame
} from './taskFrame'

export type TurnRouting =
  | 'casual_chat'
  | 'structured_chat'
  | 'extension_plan'
  | 'extension_ask_plan'
  | 'extension_invoke'

export type TurnPlanRulePriors = {
  taskFrameGoal: TaskGoal
  taskFrameDelivery: TaskDeliveryFormat
  mergeWebSearch: boolean
  explicitCreate: boolean
  bareFeatureCreate: boolean
  capabilityProbe: boolean
  explicitCreateTopic?: string
  bareFeatureTopic?: string
}

export type TurnPlan = {
  routing: TurnRouting
  goal: TaskGoal
  delivery: TaskDeliveryFormat
  subjects: string[]
  needsSearch: boolean
  searchQuery?: string
  mergeWebSearch: boolean
  formatHint?: string
  planTopic?: string
  extensionId?: string
  extensionConfidence?: number
  reasoning?: string
  source: 'rules' | 'llm' | 'rules+llm'
}

const VALID_ROUTING = new Set<TurnRouting>([
  'casual_chat',
  'structured_chat',
  'extension_plan',
  'extension_ask_plan',
  'extension_invoke'
])

const VALID_GOALS = new Set<TaskGoal>(['casual', 'list', 'compare', 'explain', 'recommend'])
const VALID_DELIVERY = new Set<TaskDeliveryFormat>(['prose', 'markdown_table', 'bullet_list'])

/** 弱交付信号：规则可能漏判，须交给 LLM / 强制 structured */
export const DELIVERY_WEAK_SIGNAL_RE =
  /表|列个|列出|罗列|对比|对照|清单|分条|差距|排成|汇总|画个/u

export type TurnPlanRuleDeps = {
  detectExtensionDemandExplicit: (msg: string) => boolean
  detectBareFeatureCreateCandidate: (msg: string) => boolean
  shouldRunCapabilityProbe: (msg: string) => boolean
  extractExplicitCreateTopic: (msg: string) => string | undefined
  extractBareFeatureCreateTopic: (msg: string) => string | undefined
}

export function buildTurnPlanRulePriors(
  userMessage: string,
  deps: TurnPlanRuleDeps
): TurnPlanRulePriors {
  const hint = detectTaskFrameRules(userMessage)
  return {
    taskFrameGoal: hint.goal,
    taskFrameDelivery: hint.delivery,
    mergeWebSearch: hint.mergeWebSearch,
    explicitCreate: deps.detectExtensionDemandExplicit(userMessage),
    bareFeatureCreate: deps.detectBareFeatureCreateCandidate(userMessage),
    capabilityProbe: deps.shouldRunCapabilityProbe(userMessage),
    explicitCreateTopic: deps.extractExplicitCreateTopic(userMessage),
    bareFeatureTopic: deps.extractBareFeatureCreateTopic(userMessage)
  }
}

export function inferRoutingFromPriors(priors: TurnPlanRulePriors): TurnRouting {
  if (priors.explicitCreate) return 'extension_plan'
  if (priors.bareFeatureCreate) return 'extension_ask_plan'
  if (priors.taskFrameDelivery !== 'prose') return 'structured_chat'
  return 'casual_chat'
}

export function mergeTurnPlanFromRules(
  userMessage: string,
  priors: TurnPlanRulePriors
): TurnPlan {
  const rulesFrame = taskFrameFromRules(userMessage)
  const routing = inferRoutingFromPriors(priors)
  const planTopic =
    priors.explicitCreateTopic ??
    (routing === 'extension_ask_plan' ? priors.bareFeatureTopic : undefined)

  return {
    routing,
    goal: rulesFrame.goal,
    delivery: rulesFrame.delivery,
    subjects: [],
    needsSearch: rulesFrame.needsSearch,
    searchQuery: rulesFrame.searchQuery,
    mergeWebSearch: rulesFrame.mergeWebSearch,
    formatHint: rulesFrame.formatHint,
    planTopic,
    source: 'rules'
  }
}

export type LlmTurnPlanJson = {
  routing?: string
  goal?: string
  delivery?: string
  subjects?: string[]
  needs_search?: boolean
  search_query?: string
  merge_web_search?: boolean
  format_hint?: string
  plan_topic?: string
  extension_id?: string
  extension_confidence?: number
  reasoning?: string
}

function normalizeRouting(raw: string | undefined, fallback: TurnRouting): TurnRouting {
  const r = (raw ?? '').trim() as TurnRouting
  return VALID_ROUTING.has(r) ? r : fallback
}

function normalizeGoal(raw: string | undefined, fallback: TaskGoal): TaskGoal {
  const g = (raw ?? '').trim() as TaskGoal
  return VALID_GOALS.has(g) ? g : fallback
}

function normalizeDelivery(
  raw: string | undefined,
  fallback: TaskDeliveryFormat
): TaskDeliveryFormat {
  const d = (raw ?? '').trim() as TaskDeliveryFormat
  return VALID_DELIVERY.has(d) ? d : fallback
}

function normalizeSubjects(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter((s) => s.length >= 1 && s.length <= 40)
    .slice(0, 6)
}

export function mergeTurnPlanWithLlm(
  userMessage: string,
  priors: TurnPlanRulePriors,
  rulesPlan: TurnPlan,
  llm: LlmTurnPlanJson
): TurnPlan {
  const routing = normalizeRouting(llm.routing, rulesPlan.routing)
  const delivery = normalizeDelivery(llm.delivery, rulesPlan.delivery)
  const goal = normalizeGoal(llm.goal, rulesPlan.goal)
  const subjects = normalizeSubjects(llm.subjects)

  const structured = delivery !== 'prose' || routing === 'structured_chat'
  const mergeWebSearch =
    llm.merge_web_search === true ||
    priors.mergeWebSearch ||
    goal === 'compare' ||
    (subjects.length >= 2 && structured)

  const formatHint =
    llm.format_hint?.trim() ||
    rulesPlan.formatHint ||
    buildFormatHintFromDelivery(delivery, goal)

  const planTopic =
    llm.plan_topic?.trim() ||
    rulesPlan.planTopic ||
    priors.explicitCreateTopic ||
    priors.bareFeatureTopic

  let finalRouting = routing
  if (structured && finalRouting === 'casual_chat') {
    finalRouting = 'structured_chat'
  }

  return {
    routing: finalRouting,
    goal,
    delivery,
    subjects,
    needsSearch: llm.needs_search === true || rulesPlan.needsSearch,
    searchQuery: llm.search_query?.trim() || rulesPlan.searchQuery,
    mergeWebSearch,
    formatHint,
    planTopic: planTopic || undefined,
    extensionId: llm.extension_id?.trim() || undefined,
    extensionConfidence:
      typeof llm.extension_confidence === 'number' ? llm.extension_confidence : undefined,
    reasoning: llm.reasoning?.trim(),
    source: 'rules+llm'
  }
}

export function turnPlanToUserTaskFrame(plan: TurnPlan): UserTaskFrame {
  return {
    goal: plan.goal,
    delivery: plan.delivery,
    subjects: plan.subjects,
    needsSearch: plan.needsSearch,
    searchQuery: plan.searchQuery,
    mergeWebSearch: plan.mergeWebSearch,
    formatHint: plan.formatHint,
    source: plan.source === 'rules' ? 'rules' : 'rules+llm'
  }
}

export function shouldForceTaskFrameLlmEnrich(userMessage: string): boolean {
  const hint = detectTaskFrameRules(userMessage)
  if (hint.needsLlmEnrich) return true
  return DELIVERY_WEAK_SIGNAL_RE.test(userMessage.trim())
}
