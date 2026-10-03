import type { ChannelPlan } from '../../shared/channelPlan'
import type { CatalogEntry } from './catalogTypes'
import { classifyIntent, type ClassifyClient } from './classifyIntent'
import { detectMotive, type Motive } from './detectMotive'
import { deriveDeterministic } from './deriveDeterministic'
import { matchCatalog, type CatalogMatch } from './matchCatalog'
import { normalizeChannel } from './normalizeChannel'
import { chatPlan, pendingPlan, pluginPlan } from './plans'
import { isActionablePlan, splitUtterance } from './splitUtterance'
import { writeGrounding } from './grounding'
import { createRouteTrace, routeTraceClock, type RouteTrace } from './routeTrace'
import { tryLearnedGate0 } from '../route/learnedGate'
import { matchUserInvocationForDataRoot } from '../route/userInvocations.js'
import { shouldProbe, recordProbeOutcome } from './residualProbe'
import { createMilestoneEmitter, type RouteMilestones } from './routeMilestones'

export type RouteChannelInput = {
  text: string
  catalog: CatalogEntry[]
  recent?: Array<{ role: string; content: string }>
  sessionId?: string
  llm?: ClassifyClient
  catalogFailed?: boolean
  onResidual?: () => void
  timeoutMs?: number
  /** Route v2 §6.1: optional per-turn trace; layers feed the verdict ledger. */
  trace?: RouteTrace
  /** Route v2 阶段 2: dataRoot for learned-pattern reads (omitted in unit tests). */
  dataRoot?: string
  /** 阶段 3-4 思考中里程碑: 每个真实层边界回调一次 (渲染层规格见设计 §17.2). */
  onMilestone?: (text: string) => void
}

export type RouteChannelResult = {
  plan: ChannelPlan
  motive: Motive
  match: CatalogMatch | null
  usedClassifier: boolean
  extras?: ChannelPlan[]
  split?: boolean
}

export async function routeChannel(input: RouteChannelInput): Promise<RouteChannelResult> {
  const clauses = !input.catalogFailed ? splitUtterance(input.text) : null
  if (clauses) {
    const parts: RouteChannelResult[] = []
    for (const clause of clauses) {
      parts.push(await routeOne({ ...input, text: clause }))
    }
    const actionable = parts.filter((p) => isActionablePlan(p.plan))
    if (actionable.length >= 2) {
      const pendingized = actionable.map((p) => ({ ...p, plan: asConfirmable(p.plan, input.text) }))
      return {
        plan: pendingized[0].plan,
        motive: pendingized[0].motive,
        match: pendingized[0].match,
        usedClassifier: parts.some((p) => p.usedClassifier),
        extras: pendingized.slice(1).map((p) => p.plan),
        split: true
      }
    }
    if (actionable.length === 1) return actionable[0]
  }
  return routeOne(input)
}

