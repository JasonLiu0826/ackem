import { CLASSIFY_SYSTEM_PROMPT, parseIntentJson, type IntentJson } from '../../shared/intentProtocol'
import type { CatalogEntry } from './catalogTypes'
import type { RouteResidualOutcome } from './routeTrace'

export type ClassifyClient = {
  chatCompletionJson: (params: {
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    temperature: number
    max_tokens?: number
    signal?: AbortSignal
  }) => Promise<string>
}

export async function classifyIntent(input: {
  text: string
  catalog: CatalogEntry[]
  recent?: Array<{ role: string; content: string }>
  llm?: ClassifyClient
  timeoutMs?: number
  /** Route v2 §6.1: honest residual accounting — timeout/invalid must be visible. */
  onOutcome?: (outcome: RouteResidualOutcome) => void
}): Promise<IntentJson | null> {
  if (!input.llm) return null
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, input.timeoutMs ?? 2500)
  const envelope = [
    '【已启用能力】',
    input.catalog
      .filter((e) => e.status === 'active')
      .map((e) => `- ${e.name}（${e.capabilityTag ?? 'untagged'}）`)
      .join('\n') || '（无）',
    '',
    '【最近对话】',
    (input.recent ?? [])
      .slice(-6)
      .map((m) => `${m.role === 'user' ? '用户' : 'Ackem'}：${m.content.slice(0, 160)}`)
      .join('\n') || '（无）',
    '',
    '【本轮】',
    `用户：${input.text}`
  ].join('\n')

  try {
    const raw = await input.llm.chatCompletionJson({
      messages: [
        { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
        { role: 'user', content: envelope }
      ],
      temperature: 0,
      max_tokens: 512,
      signal: controller.signal
    })
    const parsed = parseIntentJson(raw)
    if (parsed) input.onOutcome?.('ok')
    else input.onOutcome?.('invalid_json')
    return parsed
  } catch (e) {
    if (timedOut || controller.signal.aborted) input.onOutcome?.('timeout')
    else {
      void e
      input.onOutcome?.('llm_error')
    }
    return null
  } finally {
    clearTimeout(timer)
  }
}
