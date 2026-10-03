/**
 * update.ts — 编辑社会成员 Agent（保留记忆）
 * 允许 origin=user 与可删内置社会成员；改名不改 id；换预设须确认；种子仅替换 import 面
 */

import { getAgent, updateAgent as updateAgentRow } from '../../db/repos/agentsRepo'
import {
  deleteImportSeedsByOwner,
  insertFact,
} from '../../db/repos/memoryFacts'
import { defaultPersonalitySlice, getPreset } from '../../personalityPresets'
import { loadState, saveState } from '../../engine/state-persistence'
import { sessionIdForAgent } from '../agents/agentPaths'
import { rememberAgent, invalidateAgentCache } from '../agents/agentRegistry'
import { mergeAgentCard } from './buildAgentCard'
import { loadOrCreateAgentCard } from './ensureCard'
import {
  loadPersonaMarkdown,
  saveAgentCard,
  savePersonaMarkdown,
  writeCardBundle,
} from './agentCardStore'
import { buildSeedFacts } from './seedGenerator'
import { validateUpdateInput } from './validate'
import type { AgentCard, UpdateAgentInput } from './types'
import { CharacterCardError } from './types'

function assertEditableSocialMember(dataRoot: string, agentId: string) {
  const row = getAgent(dataRoot, agentId)
  if (!row) {
    throw new CharacterCardError('NOT_FOUND', `Agent 不存在：${agentId}`)
  }
  if (row.kind !== 'social_member') {
    throw new CharacterCardError('FORBIDDEN', '主体角色不可经社会页编辑')
  }
  return row
}

function patchPersonalityTisor(
  dataRoot: string,
  sessionId: string,
  presetId: string,
  gender: 'female' | 'male'
): void {
  const state = loadState(dataRoot, sessionId)
  if (!state) return
  const slice = defaultPersonalitySlice({
    companionGender: gender,
    personalityPresetId: presetId,
  })
  saveState(
    dataRoot,
    {
      ...state,
      personality: slice,
      personalityBaseline: {
        T: slice.T,
        I: slice.I,
        S: slice.S,
        O: slice.O,
        R: slice.R,
      },
    },
    sessionId
  )
}

/** 编辑社会成员；默认保留聊天记忆与 relationship 进度 */
export async function updateAgent(
  dataRoot: string,
  input: UpdateAgentInput,
  opts: { ageConfirmed18: boolean }
): Promise<void> {
  assertEditableSocialMember(dataRoot, input.agentId)
  const existing = loadOrCreateAgentCard(dataRoot, input.agentId)

  const next = mergeAgentCard(existing, {
    identity: input.identity,
    personality: input.personality,
    social3D: input.social3D,
    seedMemories: input.seedMemories,
  })

  if (input.identity?.name) {
    next.identity.name = input.identity.name.trim()
  }

  validateUpdateInput(input, next, opts.ageConfirmed18)

  const presetChanging =
    input.personality?.presetId != null &&
    input.personality.presetId !== existing.personality.presetId

  if (presetChanging) {
    const preset = getPreset(input.personality!.presetId!)
    if (!preset || preset.gender !== next.identity.gender) {
      throw new CharacterCardError('PRESET_MISMATCH', '预设与性别不匹配')
    }
    next.personality.presetId = preset.id
  }

  next.personality.customTISOR = null

  const personaMarkdown =
    input.personaMarkdown != null
      ? input.personaMarkdown
      : loadPersonaMarkdown(dataRoot, input.agentId)

  writeCardBundle(dataRoot, input.agentId, next, personaMarkdown)

  const patch: Parameters<typeof updateAgentRow>[2] = {
    updated_at: new Date().toISOString(),
    persona_source: 'preset+card',
    persona_path: 'card/persona.md',
  }
  if (input.identity?.name) patch.name = next.identity.name
  if (input.social3D) {
    patch.se = next.social3D.se
    patch.sp = next.social3D.sp
    patch.so = next.social3D.so
  }
  if (presetChanging) patch.preset_id = next.personality.presetId
  updateAgentRow(dataRoot, input.agentId, patch)

  if (presetChanging) {
    patchPersonalityTisor(
      dataRoot,
      sessionIdForAgent(input.agentId),
      next.personality.presetId,
      next.identity.gender
    )
  }

  if (input.seedMemories != null) {
    deleteImportSeedsByOwner(dataRoot, input.agentId)
    const seeds = buildSeedFacts(input.agentId, input.seedMemories)
    for (const fact of seeds) {
      insertFact(dataRoot, fact)
    }
    const cardWithSeeds: AgentCard = { ...next, seedMemories: input.seedMemories }
    saveAgentCard(dataRoot, input.agentId, cardWithSeeds)
  }

  if (input.personaMarkdown != null) {
    savePersonaMarkdown(dataRoot, input.agentId, input.personaMarkdown)
  }

  invalidateAgentCache(dataRoot, input.agentId)
  const refreshed = getAgent(dataRoot, input.agentId)
  if (refreshed) rememberAgent(dataRoot, refreshed)
}
