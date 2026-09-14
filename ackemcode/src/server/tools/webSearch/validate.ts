import type { WebSearchHit, WebSearchInput } from './types.js'

export type ValidatedWebSearch =
  | { ok: true; query: string; allowed?: string[]; blocked?: string[] }
  | { ok: false; error: string; code: 1 | 2 }

/** CC WebSearch validateInput spirit. */
export function validateWebSearchInput(
  input: Record<string, unknown>
): ValidatedWebSearch {
  const query = String(input.query ?? '').trim()
  if (query.length < 2) {
    return {
      ok: false,
      code: 1,
      error: 'query is required (min length 2)'
    }
  }

  const allowed = normalizeDomainList(input.allowed_domains)
  const blocked = normalizeDomainList(input.blocked_domains)
  if (allowed?.length && blocked?.length) {
    return {
      ok: false,
      code: 2,
      error:
        'allowed_domains and blocked_domains are mutually exclusive — set only one'
    }
  }

  return {
    ok: true,
    query,
    allowed: allowed?.length ? allowed : undefined,
    blocked: blocked?.length ? blocked : undefined
  }
}

function normalizeDomainList(raw: unknown): string[] | undefined {
  if (raw == null) return undefined
  if (!Array.isArray(raw)) return undefined
  const out: string[] = []
  for (const item of raw) {
    const d = String(item ?? '')
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/\/.*$/, '')
      .replace(/^\*\./, '')
    if (d) out.push(d)
  }
  return out
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

export function filterHitsByDomains(
  hits: WebSearchHit[],
  allowed?: string[],
  blocked?: string[]
): WebSearchHit[] {
  return hits.filter((h) => {
    const host = hostnameOf(h.url)
    if (!host) return false
    if (allowed?.length) {
      return allowed.some((d) => host === d || host.endsWith(`.${d}`))
    }
    if (blocked?.length) {
      return !blocked.some((d) => host === d || host.endsWith(`.${d}`))
    }
    return true
  })
}

export function asWebSearchInput(
  v: ValidatedWebSearch & { ok: true }
): WebSearchInput {
  return {
    query: v.query,
    allowed_domains: v.allowed,
    blocked_domains: v.blocked
  }
}
