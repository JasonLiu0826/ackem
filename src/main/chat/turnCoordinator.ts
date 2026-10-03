import { randomUUID } from 'node:crypto'
import { createLogger } from '../logger.js'
import {
  MemorySystemFactoryNotRegisteredError,
  getMemorySystem
} from '../memory/bootstrap.js'
import type { MemorySystem } from '../memory/memorySystem.js'
import { applyTurnConfirm, type ConfirmResult } from '../channel/pendingAction.js'
import type { TurnConfirm } from '../../shared/channelPlan.js'
import type { MemoryRecordResult, PlanEvidence, TurnDeriveContext } from '../memory/contracts.js'
import { resolveUserTimezone } from '../memory/temporal/timezonePolicy.js'
import { getClock, type Clock } from '../memory/temporal/clock.js'
import {
  appendUnifiedChatMessage,
  type UnifiedChatRow
} from './unifiedChatHistory.js'

const log = createLogger('turn-coordinator')

// route / confirm / execute / 确认卡收口在 orchestrateChannelTurn.ts，由 IPC 入口调用。

export type ChatSurface = 'desktop' | 'weixin'

export type BeginChatTurnResult = {
  turnId: string
  correlationId: string
  memoryDegraded: boolean
}

function tryMemory(dataRoot: string): MemorySystem | null {
  try {
    return getMemorySystem(dataRoot)
  } catch (e) {
    if (e instanceof MemorySystemFactoryNotRegisteredError) return null
    throw e
  }
}

function degraded(result: MemoryRecordResult | null): boolean {
  return !result || !result.ok
}

export function beginChatTurn(
  args: {
    dataRoot: string
    sessionId: string
    userText: string
    surface: ChatSurface
    timezoneOverride?: string | null
    turnId?: string
    correlationId?: string
  },
  clock: Clock = getClock()
): BeginChatTurnResult {
  const turnId = args.turnId ?? randomUUID()
  const correlationId = args.correlationId ?? turnId
  const timezone = resolveUserTimezone(args.timezoneOverride).timezone
  const memory = tryMemory(args.dataRoot)
  if (!memory) {
    log.warn('turn.started skipped; memory system unavailable', { turnId })
    return { turnId, correlationId, memoryDegraded: true }
  }
  const recorded = memory.record({
    kind: 'turn.started',
    turn: {
      sessionId: args.sessionId,
      turnId,
      correlationId,
      userText: args.userText,
      surface: args.surface,
      observedAt: clock.now().toISOString(),
      timezone
    }
  })
  if (!recorded.ok) {
    log.warn('turn.started failed', { turnId, code: recorded.code, message: recorded.message })
  }
  return { turnId, correlationId, memoryDegraded: degraded(recorded) }
}

export function proposeChatPlan(args: {
  dataRoot: string
  turnId: string
  plan: PlanEvidence
}): MemoryRecordResult {
  const memory = tryMemory(args.dataRoot)
  if (!memory) return { ok: false, code: 'db_unavailable', message: 'memory system unavailable' }
  return memory.record({
    kind: 'plan.proposed',
    turnId: args.turnId,
    plan: args.plan
  })
}

/** Record accept/reject only after applyTurnConfirm validates the card. */
export function commitTurnConfirm(args: {
  dataRoot: string
  sessionId: string
  confirm: TurnConfirm
  catalogRevision: string
  enabledIds: string[]
}): ConfirmResult {
  const confirmed = applyTurnConfirm(args.sessionId, args.confirm, {
    catalogRevision: args.catalogRevision,
    enabledIds: args.enabledIds
  })
  const userRejected = !confirmed.ok && confirmed.reason === '用户拒绝'
  if (confirmed.ok || userRejected) {
    const recorded = decideChatPlan({
      dataRoot: args.dataRoot,
      planId: args.confirm.planId,
      accepted: confirmed.ok
    })
    if (!recorded.ok) {
      log.warn('plan decision was not recorded', {
        planId: args.confirm.planId,
        code: recorded.code,
        message: recorded.message
      })
    }
  }
  return confirmed
}

export function decideChatPlan(args: {
  dataRoot: string
  planId: string
  accepted: boolean
  /** Empty resolves the proposal by planId and reuses its turn + correlation. */
  turnId?: string
}): MemoryRecordResult {
  const memory = tryMemory(args.dataRoot)
  if (!memory) return { ok: false, code: 'db_unavailable', message: 'memory system unavailable' }
  return memory.record({
    kind: 'plan.decided',
    turnId: args.turnId ?? '',
    planId: args.planId,
    accepted: args.accepted
  })
}

function natureFromIntent(intent: string): PlanEvidence['nature'] {
  if (intent.startsWith('plugin')) return 'plugin'
  if (intent === 'work' || intent === 'work_job' || intent === 'create' || intent === 'update') return 'work'
  return 'chat'
}

/** Confirm-card branch: plan.proposed + finalize with no fabricated assistant bubble. */
export function closeConfirmCard(args: {
  dataRoot: string
  sessionId: string
  turnId: string
  userText: string
  surface: ChatSurface
  planId: string
  intent: string
  summary: string
  targetId?: string | null
}): { memoryDegraded: boolean; userRow: UnifiedChatRow | null } {
  const proposed = proposeChatPlan({
    dataRoot: args.dataRoot,
    turnId: args.turnId,
    plan: {
      planId: args.planId,
      nature: natureFromIntent(args.intent),
      intent: args.intent,
      targetId: args.targetId ?? null,
      summary: args.summary,
      requiresConfirmation: true
    }
  })
  const finalized = finalizeChatTurn({
    dataRoot: args.dataRoot,
    sessionId: args.sessionId,
    turnId: args.turnId,
    userText: args.userText,
    assistantText: '',
    surface: args.surface
  })
  if (!proposed.ok) {
    log.warn('plan.proposed failed', { turnId: args.turnId, code: proposed.code })
  }
  return {
    memoryDegraded: !proposed.ok || finalized.memoryDegraded,
    userRow: finalized.userRow
  }
}

export function finalizeChatTurn(args: {
  dataRoot: string
  sessionId: string
  turnId: string
  userText: string
  assistantText: string
  surface: ChatSurface
  occurredAt?: string
  deriveContext?: TurnDeriveContext
}): { memoryDegraded: boolean; userRow: UnifiedChatRow | null; assistantRow: UnifiedChatRow | null } {
  const occurredAt = args.occurredAt ?? getClock().now().toISOString()
  const memory = tryMemory(args.dataRoot)
  let memoryDegraded = true
  if (!memory) {
    log.warn('turn.finalized skipped; memory system unavailable', { turnId: args.turnId })
  } else {
    const recorded = memory.record({
      kind: 'turn.finalized',
      turnId: args.turnId,
      assistantText: args.assistantText,
      occurredAt,
      deriveContext: args.deriveContext
    })
    memoryDegraded = !recorded.ok
    if (!recorded.ok) {
      log.warn('turn.finalized failed', { turnId: args.turnId, code: recorded.code })
    }
  }

  const append = (
    role: 'user' | 'assistant',
    content: string
  ): UnifiedChatRow | null => {
    try {
      return appendUnifiedChatMessage(
        args.dataRoot,
        { role, content, channel: args.surface, turnId: args.turnId },
        args.sessionId
      )
    } catch (e) {
      log.warn('chat projection append failed', { turnId: args.turnId, role, error: String(e) })
      return null
    }
  }

  return {
    memoryDegraded,
    userRow: args.userText.trim() ? append('user', args.userText) : null,
    assistantRow: args.assistantText.trim() ? append('assistant', args.assistantText) : null
  }
}
