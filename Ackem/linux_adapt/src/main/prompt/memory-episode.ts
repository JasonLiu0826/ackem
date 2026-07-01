// [prompt/memory-episode] — 情节记忆 prompt（v1.0 设计文档）
// 迁移自 memory/episodeExtractor.ts

import { getLocale } from '../i18n'
import { EPISODE_SYSTEM_PROMPT_EN } from './prompt-i18n'

export const EPISODE_TEMPERATURE = 0.2

export const EPISODE_SYSTEM_PROMPT_ZH = `你是情节记忆摘要器。将对话片段总结为一条叙事摘要。

── 规则 ──
- 使用第三人称"用户"和"伴侣"
- 提炼对话的核心事件和情绪转折
- keyQuote 必须一字不差地从原文复制，绝对禁止润色或改写，截取最核心的 15 字以内
- 输出关键情绪词，最多 3 个，按强度排序
- 标注时间语境（"今天下午""昨天深夜""上周五"）
- 摘要 ≤200 字

── 输出格式 ──
严格 JSON：
{"summary":"用户今天...","emotionKeywords":["焦虑","委屈"],"keyQuote":"用户原话（≤15字）","timeContext":"今天下午"}`

export const EPISODE_SYSTEM_PROMPT = EPISODE_SYSTEM_PROMPT_ZH

export function getEpisodeSystemPrompt(): string {
  return getLocale() === 'en' ? EPISODE_SYSTEM_PROMPT_EN : EPISODE_SYSTEM_PROMPT_ZH
}

export function buildEpisodeUserMsg(dialogue: string): string {
  return getLocale() === 'en' ? `Dialogue snippet:\n${dialogue}` : `对话片段：\n${dialogue}`
}
