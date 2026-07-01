// [episodeExtractor] — 情节摘要提取器
// 引用：../engine/types, ../engine/ackemParams, ../llmClient, ../prompt/memory-episode

import { EPISODE_EXTRACT_MSG_TRUNC, EPISODE_SUMMARY_MAX_CHARS } from '../engine/ackemParams'
import type { LlmClient } from '../engine/types'
import { EPISODE_SYSTEM_PROMPT, EPISODE_TEMPERATURE } from '../prompt/memory-episode'

export class EpisodeExtractor {
  async extract(
    exchanges: Array<{ user: string; assistant: string }>,
    turnRange: { start: number; end: number },
    llm: LlmClient
  ): Promise<{
    summary: string
    emotionalIntensity: number
    dominantEmotion: string
    keywords: string[]
  } | null> {
    const dialogueText = exchanges
      .map((ex, i) => `[第${turnRange.start + i}轮]\n用户：${ex.user.slice(0, EPISODE_EXTRACT_MSG_TRUNC)}\n伴侣：${ex.assistant.slice(0, EPISODE_EXTRACT_MSG_TRUNC)}`)
      .join('\n\n')

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: EPISODE_TEMPERATURE,
        messages: [
          { role: 'system', content: EPISODE_SYSTEM_PROMPT },
          { role: 'user', content: `对话片段：\n${dialogueText}` }
        ]
      })
    } catch {
      return null
    }

    return parseEpisodeResult(raw)
  }
}

function parseEpisodeResult(raw: string): {
  summary: string
  emotionalIntensity: number
  dominantEmotion: string
  keywords: string[]
} | null {
  const tryParse = (s: string) => {
    try {
      return JSON.parse(s) as {
        summary?: string
        emotionalIntensity?: number
        dominantEmotion?: string
        keywords?: string[]
      }
    } catch {
      return null
    }
  }

  let parsed = tryParse(raw.trim())
  if (!parsed) {
    const i = raw.indexOf('{')
    const j = raw.lastIndexOf('}')
    if (i >= 0 && j > i) {
      parsed = tryParse(raw.slice(i, j + 1))
    }
  }
  if (!parsed || !parsed.summary) return null

  return {
    summary: parsed.summary.slice(0, EPISODE_SUMMARY_MAX_CHARS),
    emotionalIntensity: typeof parsed.emotionalIntensity === 'number'
      ? Math.max(0, Math.min(1, parsed.emotionalIntensity))
      : 0.5,
    dominantEmotion: parsed.dominantEmotion ?? '中性',
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map(String).slice(0, 5)
      : []
  }
}
