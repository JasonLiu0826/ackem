import { runSharedWebSearch } from '../../../../../ackemcode/webSearch'
// [search] — L5 联网搜索实现
// 与 AckemCode 共用 web_search 服务商和配置，不再解析搜索引擎 HTML。

import type { SearchCardPayload, WebSearchHit } from '../../../../../../shared/searchCard'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

/** 单次搜索保留条数（纸面卡展示 + LLM 上下文；略多以便摘录写全） */
export const SEARCH_MAX_RESULTS = 12

function extractDomain(url: string): string {
  try {
    const u = new URL(url)
    return u.hostname
  } catch {
    return url
  }
}

export type SearchEngineId = string
export type SearchWebOutcome = { results: SearchResult[]; engine: SearchEngineId }
export async function searchWeb(query: string): Promise<SearchResult[]> { return (await searchWebWithMeta(query)).results }
export async function searchWebWithMeta(query: string, filters?: { allowed_domains?: string[]; blocked_domains?: string[] }): Promise<SearchWebOutcome> {
  const q = query.trim()
  if (!q) return { results: [], engine: 'web-search' }
  const searched = await runSharedWebSearch({ query: q, ...filters })
  if (!searched.ok) throw new Error(searched.output)
  return { results: (searched.hits ?? []).map(hit => ({ title: hit.title, url: hit.url, snippet: hit.snippet ?? '' })), engine: searched.provider ?? 'web-search' }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) return '（未找到相关结果）'
  return results
    .map(
      (r, i) =>
        `${i + 1}. **${r.title}**\n   链接: ${r.url}\n   来源: ${extractDomain(r.url)}\n   ${r.snippet || '（无摘要）'}`
    )
    .join('\n\n')
}

/** 纸面卡一键复制全文（不截断摘要） */
export function buildSearchCardCopyText(
  query: string,
  results: SearchResult[],
  error?: string
): string {
  const header = `【网页搜索】${query}\n${'─'.repeat(32)}\n`
  if (error) return `${header}搜索失败：${error}`
  if (results.length === 0) return `${header}（未找到相关结果）`
  const body = results
    .map((r, i) => {
      const lines = [
        `${i + 1}. ${r.title}`,
        `链接: ${r.url}`,
        `来源: ${extractDomain(r.url)}`,
        r.snippet ? r.snippet : '（无摘要）'
      ]
      return lines.join('\n')
    })
    .join('\n\n')
  return header + body
}

/** @deprecated 请用 searchSynthesis；仅作降级 */
export function toSearchCardPayload(
  query: string,
  results: SearchResult[],
  error?: string
): SearchCardPayload {
  const sources: WebSearchHit[] = results.map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet
  }))
  const cardBody = error
    ? `搜索失败：${error}`
    : sources.length === 0
      ? '（未找到相关结果）'
      : sources.map((s, i) => `${i + 1}. ${s.title}\n${s.snippet || ''}`).join('\n\n')
  return {
    query,
    cardBody,
    sources,
    copyText: buildSearchCardCopyText(query, results, error),
    ...(error ? { error } : {})
  }
}
