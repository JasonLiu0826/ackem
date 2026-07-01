/**
 * FIX-025 — 关联图冷启动：批量 strengthenOrCreate，弥补导入/新用户仅靠 ingest 共现建边不足。
 */
import type { MemoryFact } from '../engine/types'
import type { FactStore } from './factStore'
import type { AssociationIndex, AssociationType } from './associationIndex'
import { FactEmbeddingCache, cosineSimilarity } from './factEmbeddingCache'
import { createLogger } from '../logger'

const log = createLogger('association-cold-start')

export type BatchSeedAssociationsResult = {
  edgesCreated: number
  factsConsidered: number
  orphansLinked: number
}

export type EmbedCacheLike = Map<string, number[]> | FactEmbeddingCache

function getEmbed(cache: EmbedCacheLike, factId: string): number[] | undefined {
  if (cache instanceof FactEmbeddingCache) return cache.get(factId)
  return cache.get(factId)
}

function pickAssociationType(a: MemoryFact, b: MemoryFact): AssociationType {
  if (a.subcategory === b.subcategory) return 'event_chain'
  return 'thematic'
}

/** retriever 扩散门槛 minStrength=0.3；新边需 ≥0.3 才能计入 associationActivations */
const COLD_START_EDGE_STRENGTH = 0.35

function hasEdgeBetween(index: AssociationIndex, a: string, b: string): boolean {
  return index
    .getAssociations(a, 0.05)
    .some((edge) => edge.fact_id_a === b || edge.fact_id_b === b)
}

/** 冷启动建边：已有边 strengthenOrCreate，新边用足够强度 add */
function linkForColdStart(
  index: AssociationIndex,
  factIdA: string,
  factIdB: string,
  assocType: AssociationType
): boolean {
  if (hasEdgeBetween(index, factIdA, factIdB)) {
    index.strengthenOrCreate(factIdA, factIdB, assocType)
    return false
  }
  const [a, b] = factIdA < factIdB ? [factIdA, factIdB] : [factIdB, factIdA]
  index.add({
    fact_id_a: a,
    fact_id_b: b,
    association_type: assocType,
    strength: COLD_START_EDGE_STRENGTH,
  })
  return true
}

/** 共享词/字重叠（无 embedding 时的兜底；含 CJK 二字 gram） */
function textOverlapScore(a: MemoryFact, b: MemoryFact): number {
  const grams = (s: string): Set<string> => {
    const text = s.toLowerCase()
    const set = new Set<string>()
    for (let i = 0; i < text.length - 1; i++) {
      set.add(text.slice(i, i + 2))
    }
    for (const t of text.split(/[^\p{L}\p{N}]+/u).filter((x) => x.length >= 2)) {
      set.add(t)
    }
    return set
  }
  const ta = grams(`${a.subject} ${a.summary}`)
  const tb = grams(`${b.subject} ${b.summary}`)
  let overlap = 0
  for (const t of ta) {
    if (tb.has(t)) overlap++
  }
  return overlap
}

export function batchSeedAssociationsFromTextOverlap(args: {
  factStore: FactStore
  associationIndex: AssociationIndex
  minOverlap?: number
  maxOrphans?: number
  maxPairsPerFact?: number
}): BatchSeedAssociationsResult {
  const minOverlap = args.minOverlap ?? 2
  const maxOrphans = args.maxOrphans ?? 40
  const maxPairsPerFact = args.maxPairsPerFact ?? 3
  const active = args.factStore.listActive()
  const orphans = active.filter((f) => args.associationIndex.getAssociations(f.id, 0.1).length === 0)
  const targets = (orphans.length > 0 ? orphans : active).slice(0, maxOrphans)

  let edgesCreated = 0
  let orphansLinked = 0

  for (const fact of targets) {
    let linked = 0
    const scores: Array<{ other: MemoryFact; score: number }> = []
    for (const other of active) {
      if (other.id === fact.id) continue
      if (fact.domain !== other.domain) continue
      const score = textOverlapScore(fact, other)
      if (score >= minOverlap) scores.push({ other, score })
    }
    scores.sort((a, b) => b.score - a.score)
    for (const { other } of scores.slice(0, maxPairsPerFact)) {
      if (linkForColdStart(args.associationIndex, fact.id, other.id, pickAssociationType(fact, other))) {
        edgesCreated++
        linked++
      }
    }
    if (linked > 0 && orphans.some((o) => o.id === fact.id)) orphansLinked++
  }

  return { edgesCreated, factsConsidered: targets.length, orphansLinked }
}

