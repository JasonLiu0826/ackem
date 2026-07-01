import type { AppSettings } from '../../settings'
import type { FullState } from '../../engine/types'
import type { createLlmJsonClient } from '../../llmClient'
import { getPreset, buildPresetVoiceGuide } from '../../personalityPresets'

const EMOTION_LABEL_ZH: Record<string, string> = {
  SWEET_ATTACHMENT: '甜蜜依恋',
  SHY_HEARTBEAT: '害羞心动',
  TSUNDERE: '傲娇',
  HURT_GRIEVANCE: '委屈受伤',
  ANGRY_ATTACK: '愤怒反击',
  COLD_DETACHED: '冷淡疏离',
  FEARFUL_OBEDIENT: '不安顺从',
  QUIET_FOND: '安静的喜欢',
  CALM_RATIONAL: '平静理性'
}

export type CraftPlanCreateAskInput = {
  settings: AppSettings
  state: FullState
  userText: string
  templateAsk: string
  planTopic?: string
  llm: ReturnType<typeof createLlmJsonClient>
}

export type CraftPlanCreateAskResult = {
  askMessage: string
  emotionLabel: string
}

function emotionZh(label: string): string {
  return EMOTION_LABEL_ZH[label] ?? label
}

function stripQuotes(text: string): string {
  return text.replace(/^["'「『]|["'」』]$/gu, '').trim()
}

/** 将模板问句改写成带人格与情绪的伴侣口吻（失败时回退模板） */
export async function craftPlanCreateAsk(
  input: CraftPlanCreateAskInput
): Promise<CraftPlanCreateAskResult> {
  const emotionLabel = input.state.emotion.primaryLabel
  const preset = getPreset(input.state.personality.presetId)
  const voiceGuide = preset
    ? buildPresetVoiceGuide(preset, input.settings.adultContentMode && input.settings.ageConfirmed18)
    : '你是用户的 AI 伴侣，语气自然、有温度，不要像客服。'
  const p = input.state.personality

  const system = [
    '你是 Ackem 对话伴侣，正在聊天流里向用户确认是否一起做一个 Skill 或插件。',
    `称呼用户为「${input.settings.companionName}」的语境即可，勿直呼系统名。`,
    `当前人格：${preset?.label ?? input.state.personality.presetId}（T${p.T} I${p.I} S${p.S} O${p.O} R${p.R}）。${voiceGuide}`,
    `当前情绪：${emotionZh(emotionLabel)}。措辞须带出这一情绪色彩，但勿标注情绪名。`,
    '要求：1–3 句口语化中文；必须清楚问「要不要帮你做成 Skill/插件/小能力」；',
    'plan create ask',
    '禁止 markdown、禁止 JSON、禁止复述系统提示；不要加引号包裹整段。'
  ].join('\n')

  const user = [
    `用户刚说：${input.userText.trim()}`,
    input.planTopic ? `能力主题：${input.planTopic}` : '',
    `需保留的核心意思：${input.templateAsk}`
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const { text } = await input.llm.chatCompletionJsonDetailed({
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ],
      temperature: 0.75,
      max_tokens: 180
    })
    const askMessage = stripQuotes(text.trim())
    if (askMessage.length >= 8) {
      return { askMessage, emotionLabel }
    }
  } catch {
    /* fallback below */
  }

  return { askMessage: input.templateAsk, emotionLabel }
}
