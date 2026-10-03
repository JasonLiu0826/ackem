/**
 * seedGenerator.ts — 导入种子事实
 * 将角色卡 seedMemories 转为 memory_facts（surface=import）
 * 供 createFromLocal / updateAgent 写入 DB
 */

import { randomUUID } from 'node:crypto'
import type { MemoryFact } from '../../memory/semantic/types.js'
import { sessionIdForAgent } from '../agents/agentPaths'

const DEFAULT_EMOTIONAL = {
  valence: 0,
  intensity: 0.2,
  relStage: 'STRANGER' as const,
  trust: 10,
  atmosphere: 'neutral' as const,
}

export function seedMemoryToFact(
  agentId: string,
  seed: { domain: string; content: string },
  index: number
): MemoryFact {
  const now = new Date().toISOString()
  const sessionId = sessionIdForAgent(agentId)
  const domain = seed.domain.trim().toUpperCase() || 'IDENTITY'
  const summary = seed.content.trim()

  return {
    id: randomUUID(),
    domain,
    subcategory: 'CHARACTER_SEED',
    subject: domain,
    summary,
    weight: 3,
    confidence: 0.95,
    status: 'active',
    emotionalContext: { ...DEFAULT_EMOTIONAL },
    selfRelevance: 0.9,
    triggers: summary.slice(0, 40).split(/\s+/).filter(Boolean).slice(0, 5),
    updateTrail: [now],
    sourceSessionId: sessionId,
    sourceTurnIndex: -1 - index,
    createdAt: now,
    updatedAt: now,
    factLayer: 'raw',
    tier: 'core',
    privacyLevel: 'normal',
    ownerAgentId: agentId,
    interactionSurface: 'import',
    counterpartyKind: 'none',
    counterpartyId: null,
    involvesUser: false,
    occurredAt: now,
    contextJson: { seed: true, domain },
  }
}

export function buildSeedFacts(
  agentId: string,
  seeds: { domain: string; content: string }[] | undefined
): MemoryFact[] {
  if (!seeds?.length) return []
  return seeds
    .map((s, i) => seedMemoryToFact(agentId, s, i))
    .filter((f) => f.summary.length > 0)
}