/** 基于 embedding 相似度批量建边（优先孤儿事实） */
export function batchSeedAssociationsFromEmbeddings(args: {
  factStore: FactStore
  associationIndex: AssociationIndex
  embedCache: EmbedCacheLike
  minCosine?: number
  maxOrphans?: number
  maxPairsPerFact?: number
  sameDomainOnly?: boolean
}): BatchSeedAssociationsResult {
  const minCosine = args.minCosine ?? 0.65
  const maxOrphans = args.maxOrphans ?? 50
  const maxPairsPerFact = args.maxPairsPerFact ?? 3
  const sameDomainOnly = args.sameDomainOnly ?? true

  const active = args.factStore.listActive()
  if (active.length < 2) {
    return { edgesCreated: 0, factsConsidered: 0, orphansLinked: 0 }
  }

  const orphans = active.filter((f) => args.associationIndex.getAssociations(f.id, 0.1).length === 0)
  const targets = (orphans.length > 0 ? orphans : active).slice(0, maxOrphans)

  let edgesCreated = 0
  let orphansLinked = 0

  for (const fact of targets) {
    const embA = getEmbed(args.embedCache, fact.id)
    if (!embA?.length) continue

    const scores: Array<{ other: MemoryFact; cosine: number }> = []
    for (const other of active) {
      if (other.id === fact.id) continue
      if (sameDomainOnly && fact.domain !== other.domain) continue
      const embB = getEmbed(args.embedCache, other.id)
      if (!embB?.length) continue
      const cosine = cosineSimilarity(embA, embB)
      if (cosine >= minCosine) scores.push({ other, cosine })
    }
    scores.sort((a, b) => b.cosine - a.cosine)

    let linked = 0
    for (const { other } of scores.slice(0, maxPairsPerFact)) {
      if (linkForColdStart(args.associationIndex, fact.id, other.id, pickAssociationType(fact, other))) {
        edgesCreated++
        linked++
      }
    }
    if (linked > 0 && orphans.some((o) => o.id === fact.id)) orphansLinked++
  }

  return { edgesCreated, factsConsidered: targets.length, orphansLinked }
}

/** ingest 单轮新增事实 → 与库内 active 事实建边（含单条冷启动） */
export function seedAssociationsForNewFacts(args: {
  newFacts: MemoryFact[]
  factStore: FactStore
  associationIndex: AssociationIndex
  embedCache?: EmbedCacheLike
  minCosine?: number
}): number {
  if (args.newFacts.length === 0) return 0
  const minCosine = args.minCosine ?? 0.7
  const active = args.factStore.listActive()
  let created = 0

  const cache = args.embedCache
  const hasEmbed = cache && (cache instanceof FactEmbeddingCache ? cache.size() : cache.size) > 0

  if (hasEmbed && cache) {
    for (const fact of args.newFacts) {
      const embA = getEmbed(cache, fact.id)
      if (!embA?.length) continue
      for (const other of active) {
        if (other.id === fact.id) continue
        if (fact.domain !== other.domain) continue
        const embB = getEmbed(cache, other.id)
        if (!embB?.length) continue
        const threshold = args.newFacts.length === 1 ? Math.min(minCosine, 0.55) : minCosine
        if (cosineSimilarity(embA, embB) < threshold) continue
        if (linkForColdStart(args.associationIndex, fact.id, other.id, pickAssociationType(fact, other))) {
          created++
        }
      }
    }
  }

  if (args.newFacts.length >= 2) {
    for (let i = 0; i < args.newFacts.length; i++) {
      for (let j = i + 1; j < args.newFacts.length; j++) {
        const a = args.newFacts[i]
        const b = args.newFacts[j]
        if (a.domain !== b.domain) continue
        if (linkForColdStart(args.associationIndex, a.id, b.id, pickAssociationType(a, b))) {
          created++
        }
      }
    }
  }

  if (created === 0) {
    created += seedSingleOrNoteAssociations(args)
  }

  return created
}

