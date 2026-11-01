/**
 * R1-RETRY · LLM API failure recovery engine (Claude Code services/api/withRetry.ts spirit).
 *
 * Pure, fetch-agnostic retry core so the "bad weather" path (429 / 5xx / network
 * jitter) self-heals instead of failing the turn on the first hiccup. Kept free of
 * fetch/loop imports so it is unit-testable in isolation (smoke-r1-retry.ts).
 *
 * NOT ported: Anthropic overloaded_error internals, fast-mode cooldown, GrowthBook
 * flags, Bedrock/Vertex credential caches — those are Anthropic-specific (see
 * 追平施工计划-R系列.md §6).
 */

/** Error thrown when all retries (across all models) are exhausted. */
export class LlmRetryExhaustedError extends Error {
  constructor(
    message: string,
    public readonly lastStatus: number | undefined,
    public readonly attempts: number,
    public readonly cause?: unknown
  ) {
    super(message)
    this.name = 'LlmRetryExhaustedError'
  }
}

export type RetryClassification = {
  retryable: boolean
  reason: string
}

/**
 * Classify an LLM API error by HTTP status (and message for network / streaming
 * 529 cases where the SDK/proxy loses the status code).
 *
 * Retryable: 408/409/425/429 + all 5xx (incl. 529 overloaded) + network-level
 * (no status, connection-ish message).
 * Not retryable: 400/401/403/404/422 and prompt-too-long (handled by compact path).
 */
export function classifyLlmError(
  status: number | undefined,
  message?: string
): RetryClassification {
  const msg = (message || '').toLowerCase()

  // prompt_too_long is handled by the forceFull compact path, never retried here.
  if (/prompt.{0,3}too.{0,3}long|context.{0,6}(length|window).{0,12}exceed/.test(msg)) {
    return { retryable: false, reason: 'prompt_too_long' }
  }

  if (typeof status === 'number') {
    if (status === 408) return { retryable: true, reason: 'request_timeout' }
    if (status === 409) return { retryable: true, reason: 'lock_timeout' }
    if (status === 425) return { retryable: true, reason: 'too_early' }
    if (status === 429) return { retryable: true, reason: 'rate_limit' }
    if (status === 529) return { retryable: true, reason: 'overloaded' }
    if (status >= 500) return { retryable: true, reason: 'server_error' }
    // 4xx client errors (400/401/403/404/422 …) — do not retry.
    return { retryable: false, reason: `client_error_${status}` }
  }

  // No status → likely a network/transport failure. The Anthropic SDK surfaces
  // 529 as an overloaded_error message even when the status is missing.
  if (/"type":\s*"overloaded_error"|overloaded/.test(msg)) {
    return { retryable: true, reason: 'overloaded' }
  }
  if (
    /econnreset|epipe|etimedout|econnrefused|enetunreach|socket hang up|network|fetch failed|terminated|aborted the request|timeout/.test(
      msg
    )
  ) {
    return { retryable: true, reason: 'network' }
  }

  // Unknown shape with no status → conservative: do not retry (avoid burning
  // budget on a deterministic bug).
  return { retryable: false, reason: 'unknown' }
}

export const RETRY_BASE_DELAY_MS = 500
export const RETRY_MAX_DELAY_MS = 32_000

/** Parse a Retry-After header value (integer seconds) into ms; null if absent/invalid. */
export function parseRetryAfterMs(retryAfter: string | null | undefined): number | null {
  if (!retryAfter) return null
  const seconds = parseInt(String(retryAfter).trim(), 10)
  if (Number.isNaN(seconds) || seconds < 0) return null
  return seconds * 1000
}

/**
 * Exponential backoff + jitter. A valid Retry-After overrides the computed delay
 * (server directive wins), still clamped to maxMs to bound a pathological header.
 */
export function computeBackoffMs(
  attempt: number,
  opts?: { retryAfterMs?: number | null; baseMs?: number; maxMs?: number; jitter?: () => number }
): number {
  const baseMs = opts?.baseMs ?? RETRY_BASE_DELAY_MS
  const maxMs = opts?.maxMs ?? RETRY_MAX_DELAY_MS
  if (opts?.retryAfterMs != null && opts.retryAfterMs >= 0) {
    return Math.min(opts.retryAfterMs, maxMs)
  }
  const exp = Math.min(baseMs * Math.pow(2, Math.max(0, attempt - 1)), maxMs)
  const rand = opts?.jitter ? opts.jitter() : Math.random()
  const jitter = rand * 0.25 * exp
  return Math.round(exp + jitter)
}

