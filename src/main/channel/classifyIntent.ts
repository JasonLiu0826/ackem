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
  }, input.timeoutMs ?? 15000)
  const envelope = [
    '【执行职责】Ackem 主聊天负责理解、协调与交付；AckemCode 工作页可以真实检查本机文件、目录、已安装应用和项目，执行终端及文件操作。插件只代表下面明确启用的能力。选择通道不代表已经执行，运行可用性和权限由实际执行入口核验。',
    '【已启用能力】',
    input.catalog
      .filter((e) => e.status === 'active' && !e.rejectedInSession)
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
    const deadline = new Promise<never>((_resolve, reject) => {
      controller.signal.addEventListener('abort', () => reject(Error('route_decision_timeout')), { once: true })
    })
    const raw = await Promise.race([
      input.llm.chatCompletionJson({
        messages: [
          { role: 'system', content: CLASSIFY_SYSTEM_PROMPT },
          { role: 'user', content: envelope }
        ],
        temperature: 0,
        max_tokens: 1024,
        signal: controller.signal
      }),
      deadline
    ])
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
