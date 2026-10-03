/**
 * contextBuilder.ts — buildSocialAgentTierA
 * 将 agentCard.json + persona.md 组装为 Tier A 中文块（嘴·身份口吻）
 * 社会成员专用，不含 Ackem Canon
 */

import type { AppSettings } from '../../settings'
import { buildPresetVoiceGuide, getPreset } from '../../personalityPresets'
import { loadAgentCard, loadPersonaMarkdown } from './agentCardStore'
import { getRegisteredAgent } from '../agents/agentRegistry'

const PERSONA_INJECT_LIMIT = 2500

const DEFAULT_PROHIBITIONS = [
  '不要自称 Ackem、GPT、Claude 等大模型品牌',
  '不要注入主 Chat 的 Canon 或扩展上下文',
  '不要跳出角色用客服腔或百科腔',
]

export function buildSocialAgentTierA(
  dataRoot: string,
  agentId: string,
  settings: AppSettings
): string {
  const adultMode = Boolean(settings.adultContentMode && settings.ageConfirmed18)

  let displayName = agentId
  try {
    const card = loadAgentCard(dataRoot, agentId)
    const persona = loadPersonaMarkdown(dataRoot, agentId)
    const preset = getPreset(card.personality.presetId)
    const voiceFallback =
      preset != null
        ? buildPresetVoiceGuide(preset, adultMode)
        : '以角色卡口吻说话，勿写成通用助手。'

    const prohibitions = [
      ...(card.personality.prohibitions ?? []),
      ...DEFAULT_PROHIBITIONS,
      `永远以「${card.identity.name}」的身份说话，不要跳出角色`,
    ]

    if (card.identity.world) {
      prohibitions.push(`你生活在「${card.identity.world}」的世界观中，避免无关现实品牌植入`)
    }

    const blocks = [
      '【角色身份 · 全轮优先】',
      `你是「${card.identity.name}」。`,
      `身份：${card.identity.role}。`,
      card.identity.world ? `所在世界：${card.identity.world}。` : '',
      card.identity.tagline ? `标语：${card.identity.tagline}` : '',
      card.identity.appearance ? `外貌：${card.identity.appearance}` : '',
      '',
      '【角色口吻 · 全轮优先】',
      card.personality.coreConflict
        ? `核心矛盾：${card.personality.coreConflict}`
        : '',
      card.personality.speakingStyle
        ? `说话方式：${card.personality.speakingStyle}`
        : `说话方式：${voiceFallback}`,
      card.personality.speechQuirks?.length
        ? `常用语癖：${card.personality.speechQuirks.join('、')}`
        : preset
          ? `预设口吻：${voiceFallback}`
          : '',
      '',
      '【角色背景】',
      persona.slice(0, PERSONA_INJECT_LIMIT),
      '',
      '【行为约束 · 全轮禁止】',
      ...prohibitions.map((p) => `- ${p}`),
      '',
      '【对话示例】',
      card.identity.voiceSample
        ? `角色代表性台词：${card.identity.voiceSample}`
        : '',
    ]

    return blocks.filter((line) => line !== '').join('\n')
  } catch {
    const row = getRegisteredAgent(dataRoot, agentId)
    displayName = row?.name ?? agentId
    const preset = row ? getPreset(row.preset_id) : undefined
    const voice =
      preset != null
        ? buildPresetVoiceGuide(preset, adultMode)
        : '以该社会成员身份自然对话。'

    return [
      '【角色身份 · 全轮优先】',
      `你是「${displayName}」。`,
      '',
      '【角色口吻 · 全轮优先】',
      voice,
      '',
      '【行为约束 · 全轮禁止】',
      ...DEFAULT_PROHIBITIONS.map((p) => `- ${p}`),
    ].join('\n')
  }
}
