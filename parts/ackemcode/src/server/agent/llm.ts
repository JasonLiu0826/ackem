import type { ChatMessage, EffortLevel, ToolCall, ToolDefinition, MessageContentPart } from '../../shared/types.js'
import { resolveModelMedia } from '../llm/capabilities.js'
import type { LlmUsage } from './tokenUsage.js'
import { effortToMaxTokens } from '../../shared/types.js'
import {
  resolveMaxRetries,
  resolveModelChain,
  withLlmRetry,
  type RetryEvent
} from './llmRetry.js'

export class LlmError extends Error {
  constructor(
    message: string,
    public status?: number,
    public body?: string,
    /** Retry-After header value (seconds string) when present. */
    public retryAfter?: string | null
  ) {
    super(message)
    this.name = 'LlmError'
  }
}

/** Node undici aborts often surface as TypeError: terminated (not AbortError). */
export function isTransientDisconnect(err: unknown): boolean {
  if (err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')) {
    return true
  }
  const msg = err instanceof Error ? err.message : String(err)
  return (
    /^(terminated|aborted)$/i.test(msg.trim()) ||
    /模型连接中断|operation was aborted|econnreset|epipe|socket hang up|fetch failed/i.test(
      msg
    )
  )
}

export function formatTurnError(message: string): string {
  const t = message.trim()
  if (/^(terminated|aborted)$/i.test(t) || /operation was aborted/i.test(t)) {
    return '模型连接中断，请再试一次。'
  }
  return message
}

/**
 * R1-RETRY: shared retry options accepted by both completion functions.
 * Retry wraps only the HTTP POST + status check (pre-stream), so streaming stays
 * safe — a mid-stream failure after tools started is handled by the loop's
 * finalizeDiscard path, never silently re-requested here.
 */
export type LlmRetryOpts = {
  /** Per-model retry budget; defaults to resolveMaxRetries() (ACKEM_LLM_MAX_RETRIES / 5). */
  maxRetries?: number
  /** Optional fallback model tried after primary retries exhaust. */
  fallbackModel?: string
  /** Host status surface for each backoff. */
  onRetry?: (ev: RetryEvent) => void
  /** Notified when switching to a fallback model. */
  onFallback?: (from: string, to: string) => void
  /** Disable retry entirely (e.g. background/non-critical calls). */
  disabled?: boolean
}

function getRetryAfterMsFromError(err: unknown): number | null {
  if (err instanceof LlmError && err.retryAfter) {
    const seconds = parseInt(String(err.retryAfter).trim(), 10)
    if (!Number.isNaN(seconds) && seconds >= 0) return seconds * 1000
  }
  return null
}

function getStatusFromError(err: unknown): number | undefined {
  return err instanceof LlmError ? err.status : undefined
}

/**
 * Vendor vision rules:
 * DeepSeek/OpenAI/Gemini/Qwen — image_url only on user messages.
 * Anthropic native PDF document blocks only when caps.nativePdf.
 * Never send leftover images to a text-only model (HTTP 400).
 */
function prepareChatMessages(
  messages: ChatMessage[],
  opts: { model: string; apiBaseUrl: string; multimodal?: string | null }
): ChatMessage[] {
  const caps = resolveModelMedia({
    model: opts.model,
    apiBaseUrl: opts.apiBaseUrl,
    multimodal: opts.multimodal
  })
  return messages.map((m) => {
    if (!Array.isArray(m.content)) return m
    const next: MessageContentPart[] = []
    for (const part of m.content) {
      if (part.type === 'image_url') {
        if (!caps.vision || m.role !== 'user') {
          next.push({
            type: 'text',
            text: '[image omitted — current model does not accept image_url]'
          })
          continue
        }
        next.push({
          type: 'image_url',
          image_url: {
            url: part.image_url.url,
            detail: part.image_url.detail ?? caps.imageDetail
          }
        })
        continue
      }
      if (part.type === 'document') {
        if (!caps.nativePdf || m.role !== 'user') {
          next.push({
            type: 'text',
            text: '[PDF omitted — this API uses page images, not native PDF documents]'
          })
          continue
        }
        next.push(part)
        continue
      }
      next.push(part)
    }
    if (next.length === 1 && next[0]?.type === 'text') {
      return { ...m, content: next[0].text }
    }
    return { ...m, content: next }
  })
}

/**
 * POST to /chat/completions and return the (ok) Response, retrying transient
 * failures. On non-ok status throws LlmError carrying status + retry-after.
 */
