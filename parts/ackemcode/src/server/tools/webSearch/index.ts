/**
 * web_search — Claude Code WebSearchTool behavior with pluggable SERP providers.
 */
import { formatWebSearchToolResult, webSearchToolDescription } from './format.js'
import {
  resolveProviderConfig,
  runProviderSearch
} from './providers.js'
import type { WebSearchRunResult, WebSearchSettings } from './types.js'
import { filterHitsByDomains, validateWebSearchInput } from './validate.js'

export type { WebSearchSettings, WebSearchHit, WebSearchProviderId } from './types.js'
export { webSearchToolDescription } from './format.js'
export { validateWebSearchInput, filterHitsByDomains } from './validate.js'
export {
  resolveProviderConfig,
  runProviderSearch,
  pickAutoProvider,
  inferProviderFromApiKey
} from './providers.js'

export function isWebSearchEnabled(): boolean {
  const off =
    process.env.ACKEM_DISABLE_WEB_SEARCH === '1' ||
    process.env.CLAUDE_CODE_DISABLE_WEB_SEARCH === '1'
  return !off
}

export async function runWebSearch(opts: {
  input: Record<string, unknown>
  settings?: WebSearchSettings
  signal?: AbortSignal
}): Promise<WebSearchRunResult> {
  if (!isWebSearchEnabled()) {
    return {
      ok: false,
      output:
        'web_search is disabled (ACKEM_DISABLE_WEB_SEARCH=1). Use web_fetch with a known URL.'
    }
  }

  const validated = validateWebSearchInput(opts.input)
  if (!validated.ok) {
    return { ok: false, output: validated.error }
  }

  const cfg = resolveProviderConfig(opts.settings)
  const blockedExtra = [
    ...(validated.blocked ?? []),
    ...(opts.settings?.blockedDomains ?? [])
  ]
  const start = Date.now()

  try {
    if (opts.signal?.aborted) {
      return { ok: false, output: 'Tool execution aborted by user.' }
    }

    const raw = await runProviderSearch(cfg.provider, {
      query: validated.query,
      apiKey: cfg.apiKey,
      customUrl: cfg.customUrl,
      maxResults: cfg.maxResults,
      signal: opts.signal
    })

    const hits = filterHitsByDomains(
      raw.hits,
      validated.allowed,
      blockedExtra.length ? blockedExtra : undefined
    )

    const durationSeconds = (Date.now() - start) / 1000
    const note =
      raw.provider === 'mock'
        ? 'Note: using mock provider (set TAVILY_API_KEY / SERPAPI_API_KEY / BRAVE_API_KEY or webSearch.provider for live search).'
        : undefined

    return {
      ok: true,
      output: formatWebSearchToolResult({
        query: validated.query,
        hits,
        provider: raw.provider,
        durationSeconds,
        note
      }),
      hits,
      provider: raw.provider,
      durationSeconds
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      output: `Web search failed: ${msg}`,
      durationSeconds: (Date.now() - start) / 1000
    }
  }
}
