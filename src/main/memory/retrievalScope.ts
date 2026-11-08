/**
 * retrievalScope.ts — 检索硬隔离
 * 规则：owner_agent_id 必须相等；同 owner 下允许全场景面召回
 */

import type { MemoryFact } from './semantic/types.js'
import { ALL_INTERACTION_SURFACES, type InteractionSurface } from './provenance'
import type Database from 'better-sqlite3'
import { canReadMemoryObject } from './accessScope'

export type RetrievalScope = {
  ownerAgentId: string
  sessionId: string
  interactionSurface: InteractionSurface
  adultMode: boolean
  database?: Database.Database
  accessContextRef?: string
}

/** 任意 Agent 同权：同 owner 下主聊 / 微信 / 导入 / 社会场景均可检出 */
const OWNER_VISIBLE_SURFACES = new Set<string>(ALL_INTERACTION_SURFACES)

export function matchesFactVisibility(
  fact: { ownerAgentId?: string; interactionSurface?: string; privacyLevel?: string },
  ownerAgentId: string,
  adultMode: boolean
): boolean {
  return (fact.ownerAgentId ?? 'default') === ownerAgentId &&
    OWNER_VISIBLE_SURFACES.has(fact.interactionSurface ?? 'desktop_main') &&
    (adultMode || (fact.privacyLevel ?? 'normal') === 'normal')
}

export function filterFactsForRetrieval(facts: MemoryFact[], scope: RetrievalScope): MemoryFact[] {
  return facts.filter((fact) => matchesFactVisibility(fact, scope.ownerAgentId, scope.adultMode) &&
    (!scope.database || canReadMemoryObject(scope.database, 'fact', fact.id, fact.sourceSessionId, scope.accessContextRef)))
}
