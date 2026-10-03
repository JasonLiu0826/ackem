// [retriever] — 记忆检索器（legacy tierB；Task 12 Recall Composer 在 prepareTurnContext 前置拼接，shadow 期双路并存）
// 职责：触发词、事实检索、chunk 片段、memory_echo
// 输入：query、FactStore、IndexSnapshot
// 输出：tierBBlock、MemoryEcho、trace
// 引用：./factStore, ../indexer, ../engine/ackemParams

import { searchChunks, type IndexSnapshot } from '../indexer'
import { CHUNK_SEARCH_MAX_RESULTS, CORE_MEMORY_CHAR_BUDGET, EPISODE_CHAR_BUDGET, EMBEDDING_MIN_SCORE, EMBEDDING_SEARCH_ENABLED, EMBEDDING_SEARCH_TOP_K, MIN_CONFIDENCE_FOR_INJECTION, SEMANTIC_SEARCH_ENABLED, SEMANTIC_SEARCH_TOP_K, TIER_B_CHAR_BUDGET, TRIGGER_MATCH_BOOST, VECTOR_SEARCH_ENABLED, VECTOR_SEARCH_TOP_K } from '../engine/ackemParams'
import type { MemoryEcho } from '../engine/types'
import type { MemoryFact } from './semantic/types.js'
import type { FactStore } from './factStore'
import type { EpisodicStore } from './episodicStore'
import type { KnowledgeGraph } from './knowledgeGraph'
import { VectorStore } from './vectorStore'
import { searchBySemantics } from './semanticSearch'
import type { RelevanceHint } from './scheduler'
import type { AssociationIndex, AssociationType } from './associationIndex'
import type { TemporalContext } from './temporalContextModulator'
import { computeTemporalBoost } from './temporalContextModulator'
import type { TemporalSemanticSignal } from './temporalSignalExtractor'
import { filterFactsForSession } from './sessionFacts'
import { normalizeAckemBrandText } from '../../shared/ackemBrand'
import { filterFactsForRetrieval } from './retrievalScope'
import { surfaceLabel } from './provenance'
import { getCurrentAgentId, getCurrentInteractionSurface } from '../social/agents/withAgentContext'
import { isPrimaryCompanion } from '../social/agents/guards'
import type { InteractionSurface } from './provenance'
import { loadSettings } from '../settings'
import { getClock } from './temporal/clock.js'
import { localDateWindow, monthDayWindowRanges } from './temporal/calendarWindow.js'
import { resolveUserTimezone } from './temporal/timezonePolicy.js'
import { zonedLocalDate, zonedMonthDay } from './temporal/zonedDate.js'
import { getDatabase } from '../db/database.js'
import { loadTombstoneIndex } from './governance/tombstoneIndex.js'

export type RetrievalResult = {
  tierBBlock: string
  memoryEcho: MemoryEcho
  trace: {
    factsUsed: number
    chunkCount: number
    memoirTrust: number | null
    sharedCount: number
    episodesUsed: number
    embeddingHits: number
    /** FIX-024：关联扩散增量事实数（linked 未在 trigger/emb/FTS 等先命中） */
    associationHits: number
    /** FIX-024：关联图激活边数（含 embedding 已命中的 linked 边） */
    associationActivations: number
    /** FIX-022：第 8 路时间锚点命中事实数 */
    temporalAnchorHits: number
  }
  activatedAssociationIds: string[]
}

/** 上一轮激活的关联 ID 列表（供 postChatTurn 纠错使用） */
export let lastActivatedAssociationIds: string[] = []
/** 共现激活频率门控计数器（按 agentId 分行） */
const cooccurrenceTicksByAgent = new Map<string, number>()

function nextCooccurrenceTick(agentId: string): number {
  const n = (cooccurrenceTicksByAgent.get(agentId) ?? 0) + 1
  cooccurrenceTicksByAgent.set(agentId, n)
  return n
}

