/**
 * guards — 判断当前是否 Ackem 主体 / 社会成员
 * 决定走主 Chat 还是社会 prompt 分叉
 */

import { getAgent } from '../../db/repos/agentsRepo'
import { PRIMARY_AGENT_ID } from './agentPaths'
import { getCachedAgent } from './agentRegistry'

export function isPrimaryCompanion(agentId: string): boolean {
  return agentId === PRIMARY_AGENT_ID
}

export function isSocialMember(agentId: string, dataRoot?: string): boolean {
  if (agentId === PRIMARY_AGENT_ID) return false
  const cached = getCachedAgent(agentId)
  if (cached) return cached.kind === 'social_member'
  if (!dataRoot) return agentId.startsWith('user_') || agentId.startsWith('builtin_')
  const row = getAgent(dataRoot, agentId)
  return row?.kind === 'social_member'
}
