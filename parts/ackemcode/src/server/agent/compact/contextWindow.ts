/**
 * Context-window resolution (A-09 / B-08).
 * Prefix table order is first-match-wins — keep more specific rows first.
 */
import {
  DEFAULT_COMPACT_BUFFER_TOKENS,
  DEFAULT_COMPACT_TOKEN_THRESHOLD
} from './compactConstants.js'

export const MIN_CONTEXT_WINDOW = 4_096
export const MAX_CONTEXT_WINDOW = 20_000_000

export type ContextWindowSource =
  | 'settings'
  | 'env'
  | `prefix:${string}`
  | 'fallback-90k'

export type ContextWindowInfo = {
  displayWindow: number
  compactThreshold: number
  modelWindow?: number
  source: ContextWindowSource
  matchedPrefixLabel?: string
}

export type ModelWindowHit = {
  window: number
  label: string
}

type PrefixRow = { prefix: RegExp; window: number; label: string }

/** §6.4 authoritative prefix table (2026-09-05). First match wins. */
export const MODEL_CONTEXT_WINDOWS: readonly PrefixRow[] = [
  { prefix: /^qwen-long/i, window: 10_000_000, label: 'qwen-long' },
  { prefix: /^qwen2\.5-.*32k/i, window: 32_000, label: 'qwen2.5-32k' },
  { prefix: /^qwen2\.5-coder/i, window: 128_000, label: 'qwen2.5-coder' },
  { prefix: /^qwen3/i, window: 1_000_000, label: 'qwen3' },
  { prefix: /^qwen/i, window: 1_000_000, label: 'qwen' },
  { prefix: /^claude-(opus|sonnet|fable)-5/i, window: 1_000_000, label: 'claude-5' },
  { prefix: /^claude-opus-4-[678]/i, window: 1_000_000, label: 'claude-opus-4-1m' },
  { prefix: /^claude-sonnet-4-6/i, window: 1_000_000, label: 'claude-sonnet-4-6' },
  { prefix: /^claude-haiku/i, window: 200_000, label: 'claude-haiku' },
  { prefix: /^claude/i, window: 1_000_000, label: 'claude' },
  { prefix: /^deepseek-v4/i, window: 1_000_000, label: 'deepseek-v4' },
  { prefix: /^deepseek/i, window: 1_000_000, label: 'deepseek' },
  { prefix: /^glm-5\.[23]/i, window: 1_000_000, label: 'glm-5.2+' },
  { prefix: /^glm-5/i, window: 200_000, label: 'glm-5' },
  { prefix: /^glm/i, window: 128_000, label: 'glm' },
  { prefix: /^kimi-k3/i, window: 1_000_000, label: 'kimi-k3' },
  { prefix: /^kimi-k2/i, window: 256_000, label: 'kimi-k2' },
  { prefix: /^kimi|^moonshot/i, window: 256_000, label: 'kimi' },
  { prefix: /^llama-?4-scout/i, window: 10_000_000, label: 'llama-4-scout' },
  { prefix: /^llama-?4/i, window: 1_000_000, label: 'llama-4' },
  { prefix: /^llama-?3/i, window: 128_000, label: 'llama-3' },
  { prefix: /^mistral-large-3|^mistral-large/i, window: 256_000, label: 'mistral-large' },
  { prefix: /^mixtral|^mistral/i, window: 32_000, label: 'mistral-legacy' },
  { prefix: /^gpt-4\.1/i, window: 1_000_000, label: 'gpt-4.1' },
  { prefix: /^gpt-4o/i, window: 128_000, label: 'gpt-4o' },
  { prefix: /^gpt-4-turbo/i, window: 128_000, label: 'gpt-4-turbo' },
  { prefix: /^gpt-[56]/i, window: 1_000_000, label: 'gpt-5+' },
  { prefix: /^gpt-4(\b|-\d)/i, window: 8_192, label: 'gpt-4-legacy' },
  { prefix: /^gpt-3\.5/i, window: 16_385, label: 'gpt-3.5' },
  { prefix: /^o[134](-|$)/i, window: 200_000, label: 'o-series' },
  { prefix: /^gemini-1\.5|^gemini-2/i, window: 1_000_000, label: 'gemini' },
  { prefix: /^grok-4\.[36]/i, window: 1_000_000, label: 'grok-4-1m' },
  { prefix: /^grok-4\.[56]/i, window: 500_000, label: 'grok-4-500k' },
  { prefix: /^grok/i, window: 256_000, label: 'grok' },
  { prefix: /^minimax-m3/i, window: 1_000_000, label: 'minimax-m3' },
  { prefix: /^minimax/i, window: 204_800, label: 'minimax' },
  { prefix: /^hy4/i, window: 1_000_000, label: 'hy4' },
  { prefix: /^hy3/i, window: 256_000, label: 'hy3' }
]

export function parseContextWindow(raw: unknown): number | undefined {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined
  const n = Math.floor(raw)
  if (n < MIN_CONTEXT_WINDOW || n > MAX_CONTEXT_WINDOW) return undefined
  return n
}

export function matchModelContextWindow(model?: string): ModelWindowHit | undefined {
  if (!model) return undefined
  const m = model.trim()
  if (!m) return undefined
  for (const row of MODEL_CONTEXT_WINDOWS) {
    if (row.prefix.test(m)) return { window: row.window, label: row.label }
  }
  return undefined
}

export function compactThresholdFromWindow(window: number): number {
  return Math.max(
    Math.floor(window * 0.6),
    window - DEFAULT_COMPACT_BUFFER_TOKENS
  )
}

export function resolveContextWindowInfo(opts?: {
  settingsContextWindow?: number
  model?: string
}): ContextWindowInfo {
  const fromSettings = parseContextWindow(opts?.settingsContextWindow)
  if (fromSettings != null) {
    const compactThreshold = compactThresholdFromWindow(fromSettings)
    return {
      displayWindow: fromSettings,
      compactThreshold,
      modelWindow: fromSettings,
      source: 'settings'
    }
  }

  const envRaw = process.env.ACKEM_CONTEXT_WINDOW
  if (envRaw) {
    const fromEnv = parseContextWindow(Number(envRaw))
    if (fromEnv != null) {
      const compactThreshold = compactThresholdFromWindow(fromEnv)
      return {
        displayWindow: fromEnv,
        compactThreshold,
        modelWindow: fromEnv,
        source: 'env'
      }
    }
  }

  const hit = matchModelContextWindow(opts?.model)
  if (hit) {
    const compactThreshold = compactThresholdFromWindow(hit.window)
    return {
      displayWindow: compactThreshold + DEFAULT_COMPACT_BUFFER_TOKENS,
      compactThreshold,
      modelWindow: hit.window,
      source: `prefix:${hit.label}`,
      matchedPrefixLabel: hit.label
    }
  }

  return {
    displayWindow: DEFAULT_COMPACT_TOKEN_THRESHOLD + DEFAULT_COMPACT_BUFFER_TOKENS,
    compactThreshold: DEFAULT_COMPACT_TOKEN_THRESHOLD,
    source: 'fallback-90k'
  }
}
