// [llmRetry] — LLM 请求韧性：超时、重试、速率限制处理

import { createLogger } from './logger'

const log = createLogger('llm-retry')

const MAX_RETRIES = 3
const BASE_DELAY_MS = 1000
const MAX_DELAY_MS = 30000

function isRetryable(status: number): boolean {
  // 429 Rate Limit, 5xx Server Error
  return status === 429 || (status >= 500 && status < 600)
}

function getRetryDelay(retryCount: number, retryAfterHeader?: string | null): number {
  // 优先使用服务器返回的 Retry-After
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10)
    if (!isNaN(seconds) && seconds > 0) {
      return Math.min(seconds * 1000, MAX_DELAY_MS)
    }
  }
  // 指数退避：1s, 2s, 4s, 8s...
  const delay = BASE_DELAY_MS * Math.pow(2, retryCount)
  // 添加抖动 ±25%
  const jitter = delay * 0.25 * (Math.random() * 2 - 1)
  return Math.min(delay + jitter, MAX_DELAY_MS)
}

export async function fetchWithRetry(
  url: string,
  init: RequestInit & { timeoutMs?: number },
  retries = MAX_RETRIES
): Promise<Response> {
  const timeoutMs = init.timeoutMs ?? 120_000

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const externalSignal = init.signal
    const onExternalAbort = () => controller.abort()
    externalSignal?.addEventListener('abort', onExternalAbort)

    try {
      const res = await fetch(url, {
        ...init,
        signal: controller.signal
      })
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)

      if (res.ok) return res

      // 可重试的错误
      if (attempt < retries && isRetryable(res.status)) {
        const retryAfter = res.headers.get('Retry-After')
        const delay = getRetryDelay(attempt, retryAfter)
        log.warn(`LLM retryable error ${res.status}`, { attempt: attempt + 1, delayMs: Math.round(delay) })
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      return res
    } catch (err) {
      clearTimeout(timer)
      externalSignal?.removeEventListener('abort', onExternalAbort)

      if ((err as Error).name === 'AbortError') {
        if (externalSignal?.aborted) {
          throw new DOMException('操作已取消', 'AbortError')
        }
        if (attempt < retries) {
          const delay = getRetryDelay(attempt, null)
          log.warn('LLM request timeout, retrying', { attempt: attempt + 1, delayMs: Math.round(delay) })
          await new Promise(r => setTimeout(r, delay))
          continue
        }
        throw new Error(`LLM request timed out after ${timeoutMs}ms`)
      }

      // 网络错误重试
      if (attempt < retries) {
        const delay = getRetryDelay(attempt, null)
        log.warn('LLM network error, retrying', { attempt: attempt + 1, delayMs: Math.round(delay), error: (err as Error).message })
        await new Promise(r => setTimeout(r, delay))
        continue
      }

      throw err
    }
  }

  throw new Error('LLM request failed after max retries')
}
