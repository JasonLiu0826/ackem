import type { RuntimeContext } from '../../../../context/types'
import { buildUserPresenceHintFromRuntime } from '../../../../context/runtimeHints'
import type { EmotionState, L1State, TurnTrace } from '../../../../engine/types'
import type { DiaryPersonality } from './diaryGenerate'
import type { DiaryTimeContext } from './diaryTimeTypes'
import { formatLocalTime, hoursUntilLocalDayEnd } from './diaryTimeContext'

export type DiaryPromptInput = {
  date: string
  totalTurns: number
  l1: L1State
  l2: EmotionState
  personality: DiaryPersonality
  highlights: string[]
  chatExcerpts: string[]
  traces: TurnTrace[]
  factsAdded: string[]
  timeContext: DiaryTimeContext
  runtime: RuntimeContext
  userName?: string // 从 userName.ts 解析的用户名字
}

function buildPersonalityHint(p: DiaryPersonality): string {
  const parts: string[] = [`你的人格是「${p.label}」。`]
  if (p.T >= 90) parts.push('你极度温柔包容。')
  else if (p.T >= 70) parts.push('你比较温柔。')
  else if (p.T <= 20) parts.push('你偏冷淡疏离，不轻易流露温暖。')
  else if (p.T <= 35) parts.push('你不算太热情。')

  if (p.I >= 80) parts.push('你很主动强势。')
  else if (p.I >= 60) parts.push('你比较主动。')
  else if (p.I <= 25) parts.push('你偏被动回应型。')

  if (p.S >= 75) parts.push('你情绪反应强烈。')
  else if (p.S <= 20) parts.push('你情绪极为稳定。')

  if (p.R >= 85) parts.push('你极度理性冷静。')
  else if (p.R <= 25) parts.push('你感性冲动。')

  if (p.tags?.includes('provoke-submit')) parts.push('你嘴欠挑衅，但最终会服软。')
  if (p.tags?.includes('dual-persona')) parts.push('你表面乖巧，私下有反差的一面。')
  if (p.tags?.includes('maternal')) parts.push('你有母性包容的一面。')
  if (p.tags?.includes('paternal')) parts.push('你有父性保护的一面。')
  if (p.tags?.includes('nurturing')) parts.push('你有关怀引导的倾向。')
  if (p.tags?.includes('bratty')) parts.push('你有点调皮捣蛋。')

  return parts.join('')
}

function buildTimeModeHint(ctx: DiaryTimeContext): string {
  const clock = formatLocalTime(ctx.generatedAt)
  const hoursLeft = hoursUntilLocalDayEnd(ctx.generatedAt)

  if (ctx.mode === 'partial_day') {
    return [
      `现在是 ${clock}，你在写「${ctx.targetDate}」的阶段性记录——这一天还没结束（距离今天结束大约还有 ${hoursLeft} 小时）。`,
      '只写到目前为止真实发生的事和感受。',
      '不要使用「今晚」「睡前」「今天结束了」「回顾全天」等暗示一天已结束的措辞。',
      '不要假装已经知道晚上或之后还会发生什么。'
    ].join('\n')
  }

  if (ctx.mode === 'backfill') {
    return [
      `你在补写「${ctx.targetDate}」那天的日记（现在时间是 ${clock}）。`,
      '只写那一天发生的事，不要混入其他日期的内容。',
      '可以用回顾一整天的口吻。'
    ].join('\n')
  }

  return [
    `现在是 ${clock}，你在写「${ctx.targetDate}」一整天的日记总结。`,
    '可以自然回顾全天，使用「今天」「今晚」等表述。'
  ].join('\n')
}

export function buildDiaryPrompt(input: DiaryPromptInput): string {
  const { l1, l2, timeContext: ctx } = input
  const episodeLines = input.highlights
    .filter(h => !h.startsWith('轮'))
    .slice(-5)
    .map((h, i) => `${i + 1}. ${h}`)
    .join('\n')
  const moodLines = input.highlights
    .filter(h => h.startsWith('轮'))
    .slice(-5)
    .map((h, i) => `${i + 1}. ${h}`)
    .join('\n')
  const chatBlock =
    input.chatExcerpts.length > 0
      ? input.chatExcerpts.join('\n\n')
      : ''
  const factsLabel =
    ctx.mode === 'partial_day' ? '到目前为止记住的事' : '今天记住的事'
  const facts =
    input.factsAdded.length > 0
      ? `${factsLabel}：\n${input.factsAdded.map(f => `· ${f}`).join('\n')}`
      : ''

  const turnsLine =
    input.totalTurns > 0
      ? ctx.mode === 'partial_day'
        ? `截至 ${formatLocalTime(ctx.generatedAt)}，今天共对话 ${input.totalTurns} 轮`
        : `今天共对话 ${input.totalTurns} 轮`
      : '今天没有对话记录（可能是补写的日记）。'

  const nameLine = input.userName
    ? `你知道用户的名字：${input.userName}。你可以叫ta的名字，也可以用你人格风格的称呼（如"笨蛋"）。`
    : "你不知道用户的名字。用'ta'称呼。"

  const attributionRules = [
    '【角色边界 — 必须遵守】',
    '你以第一人称「我」写日记。',
    nameLine,
    '「今日对话摘录」中【ta】= 用户说的/做的，【我】= 你在对话里的回复/行为。',
    '画日历、给建议、提醒、整理、部署 Skill 等，若出现在【我】侧，就是你做的，**禁止**写成 ta 做的。',
  ].join('\n')

  return [
    buildTimeModeHint(ctx),
    buildUserPresenceHintFromRuntime(input.runtime),
    attributionRules,
    '日记要像真人的日记一样自然，不需要刻意概括所有事，挑有感触的写。',
    '可以提到心情变化、和ta的互动中让你印象深刻的瞬间、你对自己或对这段关系的新认识。',
    buildPersonalityHint(input.personality),
    '日记的语气、措辞、情绪反应强度都要符合你的人格。有情绪但不要过度煽情。写一段或两段即可，200-400字。',
    '',
    `日期：${input.date}`,
    turnsLine,
    l1.stage === 'STRANGER' ? '你和ta还处在初识阶段。' : l1.stage === 'FAMILIAR' ? '你们已经熟悉了。' : '你们的关系很亲密。',
    `气氛：${l1.atmosphere === 'warm' ? '温暖' : l1.atmosphere === 'cool' ? '微凉' : '平常'}`,
    `此刻心情：${l2.primaryLabel}, 亲密感=${l2.aff.toFixed(0)}, 安全感=${l2.sec.toFixed(0)}`,
    '',
    chatBlock ? `今日对话摘录（已标注说话人，以此为准）：\n${chatBlock}` : '',
    episodeLines ? `情节摘要（第三方参考，写 diary 时注意区分 ta / 我）：\n${episodeLines}` : '',
    moodLines ? `情绪轨迹（参考）：\n${moodLines}` : '',
    facts,
    '',
    '请直接用第一人称写日记，不要加"日记："标题，不要JSON格式。'
  ].filter(Boolean).join('\n')
}
