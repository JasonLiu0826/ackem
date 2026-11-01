/**
 * Web search types — Claude Code WebSearchTool contract (provider-agnostic).
 */

export type WebSearchProviderId =
  | 'tavily'
  | 'serpapi'
  | 'brave'
  | 'custom'
  | 'mock'

export type WebSearchHit = {
  title: string
  url: string
  snippet?: string
}

export type WebSearchSettings = {
  /** Default auto: pick first provider with a key. */
  provider?: WebSearchProviderId | 'auto'
  apiKey?: string
  /** For provider=custom: GET URL with `{query}` placeholder */
  customUrl?: string
  maxResults?: number
  /** Extra blocked domains always applied */
  blockedDomains?: string[]
}

export type WebSearchInput = {
  query: string
  allowed_domains?: string[]
  blocked_domains?: string[]
}

export type WebSearchRunResult = {
  ok: boolean
  output: string
  hits?: WebSearchHit[]
  provider?: string
  durationSeconds?: number
}
