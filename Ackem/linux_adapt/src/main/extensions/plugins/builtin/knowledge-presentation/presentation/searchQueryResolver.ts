// [searchQueryResolver] — 搜索前/后用 LLM 澄清意图与筛选结果
// 引用：../../../../../settings, ../../../../../llmClient, ./search, ../../../../../prompt/search-query-resolver

import type { AppSettings } from '../../../../../settings'
import { createLlmJsonClient } from '../../../../../llmClient'
import type { SearchResult } from './search'
import { SEARCH_RESOLVE_SYSTEM, SEARCH_RESOLVE_TEMPERATURE } from '../../../../../prompt/search-query-resolver'

export type ResolvedSearchIntent = {
  searchQuery: string
  displayLabel: string
  intentSummary: string
}

const RESOLVE_MAX_TOKENS = 280
const RANK_MAX_TOKENS = 400

export function parseJsonObject<T extends Record<string, unknown>>(raw: string): T | null {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidate = (fenced ? fenced[1] : trimmed).trim()
  try {
    return JSON.parse(candidate) as T
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as T
      } catch {
        return null
      }
    }
    return null
  }
}

function uniqueNonEmpty(queries: Array<string | undefined | null>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const q of queries) {
    if (typeof q !== 'string') continue
    const t = q.trim()
    if (!t || seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}

export function isUnusableSearchQuery(query: string, userMessage?: string): boolean {
  const q = query.trim()
  if (!q) return true
  if (q.length <= 2) return true
  if (/^[\u4e00-\u9fff\d]{1,2}$/u.test(q)) return true

  const user = userMessage?.trim() ?? ''
  if (user.length >= 10 && q.length <= 3) {
    return true
  }
  return false
}

export function buildSearchCandidateQueries(
  userMessage: string,
  toolCallQueries: string[],
  taskFrameSearchQuery?: string
): string[] {
  const user = userMessage.trim()
  const stripped = user.replace(/^(?:请|帮我|给我)\s*/u, '').trim()
  return uniqueNonEmpty([
    taskFrameSearchQuery,
    ...toolCallQueries,
    stripped.length >= 4 ? stripped : '',
    user.length >= 4 ? user : ''
  ])
}

function fallbackIntent(userMessage: string, candidates: string[]): ResolvedSearchIntent {
  const user = userMessage.trim()
  const viable = candidates.filter((q) => !isUnusableSearchQuery(q, user))
  const pool = viable.length > 0 ? viable : candidates
  const best =
    pool.find((q) => q.length >= 4 && !/^一下/u.test(q)) ||
    pool.find((q) => !isUnusableSearchQuery(q, user)) ||
    user ||
    pool[0] ||
    ''
  const searchQuery = best.replace(/^(一下|一个|个|下|点)\s*/u, '').trim() || user
  return {
    searchQuery,
    displayLabel: searchQuery.slice(0, 48),
    intentSummary: user || searchQuery
  }
}

export async function resolveSearchIntent(
  settings: AppSettings,
  input: { userMessage: string; candidateQueries: string[] }
): Promise<ResolvedSearchIntent> {
  const userMessage = input.userMessage.trim()
  const candidates = uniqueNonEmpty(input.candidateQueries)
  if (!userMessage && candidates.length === 0) {
    return { searchQuery: '', displayLabel: '', intentSummary: '' }
  }

  const client = createLlmJsonClient(settings)
  const candidateBlock =
    candidates.length > 0
      ? candidates.map((q, i) => `${i + 1}. ${q}`).join('\n')
      : '（无，请仅根据用户原话生成）'

  const raw = await client.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content: SEARCH_RESOLVE_SYSTEM
      },
      {
        role: 'user',
        content: `用户原话：\n${userMessage || '（空）'}\n\n候选搜索词：\n${candidateBlock}`
      }
    ],
    temperature: 0.15,
    max_tokens: RESOLVE_MAX_TOKENS
  })

  const parsed = parseJsonObject<{
    search_query?: string
    display_label?: string
    intent_summary?: string
  }>(raw)

  if (!parsed?.search_query?.trim()) {
    return fallbackIntent(userMessage, candidates)
  }

  const searchQuery = parsed.search_query.trim()
  if (isUnusableSearchQuery(searchQuery, userMessage)) {
    return fallbackIntent(userMessage, candidates)
  }

  return {
    searchQuery,
    displayLabel: (parsed.display_label || searchQuery).trim().slice(0, 64) || searchQuery,
    intentSummary: (parsed.intent_summary || userMessage || searchQuery).trim()
  }
}

export async function rankSearchResultsByIntent(
  settings: AppSettings,
  intent: ResolvedSearchIntent,
  results: SearchResult[]
): Promise<SearchResult[]> {
  if (results.length === 0) return []
  if (!intent.intentSummary.trim() && !intent.searchQuery.trim()) return results

  const lines = results
    .map(
      (r, i) =>
        `${i + 1}. 标题: ${r.title}\n   摘要: ${(r.snippet || '（无）').slice(0, 200)}\n   链接: ${r.url}`
    )
    .join('\n\n')

  const client = createLlmJsonClient(settings)
  const raw = await client.chatCompletionJson({
    messages: [
      {
        role: 'system',
        content:
          '你是搜索结果相关性审核器。根据用户的检索意图，从列表中选出**确实相关**的条目编号（1-based）。\n' +
          '- 排除与用户意图**明显无关**的条目（例如意图是某作品/角色/软件，结果却是同名异义的行业、股票、原材料等）\n' +
          '- **若不确定但可能相关，必须保留**；宁可多留 2～3 条，也不要全部剔除\n' +
          '- 只要有一条与意图沾边，就应在 relevant_indices 中列出其编号\n' +
          '- 仅当**每一条**都明显是另一事物时，才返回 {"relevant_indices":[]}\n' +
          '- 仅输出 JSON：{"relevant_indices":[1,3,...]}'
      },
      {
        role: 'user',
        content:
          `检索意图：${intent.intentSummary}\n` +
          `搜索查询：${intent.searchQuery}\n\n` +
          `条目列表：\n${lines}`
      }
    ],
    temperature: 0.1,
    max_tokens: RANK_MAX_TOKENS
  })

  const parsed = parseJsonObject<{ relevant_indices?: number[] }>(raw)
  const indices = parsed?.relevant_indices

  if (!Array.isArray(indices)) {
    return results.slice(0, 12)
  }

  if (indices.length === 0) {
    return []
  }

  const picked: SearchResult[] = []
  const seen = new Set<number>()
  for (const n of indices) {
    const i = Math.floor(Number(n)) - 1
    if (i < 0 || i >= results.length || seen.has(i)) continue
    seen.add(i)
    picked.push(results[i])
  }

  return picked.length > 0 ? picked : results.slice(0, 12)
}
