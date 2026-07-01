import type { AppSettings } from '../settings'
import { WAVE_INTER_BUBBLE_GAP_MS } from '../../shared/wavePlan'
import type { WaveEndpoint } from './waveEndpoint'
import { openAiMessagesToAnthropic } from './waveStream'
import type { TurnBubbleQueue } from './turnBubbleQueue'
import {
  recordDisplayedSentence,
  shouldEmitSentence,
  type TurnDedupState
} from './sentenceDedup'

/** 括号/引号未闭合时不应在内部句号处切句（供 splitIntoSentences 等工具用） */
export function findSafeSentenceBreak(text: string): number {
  if (!text.trim()) return -1
  let depth = 0
  let inQuote: '"' | "'" | '「' | '『' | null = null
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!
    if (inQuote) {
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'" || ch === '「' || ch === '『') {
      inQuote = ch
      continue
    }
    if (ch === '（' || ch === '(' || ch === '【' || ch === '[') {
      depth++
      continue
    }
    if (ch === '）' || ch === ')' || ch === '】' || ch === ']') {
      depth = Math.max(0, depth - 1)
      continue
    }
    if (depth > 0) continue
    if (/[。！？!?…]/.test(ch)) return i + 1
  }
  return -1
}

export function peelCompleteSentences(buffer: string): { sentences: string[]; remainder: string } {
  const sentences: string[] = []
  let rest = buffer
  while (true) {
    const end = findSafeSentenceBreak(rest)
    if (end <= 0) break
    const sentence = rest.slice(0, end).trim()
    if (sentence) sentences.push(sentence)
    rest = rest.slice(end).trimStart()
  }
  return { sentences, remainder: rest }
}

export type SentenceTurnState = {
  /** 整轮是否已用过发送占位 bubble */
  placeholderUsed: boolean
  /** 下一 bubble 的全局序号 */
  nextSentenceIndex: number
}

export type SentenceBubbleContext = {
  queue: TurnBubbleQueue
  dedup: TurnDedupState
  waveIndex: number
  signal: AbortSignal
  turnState: SentenceTurnState
  waveCount: number
  /** 本波实际展示的句子 */
  emittedParts: string[]
  /** 本波流式是否已打开 bubble（仅本 wave 生产者使用） */
  waveBubbleOpen: boolean
}

export function createSentenceTurnState(): SentenceTurnState {
  return { placeholderUsed: false, nextSentenceIndex: 0 }
}

export function splitIntoSentences(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  const out: string[] = []
  let rest = trimmed
  while (rest.length > 0) {
    const { sentences, remainder } = peelCompleteSentences(rest)
    if (sentences.length === 0) {
      out.push(rest.trim())
      break
    }
    out.push(...sentences)
    rest = remainder
  }
  return out.filter(Boolean)
}

