import type { DispatchCatalogEntry } from '../protocols'
import { matchAgainstRouteTable } from '../../embedding/routeTable'
import type { RouteIndex } from '../../embedding/types'
import { HIGH_CONFIDENCE_THRESHOLD } from '../../embedding/types'

const DEFAULT_COOLDOWN_MINUTES = 10
const MAX_CANDIDATES = 5
const SEMANTIC_MIN_SCORE = 0.08
const EMBEDDING_MIN_SCORE = HIGH_CONFIDENCE_THRESHOLD

function parseMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function isWithinActiveHours(activeHours: string | undefined, now: Date): boolean {
  if (!activeHours) return true
  const [startStr, endStr] = activeHours.split('-')
  if (!startStr || !endStr) return true
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const start = parseMinutes(startStr)
  const end = parseMinutes(endStr)
  if (start <= end) {
    return nowMin >= start && nowMin <= end
  }
  return nowMin >= start || nowMin <= end
}

export function messageMatchesKeywords(message: string, keywords: string[]): boolean {
  const normalized = message.toLowerCase()
  return keywords.some((kw) => normalized.includes(kw.toLowerCase()))
}

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[，。！？、；：""''（）【】《》\s,.!?;:()\[\]{}"']+/u)
      .map((t) => t.trim())
      .filter((t) => t.length >= 2)
  )
}

function bigrams(text: string): Set<string> {
  const clean = text.replace(/\s+/g, '')
  const grams = new Set<string>()
  for (let i = 0; i < clean.length - 1; i++) {
    grams.add(clean.slice(i, i + 2).toLowerCase())
  }
  return grams
}

function overlapRatio(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let hit = 0
  for (const t of a) {
    if (b.has(t)) hit++
  }
  return hit / a.size
}

function scoreCatalogEntry(message: string, entry: DispatchCatalogEntry): number {
  const msgTokens = tokenize(message)
  const msgGrams = bigrams(message)

  const corpus = [
    entry.name,
    entry.dispatch.summary,
    ...entry.dispatch.keywords,
    ...entry.dispatch.scenarios,
    ...entry.dispatch.habits
  ].join(' ')

  const corpusTokens = tokenize(corpus)
  const corpusGrams = bigrams(corpus)

  const tokenScore = overlapRatio(msgTokens, corpusTokens)
  const gramScore = overlapRatio(msgGrams, corpusGrams)

  let score = Math.max(tokenScore, gramScore * 1.1)
  if (messageMatchesKeywords(message, entry.dispatch.keywords)) {
    score = Math.max(score, 0.45)
  }
  for (const kw of entry.dispatch.keywords) {
    if (message.includes(kw)) {
      score = Math.max(score, 0.5)
    }
  }
  return score
}

function filterEligibleCatalogEntries(
  catalog: DispatchCatalogEntry[],
  now: Date
): DispatchCatalogEntry[] {
  return catalog.filter((entry) => {
    if (entry.dispatch.mode !== 'dispatched') return false
    if (entry.status !== 'active') return false
    if (entry.rejectedInSession) return false
    if (!isWithinActiveHours(entry.dispatch.time?.active_hours, now)) return false

    const cooldownMin = entry.dispatch.time?.cooldown_minutes ?? DEFAULT_COOLDOWN_MINUTES
    if (entry.lastTriggeredAt) {
      const elapsedMs = now.getTime() - entry.lastTriggeredAt
      if (elapsedMs < cooldownMin * 60_000) return false
    }
    return true
  })
}

/** 语义召回：不依赖 keywords 完全命中，用 summary/场景/token 重叠 */
export function collectSemanticDispatchCandidates(
  message: string,
  catalog: DispatchCatalogEntry[],
  now: Date,
  maxCandidates = MAX_CANDIDATES,
  minScore = SEMANTIC_MIN_SCORE
): DispatchCatalogEntry[] {
  const eligible = filterEligibleCatalogEntries(catalog, now)
  return eligible
    .map((entry) => ({ entry, score: scoreCatalogEntry(message, entry) }))
    .filter(({ score }) => score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, maxCandidates)
    .map(({ entry }) => entry)
}

export function mergeDispatchCandidates(
  keywordHits: DispatchCatalogEntry[],
  semanticHits: DispatchCatalogEntry[],
  turnPlanExtensionId?: string,
  catalog?: DispatchCatalogEntry[],
  maxCandidates = MAX_CANDIDATES
): DispatchCatalogEntry[] {
  const byId = new Map<string, DispatchCatalogEntry>()
  for (const entry of [...keywordHits, ...semanticHits]) {
    byId.set(entry.id, entry)
  }
  if (turnPlanExtensionId && catalog) {
    const forced = catalog.find((c) => c.id === turnPlanExtensionId)
    if (forced) byId.set(forced.id, forced)
  }
  return Array.from(byId.values()).slice(0, maxCandidates)
}

export function collectDispatchCandidates(
  message: string,
  catalog: DispatchCatalogEntry[],
  now: Date,
  maxCandidates = MAX_CANDIDATES
): DispatchCatalogEntry[] {
  const candidates: DispatchCatalogEntry[] = []

  for (const entry of filterEligibleCatalogEntries(catalog, now)) {
    if (!messageMatchesKeywords(message, entry.dispatch.keywords)) continue

    candidates.push(entry)
    if (candidates.length >= maxCandidates) break
  }

  return candidates
}

// ═══════════════════════════════════════════════════════════
// Embedding 路由匹配（新增）
// ═══════════════════════════════════════════════════════════

/**
 * 用 Embedding 匹配路由表，收集候选扩展。
 *
 * 替代关键词匹配——语义上"明天会下雨吗"可以匹配到"帮我查天气"。
 *
 * @param queryEmbed 用户消息的 Embedding 向量
 * @param index 路由索引
 * @param catalog 扩展 catalog
 * @param now 当前时间
 * @returns 匹配到的扩展列表（按分数排序）
 */
export function collectEmbeddingCandidates(
  queryEmbed: number[],
  index: RouteIndex,
  catalog: DispatchCatalogEntry[],
  now: Date
): DispatchCatalogEntry[] {
  if (!queryEmbed || queryEmbed.length === 0 || !index.entries.length) return []

  // Embedding 匹配路由表
  const matches = matchAgainstRouteTable(queryEmbed, index, MAX_CANDIDATES)
  if (matches.length === 0) return []

  // 过滤：只保留活跃且在活跃时段内的扩展
  const eligibleIds = new Set(
    filterEligibleCatalogEntries(catalog, now).map(e => e.id)
  )

  // 按匹配分数排序，去重
  const seen = new Set<string>()
  const candidates: DispatchCatalogEntry[] = []

  for (const match of matches) {
    if (!eligibleIds.has(match.extensionId)) continue
    if (seen.has(match.extensionId)) continue
    seen.add(match.extensionId)

    const entry = catalog.find(c => c.id === match.extensionId)
    if (entry) {
      // 将 Embedding 分数暂时挂到 entry 上（供后续 LLM 精判使用）
      (entry as DispatchCatalogEntry & { _embeddingScore?: number })._embeddingScore = match.score
      candidates.push(entry)
    }
    if (candidates.length >= MAX_CANDIDATES) break
  }

  return candidates
}

/**
 * 判断 Embedding 匹配是否高置信（可直接执行，省 LLM）。
 */
export function isHighConfidenceEmbedding(score: number): boolean {
  return score >= EMBEDDING_MIN_SCORE
}
