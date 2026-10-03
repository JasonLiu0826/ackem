import { URL } from 'node:url'
import { assertSafeHostname } from './ssrf.js'

const MAX_URL_LENGTH = 2000
const MAX_HTTP_CONTENT_LENGTH = 10 * 1024 * 1024
const FETCH_TIMEOUT_MS = 60_000
const MAX_REDIRECTS = 10
export const MAX_MARKDOWN_LENGTH = 100_000

export type RedirectInfo = {
  type: 'redirect'
  originalUrl: string
  redirectUrl: string
  statusCode: number
}

export type FetchedContent = {
  type: 'content'
  content: string
  bytes: number
  code: number
  codeText: string
  contentType: string
  finalUrl: string
}

export type FetchResult = FetchedContent | RedirectInfo

type CacheEntry = FetchedContent & { cachedAt: number; bytesStored: number }
const URL_CACHE = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 15 * 60 * 1000
/** Soft LRU: max entries + ~50MB content (CC WebFetch cache spirit) */
const CACHE_MAX_ENTRIES = 64
const CACHE_MAX_BYTES = 50 * 1024 * 1024
let cacheBytes = 0

export function clearWebFetchCache(): void {
  URL_CACHE.clear()
  cacheBytes = 0
}

function cacheSet(url: string, result: FetchedContent): void {
  const prev = URL_CACHE.get(url)
  if (prev) cacheBytes -= prev.bytesStored
  const bytesStored = result.content.length
  while (
    (URL_CACHE.size >= CACHE_MAX_ENTRIES || cacheBytes + bytesStored > CACHE_MAX_BYTES) &&
    URL_CACHE.size > 0
  ) {
    const first = URL_CACHE.keys().next().value as string | undefined
    if (!first) break
    const evicted = URL_CACHE.get(first)
    URL_CACHE.delete(first)
    if (evicted) cacheBytes -= evicted.bytesStored
  }
  URL_CACHE.set(url, { ...result, cachedAt: Date.now(), bytesStored })
  cacheBytes += bytesStored
}

export function validateURL(url: string): boolean {
  if (url.length > MAX_URL_LENGTH) return false
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.username || parsed.password) return false
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
  const parts = parsed.hostname.split('.')
  if (parts.length < 2) return false
  return true
}

/** Same-host redirects only (www add/remove allowed) — CC WebFetchTool.utils isPermittedRedirect */
export function isPermittedRedirect(originalUrl: string, redirectUrl: string): boolean {
  try {
    const a = new URL(originalUrl)
    const b = new URL(redirectUrl)
    if (a.protocol !== b.protocol) return false
    if (a.port !== b.port) return false
    if (b.username || b.password) return false
    const stripWww = (h: string) => h.replace(/^www\./, '')
    return stripWww(a.hostname) === stripWww(b.hostname)
  } catch {
    return false
  }
}

function statusText(code: number): string {
  const map: Record<number, string> = {
    200: 'OK',
    301: 'Moved Permanently',
    302: 'Found',
    307: 'Temporary Redirect',
    308: 'Permanent Redirect'
  }
  return map[code] || `HTTP ${code}`
}

async function fetchOnce(
  url: string,
  signal?: AbortSignal
): Promise<{
  status: number
  headers: Headers
  buffer: ArrayBuffer
  redirectedTo?: string
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: {
        Accept: 'text/markdown, text/html, text/plain, application/json, */*',
        'User-Agent': 'AckemCode-WebFetch/0.1 (compatible; Claude-Code-style)'
      }
    })
    if ([301, 302, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location')
      if (!loc) throw new Error('Redirect missing Location header')
      return {
        status: res.status,
        headers: res.headers,
        buffer: new ArrayBuffer(0),
        redirectedTo: new URL(loc, url).toString()
      }
    }
    const buffer = await res.arrayBuffer()
    if (buffer.byteLength > MAX_HTTP_CONTENT_LENGTH) {
      throw new Error(`Response too large (>${MAX_HTTP_CONTENT_LENGTH} bytes)`)
    }
    return { status: res.status, headers: res.headers, buffer }
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }
}

/**
 * Fetch URL → markdown/text. Cross-host redirects returned to caller (CC behavior).
 */
export async function getURLMarkdownContent(
  url: string,
  signal?: AbortSignal
): Promise<FetchResult> {
  if (!validateURL(url)) {
    throw new Error('Invalid URL')
  }

  const cached = URL_CACHE.get(url)
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    const { cachedAt: _, bytesStored: __, ...rest } = cached
    return rest
  }

  let parsed = new URL(url)
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'https:'
  }
  let current = parsed.toString()
  await assertSafeHostname(parsed.hostname)

  for (let depth = 0; depth <= MAX_REDIRECTS; depth++) {
    if (depth === MAX_REDIRECTS) {
      throw new Error(`Too many redirects (exceeded ${MAX_REDIRECTS})`)
    }
    const hop = await fetchOnce(current, signal)
    if (hop.redirectedTo) {
      if (isPermittedRedirect(current, hop.redirectedTo)) {
        current = hop.redirectedTo
        await assertSafeHostname(new URL(current).hostname)
        continue
      }
      return {
        type: 'redirect',
        originalUrl: url,
        redirectUrl: hop.redirectedTo,
        statusCode: hop.status
      }
    }

    if (hop.status < 200 || hop.status >= 300) {
      throw new Error(`HTTP ${hop.status} fetching ${current}`)
    }

    const contentType = (hop.headers.get('content-type') || 'text/plain').toLowerCase()
    const bytes = hop.buffer.byteLength
    const decoder = new TextDecoder('utf-8', { fatal: false })
    let text = decoder.decode(hop.buffer)

    if (contentType.includes('text/html') || /^\s*</.test(text)) {
      const { htmlToMarkdown } = await import('./htmlToMarkdown.js')
      text = htmlToMarkdown(text)
    } else if (contentType.includes('application/json')) {
      try {
        text = '```json\n' + JSON.stringify(JSON.parse(text), null, 2) + '\n```'
      } catch {
        /* keep raw */
      }
    }

    if (text.length > MAX_MARKDOWN_LENGTH) {
      text = text.slice(0, MAX_MARKDOWN_LENGTH) + '\n\n…[truncated]'
    }

    const result: FetchedContent = {
      type: 'content',
      content: text,
      bytes,
      code: hop.status,
      codeText: statusText(hop.status),
      contentType,
      finalUrl: current
    }
    cacheSet(url, result)
    return result
  }

  throw new Error('Fetch failed')
}