export type RetryEvent = {
  attempt: number
  delayMs: number
  status: number | undefined
  reason: string
  model: string
}

export type WithLlmRetryOptions<T> = {
  /** Executes one attempt against the given model. */
  operation: (attempt: number, model: string) => Promise<T>
  /** Primary model + optional fallbacks (tried in order after retries exhaust). */
  models: string[]
  /** Per-model retry budget (default 5, ACKEM_LLM_MAX_RETRIES). */
  maxRetries: number
  /** Extract HTTP status from a thrown error. */
  getStatus: (err: unknown) => number | undefined
  /** Extract Retry-After ms from a thrown error (headers). */
  getRetryAfterMs: (err: unknown) => number | null
  signal?: AbortSignal
  /** Notified before each backoff sleep (Host status surfacing). */
  onRetry?: (ev: RetryEvent) => void
  /** Notified when switching to a fallback model. */
  onFallback?: (from: string, to: string) => void
  /** Injectable sleep (tests). Must reject on abort. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Injectable jitter (tests). */
  jitter?: () => number
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(t)
      reject(new Error('aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/**
 * Run `operation` with retry + optional model fallback.
 *
 * Contract:
 * - Retryable error → exp backoff (Retry-After wins) up to maxRetries per model.
 * - Non-retryable error → rethrow immediately (no retry, no fallback).
 * - Per-model budget exhausted AND a fallback model remains → onFallback + move on.
 * - Last model exhausted → throw LlmRetryExhaustedError.
 * - Abort at any point (signal or sleep) → rethrow the abort error.
 */
export async function withLlmRetry<T>(opts: WithLlmRetryOptions<T>): Promise<T> {
  const sleep = opts.sleep ?? defaultSleep
  const models = opts.models.length ? opts.models : ['']
  let totalAttempts = 0
  let lastError: unknown
  let lastStatus: number | undefined

  for (let m = 0; m < models.length; m++) {
    const model = models[m]!
    // attempt 1 = initial try; then up to maxRetries additional tries.
    for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
      if (opts.signal?.aborted) throw new Error('aborted')
      totalAttempts++
      try {
        return await opts.operation(attempt, model)
      } catch (err) {
        lastError = err
        if (opts.signal?.aborted) throw err
        const status = opts.getStatus(err)
        lastStatus = status
        const msg = err instanceof Error ? err.message : String(err)
        const cls = classifyLlmError(status, msg)
        if (!cls.retryable) {
          // Deterministic failure — surface as-is (loop maps prompt_too_long etc.).
          throw err
        }
        const budgetLeft = attempt <= opts.maxRetries
        if (!budgetLeft) {
          // This model is out of budget. Try a fallback model if any remains.
          const next = models[m + 1]
          if (next !== undefined) {
            opts.onFallback?.(model, next)
          }
          break
        }
        const retryAfterMs = opts.getRetryAfterMs(err)
        const delayMs = computeBackoffMs(attempt, {
          retryAfterMs,
          jitter: opts.jitter
        })
        opts.onRetry?.({ attempt, delayMs, status, reason: cls.reason, model })
        await sleep(delayMs, opts.signal)
      }
    }
  }

  throw new LlmRetryExhaustedError(
    `LLM retries exhausted after ${totalAttempts} attempt(s)` +
      (lastStatus != null ? ` (last status ${lastStatus})` : ''),
    lastStatus,
    totalAttempts,
    lastError
  )
}

/** Resolve per-model retry budget from env (ACKEM_LLM_MAX_RETRIES), default 5. */
export function resolveMaxRetries(): number {
  const raw = process.env.ACKEM_LLM_MAX_RETRIES
  if (raw) {
    const n = parseInt(raw, 10)
    if (!Number.isNaN(n) && n >= 0) return n
  }
  return 5
}

/** Resolve the model list [primary, ...fallback] from settings + env. */
export function resolveModelChain(primary: string, fallbackModel?: string): string[] {
  const envFallback = process.env.ACKEM_LLM_FALLBACK_MODEL?.trim()
  const fb = (fallbackModel || envFallback || '').trim()
  if (fb && fb !== primary) return [primary, fb]
  return [primary]
}
