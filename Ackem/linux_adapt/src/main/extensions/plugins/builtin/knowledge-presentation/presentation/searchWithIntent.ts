// [searchWithIntent] — 意图澄清 → 网页搜索 → 结果相关性筛选

import type { AppSettings } from '../../../../../settings'
import { searchWebWithMeta, type SearchResult } from './search'
import {
  rankSearchResultsByIntent,
  resolveSearchIntent,
  type ResolvedSearchIntent
} from './searchQueryResolver'

export type IntentAwareSearchOutcome = {
  query: string
  intent: ResolvedSearchIntent
  results: SearchResult[]
  engine?: string
  error?: string
}

export function lastUserMessageFromContext(
  messages: Array<{ role: string; content: unknown }>
): string {
  const last = [...messages].reverse().find(m => m.role === 'user')
  if (!last) return ''
  const c = last.content
  if (typeof c === 'string') return c
  if (c == null) return ''
  try {
    return JSON.stringify(c)
  } catch {
    return String(c)
  }
}

export async function runIntentAwareWebSearch(
  settings: AppSettings,
  input: { userMessage: string; candidateQueries: string[] },
  onStatus?: (text: string) => void
): Promise<IntentAwareSearchOutcome> {
  const userMessage = input.userMessage.trim()
  const candidates = input.candidateQueries
    .filter((q): q is string => typeof q === 'string')
    .map(q => q.trim())
    .filter(Boolean)

  onStatus?.('正在确认你想搜的内容…')

  const intent = await resolveSearchIntent(settings, {
    userMessage,
    candidateQueries: candidates
  })

  if (!intent.searchQuery.trim()) {
    return {
      query: '',
      intent,
      results: [],
      error: '搜索词为空'
    }
  }

  onStatus?.(`正在搜索「${intent.displayLabel}」…`)

  let rawResults: SearchResult[]
  let engine: string | undefined
  try {
    const searched = await searchWebWithMeta(intent.searchQuery)
    rawResults = searched.results
    engine = searched.engine
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      query: intent.displayLabel || intent.searchQuery,
      intent,
      results: [],
      error: msg
    }
  }

  if (rawResults.length === 0) {
    return {
      query: intent.displayLabel || intent.searchQuery,
      intent,
      results: [],
      engine,
      error: undefined
    }
  }

  onStatus?.('正在核对参考来源是否对口…')

  let results = rawResults
  try {
    results = await rankSearchResultsByIntent(settings, intent, rawResults)
  } catch (e) {
    console.warn('[search] rank by intent failed, using raw results', e)
    results = rawResults.slice(0, 12)
  }

  return {
    query: intent.displayLabel || intent.searchQuery,
    intent,
    results,
    engine,
    error: undefined
  }
}
