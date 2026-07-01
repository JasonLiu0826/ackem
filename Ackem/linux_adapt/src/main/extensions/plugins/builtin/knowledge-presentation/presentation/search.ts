// [search] — L5 联网搜索实现
// 默认 Bing HTML 解析（无需 API Key）；可选配置 SearXNG 实例优先

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

/** SearXNG JSON API 搜索（需用户配置实例地址） */
async function searchSearxng(query: string, instanceUrl: string): Promise<SearchResult[]> {
  const url = `${instanceUrl.replace(/\/+$/, '')}/search?format=json&q=${encodeURIComponent(query)}`
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  if (!resp.ok) throw new Error(`SearXNG HTTP ${resp.status}`)
  const data = (await resp.json()) as {
    results?: Array<{ title: string; url: string; content: string; snippet?: string }>
  }
  return (data.results || []).slice(0, SEARCH_MAX_RESULTS).map(r => ({
    title: r.title,
    url: r.url,
    snippet: r.snippet || r.content || ''
  }))
}

/** Bing 搜索（默认引擎，国内较可达） */
async function searchBing(query: string): Promise<SearchResult[]> {
  const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-cn`
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  })
  if (!resp.ok) throw new Error(`Bing HTTP ${resp.status}`)
  const html = await resp.text()

  const results: SearchResult[] = []
  const blockRe = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/gi
  let m: RegExpExecArray | null
  while ((m = blockRe.exec(html)) !== null) {
    if (results.length >= SEARCH_MAX_RESULTS) break
    const block = m[1]
    const titleM = /<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a><\/h2>/i.exec(block)
    const snippetM = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block)
    if (titleM) {
      results.push({
        title: titleM[2].replace(/<[^>]+>/g, '').trim(),
        url: titleM[1],
        snippet: snippetM ? snippetM[1].replace(/<[^>]+>/g, '').trim() : ''
      })
    }
  }
  return results
}

export interface SearchConfig {
  searxngUrl?: string
}

let _config: SearchConfig = {}

export function setSearchConfig(cfg: SearchConfig): void {
  _config = cfg
}

export type SearchEngineId = 'searxng' | 'bing'

export type SearchWebOutcome = {
  results: SearchResult[]
  engine: SearchEngineId
}

/** 默认 Bing；若配置了 SearXNG 则优先 SearXNG */
export async function searchWeb(query: string): Promise<SearchResult[]> {
  const out = await searchWebWithMeta(query)
  return out.results
}

export async function searchWebWithMeta(query: string): Promise<SearchWebOutcome> {
  const q = query.trim()
  if (!q) return { results: [], engine: 'bing' }

  if (_config.searxngUrl) {
    try {
      const results = await searchSearxng(q, _config.searxngUrl)
      console.info('[search] engine=searxng', q, results.length)
      return { results, engine: 'searxng' }
    } catch (e) {
      console.warn('[search] searxng failed, fallback bing', e)
    }
  }

  try {
    const results = await searchBing(q)
    console.info('[search] engine=bing', q, results.length)
    return { results, engine: 'bing' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`Bing 搜索不可达：${msg}。可通过 setSearchConfig({ searxngUrl }) 配置 SearXNG。`)
  }
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
