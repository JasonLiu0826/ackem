/**
 * /context bucket breakdown (F-01). Character÷4, same as compact estimate.
 * Does not change the compact pipeline — classify what we already have.
 */
import type { ChatMessage } from '../../../shared/types.js'
import { flattenMessageContent } from '../../../shared/messageContent.js'
import { estimateMessagesTokens, estimateTokensForText } from './estimate.js'
import type { ContextWindowInfo } from './contextWindow.js'
import { calculateTokenWarningState } from './compactPressure.js'
import { isAutoCompactEnabled } from './autoCompact.js'
import { formatCompactPipelineLine } from './compactPipeline.js'

export const CONTEXT_BUCKET_NAMES = [
  '系统提示',
  '项目说明',
  '记忆',
  '工具定义',
  'MCP 工具',
  '技能',
  '对话',
  '附件',
  '其它'
] as const

export type ContextBucketName = (typeof CONTEXT_BUCKET_NAMES)[number]

export type ContextBucket = {
  name: ContextBucketName
  tokens: number
  percent: number
}

export type ContextBreakdown = {
  buckets: ContextBucket[]
  tokens: number
  suggestion: string
}

function looksLike(content: string, re: RegExp): boolean {
  return re.test(content.slice(0, 400))
}

export function estimateContextBreakdown(opts: {
  history: ChatMessage[]
  info: ContextWindowInfo
  toolDefTokens?: number
  mcpToolTokens?: number
}): ContextBreakdown {
  const buckets: Record<ContextBucketName, number> = {
    系统提示: 0,
    项目说明: 0,
    记忆: 0,
    工具定义: Math.max(0, opts.toolDefTokens ?? 0),
    'MCP 工具': Math.max(0, opts.mcpToolTokens ?? 0),
    技能: 0,
    对话: 0,
    附件: 0,
    其它: 0
  }

  for (const msg of opts.history) {
    const text = flattenMessageContent(msg.content)
    const n = estimateMessagesTokens([msg])
    if (msg.role === 'system') {
      if (looksLike(text, /CLAUDE\.md|AGENTS\.md|project instructions/i)) {
        buckets.项目说明 += n
      } else if (looksLike(text, /memory|memdir|relevant memor/i)) {
        buckets.记忆 += n
      } else {
        buckets.系统提示 += n
      }
      continue
    }
    if (looksLike(text, /\[Relevant memories\]|auto-memory|MEMORY\.md/i)) {
      buckets.记忆 += n
    } else if (looksLike(text, /\[Skill invoked|SKILL\.md|SYSTEM SKILL INVOCATION/i)) {
      buckets.技能 += n
    } else if (
      looksLike(text, /@file|attachment:|\[Attached |<attachment kind=|\[Context collapsed —/i)
    ) {
      buckets.附件 += n
    } else if (msg.role === 'tool' || msg.tool_calls?.length) {
      buckets.对话 += n
    } else if (msg.role === 'user' || msg.role === 'assistant') {
      buckets.对话 += n
    } else {
      buckets.其它 += n
    }
  }

  const tokens = CONTEXT_BUCKET_NAMES.reduce((s, k) => s + buckets[k], 0)
  const window = Math.max(1, opts.info.displayWindow)
  const listed: ContextBucket[] = CONTEXT_BUCKET_NAMES.map((name) => ({
    name,
    tokens: buckets[name],
    percent: Math.round((buckets[name] / window) * 1000) / 10
  }))

  const pressure = calculateTokenWarningState(tokens, {
    tokenThreshold: opts.info.compactThreshold,
    model: undefined
  })
  const microLine = Math.floor(opts.info.compactThreshold * 0.45)
  let suggestion = '不用压'
  if (pressure.level === 'blocking') suggestion = '压不动 · 新开会话或 /clear'
  else if (tokens >= opts.info.compactThreshold) suggestion = '该压'
  else if (tokens >= microLine) suggestion = '可以压 · 或等自动 micro'

  return { buckets: listed, tokens, suggestion }
}

export function formatContextReport(opts: {
  model: string
  tokens: number
  info: ContextWindowInfo
  breakdown: ContextBreakdown
  sessionId?: string
}): string {
  const pct = Math.max(
    0,
    Math.min(100, Math.round((opts.tokens / Math.max(1, opts.info.displayWindow)) * 100))
  )
  const pressure = calculateTokenWarningState(opts.tokens, {
    tokenThreshold: opts.info.compactThreshold
  })
  const lines = [
    '=== /context ===',
    `model:           ${opts.model}`,
    `tokens:          ${opts.tokens} (${formatCompactCount(opts.tokens)})`,
    `window:          ${opts.info.displayWindow}`,
    `window source:   ${opts.info.source}`,
    `compact at:      ${opts.info.compactThreshold}`,
    `context:         ${pct}%`,
    `pressure:        ${pressure.level}`,
    `autocompact:     ${isAutoCompactEnabled() ? 'on' : 'off'}`,
    formatCompactPipelineLine(opts.sessionId)
  ]
  if (opts.info.source === 'fallback-90k') {
    lines.push(
      'hint:            Unknown model — set contextWindow in settings or ACKEM_CONTEXT_WINDOW'
    )
  }
  lines.push('', 'Breakdown')
  for (const b of opts.breakdown.buckets) {
    const pad = b.name.padEnd(8, ' ')
    lines.push(
      `  ${pad} ${String(b.tokens).padStart(7, ' ')}  ${b.percent.toFixed(1)}%`
    )
  }
  lines.push('', `建议: ${opts.breakdown.suggestion}`)
  return lines.join('\n')
}

export function formatCompactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

export function estimateTokensFromUnknown(value: unknown): number {
  try {
    return estimateTokensForText(JSON.stringify(value))
  } catch {
    return 0
  }
}
