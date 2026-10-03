/**
 * import.ts — 本地创建主流程 createFromLocal
 * 校验 → 建卡 → 注册 agents → 落盘 → 状态/种子/图谱/头像
 * 对齐说明书 §6.3 十步事务
 */

import { randomBytes } from 'node:crypto'
import {
  getAgent,
  insertAgent,
  listSocialMembers,
  type AgentInsert,
} from '../../db/repos/agentsRepo'
import { insertFact } from '../../db/repos/memoryFacts'
import { upsertEdge } from '../../db/repos/socialGraphRepo'
import { defaultFullState, saveState } from '../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../personalityPresets'
import { sessionIdForAgent } from '../agents/agentPaths'
import { rememberAgent } from '../agents/agentRegistry'
import { buildAgentCard } from './buildAgentCard'
import { formToPersona } from './formToPersona'
import { parseToIntermediate } from './parse'
import { buildSeedFacts } from './seedGenerator'
import { validateCreateInput } from './validate'
import { writeCardBundle } from './agentCardStore'
import { writeAgentAvatar } from './avatarStore'
import type { CreateAgentInput } from './types'

export type CreateFromLocalResult = {
  agentId: string
  warnings: import('./validate').ValidationWarning[]
}

function slugifyName(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/gi, '_')
    .replace(/^_+|_+$/g, '')
  if (ascii.length >= 2) return ascii.slice(0, 24)
  return 'agent'
}

export function generateAgentId(name: string): string {
  const slug = slugifyName(name)
  const rand = randomBytes(2).toString('hex')
  return `user_${slug}_${rand}`
}

/** 本地创建自定义社会成员（表单 / md / txt） */
export async function createFromLocal(
  dataRoot: string,
  input: CreateAgentInput,
  opts: { ageConfirmed18: boolean }
): Promise<CreateFromLocalResult> {
  // 1. validate + presetMatchConfirmed
  const parsed = parseToIntermediate(input)
  const { warnings } = validateCreateInput(input, parsed, opts.ageConfirmed18)

  // 2. buildAgentCard; customTISOR=null; social3D = user ?? preset default
  const card = buildAgentCard(parsed, input)
  card.personality.customTISOR = null

  const personaMarkdown =
    input.format === 'form'
      ? formToPersona(input)
      : parsed.personaMarkdown

  // 3. generateAgentId
  const agentId = generateAgentId(card.identity.name)
  const sessionId = sessionIdForAgent(agentId)
  const now = new Date().toISOString()

  // 4. agentsRepo.insert
  const row: AgentInsert = {
    id: agentId,
    name: card.identity.name,
    kind: 'social_member',
    origin: 'user',
    deletable: 1,
    preset_id: card.personality.presetId,
    gender: card.identity.gender,
    session_id: sessionId,
    se: card.social3D.se,
    sp: card.social3D.sp,
    so: card.social3D.so,
    persona_source: 'preset+card',
    persona_path: 'card/persona.md',
    avatar_url: input.avatarUpload ? 'card/avatar.webp' : null,
    created_at: now,
    updated_at: now,
  }
  insertAgent(dataRoot, row)

  // 5. mkdir card/; write agentCard.json + persona.md
  writeCardBundle(dataRoot, agentId, card, personaMarkdown)

  // 6. defaultFullState + relationship → saveCompanionState
  const personality = defaultPersonalitySlice({
    companionGender: card.identity.gender,
    personalityPresetId: card.personality.presetId,
  })
  const state = defaultFullState(personality)
  if (card.relationship) {
    state.relationship.stage = card.relationship.initialStage ?? 'STRANGER'
    state.relationship.trust = card.relationship.initialTrust ?? 10
  }
  saveState(dataRoot, state, sessionId)

  // 7. seedMemories → facts surface=import
  const seeds = buildSeedFacts(agentId, card.seedMemories)
  for (const fact of seeds) {
    insertFact(dataRoot, fact)
  }

  // 8. social_graph edges with all other social_members trust=25
  const members = listSocialMembers(dataRoot)
  for (const other of members) {
    if (other.id === agentId) continue
    upsertEdge(dataRoot, agentId, other.id, { trust: 25, stage: 'STRANGER' })
  }

  // 9. avatar if bytes
  if (input.avatarUpload) {
    writeAgentAvatar(dataRoot, agentId, input.avatarUpload)
  }

  // cache
  const inserted = getAgent(dataRoot, agentId)
  if (inserted) rememberAgent(dataRoot, inserted)

  // 10. return { agentId }
  return { agentId, warnings }
}
