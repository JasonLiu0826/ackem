/**
 * purge.ts — 删除社会成员 Agent 全量清理
 * 按说明书 §8.1：图谱、记忆、嵌入、聊天、状态、磁盘、agents 行、缓存
 * 允许 deletable=1 的自建与内置社会成员；主体不可删
 */

import { existsSync, rmSync } from 'node:fs'
import { getDatabase } from '../../db/database'
import { deleteAgent as deleteAgentRow, getAgent } from '../../db/repos/agentsRepo'
import { deleteChatHistoryFromDb } from '../../db/repos/chatHistory'
import { deleteCompanionStateFromDb } from '../../db/repos/companionState'
import { deleteFactsByOwner } from '../../db/repos/memoryFacts'
import { deleteByAgent } from '../../db/repos/socialGraphRepo'
import { invalidateEngineCache } from '../../engineCache'
import { clearAgentEngineMaps } from '../../engine/orchestrator'
import { clearRhythmState } from '../../engine/rhythmEngine'
import { clearEmergenceTracking } from '../../engine/emotionalEmergence'
import { agentFileRoot, sessionIdForAgent } from '../agents/agentPaths'
import { markBuiltinRemoved } from '../agents/builtinRemoval'
import { forgetAgent, invalidateAgentCache } from '../agents/agentRegistry'
import { CharacterCardError } from './types'

function deleteEmbeddingsByOwner(dataRoot: string, ownerAgentId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  try {
    db.prepare(`DELETE FROM fact_embeddings WHERE owner_agent_id = ?`).run(ownerAgentId)
  } catch {
    db.prepare(
      `DELETE FROM fact_embeddings WHERE fact_id IN (
        SELECT id FROM memory_facts WHERE owner_agent_id = ?
      )`
    ).run(ownerAgentId)
  }
}

/** 全量删除可删社会成员（不可恢复） */
export async function purgeUserAgent(dataRoot: string, agentId: string): Promise<void> {
  const row = getAgent(dataRoot, agentId)
  if (!row) {
    throw new CharacterCardError('NOT_FOUND', `Agent 不存在：${agentId}`)
  }
  if (row.kind !== 'social_member' || row.deletable !== 1) {
    throw new CharacterCardError('FORBIDDEN', '该角色不可删除')
  }

  const sessionId = sessionIdForAgent(agentId)

  deleteByAgent(dataRoot, agentId)
  deleteFactsByOwner(dataRoot, agentId)
  deleteEmbeddingsByOwner(dataRoot, agentId)
  deleteChatHistoryFromDb(dataRoot, sessionId)
  deleteCompanionStateFromDb(dataRoot, sessionId)

  const root = agentFileRoot(dataRoot, agentId)
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true })
  }

  const deleted = deleteAgentRow(dataRoot, agentId)
  if (!deleted) {
    throw new CharacterCardError('FORBIDDEN', '删除 agents 行失败')
  }

  if (row.origin === 'builtin') {
    markBuiltinRemoved(dataRoot, agentId)
  }

  forgetAgent(dataRoot, agentId)
  invalidateAgentCache(dataRoot, agentId)
  clearAgentEngineMaps(agentId)
  clearRhythmState(agentId)
  clearEmergenceTracking(agentId)
  invalidateEngineCache(dataRoot)
}
