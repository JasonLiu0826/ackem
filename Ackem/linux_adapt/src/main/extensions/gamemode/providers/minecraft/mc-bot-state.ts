// [gaming/mc-bot-state] — Bot 运行状态机 + 实机调试快照
// 职责：将行为决策映射为互斥的运行状态，生成供 UI 展示的调试信息

import type { BehaviorDecision, BehaviorType, BotAction } from './mc-behavior'
import type { McGameState } from './types'

/** Bot 当前运行状态（互斥，用于避免动作互相覆盖） */
export type BotOpState =
  | 'IDLE'
  | 'FOLLOWING'
  | 'COMBAT'
  | 'RESCUE'
  | 'STUCK'
  | 'NAVIGATING'
  | 'PORTAL'

export interface McBotDebugSnapshot {
  timestamp: string
  opState: BotOpState
  decisionType: BehaviorType | null
  decisionPriority: number | null
  actionSummary: string
  attackTargetId: number | string | null
  attackTargetName: string | null
  attackRemainingMs: number
  followEntityId: number | string | null
  followRange: number
  pathStatus: string
  distToPlayer: number
  stuckForMs: number
  stuckReason: string
  dimension: string
  playerInDanger: boolean
  nearestThreatToPlayer: string | null
  playerAttacking: string | null
  botHealth: number
  botInLava: boolean
  botInWater: boolean
  playerNotFound: boolean
  hasPathGoal: boolean
}

export interface BotRuntimeContext {
  now: number
  gs: McGameState
  decision: BehaviorDecision | null
  activeAttackTarget: number | string | null
  activeAttackUntil: number
  activeAttackName?: string | null
  activeFollowEntityId: number | string | null
  activeFollowRange: number
  stuckForMs: number
  stuckReason: string
  pathStatus: string
}

const COMBAT_LOCK_PRIORITY = 11

export function behaviorTypeToOpState(type: BehaviorType, actions: BotAction[]): BotOpState {
  if (type === 'rescue' || type === 'first_aid') return 'RESCUE'
  if (type === 'combat') return 'COMBAT'
  if (type === 'follow') return 'FOLLOWING'
  if (actions.some(a => a.kind === 'find_portal' || a.kind === 'tp_to_player')) return 'PORTAL'
  if (actions.some(a => a.kind === 'move_to' || a.kind === 'teleport')) return 'NAVIGATING'
  return 'IDLE'
}

/** 根据活跃战斗/跟随/卡住覆盖决策类型 */
export function resolveOpState(ctx: BotRuntimeContext): BotOpState {
  const { now, decision, activeAttackTarget, activeAttackUntil, stuckForMs } = ctx
  if (stuckForMs >= 2500) return 'STUCK'
  if (activeAttackTarget != null && now < activeAttackUntil) return 'COMBAT'
  if (decision) {
    const base = behaviorTypeToOpState(decision.type, decision.actions)
    if (base === 'COMBAT' || base === 'RESCUE') return base
    if (ctx.activeFollowEntityId != null && base === 'IDLE') return 'FOLLOWING'
    return base
  }
  if (ctx.activeFollowEntityId != null) return 'FOLLOWING'
  return 'IDLE'
}

/** 战斗进行中时过滤会打断战斗的低优先级动作 */
export function filterActionsForCombatLock(
  actions: BotAction[],
  decision: BehaviorDecision,
  now: number,
  activeAttackUntil: number,
): BotAction[] {
  if (now >= activeAttackUntil) return actions
  if (decision.priority >= COMBAT_LOCK_PRIORITY) return actions
  if (decision.type === 'rescue' || decision.type === 'first_aid') return actions

  return actions.filter(a => {
    if (a.kind === 'follow_player') return false
    if (a.kind === 'move_to') return false
    if (a.kind === 'idle') return false
    return true
  })
}

export function summarizeActions(actions: BotAction[]): string {
  if (actions.length === 0) return '(none)'
  return actions.map(a => {
    if (a.kind === 'attack') return `attack:${a.targetName}`
    if (a.kind === 'follow_player') return `follow:${a.distance}`
    if (a.kind === 'move_to') return `move`
    if (a.kind === 'chat') return 'chat'
    return a.kind
  }).join(', ')
}

export function buildDebugSnapshot(ctx: BotRuntimeContext): McBotDebugSnapshot {
  const { gs, decision, now } = ctx
  const dx = gs.botPosition.x - gs.playerPosition.x
  const dy = gs.botPosition.y - gs.playerPosition.y
  const dz = gs.botPosition.z - gs.playerPosition.z
  const distToPlayer = Math.sqrt(dx * dx + dy * dy + dz * dz)

  return {
    timestamp: new Date(now).toISOString(),
    opState: resolveOpState(ctx),
    decisionType: decision?.type ?? null,
    decisionPriority: decision?.priority ?? null,
    actionSummary: decision ? summarizeActions(decision.actions) : '',
    attackTargetId: ctx.activeAttackTarget,
    attackTargetName: ctx.activeAttackName ?? null,
    attackRemainingMs: Math.max(0, ctx.activeAttackUntil - now),
    followEntityId: ctx.activeFollowEntityId,
    followRange: ctx.activeFollowRange,
    pathStatus: ctx.pathStatus,
    distToPlayer: Math.round(distToPlayer * 10) / 10,
    stuckForMs: ctx.stuckForMs,
    stuckReason: ctx.stuckReason,
    dimension: gs.dimension,
    playerInDanger: gs.playerInDanger,
    nearestThreatToPlayer: gs.nearestThreatToPlayer,
    playerAttacking: gs.playerAttacking,
    botHealth: gs.botHealth,
    botInLava: gs.botInLava,
    botInWater: gs.botInWater,
    playerNotFound: gs.playerNotFound,
    hasPathGoal: ctx.pathStatus !== 'no_goal' && ctx.pathStatus !== 'no_pathfinder',
  }
}
