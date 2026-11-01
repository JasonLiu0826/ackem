import type { AgentEvent, ChatMessage, ToolDefinition } from '../../shared/types.js'
import {
  estimateMessagesTokens,
  estimateTokensForText,
  resolveContextWindowInfo
} from './compact/index.js'
import { estimateTokensFromUnknown } from './compact/contextBreakdown.js'

export type LlmUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

export type TokenUsageSource = 'api' | 'estimate'

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

/** CC-style context fill from provider usage (last request + response). */
export function usageToContextTokens(usage: LlmUsage | null | undefined): number {
  if (!usage) return 0
  const input = num(usage.prompt_tokens) ?? num(usage.input_tokens) ?? 0
  const output = num(usage.completion_tokens) ?? num(usage.output_tokens) ?? 0
  const cacheCreate = num(usage.cache_creation_input_tokens) ?? 0
  const cacheRead = num(usage.cache_read_input_tokens) ?? 0
  if (input || output || cacheCreate || cacheRead) {
    return input + output + cacheCreate + cacheRead
  }
  return num(usage.total_tokens) ?? 0
}

export function estimateSessionContextTokens(opts: {
  messages: ChatMessage[]
  tools?: ToolDefinition[]
  partialAssistant?: string
}): number {
  let n = estimateMessagesTokens(opts.messages)
  if (opts.tools?.length) n += estimateTokensFromUnknown(opts.tools)
  if (opts.partialAssistant) n += estimateTokensForText(opts.partialAssistant)
  return n
}

export function buildTokenUsageEvent(opts: {
  tokens: number
  contextWindow: number
  source: TokenUsageSource
  inputTokens?: number
  outputTokens?: number
}): Extract<AgentEvent, { type: 'token_usage' }> {
  return {
    type: 'token_usage',
    tokens: opts.tokens,
    contextWindow: opts.contextWindow,
    source: opts.source,
    inputTokens: opts.inputTokens,
    outputTokens: opts.outputTokens
  }
}

export function emitTokenUsage(
  emit: (event: AgentEvent) => void,
  opts: {
    messages: ChatMessage[]
    tools?: ToolDefinition[]
    partialAssistant?: string
    apiUsage?: LlmUsage | null
    settingsContextWindow?: number
    model: string
    /** When set, emit this count directly (e.g. after compact). */
    overrideTokens?: number
  }
): void {
  const info = resolveContextWindowInfo({
    settingsContextWindow: opts.settingsContextWindow,
    model: opts.model
  })
  let tokens: number
  let source: TokenUsageSource
  let inputTokens: number | undefined
  let outputTokens: number | undefined

  if (opts.overrideTokens != null) {
    tokens = opts.overrideTokens
    source = 'estimate'
  } else if (opts.apiUsage && usageToContextTokens(opts.apiUsage) > 0) {
    tokens = usageToContextTokens(opts.apiUsage)
    source = 'api'
    inputTokens =
      num(opts.apiUsage.prompt_tokens) ?? num(opts.apiUsage.input_tokens)
    outputTokens =
      num(opts.apiUsage.completion_tokens) ?? num(opts.apiUsage.output_tokens)
  } else {
    tokens = estimateSessionContextTokens({
      messages: opts.messages,
      tools: opts.tools,
      partialAssistant: opts.partialAssistant
    })
    source = 'estimate'
  }

  emit(
    buildTokenUsageEvent({
      tokens,
      contextWindow: info.displayWindow,
      source,
      inputTokens,
      outputTokens
    })
  )
}

const STREAM_EMIT_MS = 250

/** Throttled reporter for mid-stream assistant_delta updates. */
export function createTokenUsageReporter(
  send: (event: AgentEvent) => void,
  settings: { contextWindow?: number; model: string }
) {
  let lastPartialEmit = 0

  return {
    emit(
      opts: {
        messages: ChatMessage[]
        tools?: ToolDefinition[]
        partialAssistant?: string
        apiUsage?: LlmUsage | null
        overrideTokens?: number
        force?: boolean
      }
    ) {
      if (
        opts.partialAssistant &&
        !opts.force &&
        Date.now() - lastPartialEmit < STREAM_EMIT_MS
      ) {
        return
      }
      if (opts.partialAssistant) lastPartialEmit = Date.now()
      emitTokenUsage(send, {
        messages: opts.messages,
        tools: opts.tools,
        partialAssistant: opts.partialAssistant,
        apiUsage: opts.apiUsage,
        overrideTokens: opts.overrideTokens,
        settingsContextWindow: settings.contextWindow,
        model: settings.model
      })
    }
  }
}
