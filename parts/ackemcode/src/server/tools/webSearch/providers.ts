/**
 * Third-party SERP providers — Ackem substitute for Anthropic web_search_20250305.
 *
 * Auto order: Tavily (agent-native) → SerpAPI → Brave.
 */
import type { WebSearchHit, WebSearchProviderId, WebSearchSettings } from './types.js'

export type ProviderSearchOpts = {
  query: string
  apiKey?: string
  customUrl?: string
  maxResults: number
  signal?: AbortSignal
}

export type ProviderSearchResult = {
  provider: string
  hits: WebSearchHit[]
}

const NO_PROVIDER =
  'No web search provider configured. Set webSearch.provider=tavily and paste a Tavily key (https://app.tavily.com), or TAVILY_API_KEY / SERPAPI_API_KEY / BRAVE_API_KEY, or ACKEM_WEB_SEARCH_USE_MOCK=1 for tests.'

function trimHits(hits: WebSearchHit[], max: number): WebSearchHit[] {
  return hits.slice(0, Math.max(1, Math.min(max, 20)))
}

/** Node fetch has no default timeout; a blocked SERP host can hang the whole turn. */
const WEB_SEARCH_TIMEOUT_MS = 20_000

function withSearchTimeout(parent?: AbortSignal): {
  signal: AbortSignal
  dispose: () => void
  timedOut: () => boolean
} {
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, WEB_SEARCH_TIMEOUT_MS)
  const onParent = () => controller.abort()
  if (parent?.aborted) controller.abort()
  else parent?.addEventListener('abort', onParent, { once: true })
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      parent?.removeEventListener('abort', onParent)
    },
    timedOut: () => timedOut
  }
}

/** tvly- / tvly-dev- keys are unambiguous; other vendors share similar hex tokens. */
export function inferProviderFromApiKey(
  apiKey?: string
): WebSearchProviderId | null {
  const k = apiKey?.trim() ?? ''
  if (k.startsWith('tvly-')) return 'tavily'
  return null
}

function envKey(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n]?.trim()
    if (v) return v
  }
  return undefined
}

/** In-process mock for smoke / offline. */
export async function searchMock(
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  const q = opts.query.toLowerCase()
  const hits: WebSearchHit[] = [
    {
      title: `Docs matching "${opts.query}"`,
      url: 'https://example.com/docs',
      snippet: 'Mock documentation page for Ackem web_search smoke tests.'
    },
    {
      title: 'MDN Web Docs',
      url: 'https://developer.mozilla.org/',
      snippet: 'Web platform documentation.'
    }
  ]
  if (q.includes('react')) {
    hits.unshift({
      title: 'React – A JavaScript library for building user interfaces',
      url: 'https://react.dev/',
      snippet: 'Official React documentation.'
    })
  }
  return { provider: 'mock', hits: trimHits(hits, opts.maxResults) }
}

export async function searchTavily(
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  const key = opts.apiKey?.trim()
  if (!key) {
    throw new Error(
      'Tavily API key missing (settings.webSearch.apiKey or TAVILY_API_KEY)'
    )
  }
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`
    },
    body: JSON.stringify({
      query: opts.query,
      search_depth: 'basic',
      max_results: opts.maxResults,
      include_answer: false
    }),
    signal: opts.signal
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Tavily HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>
    error?: string
  }
  if (data.error) throw new Error(`Tavily: ${data.error}`)
  const hits: WebSearchHit[] = (data.results ?? [])
    .map((r) => ({
      title: String(r.title || r.url || 'result'),
      url: String(r.url || ''),
      snippet: r.content
    }))
    .filter((h) => h.url.startsWith('http'))
  return { provider: 'tavily', hits: trimHits(hits, opts.maxResults) }
}

export async function searchBrave(
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  const key = opts.apiKey?.trim()
  if (!key) {
    throw new Error(
      'Brave Search API key missing (settings.webSearch.apiKey or BRAVE_API_KEY)'
    )
  }
  const url = new URL('https://api.search.brave.com/res/v1/web/search')
  url.searchParams.set('q', opts.query)
  url.searchParams.set('count', String(opts.maxResults))
  const res = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': key
    },
    signal: opts.signal
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brave Search HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    web?: { results?: Array<{ title?: string; url?: string; description?: string }> }
  }
  const hits: WebSearchHit[] = (data.web?.results ?? [])
    .map((r) => ({
      title: String(r.title || r.url || 'result'),
      url: String(r.url || ''),
      snippet: r.description
    }))
    .filter((h) => h.url.startsWith('http'))
  return { provider: 'brave', hits: trimHits(hits, opts.maxResults) }
}

export async function searchSerpApi(
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  const key = opts.apiKey?.trim()
  if (!key) {
    throw new Error(
      'SerpAPI key missing (settings.webSearch.apiKey or SERPAPI_API_KEY)'
    )
  }
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', opts.query)
  url.searchParams.set('api_key', key)
  url.searchParams.set('num', String(opts.maxResults))
  const res = await fetch(url, { signal: opts.signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`SerpAPI HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  const data = (await res.json()) as {
    organic_results?: Array<{ title?: string; link?: string; snippet?: string }>
    error?: string
  }
  if (data.error) throw new Error(`SerpAPI: ${data.error}`)
  const hits: WebSearchHit[] = (data.organic_results ?? [])
    .map((r) => ({
      title: String(r.title || r.link || 'result'),
      url: String(r.link || ''),
      snippet: r.snippet
    }))
    .filter((h) => h.url.startsWith('http'))
  return { provider: 'serpapi', hits: trimHits(hits, opts.maxResults) }
}