export class MemoryRetriever {
  constructor(
    private readonly factStore: FactStore,
    private readonly index: IndexSnapshot | null,
    private readonly episodicStore?: EpisodicStore,
    private readonly kg?: KnowledgeGraph,
    private readonly vectorStore?: VectorStore,
    private readonly associationIndex?: AssociationIndex
  ) {}

  async retrieve(
    query: string,
    hint: RelevanceHint,
    budgetChars: number,
    currentValence?: number,
    currentAff?: number,
    temporalCtx?: TemporalContext,
    queryEmbed?: number[],
    temporalSemanticSignal?: TemporalSemanticSignal | null,
    sessionId?: string,
    temporalLabelEmbed?: number[],
    adultMode: boolean = false
  ): Promise<RetrievalResult> {
    const now = Date.now()
    const agentId = getCurrentAgentId()
    const interactionSurface: InteractionSurface =
      getCurrentInteractionSurface() ??
      (isPrimaryCompanion(agentId) ? 'desktop_main' : 'social_private')
    const ownerScoped = filterFactsForRetrieval(this.factStore.listActive(), {
      ownerAgentId: agentId,
      sessionId: sessionId ?? (isPrimaryCompanion(agentId) ? 'default' : `social_${agentId}`),
      interactionSurface,
      adultMode,
    })
    const visibleFacts = ownerScoped.filter(
      (f) => adultMode || (f.privacyLevel ?? 'normal') === 'normal'
    )
    const tombDb = getDatabase(this.factStore.getDataRoot())
    const tomb = tombDb ? loadTombstoneIndex(tombDb) : { facts: new Set<string>(), episodes: new Set<string>(), events: new Set<string>() }
    const governanceVisible = (f: MemoryFact) =>
      f.status === 'active' && !tomb.facts.has(f.id) && (f.sensitivity ?? 'normal') !== 'avoid'

    const sessionFacts = (sessionId ? filterFactsForSession(visibleFacts, sessionId) : visibleFacts).filter(
      governanceVisible
    )
    const sessionFactIds = new Set(sessionFacts.map((f) => f.id))
    const inSession = (f: MemoryFact) => sessionFactIds.has(f.id)

    // 相关性调度：关系阶段缩放预算，信任下降时收紧
    const adjustedBudget = Math.round(budgetChars * hint.stageMultiplier)
    const cap = Math.min(adjustedBudget, TIER_B_CHAR_BUDGET)
    const triggered = this.factStore.searchByTriggers(query).filter(inSession)
    const { facts: selected } = this.factStore.selectForInjection(
      cap,
      MIN_CONFIDENCE_FOR_INJECTION,
      currentValence,
      { adultMode }
    )
    const selectedInSession = selected.filter(inSession)

    const ftsHits = (SEMANTIC_SEARCH_ENABLED ? this.factStore.searchByFts(query, SEMANTIC_SEARCH_TOP_K) : []).filter(
      inSession
    )

    // 短路：触发词+FTS 已足够充裕时，仅跳过 TF-IDF 兜底（字符级噪音）；Embedding 与关联扩散仍执行
    const fastFactCount = new Set([...triggered, ...ftsHits].map(f => f.id)).size
    const fastHasHighConfidence = [...triggered, ...ftsHits].some(f => f.confidence > 0.7)
    const shouldShortCircuit = fastFactCount >= 5 && fastHasHighConfidence

    // O6: 语义搜索 — FTS 优先，Jaccard 补充
    const semanticHits = SEMANTIC_SEARCH_ENABLED
      ? searchBySemantics(sessionFacts, query, SEMANTIC_SEARCH_TOP_K)
      : []

    // Embedding 向量语义搜索 — 语义理解（"喜欢猫" ↔ "喵星人"）；大库 recall 不因短路跳过
    let embeddingHits: MemoryFact[] = []
    let embeddingActive = false
    if (EMBEDDING_SEARCH_ENABLED && this.vectorStore?.embedQuery) {
      try {
        const embeddingResults = await this.vectorStore.searchAsync(
          query,
          EMBEDDING_SEARCH_TOP_K,
          queryEmbed
        )
        embeddingHits = this.vectorStore.resolveFacts(
          embeddingResults.filter(r => r.score >= EMBEDDING_MIN_SCORE),
          sessionFacts
        )
        embeddingActive = embeddingHits.length > 0
      } catch { /* embedding 搜索失败，静默降级 */ }
    }

    // TF-IDF 余弦相似度 — 仅在 embedding 不可用时作为兜底
    // embedding 可用时跳过（TF-IDF 的字符级匹配是噪音，会稀释语义排名）
    // FIX-013 / FIX-039：shouldShortCircuit 仅影响 TF-IDF vectorHits；关联扩散（第 9 路）与 embedding 不受短路影响
    const vectorHits = !shouldShortCircuit && !embeddingActive && VECTOR_SEARCH_ENABLED && this.vectorStore
      ? this.vectorStore.resolveFacts(
          this.vectorStore.search(query, VECTOR_SEARCH_TOP_K),
          sessionFacts
        )
      : []

    // FIX-007：消息内时间语义 — 「去年这时」等由 embedding 检出后额外检索并 boost
    let temporalSemanticHits: MemoryFact[] = []
    let temporalSemanticHint = ''
    if (temporalSemanticSignal?.label) {
      const label = temporalSemanticSignal.label
      temporalSemanticHint =
        `【时间回忆线索·${label}】用户可能在回忆与该时段相关的事，优先联想对应记忆。`
      const seenTemporalSemantic = new Set<string>()
      const pushSemantic = (f: MemoryFact) => {
        if (seenTemporalSemantic.has(f.id) || f.status !== 'active') return
        seenTemporalSemantic.add(f.id)
        temporalSemanticHits.push(f)
      }
      if (SEMANTIC_SEARCH_ENABLED) {
        for (const f of this.factStore.searchByFts(label, SEMANTIC_SEARCH_TOP_K)) pushSemantic(f)
        for (const f of searchBySemantics(sessionFacts, label, SEMANTIC_SEARCH_TOP_K)) {
          pushSemantic(f)
        }
      }
      if (EMBEDDING_SEARCH_ENABLED && this.vectorStore) {
        try {
          let labelResults: Array<{ factId: string; score: number }>
          if (temporalLabelEmbed && temporalLabelEmbed.length > 0 && this.vectorStore.isDenseCacheReady()) {
            labelResults = await this.vectorStore.searchAsync(
              label,
              EMBEDDING_SEARCH_TOP_K,
              temporalLabelEmbed
            )
          } else if (this.vectorStore.embedQuery) {
            labelResults = await this.vectorStore.searchAsync(label, EMBEDDING_SEARCH_TOP_K)
          } else {
            labelResults = []
          }
          for (const f of this.vectorStore.resolveFacts(
            labelResults.filter(r => r.score >= EMBEDDING_MIN_SCORE * 0.85),
            sessionFacts
          )) {
            pushSemantic(f)
          }
        } catch { /* embedding 搜索失败，静默降级 */ }
      }
    }

    const mergedIds = new Set<string>()
    const factsForEcho: ReturnType<FactStore['listActive']> = []
    for (const f of triggered) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of selectedInSession) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of ftsHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of embeddingHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of semanticHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of vectorHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }
    for (const f of temporalSemanticHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }

    // ══ 第 8 路：时间锚点语义联想 + 主动感知 ══
    // 主动感知：当前日期接近 recurring 锚点时自动触发（用户不说"生日"也会想起来）
    let temporalAnchorHits: MemoryFact[] = []
    /** 锚点 SQL 命中的关联事实（与 mergedIds 去重独立，供 KPI/trace） */
    const anchorResolvedFacts: MemoryFact[] = []
    const anchorDataRoot = this.factStore.getDataRoot()
    const nowDate = getClock().now()
    const memoryTimeZone = resolveUserTimezone(loadSettings().timezone).timezone
    const proactiveRanges = monthDayWindowRanges(nowDate, memoryTimeZone, 7, 7)
    const proactiveRangeSql = proactiveRanges.map(() => 'SUBSTR(anchor_date, 6, 5) BETWEEN ? AND ?').join(' OR ')
    const monthAgo = new Date(nowDate.getTime() - 30 * 86400000).toISOString()
    try {
      const { getDatabase } = await import('../db/database')
      const db = getDatabase(anchorDataRoot)
      if (db) {
        const proactiveAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity
           FROM temporal_anchors
           WHERE anchor_type = 'recurring'
             AND (${proactiveRangeSql})
             AND (last_triggered_at IS NULL OR last_triggered_at < ?)
           ORDER BY emotional_intensity DESC LIMIT 3`
        ).all(...proactiveRanges.flatMap((r) => [r.start, r.end]), monthAgo) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number }>

        const seenTemporal = new Set(mergedIds)
        for (const anchor of proactiveAnchors) {
          try {
            const ids: string[] = JSON.parse(anchor.linked_fact_ids)
            for (const id of ids) {
              const f = this.factStore.getById(id)
              if (f && f.status === 'active' && inSession(f)) {
                if (!anchorResolvedFacts.some((x) => x.id === f.id)) anchorResolvedFacts.push(f)
                if (seenTemporal.has(id)) continue
                seenTemporal.add(f.id)
                temporalAnchorHits.push(f)
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch { /* temporal anchors table may not exist yet */ }
    try {
      const { getDatabase } = await import('../db/database')
      const db = getDatabase(anchorDataRoot)
      if (db) {
        const now = getClock().now()
        const recurringRanges = monthDayWindowRanges(now, memoryTimeZone, 30, 30)
        const recurringRangeSql = recurringRanges.map(() => 'SUBSTR(anchor_date, 6, 5) BETWEEN ? AND ?').join(' OR ')
        const recurringAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity, anchor_date
           FROM temporal_anchors
           WHERE anchor_type = 'recurring'
             AND (${recurringRangeSql})
           ORDER BY emotional_intensity DESC
           LIMIT 5`
        ).all(...recurringRanges.flatMap((r) => [r.start, r.end])) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number; anchor_date: string }>

        // 策略 2：模糊时间锚点（最近/那时候）—— 最近 3 个月（本地日历）
        const fuzzyWindow = localDateWindow(now, memoryTimeZone, 90, 0)
        const threeMonthsAgo = fuzzyWindow.from
        const fuzzyAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity
           FROM temporal_anchors
           WHERE anchor_type = 'fuzzy' AND anchor_date >= ?
           ORDER BY emotional_intensity DESC
           LIMIT 3`
        ).all(threeMonthsAgo) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number }>

        const anchorRows = [...recurringAnchors, ...fuzzyAnchors]
        const seenTemporal = new Set(mergedIds)
        // 按 emotional_intensity 排序，优先注入高情绪锚点
        anchorRows.sort((a, b) => b.emotional_intensity - a.emotional_intensity)
        for (const anchor of anchorRows) {
          try {
            const ids: string[] = JSON.parse(anchor.linked_fact_ids)
            for (const id of ids) {
              const f = this.factStore.getById(id)
              if (f && f.status === 'active' && inSession(f)) {
                if (!anchorResolvedFacts.some((x) => x.id === f.id)) anchorResolvedFacts.push(f)
                if (seenTemporal.has(id)) continue
                seenTemporal.add(f.id)
                temporalAnchorHits.push(f)
              }
            }
          } catch { /* skip malformed JSON */ }
        }
      }
    } catch { /* temporal anchors table may not exist yet */ }

    // ══ 第 9 路：记忆关联网络扩散（一跳）══
    // FIX-039：无论 shouldShortCircuit 与否，本段始终执行（勿与 TF-IDF 短路混淆）
    let associationHits: MemoryFact[] = []
    const activatedIds = new Set<string>()
    if (this.associationIndex) {
      const seenSeed = new Set<string>()
      const seeds: MemoryFact[] = []
      const seedPriority = [
        ...triggered,
        ...embeddingHits,
        ...semanticHits,
        ...vectorHits,
        ...ftsHits,
        ...selectedInSession,
      ].filter((f) => f.status === 'active')
      for (const f of [...seedPriority, ...factsForEcho.filter((x) => x.status === 'active')]) {
        if (seenSeed.has(f.id)) continue
        seenSeed.add(f.id)
        seeds.push(f)
        if (seeds.length >= 5) break
      }
      const seen = new Set(mergedIds)
      for (const seed of seeds) {
        const associations = this.associationIndex.getAssociations(seed.id, 0.3)
        for (const assoc of associations) {
          activatedIds.add(assoc.id)
          const linkedId = assoc.fact_id_a === seed.id ? assoc.fact_id_b : assoc.fact_id_a
          if (seen.has(linkedId)) continue
          const linked = this.factStore.getById(linkedId)
          if (linked && linked.status === 'active' && linked.sensitivity !== 'avoid' && inSession(linked)) {
            seen.add(linked.id)
            associationHits.push(linked)
          }
        }
      }
    }

    // 时间锚点结果合并
    for (const f of temporalAnchorHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }

    // 关联扩散结果合并
    for (const f of associationHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }

    // ══ 关联共现激活：同轮检索到的语义相近事实自动 strengthen ══
    // 频率门控：每 3 轮激活一次（避免高频对话中 strength 增长过快）
    if (this.associationIndex && (nextCooccurrenceTick(agentId) % 3 === 0)) {
      const rankedPreview = [...factsForEcho].sort((a, b) =>
        this.factStore.scoreRelevance(b, now, currentValence, currentAff) -
        this.factStore.scoreRelevance(a, now, currentValence, currentAff)
      )
      const topForCooccurrence = rankedPreview.slice(0, 8)
      for (let i = 0; i < topForCooccurrence.length; i++) {
        for (let j = i + 1; j < topForCooccurrence.length; j++) {
          const fa = topForCooccurrence[i]
          const fb = topForCooccurrence[j]
          if (fa.domain !== fb.domain) continue
          // 语义门控：检查 embedding cosine > 0.3
          const faEmb = this.factStore._embeddingCache?.get(fa.id)
          const fbEmb = this.factStore._embeddingCache?.get(fb.id)
          if (faEmb && fbEmb) {
            const { cosineSimilarity } = await import('./factEmbeddingCache')
            const cosine = cosineSimilarity(faEmb, fbEmb)
            if (cosine < 0.3) continue
          }
          // 关联类型：同子类→event_chain，跨子类→thematic
          const assocType: AssociationType =
            fa.subcategory === fb.subcategory ? 'event_chain' : 'thematic'
          this.associationIndex.strengthenOrCreate(fa.id, fb.id, assocType)
        }
      }
    }

    // 近因衰减窗口（ms）：近 3 天内更新的记忆视为"近期"
    const RECENT_MS = 3 * 24 * 3600 * 1000
    const ranked = [...factsForEcho].sort((a, b) => {
      const ta = triggered.some((t) => t.id === a.id)
      const tb = triggered.some((t) => t.id === b.id)
      const saSem = semanticHits.some((s) => s.id === a.id)
      const sbSem = semanticHits.some((s) => s.id === b.id)
      const saEmb = embeddingHits.some((s) => s.id === a.id)
      const sbEmb = embeddingHits.some((s) => s.id === b.id)
      const saVec = vectorHits.some((s) => s.id === a.id)
      const sbVec = vectorHits.some((s) => s.id === b.id)
      const saAssoc = associationHits.some((s) => s.id === a.id)
      const sbAssoc = associationHits.some((s) => s.id === b.id)
      const saTemporalSem = temporalSemanticHits.some((s) => s.id === a.id)
      const sbTemporalSem = temporalSemanticHits.some((s) => s.id === b.id)
      // 调度器提示：长对话或高波动时给近期记忆 1.5x 加权
      const recencyBoost = (f: typeof a) =>
        hint.favorRecent && (now - new Date(f.updatedAt).getTime()) < RECENT_MS ? 1.5 : 1
      // 调度器提示：情绪波动时情感相关的记忆（OUR_BOND, MOOD, VULNERABILITIES 等）加权
      const emotionBoost = (f: typeof a) =>
        hint.emotionalVolatility > 0.4 && ['OUR_BOND', 'MOOD', 'VULNERABILITIES', 'SELF_PERCEPTION'].includes(f.subcategory)
          ? 1 + hint.emotionalVolatility * 0.5
          : 1
      // 时间感知加权（T1-T6）
      const temporalBoostA = temporalCtx ? computeTemporalBoost(a, temporalCtx) : 1.0
      const temporalBoostB = temporalCtx ? computeTemporalBoost(b, temporalCtx) : 1.0
      const sa = temporalBoostA * recencyBoost(a) * emotionBoost(a) * ((ta || saSem || saEmb || saVec || saAssoc || saTemporalSem) ? TRIGGER_MATCH_BOOST : 1) * this.factStore.scoreRelevance(a, now, currentValence, currentAff, queryEmbed)
      const sb = temporalBoostB * recencyBoost(b) * emotionBoost(b) * ((tb || sbSem || sbEmb || sbVec || sbAssoc || sbTemporalSem) ? TRIGGER_MATCH_BOOST : 1) * this.factStore.scoreRelevance(b, now, currentValence, currentAff, queryEmbed)
      return sb - sa
    })

    const memoryEcho = this.factStore.computeMemoryEcho(ranked)

    const injectable = ranked.filter(governanceVisible)

    // 统一预算控制器：所有子块从同一个预算中分配，按优先级依次填充
    // 优先级：核心记忆 > 事实检索 > chunk片段 > 知识图谱 > 情节记忆
    const header = '【Tier B · 结构化记忆与检索片段】'
    let remaining = cap - header.length - 4 // reserve for newlines

    let temporalSemanticBlock = ''
    if (temporalSemanticHint && temporalSemanticHint.length + 2 <= remaining) {
      temporalSemanticBlock = temporalSemanticHint
      remaining -= temporalSemanticBlock.length + 2
    }

    // 1. 核心记忆（优先级最高，上限 2000 或剩余预算的一半）
    let coreBlock = ''
    const coreFacts = (
      sessionId ? filterFactsForSession(this.factStore.getCoreFacts(), sessionId) : this.factStore.getCoreFacts()
    ).filter(governanceVisible)
    if (coreFacts.length > 0 && remaining > 100) {
      const coreBudget = Math.min(CORE_MEMORY_CHAR_BUDGET, Math.floor(remaining * 0.4))
      const coreLines: string[] = []
      let coreChars = 0
      for (const f of coreFacts) {
        const line = normalizeAckemBrandText(`★ ${f.subject}：${f.summary}`)
        if (coreChars + line.length + 2 > coreBudget) break
        coreLines.push(line)
        coreChars += line.length + 2
      }
      if (coreLines.length > 0) {
        coreBlock = ['【核心记忆】', ...coreLines].join('\n')
        remaining -= coreBlock.length + 2
      }
    }

    // 2. 事实检索行（从剩余预算中分配）
    // 结构化注入：关联扩散来源标注 ↳ 标记，帮助 LLM 理解记忆来源
    const lines: string[] = []
    for (const f of injectable) {
      const isAssoc = associationHits.some(s => s.id === f.id)
      const isTemporal = anchorResolvedFacts.some((s) => s.id === f.id)
      const isTemporalSemantic = temporalSemanticHits.some(s => s.id === f.id)
      let annotation = ''
      if (isAssoc) annotation = ' ↳ 关联扩散'
      else if (isTemporalSemantic) annotation = ' ↳ 时间语义'
      else if (isTemporal) annotation = ' ↳ 时间锚点'
      const surf = surfaceLabel(f.interactionSurface)
      const line = normalizeAckemBrandText(`· [${surf}] ${f.subject}：${f.summary}${annotation}`)
      if (remaining - (line.length + 2) < 200) break // 至少留 200 给后续块
      if (line.length + 2 > remaining) break
      lines.push(line)
      remaining -= line.length + 2
    }

    // 3. Chunk 片段
    const hits = this.index && query.trim().length > 0
      ? searchChunks(this.index, query, CHUNK_SEARCH_MAX_RESULTS) : []
    const chunkLines: string[] = []
    for (const h of hits) {
      const block = normalizeAckemBrandText(
        `[${h.chunk.relPath}#${h.chunk.start}-${h.chunk.end}]\n${h.chunk.text.trim()}`
      )
      if (block.length + 4 > remaining) break
      chunkLines.push(block)
      remaining -= block.length + 4
    }

    // 4. 知识图谱（低优先级，用剩余空间）
    let kgBlock = ''
    if (this.kg && remaining > 150) {
      kgBlock = this.kg.buildContextBlock(query)
      if (tombDb && tomb.facts.size > 0) {
        const blocked: string[] = []
        const stmt = tombDb.prepare(`SELECT summary FROM memory_facts WHERE id = ?`)
        for (const factId of tomb.facts) {
          const row = stmt.get(factId) as { summary: string } | undefined
          if (row?.summary) blocked.push(row.summary)
        }
        if (blocked.length > 0) {
          kgBlock = kgBlock
            .split('\n')
            .filter((line) => !blocked.some((s) => line.includes(s)))
            .join('\n')
        }
      }
      if (kgBlock.length > remaining) {
        kgBlock = kgBlock.slice(0, remaining - 3) + '...'
      }
      if (kgBlock.length > 0) remaining -= kgBlock.length + 2
    }

    // 5. 情节记忆（最低优先级）
    let episodeBlock = ''
    let episodesUsed = 0
    if (this.episodicStore && remaining > 150) {
      this.episodicStore.load()
      let episodes = this.episodicStore.retrieve(query).filter((ep) => !tomb.episodes.has(ep.id))
      if (sessionId) {
        const sid = sessionId.trim() || 'default'
        episodes = episodes.filter((ep) => {
          const src = ep.sourceSessionId?.trim()
          if (!src) return true
          return src === sid
        })
      }
      episodesUsed = episodes.length
      episodeBlock = this.episodicStore.buildRetrievalBlock(episodes, Math.min(EPISODE_CHAR_BUDGET, remaining))
      if (episodeBlock.length > 0) remaining -= episodeBlock.length + 2
    }

    const tierBBlock =
      temporalSemanticBlock || coreBlock || lines.length || chunkLines.length || episodeBlock || kgBlock
        ? [header, temporalSemanticBlock, coreBlock, kgBlock, episodeBlock, ...lines, ...chunkLines].filter(Boolean).join('\n')
        : ''

    const memoirTrust = this.factStore.computeMemoirTrust()
    const sharedCount = this.factStore.countSharedBondFacts()

    lastActivatedAssociationIds = [...activatedIds]
    return {
      tierBBlock,
      memoryEcho,
      trace: {
        factsUsed: ranked.length,
        chunkCount: chunkLines.length,
        memoirTrust,
        sharedCount,
        episodesUsed,
        embeddingHits: embeddingHits.length,
        associationHits: associationHits.length,
        associationActivations: activatedIds.size,
        temporalAnchorHits: anchorResolvedFacts.length,
      },
      activatedAssociationIds: [...activatedIds]
    }
  }
}
