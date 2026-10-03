/**
 * agentPaths — Agent id ↔ session ↔ 磁盘路径
 * 防止社会成员与 Ackem 共用路径导致记忆串线
 */

import { join } from 'node:path'

export const PRIMARY_AGENT_ID = 'default'

export function sessionIdForAgent(agentId: string): string {
  return agentId === PRIMARY_AGENT_ID ? PRIMARY_AGENT_ID : `social_${agentId}`
}

export function agentFileRoot(dataRoot: string, agentId: string): string {
  return join(dataRoot, 'agents', agentId)
}

export function agentCardDir(dataRoot: string, agentId: string): string {
  return join(agentFileRoot(dataRoot, agentId), 'card')
}

export function agentIdFromSessionId(sessionId: string): string {
  if (sessionId === PRIMARY_AGENT_ID) return PRIMARY_AGENT_ID
  if (sessionId.startsWith('social_')) return sessionId.slice('social_'.length)
  return PRIMARY_AGENT_ID
}