function delayMs(ms: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

function enqueueOpenBubble(ctx: SentenceBubbleContext): void {
  if (ctx.waveBubbleOpen) return
  ctx.waveBubbleOpen = true
  ctx.queue.enqueue(ctx.waveIndex, async () => {
    const isFirst = !ctx.turnState.placeholderUsed
    if (isFirst) ctx.turnState.placeholderUsed = true
    if (!isFirst) {
      await delayMs(WAVE_INTER_BUBBLE_GAP_MS, ctx.signal)
    }
    if (ctx.signal.aborted) return
    const wc = ctx.queue.getWebContents()
    wc.send('chat:wave-start', {
      waveIndex: ctx.turnState.nextSentenceIndex,
      waveCount: ctx.waveCount,
      newBubble: !isFirst
    })
  })
}

function enqueueChunk(ctx: SentenceBubbleContext, delta: string): void {
  ctx.queue.enqueue(ctx.waveIndex, async () => {
    if (ctx.signal.aborted) return
    ctx.queue.getWebContents().send('chat:chunk', delta)
  })
}

function enqueueReplace(ctx: SentenceBubbleContext, text: string): void {
  ctx.queue.enqueue(ctx.waveIndex, async () => {
    if (ctx.signal.aborted) return
    ctx.queue.getWebContents().send('chat:replace', text)
  })
}

function enqueueCloseBubble(ctx: SentenceBubbleContext, text: string): void {
  const trimmed = text.trim()
  ctx.queue.enqueue(ctx.waveIndex, async () => {
    if (ctx.signal.aborted) return
    const idx = ctx.turnState.nextSentenceIndex
    const wc = ctx.queue.getWebContents()
    wc.send('chat:replace', trimmed)
    wc.send('chat:wave-end', { waveIndex: idx, text: trimmed })
    ctx.turnState.nextSentenceIndex += 1
  })
  ctx.waveBubbleOpen = false
  recordDisplayedSentence(ctx.dedup, trimmed)
  ctx.emittedParts.push(trimmed)
}

function enqueueSkipOpenBubble(ctx: SentenceBubbleContext): void {
  if (!ctx.waveBubbleOpen) return
  ctx.queue.enqueue(ctx.waveIndex, async () => {
    if (ctx.signal.aborted) return
    ctx.queue.getWebContents().send('chat:wave-end', {
      waveIndex: ctx.turnState.nextSentenceIndex,
      text: '',
      partial: true
    })
  })
  ctx.waveBubbleOpen = false
}

const ORPHAN_TAIL_RE = /^[，,、；;：:…\s()（）\[\]【】]+$/ 

/** 每个 wave 只对应一条微信 bubble：流式打字，结束时整段关闭 */
async function onTextDelta(ctx: SentenceBubbleContext, buffer: { value: string }, delta: string): Promise<void> {
  buffer.value += delta
  if (!ctx.waveBubbleOpen) enqueueOpenBubble(ctx)
  enqueueChunk(ctx, delta)
}

async function flushWaveBubble(ctx: SentenceBubbleContext, buffer: { value: string }): Promise<void> {
  const text = buffer.value.trim()
  buffer.value = ''
  if (!text) {
    if (ctx.waveBubbleOpen) enqueueSkipOpenBubble(ctx)
    return
  }
  if (ORPHAN_TAIL_RE.test(text)) {
    if (ctx.waveBubbleOpen) enqueueSkipOpenBubble(ctx)
    return
  }
  if (
    !shouldEmitSentence(text, {
      waveIndex: ctx.waveIndex,
      displayed: ctx.dedup.displayedSentences
    })
  ) {
    enqueueSkipOpenBubble(ctx)
    return
  }
  if (!ctx.waveBubbleOpen) enqueueOpenBubble(ctx)
  enqueueReplace(ctx, text)
  enqueueCloseBubble(ctx, text)
}

export async function streamOpenAiAsSentenceBubbles(
  ctx: SentenceBubbleContext,
  endpoint: WaveEndpoint,
  messages: unknown[],
  settings: AppSettings,
  intensityMod: number
): Promise<string> {
  let acc = ''
  const buffer = { value: '' }
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      messages,
      stream: true,
      max_tokens: endpoint.maxTokens,
      temperature: Math.max(0.1, Math.min(1.5, 0.6 * intensityMod))
    }),
    signal: ctx.signal
  })
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 400)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    const parts = lineBuf.split('\n')
    lineBuf = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }
        const delta = json.choices?.[0]?.delta?.content
        if (delta) {
          acc += delta
          await onTextDelta(ctx, buffer, delta)
          if (ctx.signal.aborted) return ctx.emittedParts.join('\n') || acc
        }
      } catch {
        /* ignore */
      }
    }
  }

  await flushWaveBubble(ctx, buffer)
  return ctx.emittedParts.length > 0 ? ctx.emittedParts.join('\n') : acc.trim()
}

export async function streamAnthropicAsSentenceBubbles(
  ctx: SentenceBubbleContext,
  endpoint: WaveEndpoint,
  messages: Array<{ role: string; content: string }>,
  intensityMod: number
): Promise<string> {
  let acc = ''
  const buffer = { value: '' }
  const payload = openAiMessagesToAnthropic(messages)
  const res = await fetch(endpoint.url, {
    method: 'POST',
    headers: endpoint.headers,
    body: JSON.stringify({
      model: endpoint.model,
      max_tokens: endpoint.maxTokens,
      temperature: Math.max(0.1, Math.min(1.5, 0.6 * intensityMod)),
      system: payload.system || undefined,
      messages: payload.messages,
      stream: true
    }),
    signal: ctx.signal
  })
  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => res.statusText)
    throw new Error(`Anthropic HTTP ${res.status}: ${errText.slice(0, 400)}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let lineBuf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    lineBuf += decoder.decode(value, { stream: true })
    const parts = lineBuf.split('\n')
    lineBuf = parts.pop() ?? ''
    for (const line of parts) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          type?: string
          delta?: { type?: string; text?: string }
        }
        if (json.type === 'content_block_delta' && json.delta?.type === 'text_delta' && json.delta.text) {
          const delta = json.delta.text
          acc += delta
          await onTextDelta(ctx, buffer, delta)
          if (ctx.signal.aborted) return ctx.emittedParts.join('\n') || acc
        }
      } catch {
        /* ignore */
      }
    }
  }

  await flushWaveBubble(ctx, buffer)
  return ctx.emittedParts.length > 0 ? ctx.emittedParts.join('\n') : acc.trim()
}

/** 合并多波展示文本 */
export function joinEmittedWaveParts(parts: string[]): string {
  return parts.filter(Boolean).join('\n')
}