/** 单条新事实或 NOTE：文本重叠 / 最近邻弱边 */
function seedSingleOrNoteAssociations(args: {
  newFacts: MemoryFact[]
  factStore: FactStore
  associationIndex: AssociationIndex
}): number {
  let created = 0
  for (const fact of args.newFacts) {
    const active = args.factStore.listActive().filter((f) => f.id !== fact.id)
    if (active.length === 0) continue

    const scores: Array<{ other: MemoryFact; score: number }> = []
    for (const other of active) {
      const score = textOverlapScore(fact, other)
      if (score >= 1) scores.push({ other, score })
    }
    scores.sort((a, b) => b.score - a.score)

    if (scores.length > 0) {
      if (linkForColdStart(
        args.associationIndex,
        fact.id,
        scores[0].other.id,
        pickAssociationType(fact, scores[0].other)
      )) {
        created++
        continue
      }
    }

    if (fact.subcategory === 'NOTE' || args.newFacts.length === 1) {
      const neighbor = active.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )[0]
      if (neighbor && linkForColdStart(args.associationIndex, fact.id, neighbor.id, 'thematic')) {
        created++
      }
    }
  }
  return created
}

/** 导入/索引重建后：embedding 优先，否则文本重叠兜底 */
export async function reseedAssociationGraph(args: {
  factStore: FactStore
  associationIndex: AssociationIndex
  embedCache?: EmbedCacheLike
  buildEmbeddings?: () => Promise<EmbedCacheLike | null>
}): Promise<BatchSeedAssociationsResult> {
  const active = args.factStore.listActive()
  if (active.length < 2) {
    return { edgesCreated: 0, factsConsidered: 0, orphansLinked: 0 }
  }

  let cache = args.embedCache
  if (!cache && args.buildEmbeddings) {
    cache = (await args.buildEmbeddings()) ?? undefined
  }

  if (cache && (cache instanceof FactEmbeddingCache ? cache.size() : cache.size) > 0) {
    const result = batchSeedAssociationsFromEmbeddings({
      factStore: args.factStore,
      associationIndex: args.associationIndex,
      embedCache: cache,
    })
    log.info('关联冷启动 embedding 批次完成', result)
    if (result.edgesCreated > 0) return result
  }

  const fallback = batchSeedAssociationsFromTextOverlap({
    factStore: args.factStore,
    associationIndex: args.associationIndex,
  })
  log.info('关联冷启动文本重叠兜底', fallback)
  return fallback
}

/** 导入 promote / index:rebuild 后：加载事实库并批量补建关联边 */
export async function reseedAssociationGraphForDataRoot(dataRoot: string): Promise<BatchSeedAssociationsResult> {
  const { FactStore, defaultFactsPath } = await import('./factStore')
  const { getAssociationIndex, getOrInitEmbeddingProvider, getCachedFactStore } = await import('../engineCache')

  const store = getCachedFactStore(dataRoot) ?? new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const assocIndex = getAssociationIndex(dataRoot)

  return reseedAssociationGraph({
    factStore: store,
    associationIndex: assocIndex,
    buildEmbeddings: async () => {
      const provider = await getOrInitEmbeddingProvider(dataRoot)
      if (!provider?.ready()) return null
      const cache = new FactEmbeddingCache()
      await cache.build(store.listActive(), provider)
      return cache.size() > 0 ? cache : null
    },
  })
}
