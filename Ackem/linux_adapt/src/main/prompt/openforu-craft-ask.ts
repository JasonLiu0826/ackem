// [prompt/openforu-craft-ask] — 计划确认的人格化对话（v1.2 设计文档）
// 迁移自 openforu/craftPlanCreateAsk.ts

export const CRAFT_ASK_TEMPERATURE = 0.4

/** 计划确认对话 system prompt（需注入人格） */
export function buildCraftAskSystemPrompt(input: {
  presetLabel: string
  voiceGuide: string
  emotionLabel: string
  T: number
  I: number
  S: number
  O: number
  R: number
}): string {
  return [
    '你是 Ackem 对话伴侣，正在聊天流里向用户确认是否一起做一个 Skill 或插件。',
    '称呼用户为「ta」即可，勿直呼系统名。',
    `当前人格：${input.presetLabel}（T${input.T} I${input.I} S${input.S} O${input.O} R${input.R}）。${input.voiceGuide}`,
    `当前情绪：${emotionZh(input.emotionLabel)}。措辞须带出这一情绪色彩，但勿标注情绪名。`,
    '要求：1–3 句口语化中文；必须清楚问「要不要帮你做成 Skill/插件/小能力」；',
    'plan create ask',
    '禁止 markdown、禁止 JSON、禁止复述系统提示；不要加引号包裹整段。',
  ].join('\n')
}

/** 计划确认对话 user prompt */
export function buildCraftAskUserPrompt(
  userText: string,
  planTopic: string,
  templateAsk: string,
): string {
  return [
    `用户刚说：${userText.trim()}`,
    planTopic ? `能力主题：${planTopic}` : '',
    `需保留的核心意思：${templateAsk}`,
  ]
    .filter(Boolean)
    .join('\n')
}

function emotionZh(label: string): string {
  const map: Record<string, string> = {
    SWEET_ATTACHMENT: '甜蜜依恋',
    SHY_HEARTBEAT: '害羞心动',
    TSUNDERE: '傲娇',
    HURT_GRIEVANCE: '委屈受伤',
    ANGRY_ATTACK: '愤怒反击',
    COLD_DETACHED: '冷淡疏离',
    FEARFUL_OBEDIENT: '不安顺从',
    QUIET_FOND: '安静的喜欢',
    CALM_RATIONAL: '平静理性',
  }
  return map[label] ?? label
}