async function routeOne(input: RouteChannelInput): Promise<RouteChannelResult> {
  const trace = input.trace
  const milestones: RouteMilestones | null = input.onMilestone
    ? createMilestoneEmitter(input.onMilestone)
    : null
  const tGate = routeTraceClock()
  const motive = detectMotive(input.text, input.recent, input.sessionId ?? 'default')
  trace?.mark(
    {
      layer: 'gate0',
      ruleId: `gate0:${motive.kind}${'reason' in motive && motive.reason ? `:${motive.reason}` : ''}`
    },
    tGate
  )

  if (motive.kind === 'none') {
    if (input.dataRoot && !input.catalogFailed) {
      try {
        const learnedInvocation = matchUserInvocationForDataRoot(input.dataRoot, input.text.trim())
        const target = learnedInvocation && input.catalog.find(
          (entry) => entry.id === learnedInvocation.extensionId && entry.status === 'active' && !entry.rejectedInSession
        )
        if (target) {
          const match: CatalogMatch = { level: 'high', extensionId: target.id, reason: 'invocation' }
          const plan = deriveDeterministic({ kind: 'use' }, match, input.catalog, input.text)
          if (plan) {
            trace?.mark({ layer: 'catalog', ruleId: 'catalog:high:invocation', candidateCount: 1 })
            trace?.mark({ layer: 'deterministic', ruleId: `det:${plan.channel}:learned_invocation` })
            milestones?.decided(plan.channel)
            return { plan, motive: { kind: 'use' }, match, usedClassifier: false }
          }
        }
      } catch {
        // A missing personal invocation index must not block ordinary chat.
      }
    }
    // 阶段 2-5: learned gate0 extension — builtin rules all missed; a learned
    // pattern hit produces a work CONFIRM CARD (cardOnly), never execution.
    if (input.dataRoot) {
      const learned = tryLearnedGate0(input.dataRoot, input.text, motive)
      if (learned) {
        trace?.mark({ layer: 'gate0', ruleId: `learned:${learned.patternId}` })
        trace?.mark({ layer: 'deterministic', ruleId: 'det:work:learned_card' })
        return {
          plan: learned.plan,
          motive: { kind: 'work', reason: 'persist' },
          match: null,
          usedClassifier: false
        }
      }
    }
    // 阶段 3-2 二次探针 (设计 §5 层1.5): 动作信号句花一次残差分类, 只升不降。
    if (input.dataRoot !== undefined || input.llm) {
      const sessionId = input.sessionId ?? 'default'
      if (shouldProbe(input.text, sessionId)) {
        input.onResidual?.()
        const tProbe = routeTraceClock()
        const probeParsed = await classifyIntent({
          text: input.text,
          catalog: input.catalog,
          recent: input.recent,
          llm: input.llm,
          timeoutMs: input.timeoutMs,
          onOutcome: (outcome) => {
            if (trace) {
              trace.usedClassifier = true
              trace.residualOutcome = outcome
            }
            trace?.mark({ layer: 'probe', ruleId: `probe:${outcome}` }, tProbe)
          }
        })
        const probePlan = normalizeChannel(probeParsed, input.catalog, { userText: input.text, match: null })
        const upgraded = probePlan.channel !== 'chat' || Boolean(probePlan.pendingConfirm)
        recordProbeOutcome(upgraded)
        if (upgraded) {
          trace?.mark({ layer: 'normalize', ruleId: `norm:${probePlan.channel}:probe_up` })
          return {
            plan: probePlan,
            motive: { kind: 'work', reason: 'persist' },
            match: null,
            usedClassifier: true
          }
        }
      }
    }
    trace?.mark({ layer: 'deterministic', ruleId: 'det:chat:none' })
    milestones?.decided('chat')
    return { plan: chatPlan('chat'), motive, match: null, usedClassifier: false }
  }
  if (motive.kind === 'organize') {
    const plan = deriveDeterministic(motive, null, input.catalog, input.text)!
    trace?.mark({ layer: 'deterministic', ruleId: `det:${plan.channel}:${plan.chatDelivery ?? 'exec'}` })
    return { plan, motive, match: null, usedClassifier: false }
  }
  if (motive.kind === 'work') {
    const plan = deriveDeterministic(motive, null, input.catalog, input.text)!
    trace?.mark({
      layer: 'deterministic',
      ruleId: `det:${plan.channel}:${plan.pendingConfirm ?? 'exec'}`
    })
    return {
      plan,
      motive,
      match: null,
      usedClassifier: false
    }
  }

  if (input.catalogFailed && (motive.kind === 'use' || motive.kind === 'create' || motive.kind === 'update')) {
    trace?.mark({ layer: 'catalog', ruleId: 'catalog:failed' })
    return {
      plan: chatPlan('chat', {
        grounding:
          '【本轮通道】chat\n【状态】清单不可用。\n【禁止】不可假装缺扩展、已开始制造、或已调用插件。'
      }),
      motive,
      match: { level: 'none' },
      usedClassifier: false
    }
  }

  let match: CatalogMatch | null = { level: 'none' }
  if (!input.catalogFailed) {
    const tCatalog = routeTraceClock()
    try {
      match = matchCatalog(input.text, input.catalog, input.dataRoot)
    } catch {
      match = { level: 'none' }
    }
    trace?.mark(
      {
        layer: 'catalog',
        ruleId: `catalog:${match.level}${match.level === 'none' ? '' : `:${match.reason}`}`,
        candidateCount: match.level === 'high' ? 1 : match.level === 'medium' ? match.extensionIds.length : 0
      },
      tCatalog
    )
  }

  const tDeterministic = routeTraceClock()
  const deterministic = deriveDeterministic(motive, match, input.catalog, input.text)
  if (deterministic) {
    trace?.mark(
      {
        layer: 'deterministic',
        ruleId: `det:${deterministic.channel}:${deterministic.pendingConfirm ?? 'exec'}`
      },
      tDeterministic
    )
    return { plan: deterministic, motive, match, usedClassifier: false }
  }

  input.onResidual?.()
  const tResidual = routeTraceClock()
  // 阶段 1 二轮 #2 (Codex): the residual outcome must be visible even when the
  // caller passes no trace — a local trace carries the outcome for the
  // grounding annotation below.
  const residualTrace = trace ?? createRouteTrace()
  const parsed = await classifyIntent({
    text: input.text,
    catalog: input.catalog,
    recent: input.recent,
    llm: input.llm,
    timeoutMs: input.timeoutMs,
    onOutcome: (outcome) => {
      residualTrace.usedClassifier = true
      residualTrace.residualOutcome = outcome
      residualTrace.mark({ layer: 'residual', ruleId: `residual:${outcome}` }, tResidual)
    }
  })
  const plan = normalizeChannel(parsed, input.catalog, { userText: input.text, match })
  // 阶段 1 (设计 §8.2): residual failure must be VISIBLE — a chat verdict that
  // exists only because the classifier failed says so in its grounding.
  if (
    plan.channel === 'chat' &&
    residualTrace.residualOutcome &&
    residualTrace.residualOutcome !== 'ok'
  ) {
    const why =
      residualTrace.residualOutcome === 'timeout'
        ? '意图判断超时'
        : residualTrace.residualOutcome === 'invalid_json'
          ? '意图判断返回无效'
          : '意图判断出错'
    plan.grounding = `${plan.grounding}\n【判定】${why}，本轮按闲聊处理。`
  }
  trace?.mark({
    layer: 'normalize',
    ruleId: `norm:${plan.channel}:${plan.pendingConfirm ?? 'exec'}${parsed ? '' : ':no_model'}`
  })
  milestones?.decided(plan.channel)
  return {
    plan,
    motive,
    match,
    usedClassifier: true
  }
}

function asConfirmable(plan: ChannelPlan, sourceText: string): ChannelPlan {
  if (plan.channel === 'plugin' && !plan.pendingConfirm && plan.extensionId) {
    return pendingPlan('plugin_use', {
      intent: 'use',
      tag: plan.tag,
      extensionId: plan.extensionId,
      candidateExtensionIds: [plan.extensionId],
      params: plan.params,
      summary: sourceText.slice(0, 80)
    })
  }
  if (plan.pendingConfirm) return plan
  if (plan.channel === 'work') {
    return { ...plan, pendingConfirm: plan.workKind === 'factory' ? 'create' : 'work_job', grounding: writeGrounding({ ...plan, pendingConfirm: 'work_job' }) }
  }
  return plan
}
