/**
 * retrievalScope.ts — 检索硬隔离
 * 规则：owner_agent_id 必须相等；同 owner 下允许全场景面召回
 */

import type { MemoryFact } from './semantic/types.js'
import { ALL_INTERACTION_SURFACES, type InteractionSurface } from './provenance'

export type RetrievalScope = {
  ownerAgentId: string
  sessionId: string
  interactionSurface: InteractionSurface
  adultMode: boolean
}

/** 任意 Agent 同权：同 owner 下主聊 / 微信 / 导入 / 社会场景均可检出 */
const OWNER_VISIBLE_SURFACES = new Set<string>(ALL_INTERACTION_SURFACES)

export function filterFactsForRetrieval(facts: MemoryFact[], scope: RetrievalScope): MemoryFact[] {
  return facts.filter((f) => {
    const owner = f.ownerAgentId ?? 'default'
    if (owner !== scope.ownerAgentId) return false
    const surface = f.interactionSurface ?? 'desktop_main'
    if (!OWNER_VISIBLE_SURFACES.has(surface)) return false
    if (!scope.adultMode) {
      if (f.privacyLevel === 'intimate' || f.privacyLevel === 'explicit') return false
    }
    return true
  })
}
