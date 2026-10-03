/**
 * provenance.ts — 记忆溯源类型与校验
 * 写入 memory_facts 前校验 owner / surface 是否合法
 *
 * 任意 Agent（含自定义社会成员）可使用同一套场景面枚举；
 * 扩展层仍由调用方按 isPrimaryCompanion 拦截，不在此禁止 surface。
 */

import { isPrimaryCompanion } from '../social/agents/guards'

export type InteractionSurface =
  | 'desktop_main'
  | 'weixin'
  | 'social_private'
  | 'social_feed'
  | 'social_group'
  | 'social_tick'
  | 'import'
  | 'system'

export const ALL_INTERACTION_SURFACES: readonly InteractionSurface[] = [
  'desktop_main',
  'weixin',
  'social_private',
  'social_feed',
  'social_group',
  'social_tick',
  'import',
  'system',
] as const

export type CounterpartyKind = 'user' | 'agent' | 'group' | 'none' | 'system'

export type FactProvenance = {
  ownerAgentId: string
  interactionSurface: InteractionSurface
  counterpartyKind: CounterpartyKind
  counterpartyId?: string | null
  involvesUser: boolean
  occurredAt?: string
  contextJson?: Record<string, unknown>
}

export function isInteractionSurface(value: string | undefined | null): value is InteractionSurface {
  return (
    typeof value === 'string' &&
    (ALL_INTERACTION_SURFACES as readonly string[]).includes(value)
  )
}

export function validateProvenance(agentId: string, p: FactProvenance): void {
  if (p.ownerAgentId !== agentId) {
    throw new Error(`PROVENANCE_OWNER_MISMATCH: ${p.ownerAgentId} != ${agentId}`)
  }
  if (!isInteractionSurface(p.interactionSurface)) {
    throw new Error(`PROVENANCE_SURFACE_INVALID: ${String(p.interactionSurface)}`)
  }
}

/** 通道 → 场景面（显式 surface 优先；社会成员桌面私聊默认 social_private） */
export function channelToInteractionSurface(
  channel?: 'desktop' | 'weixin' | string | null,
  explicit?: InteractionSurface | string | null,
  agentId?: string | null
): InteractionSurface {
  if (explicit != null && isInteractionSurface(explicit)) return explicit
  if (channel === 'weixin') return 'weixin'
  if (agentId && !isPrimaryCompanion(agentId)) return 'social_private'
  return 'desktop_main'
}

/** 根据当前 agent 与场景构造默认溯源 */
export function buildChatProvenance(
  agentId: string,
  surface: InteractionSurface = isPrimaryCompanion(agentId) ? 'desktop_main' : 'social_private'
): FactProvenance {
  const p: FactProvenance = {
    ownerAgentId: agentId,
    interactionSurface: surface,
    counterpartyKind: surface === 'import' ? 'none' : 'user',
    counterpartyId: null,
    involvesUser: surface !== 'import' && surface !== 'system' && surface !== 'social_tick',
  }
  validateProvenance(agentId, p)
  return p
}

export function surfaceLabel(surface: string | undefined): string {
  switch (surface) {
    case 'import':
      return '角色设定/导入'
    case 'social_private':
      return '和 ta 的私聊'
    case 'social_feed':
      return '朋友圈'
    case 'social_group':
      return '群聊'
    case 'social_tick':
      return '日常见闻'
    case 'system':
      return '系统整理'
    case 'weixin':
      return '微信'
    case 'desktop_main':
    default:
      return '主对话'
  }
}
