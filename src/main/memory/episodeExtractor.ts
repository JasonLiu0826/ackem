// [episodeExtractor] 鈥?鎯呰妭鎽樿鎻愬彇鍣?
// 寮曠敤锛?./engine/types, ../engine/AckemParams, ../llmClient, ../prompt/memory-episode

import { EPISODE_EXTRACT_MSG_TRUNC, EPISODE_SUMMARY_MAX_CHARS } from '../engine/AckemParams'
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
      .map((ex, i) => `[绗?{turnRange.start + i}杞甝\n鐢ㄦ埛锛?{ex.user.slice(0, EPISODE_EXTRACT_MSG_TRUNC)}\n浼翠荆锛?{ex.assistant.slice(0, EPISODE_EXTRACT_MSG_TRUNC)}`)
      .join('\n\n')

    let raw: string
    try {
      raw = await llm.chatCompletionJson({
        temperature: EPISODE_TEMPERATURE,
        messages: [
          { role: 'system', content: EPISODE_SYSTEM_PROMPT },
          { role: 'user', content: `瀵硅瘽鐗囨锛歕n${dialogueText}` }
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
    dominantEmotion: parsed.dominantEmotion ?? '涓€?,
    keywords: Array.isArray(parsed.keywords)
      ? parsed.keywords.map(String).slice(0, 5)
      : []
  }
}
