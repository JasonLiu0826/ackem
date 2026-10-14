import { createHash } from 'node:crypto'
import type { AppSettings } from './settings'
import { customOutputTokens, isOutputTokensAutomatic } from '../shared/outputTokens'
import { createLogger } from './logger'
const log = createLogger('output-budget')
const cache = new Map<string, { expires: number; value: number }>()
/** Anthropic requires max_tokens. Prefer capabilities from the configured service. */
export async function resolveAnthropicOutputBudget(settings: AppSettings, messagesUrl: string, headers: Record<string, string>, fetcher: typeof fetch = fetch): Promise<number> {
  if (!isOutputTokensAutomatic(settings)) return customOutputTokens(settings)
  const key = createHash('sha256').update(JSON.stringify([messagesUrl, settings.model, headers])).digest('hex')
  const cached = cache.get(key)
  if (cached && cached.expires > Date.now()) return cached.value
  let value = 8192, verified = false
  try {
    const url = new URL(messagesUrl)
    url.pathname = url.pathname.replace(/\/messages\/?$/, `/models/${encodeURIComponent(settings.model)}`)
    url.search = ''
    const res = await fetcher(url, { headers, signal: AbortSignal.timeout(3000) })
    if (res.ok) {
      const info = await res.json() as { max_tokens?: unknown }
      if (typeof info.max_tokens === 'number' && Number.isSafeInteger(info.max_tokens) && info.max_tokens > 0) { value = info.max_tokens; verified = true }
    }
  } catch { /* Compatible services may not expose model capabilities. */ }
  if (!verified) log.warn('capabilities.unavailable', { fallbackTokens: value })
  if (cache.size > 128) cache.clear()
  cache.set(key, { value, expires: Date.now() + (verified ? 3600000 : 60000) })
  return value
}
