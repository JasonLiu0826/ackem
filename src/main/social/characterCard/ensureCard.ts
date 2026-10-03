/**
 * ensureCard.ts — 内置/无卡社会成员：从 agents 行合成角色卡
 */

import { getAgent, updateAgent, type AgentRow } from '../../db/repos/agentsRepo'
import { INITIAL_AGENTS } from '../agents/initialAgents'
import { buildAgentCard } from './buildAgentCard'
import { cardExists, loadAgentCard, writeCardBundle } from './agentCardStore'
import type { AgentCard, ParsedIntermediate } from './types'
import { CharacterCardError } from './types'

function cardFromRow(row: AgentRow, seedExtras?: (typeof INITIAL_AGENTS)[number]): AgentCard {
  const role = seedExtras?.role ?? row.name
  const parsed: ParsedIntermediate = {
    displayName: row.name,
    gender: row.gender,
    roleOrTagline: role,
    personaMarkdown: seedExtras?.personaMarkdown ?? '',
    sourceFormat: 'local-form',
    formExtras: {
      speakingStyle: seedExtras?.speakingStyle,
      speechQuirks: seedExtras?.speechQuirks,
      coreConflict: seedExtras?.coreConflict,
      voiceSample: seedExtras?.voiceSample,
    },
  }
  return buildAgentCard(parsed, {
    presetId: row.preset_id,
    gender: row.gender,
    social3D: { se: row.se, sp: row.sp, so: row.so },
  })
}

/** 读取角色卡；不存在则按 agents 行（及预制种子）合成并落盘 */
export function loadOrCreateAgentCard(dataRoot: string, agentId: string): AgentCard {
  if (cardExists(dataRoot, agentId)) {
    return loadAgentCard(dataRoot, agentId)
  }
  const row = getAgent(dataRoot, agentId)
  if (!row) {
    throw new CharacterCardError('NOT_FOUND', `Agent 不存在：${agentId}`)
  }
  if (row.kind !== 'social_member') {
    throw new CharacterCardError('FORBIDDEN', '主体角色不使用社会角色卡编辑')
  }
  const seed = INITIAL_AGENTS.find((s) => s.id === agentId)
  const card = cardFromRow(row, seed)
  const persona = seed?.personaMarkdown ?? `# ${row.name}\n\n## 身份\n${seed?.role ?? row.name}\n`
  writeCardBundle(dataRoot, agentId, card, persona)
  updateAgent(dataRoot, agentId, {
    persona_source: 'preset+card',
    persona_path: 'card/persona.md',
  })
  return card
}