async function postChatWithRetry(opts: {
  url: string
  apiKey: string
  apiBaseUrl: string
  model: string
  messages: ChatMessage[]
  multimodal?: string | null
  body: Record<string, unknown>
  signal?: AbortSignal
  retry?: LlmRetryOpts
}): Promise<Response> {
  const models = opts.retry?.disabled
    ? [opts.model]
    : resolveModelChain(opts.model, opts.retry?.fallbackModel)
  const maxRetries = opts.retry?.disabled ? 0 : opts.retry?.maxRetries ?? resolveMaxRetries()

  return withLlmRetry<Response>({
    models,
    maxRetries,
    signal: opts.signal,
    onRetry: opts.retry?.onRetry,
    onFallback: opts.retry?.onFallback,
    getStatus: getStatusFromError,
    getRetryAfterMs: getRetryAfterMsFromError,
    operation: async (_attempt, model) => {
      const res = await fetch(opts.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${opts.apiKey}`
        },
        body: JSON.stringify({
          ...opts.body,
          model,
          messages: prepareChatMessages(opts.messages, {
            model,
            apiBaseUrl: opts.apiBaseUrl,
            multimodal: opts.multimodal
          })
        }),
        signal: opts.signal
      })
      if (!res.ok) {
        const body = await res.text().catch(() => '')
        throw new LlmError(
          `LLM HTTP ${res.status}: ${body.slice(0, 800)}`,
          res.status,
          body,
          res.headers.get('retry-after')
        )
      }
      return res
    }
  })
}

export type LlmCompletion = {
  message: ChatMessage
  usage: LlmUsage | null
}

export async function chatCompletion(opts: {
  apiBaseUrl: string
  apiKey: string
  model: string
  effort: EffortLevel
  messages: ChatMessage[]
  tools: ToolDefinition[]
  signal?: AbortSignal
  retry?: LlmRetryOpts
  multimodal?: string | null
}): Promise<LlmCompletion> {
  const base = opts.apiBaseUrl.replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const max_tokens = effortToMaxTokens(opts.effort)

  const res = await postChatWithRetry({
    url,
    apiKey: opts.apiKey,
    apiBaseUrl: opts.apiBaseUrl,
    model: opts.model,
    messages: opts.messages,
    multimodal: opts.multimodal,
    signal: opts.signal,
    retry: opts.retry,
    body: {
      ...(opts.tools.length
        ? { tools: opts.tools, tool_choice: 'auto' as const }
        : {}),
      temperature: opts.effort === 'low' ? 0.2 : opts.effort === 'high' ? 0.4 : 0.3,
      max_tokens
    }
  })

  const data = (await res.json()) as {
    choices?: Array<{
      message?: {
        role?: string
        content?: string | null
        tool_calls?: ChatMessage['tool_calls']
      }
      finish_reason?: string | null
    }>
    usage?: LlmUsage
  }

  const choice = data.choices?.[0]
  const msg = choice?.message
  if (!msg) throw new LlmError('LLM returned empty choices')

  return {
    message: {
      role: 'assistant',
      content: msg.content ?? null,
      tool_calls: msg.tool_calls,
      finishReason: choice?.finish_reason ?? undefined
    },
    usage: data.usage ?? null
  }
}

export type StreamToolCallReady = {
  call: ToolCall
  /** Wall time when this tool_call became complete (block-stop spirit). */
  completedAt: number
}

export type ChatCompletionStreamHandlers = {
  onContentDelta?: (text: string) => void
  /**
   * Fired when a tool_call is complete (OpenAI: previous index closed /
   * stream finished for that index). Never mid-JSON — CC content_block_stop spirit.
   */
  onToolCallReady?: (ev: StreamToolCallReady) => void
}

type PartialToolAcc = {
  id: string
  name: string
  arguments: string
}

/**
 * OpenAI-compatible streaming chat.completions.
 * Emits completed tool_calls as soon as each index finishes (not on argument deltas).
 */
export async function chatCompletionStream(opts: {
  apiBaseUrl: string
  apiKey: string
  model: string
  effort: EffortLevel
  messages: ChatMessage[]
  tools: ToolDefinition[]
  signal?: AbortSignal
  handlers?: ChatCompletionStreamHandlers
  retry?: LlmRetryOpts
  multimodal?: string | null
}): Promise<LlmCompletion> {
  const base = opts.apiBaseUrl.replace(/\/+$/, '')
  const url = `${base}/chat/completions`
  const max_tokens = effortToMaxTokens(opts.effort)

  // Retry wraps only the pre-stream POST + status check. Once we hold an ok
  // body and start reading, a mid-stream error is NOT retried here (tools may
  // have started) — the loop's finalizeDiscard handles that.
  const res = await postChatWithRetry({
    url,
    apiKey: opts.apiKey,
    apiBaseUrl: opts.apiBaseUrl,
    model: opts.model,
    messages: opts.messages,
    multimodal: opts.multimodal,
    signal: opts.signal,
    retry: opts.retry,
    body: {
      stream: true,
      ...(opts.tools.length
        ? { tools: opts.tools, tool_choice: 'auto' as const }
        : {}),
      temperature: opts.effort === 'low' ? 0.2 : opts.effort === 'high' ? 0.4 : 0.3,
      max_tokens
    }
  })

  if (!res.body) throw new LlmError('LLM stream returned empty body')

  let content = ''
  let finishReason: string | undefined
  let usage: LlmUsage | null = null
  const byIndex = new Map<number, PartialToolAcc>()
  const completed: ToolCall[] = []
  let lastIndex = -1

  const flushIndex = (index: number) => {
    const acc = byIndex.get(index)
    if (!acc?.id || !acc.name) return
    if (completed.some((c) => c.id === acc.id)) return
    const call: ToolCall = {
      id: acc.id,
      type: 'function',
      function: { name: acc.name, arguments: acc.arguments || '{}' }
    }
    completed.push(call)
    opts.handlers?.onToolCallReady?.({
      call,
      completedAt: Date.now()
    })
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const payload = trimmed.slice(5).trim()
        if (!payload || payload === '[DONE]') continue
        let chunk: {
          choices?: Array<{
            delta?: {
              content?: string | null
              tool_calls?: Array<{
                index?: number
                id?: string
                type?: string
                function?: { name?: string; arguments?: string }
              }>
            }
            finish_reason?: string | null
          }>
          usage?: LlmUsage
        }
        try {
          chunk = JSON.parse(payload) as typeof chunk
        } catch {
          continue
        }
        if (chunk.usage) usage = chunk.usage
        const choice = chunk.choices?.[0]
        if (!choice) continue
        const delta = choice.delta
        if (delta?.content) {
          content += delta.content
          opts.handlers?.onContentDelta?.(delta.content)
        }
        if (delta?.tool_calls?.length) {
          for (const tc of delta.tool_calls) {
            const index = typeof tc.index === 'number' ? tc.index : 0
            // New index starting → previous index is complete (block-stop)
            if (lastIndex >= 0 && index !== lastIndex && byIndex.has(lastIndex)) {
              flushIndex(lastIndex)
            }
            lastIndex = index
            let acc = byIndex.get(index)
            if (!acc) {
              acc = { id: '', name: '', arguments: '' }
              byIndex.set(index, acc)
            }
            if (tc.id) acc.id = tc.id
            // OpenAI sends name once as a delta fragment; some proxies resend
            // the full name — prefer append only when accumulating fragments.
            if (tc.function?.name) {
              if (!acc.name) acc.name = tc.function.name
              else if (!acc.name.endsWith(tc.function.name)) {
                acc.name += tc.function.name
              }
            }
            if (tc.function?.arguments) acc.arguments += tc.function.arguments
          }
        }
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
          // flush all remaining indices in order
          const indices = [...byIndex.keys()].sort((a, b) => a - b)
          for (const i of indices) flushIndex(i)
        }
      }
    }
  } catch (e) {
    if (opts.signal?.aborted) throw new Error('aborted')
    for (const i of [...byIndex.keys()].sort((a, b) => a - b)) flushIndex(i)
    // Stream dropped after tool_calls already started — keep them so the turn
    // can finish instead of discarding as a raw "terminated" error.
    if (isTransientDisconnect(e) && (completed.length > 0 || content.trim())) {
      finishReason = finishReason || (completed.length ? 'tool_calls' : 'stop')
    } else if (isTransientDisconnect(e)) {
      throw new LlmError('模型连接中断，请再试一次。')
    } else {
      throw e
    }
  } finally {
    reader.releaseLock()
  }

  // Safety: flush any unflushed tools (providers that omit finish_reason mid-way)
  const indices = [...byIndex.keys()].sort((a, b) => a - b)
  for (const i of indices) flushIndex(i)

  return {
    message: {
      role: 'assistant',
      content: content || null,
      tool_calls: completed.length ? completed : undefined,
      finishReason
    },
    usage
  }
}
