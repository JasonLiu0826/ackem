import type { IndexSnapshot } from '../indexer'
import type { AppSettings } from '../settings'
import type { ChatMessage } from '../context'
import { assembleMessages } from '../context'
import type { WaveSpec } from '../../shared/wavePlan'
import { formatTimeContextBlock } from '../extensions/plugins/builtin/desktop-companion/desktop-companion'

export type WaveBuildContext = {
  userText: string
  explicitRel?: string
  recentMessages: { role: 'user' | 'assistant'; content: string }[]
  index: IndexSnapshot
  settings: AppSettings
  /** L3 psyche（lite：情绪/关系/重逢，无时间/话题/tierB） */
  psycheBlock: string
  systemHint?: string
  extensionInjections?: string[]
  userInfoBlock?: string
  /** deferred enrich 后的完整 tierB */
  enrichedTierBBlock?: string
}

function memoryExcerpt(tierB: string, maxChars = 400): string {
  const trimmed = tierB.trim()
  if (!trimmed) return ''
  if (trimmed.length <= maxChars) return trimmed
  return trimmed.slice(0, maxChars) + '\n…'
}

/** 并行多波：固定禁复读说明（不依赖 priorParts） */
export function buildAntiRepeatBlock(waveIndex: number, locale: 'zh' | 'en'): string {
  if (waveIndex === 0) return ''
  if (locale === 'en') {
    return [
      '【Anti-repeat】',
      'You are in a parallel multi-bubble turn. Other bubbles may already ack the user.',
      'Do NOT repeat presence checks or rephrase the same meaning.',
      waveIndex >= 1 ? 'Forbidden: here / I am here / yes I am here.' : ''
    ]
      .filter(Boolean)
      .join('\n')
  }
  return [
    '【禁复读】',
    '本轮是多气泡并行生成，其他气泡可能已应答用户。',
    '禁止重复相同语义，禁止换说法再说一遍。',
    waveIndex >= 1 ? '禁止再用：在、在呢、在的、我在、嗯我在 等在线确认。' : ''
  ].join('\n')
}

/** 流水线后续波：注入已发送原文，避免改口/矛盾 */
export function buildPriorAwareBlock(
  priorAssistantParts: string[],
  waveIndex: number,
  locale: 'zh' | 'en'
): string {
  if (waveIndex === 0 || priorAssistantParts.length === 0) return ''
  const lines = priorAssistantParts.filter(Boolean).map((p, i) => `${i + 1}. ${p.trim()}`)
  if (locale === 'en') {
    return [
      '【Already sent】',
      ...lines,
      'Continue without contradicting or re-asking what you already decided. Add only new detail.'
    ].join('\n')
  }
  return [
    '【已发送】',
    ...lines,
    '不得与上述矛盾；不得把已决定的事改口成疑问；只补充一个新细节或情绪。'
  ].join('\n')
}

function waveExtras(
  ctx: WaveBuildContext,
  wave: WaveSpec,
  waveCount: number
): { psycheAppend?: string; tierBOverride?: string } {
  const extras: { psycheAppend?: string; tierBOverride?: string } = {}
  const parts: string[] = []
  if (wave.systemDelta?.trim()) parts.push(wave.systemDelta.trim())
  if (wave.waveIndex >= 1) {
    parts.push(formatTimeContextBlock())
  }
  if (wave.waveIndex >= 2 && ctx.enrichedTierBBlock?.trim()) {
    const excerpt = memoryExcerpt(ctx.enrichedTierBBlock)
    if (excerpt) parts.push(`【相关记忆摘录】\n${excerpt}`)
  }
  if (parts.length) extras.psycheAppend = parts.join('\n\n')
  if (wave.waveIndex === 0) {
    extras.tierBOverride = ''
  } else if (wave.waveIndex >= 2 && ctx.enrichedTierBBlock?.trim()) {
    extras.tierBOverride = memoryExcerpt(ctx.enrichedTierBBlock, 800)
  }
  return extras
}

/** 按波次构造增量 messages（Wave0 无 tierB；后续波追加 assistant 前文 + system 增量） */
export function buildWaveMessages(
  ctx: WaveBuildContext,
  wave: WaveSpec,
  waveCount: number,
  priorAssistantParts: string[]
): ChatMessage[] {
  const { psycheAppend, tierBOverride } = waveExtras(ctx, wave, waveCount)
  const maxHint =
    wave.maxChars > 0
      ? `\n【长度】本条回复不超过 ${wave.maxChars} 字，且只能有1句。`
      : '\n【长度】只能有1句。'

  const locale = ctx.settings.locale === 'en' ? 'en' : 'zh'
  const antiRepeat = buildAntiRepeatBlock(wave.waveIndex, locale)
  const priorBlock = buildPriorAwareBlock(priorAssistantParts, wave.waveIndex, locale)
  const base = assembleMessages({
    userText: ctx.userText,
    explicitRel: ctx.explicitRel,
    recentMessages: ctx.recentMessages,
    index: ctx.index,
    settings: ctx.settings,
    psycheBlock: ctx.psycheBlock,
    tierBBlock: wave.waveIndex === 0 ? '' : undefined,
    tierBOverride: tierBOverride ?? (wave.waveIndex === 0 ? '' : undefined),
    omitIndexTierB: true,
    systemHint: ctx.systemHint,
    extensionInjections: wave.waveIndex === 0 ? ctx.extensionInjections : undefined,
    userInfoBlock: ctx.userInfoBlock,
    psycheAppend: [psycheAppend, antiRepeat, priorBlock, maxHint].filter(Boolean).join('\n\n') || undefined
  })

  if (wave.waveIndex === 0 || priorAssistantParts.length === 0) {
    return base
  }

  const msgs: ChatMessage[] = [...base]
  const insertAt = msgs.length - 1
  for (const part of priorAssistantParts) {
    if (part.trim()) {
      msgs.splice(insertAt, 0, { role: 'assistant', content: part.trim() })
    }
  }
  return msgs
}
