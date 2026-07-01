import type { LlmClient } from '../../../../engine/types'
import { buildDiaryPrompt, type DiaryPromptInput } from './diaryPrompt'

export interface DiaryPersonality {
  label: string
  presetId?: string
  T: number
  I: number
  S: number
  O: number
  R: number
  tags?: string[]
}

export async function generateDiary(
  input: DiaryPromptInput,
  llm: LlmClient,
  locale: string
): Promise<string> {
  const lang = locale.startsWith('ja') ? 'ja' : locale.startsWith('en') ? 'en' : 'zh'
  const prompt = lang === 'en'
    ? `Write a first-person diary entry. ${input.date}. ${input.totalTurns} turns of conversation. Mood: ${input.l2.primaryLabel}. Keep it natural, 150-300 words.`
    : buildDiaryPrompt(input)

  try {
    // 注入完整 v3 人格模板（从 prompt 模块获取）
    const { getPersonalityTemplate } = await import('../../../../prompt/personality.js')
    const { buildDiarySystemPrompt } = await import('../../../../prompt/diary.js')
    const template = getPersonalityTemplate(input.personality.presetId ?? 'tsundere')
    const sysPrompt = buildDiarySystemPrompt(template)

    const raw = await llm.chatCompletionJson({
      temperature: 0.55,
      messages: [
        { role: 'system', content: sysPrompt },
        { role: 'user', content: prompt }
      ]
    })
    return raw.replace(/^["']|["']$/g, '').trim()
  } catch (e) {
    console.error('diary generation failed', e)
    return ''
  }
}
