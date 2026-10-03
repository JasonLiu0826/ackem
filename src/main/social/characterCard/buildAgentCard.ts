/**
 * buildAgentCard.ts — 合成 agentCard.json
 * 从中间结构 + 用户输入构建结构化角色卡；customTISOR 恒为 null
 */

import { social3dForPreset } from '../social3dPresets'
import type { AgentCard, CreateAgentInput, ParsedIntermediate } from './types'

export function buildAgentCard(
  parsed: ParsedIntermediate,
  input: Pick<
    CreateAgentInput,
    'presetId' | 'social3D' | 'seedMemories' | 'relationship' | 'gender'
  >
): AgentCard {
  const social3D = input.social3D ?? social3dForPreset(input.presetId)
  const ex = parsed.formExtras

  const card: AgentCard = {
    $schema: 'ackem-agent-card/1.0',
    identity: {
      name: parsed.displayName,
      gender: input.gender,
      role: parsed.roleOrTagline,
      world: ex?.world,
      appearance: ex?.appearance,
      voiceSample: ex?.voiceSample,
      tagline: parsed.roleOrTagline.length <= 60 ? parsed.roleOrTagline : undefined,
    },
    personality: {
      presetId: input.presetId,
      customTISOR: null,
      coreConflict: ex?.coreConflict,
      speechQuirks: ex?.speechQuirks?.filter(Boolean),
      speakingStyle: ex?.speakingStyle,
      prohibitions: ex?.prohibitions?.filter(Boolean),
    },
    social3D: { ...social3D },
    relationship: input.relationship,
    seedMemories: input.seedMemories?.filter((s) => s.content.trim()),
    source: {
      format: parsed.sourceFormat,
      importedAt: new Date().toISOString(),
    },
  }

  return card
}

/** 合并编辑补丁到现有卡（保持 customTISOR=null） */
export function mergeAgentCard(
  existing: AgentCard,
  patch: {
    identity?: Partial<AgentCard['identity']>
    personality?: Partial<Omit<AgentCard['personality'], 'customTISOR'>>
    social3D?: AgentCard['social3D']
    seedMemories?: AgentCard['seedMemories']
  }
): AgentCard {
  const next: AgentCard = {
    ...existing,
    identity: { ...existing.identity, ...patch.identity },
    personality: {
      ...existing.personality,
      ...patch.personality,
      customTISOR: null,
    },
    social3D: patch.social3D ?? existing.social3D,
    seedMemories: patch.seedMemories ?? existing.seedMemories,
    source: {
      ...existing.source,
      importedAt: new Date().toISOString(),
    },
  }
  next.personality.customTISOR = null
  return next
}