/** Custom GET endpoint; `{query}` in URL is URL-encoded. */
export async function searchCustom(
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  const template = opts.customUrl?.trim()
  if (!template) {
    throw new Error(
      'customUrl required for provider=custom (e.g. https://host/search?q={query})'
    )
  }
  const url = template.replace(/\{query\}/g, encodeURIComponent(opts.query))
  const headers: Record<string, string> = { Accept: 'application/json' }
  if (opts.apiKey?.trim()) {
    headers.Authorization = `Bearer ${opts.apiKey.trim()}`
  }
  const res = await fetch(url, { headers, signal: opts.signal })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Custom search HTTP ${res.status}: ${body.slice(0, 400)}`)
  }
  const data = (await res.json()) as
    | WebSearchHit[]
    | { results?: WebSearchHit[]; hits?: WebSearchHit[] }
  const raw = Array.isArray(data) ? data : data.results ?? data.hits ?? []
  const hits = raw
    .map((r) => ({
      title: String(r.title || r.url || 'result'),
      url: String(r.url || ''),
      snippet: r.snippet
    }))
    .filter((h) => h.url.startsWith('http'))
  return { provider: 'custom', hits: trimHits(hits, opts.maxResults) }
}

export function resolveApiKeyForProvider(
  provider: WebSearchProviderId | 'auto',
  settingsKey?: string
): string | undefined {
  const fromSettings = settingsKey?.trim() || undefined
  const generic = envKey('ACKEM_WEB_SEARCH_API_KEY')
  const inferred = inferProviderFromApiKey(fromSettings)
  const settingsMatches =
    fromSettings && (provider === 'auto' || inferred === provider || inferred === null)
      ? fromSettings
      : undefined
  switch (provider) {
    case 'tavily':
      return settingsMatches || envKey('TAVILY_API_KEY') || generic
    case 'serpapi':
      return settingsMatches || envKey('SERPAPI_API_KEY') || generic
    case 'brave':
      return settingsMatches || envKey('BRAVE_API_KEY') || generic
    case 'custom':
      return settingsMatches || generic
    default:
      return (
        settingsMatches ||
        envKey('TAVILY_API_KEY', 'SERPAPI_API_KEY', 'BRAVE_API_KEY') ||
        generic
      )
  }
}

export function resolveProviderConfig(settings?: WebSearchSettings): {
  provider: WebSearchProviderId | 'auto'
  apiKey?: string
  customUrl?: string
  maxResults: number
} {
  const envProvider = process.env.ACKEM_WEB_SEARCH_PROVIDER?.trim() as
    | WebSearchProviderId
    | 'auto'
    | undefined
  const rawProvider = (envProvider || settings?.provider || 'auto') as string
  const provider = (
    rawProvider === 'bing' ? 'auto' : rawProvider
  ) as WebSearchProviderId | 'auto'
  const customUrl =
    settings?.customUrl?.trim() ||
    process.env.ACKEM_WEB_SEARCH_CUSTOM_URL?.trim() ||
    undefined
  const fromEnv = Number(process.env.ACKEM_WEB_SEARCH_MAX || 8)
  const maxResults = Math.min(
    20,
    Math.max(
      1,
      settings?.maxResults ?? (Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : 8)
    )
  )
  const picked =
    provider === 'auto' ? pickAutoProvider(settings?.apiKey, customUrl) : provider
  const apiKey = resolveApiKeyForProvider(picked ?? provider, settings?.apiKey)
  return { provider, apiKey, customUrl, maxResults }
}

/** null = no configured provider (caller should error clearly). */
export function pickAutoProvider(
  apiKey?: string,
  customUrl?: string
): WebSearchProviderId | null {
  if (process.env.ACKEM_WEB_SEARCH_USE_MOCK === '1') return 'mock'
  if (customUrl) return 'custom'
  if (envKey('TAVILY_API_KEY') || inferProviderFromApiKey(apiKey) === 'tavily') {
    return 'tavily'
  }
  if (envKey('SERPAPI_API_KEY')) return 'serpapi'
  if (envKey('BRAVE_API_KEY')) return 'brave'
  if (apiKey?.trim()) return 'brave'
  return null
}

export async function runProviderSearch(
  provider: WebSearchProviderId | 'auto',
  opts: ProviderSearchOpts
): Promise<ProviderSearchResult> {
  let id: WebSearchProviderId
  if (provider === 'auto') {
    const picked = pickAutoProvider(opts.apiKey, opts.customUrl)
    if (!picked) {
      throw new Error(NO_PROVIDER)
    }
    id = picked
  } else {
    id = provider
  }

  const apiKey = resolveApiKeyForProvider(id, opts.apiKey)
  if (id === 'mock') {
    return searchMock({ ...opts, apiKey })
  }

  const gate = withSearchTimeout(opts.signal)
  const next = { ...opts, apiKey, signal: gate.signal }
  try {
    switch (id) {
      case 'tavily':
        return await searchTavily(next)
      case 'brave':
        return await searchBrave(next)
      case 'serpapi':
        return await searchSerpApi(next)
      case 'custom':
        return await searchCustom(next)
      default:
        throw new Error(`Unknown web search provider: ${id}`)
    }
  } catch (e) {
    if (opts.signal?.aborted) throw e
    const raw = e instanceof Error ? e.message : String(e)
    const aborted =
      gate.timedOut() ||
      (e instanceof Error && (e.name === 'AbortError' || e.name === 'TimeoutError')) ||
      /^(terminated|aborted)$/i.test(raw.trim())
    if (aborted) {
      throw new Error(
        gate.timedOut()
          ? `Web search timed out after ${WEB_SEARCH_TIMEOUT_MS / 1000}s (${id}). The search API did not respond — check network/proxy, the API key, or switch provider with /web-set.`
          : `Web search was interrupted (${id}): connection closed by the search API or proxy.`
      )
    }
    throw e
  } finally {
    gate.dispose()
  }
}
