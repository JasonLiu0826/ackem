export type WebSearchProvider = 'auto' | 'tavily' | 'serpapi' | 'brave' | 'custom'
export type WebSearchConfiguration = { provider: WebSearchProvider; apiKey?: string; customUrl?: string; maxResults?: number }
export type WebSearchStatus = { ready: boolean; enabled: boolean; provider: string; configuredProvider: WebSearchProvider; hasApiKey: boolean; customUrl?: string; maxResults: number }
export type WebSearchSetupRequest = { requestId: string; query: string; status: 'pending' | 'closed' }
export type WebSearchResult = { ok: boolean; output: string; hits?: Array<{ title: string; url: string; snippet?: string }>; provider?: string; durationSeconds?: number }
