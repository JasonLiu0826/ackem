import type { AppSettings } from '../settings'
import { buildLlmHeaders, resolveChatCompletionsUrl } from '../llmEndpoint'
import {
  buildAnthropicHeaders,
  resolveAnthropicMessagesUrl
} from '../anthropicMessages'

export type WaveEndpoint = {
  provider: 'openai' | 'anthropic'
  url: string
  headers: Record<string, string>
  model: string
  maxTokens: number
  isLocal: boolean
}

export type ProbeLocalChatResult = {
  ok: boolean
  latencyMs?: number
  model?: string
  error?: string
}

function localConfigured(settings: AppSettings): boolean {
  return (
    settings.localChatEnabled === true &&
    (settings.localChatBaseUrl ?? '').trim().length > 0 &&
    (settings.localChatModel ?? '').trim().length > 0
  )
}

function resolveLocalCompletionsUrl(baseUrl: string): string {
  const raw = baseUrl.trim().replace(/\/+$/, '')
  if (/\/chat\/completions\b/i.test(raw)) return raw
  return `${raw}/chat/completions`
}

/** Wave0 可走本地；Wave1+ 走主 API */
export function selectWaveEndpoint(waveIndex: number, settings: AppSettings): WaveEndpoint {
  if (waveIndex === 0 && localConfigured(settings)) {
    const base = (settings.localChatBaseUrl ?? '').trim()
    return {
      provider: 'openai',
      url: resolveLocalCompletionsUrl(base),
      headers: buildLlmHeaders({ ...settings, openaiApiKey: settings.openaiApiKey ?? '' }),
      model: (settings.localChatModel ?? '').trim(),
      maxTokens: Math.max(32, settings.localChatMaxTokens ?? 80),
      isLocal: true
    }
  }

  const provider = (settings.llmProvider ?? 'openai') === 'anthropic' ? 'anthropic' : 'openai'
  if (provider === 'anthropic') {
    return {
      provider: 'anthropic',
      url: resolveAnthropicMessagesUrl(settings),
      headers: buildAnthropicHeaders(settings),
      model: settings.model,
      maxTokens: Math.min(512, settings.anthropicMaxTokens ?? 1024),
      isLocal: false
    }
  }

  return {
    provider: 'openai',
    url: resolveChatCompletionsUrl(settings),
    headers: buildLlmHeaders(settings),
    model: settings.model,
    maxTokens: Math.min(512, settings.anthropicMaxTokens ?? 1024),
    isLocal: false
  }
}

/** 设置页「测试连接」：探测本地 OpenAI 兼容端点 */
export async function probeLocalChat(settings: AppSettings): Promise<ProbeLocalChatResult> {
  const base = (settings.localChatBaseUrl ?? '').trim()
  const model = (settings.localChatModel ?? '').trim()
  if (!base || !model) {
    return { ok: false, error: 'missing_base_or_model' }
  }
  const url = resolveLocalCompletionsUrl(base)
  const t0 = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs ?? 120_000, 15_000))
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        ...buildLlmHeaders(settings),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        stream: false
      }),
      signal: controller.signal
    })
    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return { ok: false, error: `HTTP ${res.status}: ${errText.slice(0, 200)}` }
    }
    return { ok: true, latencyMs: Date.now() - t0, model }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e)
    }
  } finally {
    clearTimeout(timer)
  }
}
