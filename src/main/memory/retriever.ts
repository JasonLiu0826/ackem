// [retriever] 鈥?璁板繂妫€绱㈠櫒
// 鑱岃矗锛氳Е鍙戣瘝銆佷簨瀹炴绱€乧hunk 鐗囨銆乵emory_echo
// 杈撳叆锛歲uery銆丗actStore銆両ndexSnapshot
// 杈撳嚭锛歵ierBBlock銆丮emoryEcho銆乼race
// 寮曠敤锛?/factStore, ../indexer, ../engine/AckemParams

import { searchChunks, type IndexSnapshot } from '../indexer'
import { CHUNK_SEARCH_MAX_RESULTS, CORE_MEMORY_CHAR_BUDGET, EPISODE_CHAR_BUDGET, EMBEDDING_MIN_SCORE, EMBEDDING_SEARCH_ENABLED, EMBEDDING_SEARCH_TOP_K, MIN_CONFIDENCE_FOR_INJECTION, SEMANTIC_SEARCH_ENABLED, SEMANTIC_SEARCH_TOP_K, TIER_B_CHAR_BUDGET, TRIGGER_MATCH_BOOST, VECTOR_SEARCH_ENABLED, VECTOR_SEARCH_TOP_K } from '../engine/AckemParams'
import type { MemoryEcho, MemoryFact } from '../engine/types'
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
import { normalizeAckemBrandText } from '../../shared/AckemBrand'

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
    /** FIX-024锛氬叧鑱旀墿鏁ｅ閲忎簨瀹炴暟锛坙inked 鏈湪 trigger/emb/FTS 绛夊厛鍛戒腑锛?*/
    associationHits: number
    /** FIX-024锛氬叧鑱斿浘婵€娲昏竟鏁帮紙鍚?embedding 宸插懡涓殑 linked 杈癸級 */
    associationActivations: number
    /** FIX-022锛氱 8 璺椂闂撮敋鐐瑰懡涓簨瀹炴暟 */
    temporalAnchorHits: number
  }
  activatedAssociationIds: string[]
}

/** 涓婁竴杞縺娲荤殑鍏宠仈 ID 鍒楄〃锛堜緵 postChatTurn 绾犻敊浣跨敤锛?*/
export let lastActivatedAssociationIds: string[] = []
/** 鍏辩幇婵€娲婚鐜囬棬鎺ц鏁板櫒 */
let cooccurrenceTicks = 0

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
    const visibleFacts = this.factStore
      .listActive()
      .filter((f) => adultMode || (f.privacyLevel ?? 'normal') === 'normal')
    const sessionFacts = sessionId
      ? filterFactsForSession(visibleFacts, sessionId)
      : visibleFacts
    const sessionFactIds = new Set(sessionFacts.map((f) => f.id))
    const inSession = (f: MemoryFact) => sessionFactIds.has(f.id)

    // 鐩稿叧鎬ц皟搴︼細鍏崇郴闃舵缂╂斁棰勭畻锛屼俊浠讳笅闄嶆椂鏀剁揣
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

    // 鐭矾锛氳Е鍙戣瘝+FTS 宸茶冻澶熷厖瑁曟椂锛屼粎璺宠繃 TF-IDF 鍏滃簳锛堝瓧绗︾骇鍣煶锛夛紱Embedding 涓庡叧鑱旀墿鏁ｄ粛鎵ц
    const fastFactCount = new Set([...triggered, ...ftsHits].map(f => f.id)).size
    const fastHasHighConfidence = [...triggered, ...ftsHits].some(f => f.confidence > 0.7)
    const shouldShortCircuit = fastFactCount >= 5 && fastHasHighConfidence

    // O6: 璇箟鎼滅储 鈥?FTS 浼樺厛锛孞accard 琛ュ厖
    const semanticHits = SEMANTIC_SEARCH_ENABLED
      ? searchBySemantics(sessionFacts, query, SEMANTIC_SEARCH_TOP_K)
      : []

    // Embedding 鍚戦噺璇箟鎼滅储 鈥?璇箟鐞嗚В锛?鍠滄鐚? 鈫?"鍠垫槦浜?锛夛紱澶у簱 recall 涓嶅洜鐭矾璺宠繃
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
      } catch { /* embedding 鎼滅储澶辫触锛岄潤榛橀檷绾?*/ }
    }

    // TF-IDF 浣欏鸡鐩镐技搴?鈥?浠呭湪 embedding 涓嶅彲鐢ㄦ椂浣滀负鍏滃簳
    // embedding 鍙敤鏃惰烦杩囷紙TF-IDF 鐨勫瓧绗︾骇鍖归厤鏄櫔闊筹紝浼氱█閲婅涔夋帓鍚嶏級
    // FIX-013 / FIX-039锛歴houldShortCircuit 浠呭奖鍝?TF-IDF vectorHits锛涘叧鑱旀墿鏁ｏ紙绗?9 璺級涓?embedding 涓嶅彈鐭矾褰卞搷
    const vectorHits = !shouldShortCircuit && !embeddingActive && VECTOR_SEARCH_ENABLED && this.vectorStore
      ? this.vectorStore.resolveFacts(
          this.vectorStore.search(query, VECTOR_SEARCH_TOP_K),
          sessionFacts
        )
      : []

    // FIX-007锛氭秷鎭唴鏃堕棿璇箟 鈥?銆屽幓骞磋繖鏃躲€嶇瓑鐢?embedding 妫€鍑哄悗棰濆妫€绱㈠苟 boost
    let temporalSemanticHits: MemoryFact[] = []
    let temporalSemanticHint = ''
    if (temporalSemanticSignal?.label) {
      const label = temporalSemanticSignal.label
      temporalSemanticHint =
        `銆愭椂闂村洖蹇嗙嚎绱⒙?{label}銆戠敤鎴峰彲鑳藉湪鍥炲繂涓庤鏃舵鐩稿叧鐨勪簨锛屼紭鍏堣仈鎯冲搴旇蹇嗐€俙
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
        } catch { /* embedding 鎼滅储澶辫触锛岄潤榛橀檷绾?*/ }
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

    // 鈺愨晲 绗?8 璺細鏃堕棿閿氱偣璇箟鑱旀兂 + 涓诲姩鎰熺煡 鈺愨晲
    // 涓诲姩鎰熺煡锛氬綋鍓嶆棩鏈熸帴杩?recurring 閿氱偣鏃惰嚜鍔ㄨЕ鍙戯紙鐢ㄦ埛涓嶈"鐢熸棩"涔熶細鎯宠捣鏉ワ級
    let temporalAnchorHits: MemoryFact[] = []
    /** 閿氱偣 SQL 鍛戒腑鐨勫叧鑱斾簨瀹烇紙涓?mergedIds 鍘婚噸鐙珛锛屼緵 KPI/trace锛?*/
    const anchorResolvedFacts: MemoryFact[] = []
    const anchorDataRoot = this.factStore.getDataRoot()
    const nowDate = new Date()
    const todayMMDD = nowDate.toISOString().slice(5, 10)
    try {
      const { getDatabase } = await import('../db/database')
      const db = getDatabase(anchorDataRoot)
      if (db) {
        const weekAgo = new Date(nowDate.getTime() - 7 * 86400000).toISOString().slice(5, 10)
        const weekAhead = new Date(nowDate.getTime() + 7 * 86400000).toISOString().slice(5, 10)
        const monthAgo = new Date(nowDate.getTime() - 30 * 86400000).toISOString()
        const proactiveAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity
           FROM temporal_anchors
           WHERE anchor_type = 'recurring'
             AND SUBSTR(anchor_date, 6, 5) BETWEEN ? AND ?
             AND (last_triggered_at IS NULL OR last_triggered_at < ?)
           ORDER BY emotional_intensity DESC LIMIT 3`
        ).all(weekAgo, weekAhead, monthAgo) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number }>

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
        const now = new Date()
        const today = now.toISOString().slice(5, 10) // MM-DD
        const yearAgo = now.toISOString().slice(0, 10) // YYYY-MM-DD

        // 绛栫暐 1锛氬懆鏈熸€ч敋鐐癸紙鐢熸棩/绾康鏃?鑺傚亣鏃ワ級鈥斺€?鍚屾湀鍚屾棩 卤30 澶?
        const monthDay = today // MM-DD
        const dayStart = new Date(now.getTime() - 30 * 86400000).toISOString().slice(5, 10)
        const dayEnd = new Date(now.getTime() + 30 * 86400000).toISOString().slice(5, 10)
        const recurringAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity, anchor_date
           FROM temporal_anchors
           WHERE anchor_type = 'recurring'
             AND SUBSTR(anchor_date, 6, 5) >= ?
             AND SUBSTR(anchor_date, 6, 5) <= ?
           ORDER BY emotional_intensity DESC
           LIMIT 5`
        ).all(dayStart, dayEnd) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number; anchor_date: string }>

        // 绛栫暐 2锛氭ā绯婃椂闂撮敋鐐癸紙鏈€杩?閭ｆ椂鍊欙級鈥斺€?鏈€杩?3 涓湀
        const threeMonthsAgo = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10)
        const fuzzyAnchors = db.prepare(
          `SELECT linked_fact_ids, emotional_valence, emotional_intensity
           FROM temporal_anchors
           WHERE anchor_type = 'fuzzy' AND anchor_date >= ?
           ORDER BY emotional_intensity DESC
           LIMIT 3`
        ).all(threeMonthsAgo) as Array<{ linked_fact_ids: string; emotional_valence: number; emotional_intensity: number }>

        const anchorRows = [...recurringAnchors, ...fuzzyAnchors]
        const seenTemporal = new Set(mergedIds)
        // 鎸?emotional_intensity 鎺掑簭锛屼紭鍏堟敞鍏ラ珮鎯呯华閿氱偣
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

    // 鈺愨晲 绗?9 璺細璁板繂鍏宠仈缃戠粶鎵╂暎锛堜竴璺筹級鈺愨晲
    // FIX-039锛氭棤璁?shouldShortCircuit 涓庡惁锛屾湰娈靛缁堟墽琛岋紙鍕夸笌 TF-IDF 鐭矾娣锋穯锛?
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

    // 鏃堕棿閿氱偣缁撴灉鍚堝苟
    for (const f of temporalAnchorHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }

    // 鍏宠仈鎵╂暎缁撴灉鍚堝苟
    for (const f of associationHits) {
      if (mergedIds.has(f.id)) continue
      mergedIds.add(f.id)
      factsForEcho.push(f)
    }

    // 鈺愨晲 鍏宠仈鍏辩幇婵€娲伙細鍚岃疆妫€绱㈠埌鐨勮涔夌浉杩戜簨瀹炶嚜鍔?strengthen 鈺愨晲
    // 棰戠巼闂ㄦ帶锛氭瘡 3 杞縺娲讳竴娆★紙閬垮厤楂橀瀵硅瘽涓?strength 澧為暱杩囧揩锛?
    if (this.associationIndex && (++cooccurrenceTicks % 3 === 0)) {
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
          // 璇箟闂ㄦ帶锛氭鏌?embedding cosine > 0.3
          const faEmb = this.factStore._embeddingCache?.get(fa.id)
          const fbEmb = this.factStore._embeddingCache?.get(fb.id)
          if (faEmb && fbEmb) {
            const { cosineSimilarity } = await import('./factEmbeddingCache')
            const cosine = cosineSimilarity(faEmb, fbEmb)
            if (cosine < 0.3) continue
          }
          // 鍏宠仈绫诲瀷锛氬悓瀛愮被鈫抏vent_chain锛岃法瀛愮被鈫抰hematic
          const assocType: AssociationType =
            fa.subcategory === fb.subcategory ? 'event_chain' : 'thematic'
          this.associationIndex.strengthenOrCreate(fa.id, fb.id, assocType)
        }
      }
    }

    // 杩戝洜琛板噺绐楀彛锛坢s锛夛細杩?3 澶╁唴鏇存柊鐨勮蹇嗚涓?杩戞湡"
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
      // 璋冨害鍣ㄦ彁绀猴細闀垮璇濇垨楂樻尝鍔ㄦ椂缁欒繎鏈熻蹇?1.5x 鍔犳潈
      const recencyBoost = (f: typeof a) =>
        hint.favorRecent && (now - new Date(f.updatedAt).getTime()) < RECENT_MS ? 1.5 : 1
      // 璋冨害鍣ㄦ彁绀猴細鎯呯华娉㈠姩鏃舵儏鎰熺浉鍏崇殑璁板繂锛圤UR_BOND, MOOD, VULNERABILITIES 绛夛級鍔犳潈
      const emotionBoost = (f: typeof a) =>
        hint.emotionalVolatility > 0.4 && ['OUR_BOND', 'MOOD', 'VULNERABILITIES', 'SELF_PERCEPTION'].includes(f.subcategory)
          ? 1 + hint.emotionalVolatility * 0.5
          : 1
      // 鏃堕棿鎰熺煡鍔犳潈锛圱1-T6锛?
      const temporalBoostA = temporalCtx ? computeTemporalBoost(a, temporalCtx) : 1.0
      const temporalBoostB = temporalCtx ? computeTemporalBoost(b, temporalCtx) : 1.0
      const sa = temporalBoostA * recencyBoost(a) * emotionBoost(a) * ((ta || saSem || saEmb || saVec || saAssoc || saTemporalSem) ? TRIGGER_MATCH_BOOST : 1) * this.factStore.scoreRelevance(a, now, currentValence, currentAff, queryEmbed)
      const sb = temporalBoostB * recencyBoost(b) * emotionBoost(b) * ((tb || sbSem || sbEmb || sbVec || sbAssoc || sbTemporalSem) ? TRIGGER_MATCH_BOOST : 1) * this.factStore.scoreRelevance(b, now, currentValence, currentAff, queryEmbed)
      return sb - sa
    })

    const memoryEcho = this.factStore.computeMemoryEcho(ranked)

    // 涓诲姩閬楀繕杩囨护锛歛void 浜嬪疄涓嶆敞鍏?Tier B锛堜絾鍙弬涓庢绱?鎺掑簭/memoryEcho锛?
    const injectable = ranked.filter(f => !f.sensitivity || f.sensitivity === 'normal')

    // 缁熶竴棰勭畻鎺у埗鍣細鎵€鏈夊瓙鍧椾粠鍚屼竴涓绠椾腑鍒嗛厤锛屾寜浼樺厛绾т緷娆″～鍏?
    // 浼樺厛绾э細鏍稿績璁板繂 > 浜嬪疄妫€绱?> chunk鐗囨 > 鐭ヨ瘑鍥捐氨 > 鎯呰妭璁板繂
    const header = '銆怲ier B 路 缁撴瀯鍖栬蹇嗕笌妫€绱㈢墖娈点€?
    let remaining = cap - header.length - 4 // reserve for newlines

    let temporalSemanticBlock = ''
    if (temporalSemanticHint && temporalSemanticHint.length + 2 <= remaining) {
      temporalSemanticBlock = temporalSemanticHint
      remaining -= temporalSemanticBlock.length + 2
    }

    // 1. 鏍稿績璁板繂锛堜紭鍏堢骇鏈€楂橈紝涓婇檺 2000 鎴栧墿浣欓绠楃殑涓€鍗婏級
    let coreBlock = ''
    const coreFacts = sessionId
      ? filterFactsForSession(this.factStore.getCoreFacts(), sessionId)
      : this.factStore.getCoreFacts()
    if (coreFacts.length > 0 && remaining > 100) {
      const coreBudget = Math.min(CORE_MEMORY_CHAR_BUDGET, Math.floor(remaining * 0.4))
      const coreLines: string[] = []
      let coreChars = 0
      for (const f of coreFacts) {
        const line = normalizeAckemBrandText(`鈽?${f.subject}锛?{f.summary}`)
        if (coreChars + line.length + 2 > coreBudget) break
        coreLines.push(line)
        coreChars += line.length + 2
      }
      if (coreLines.length > 0) {
        coreBlock = ['銆愭牳蹇冭蹇嗐€?, ...coreLines].join('\n')
        remaining -= coreBlock.length + 2
      }
    }

    // 2. 浜嬪疄妫€绱㈣锛堜粠鍓╀綑棰勭畻涓垎閰嶏級
    // 缁撴瀯鍖栨敞鍏ワ細鍏宠仈鎵╂暎鏉ユ簮鏍囨敞 鈫?鏍囪锛屽府鍔?LLM 鐞嗚В璁板繂鏉ユ簮
    const lines: string[] = []
    for (const f of injectable) {
      const isAssoc = associationHits.some(s => s.id === f.id)
      const isTemporal = anchorResolvedFacts.some((s) => s.id === f.id)
      const isTemporalSemantic = temporalSemanticHits.some(s => s.id === f.id)
      let annotation = ''
      if (isAssoc) annotation = ' 鈫?鍏宠仈鎵╂暎'
      else if (isTemporalSemantic) annotation = ' 鈫?鏃堕棿璇箟'
      else if (isTemporal) annotation = ' 鈫?鏃堕棿閿氱偣'
      const line = normalizeAckemBrandText(`路 ${f.subject}锛?{f.summary}${annotation}`)
      if (remaining - (line.length + 2) < 200) break // 鑷冲皯鐣?200 缁欏悗缁潡
      if (line.length + 2 > remaining) break
      lines.push(line)
      remaining -= line.length + 2
    }

    // 3. Chunk 鐗囨
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

    // 4. 鐭ヨ瘑鍥捐氨锛堜綆浼樺厛绾э紝鐢ㄥ墿浣欑┖闂达級
    let kgBlock = ''
    if (this.kg && remaining > 150) {
      kgBlock = this.kg.buildContextBlock(query)
      if (kgBlock.length > remaining) {
        kgBlock = kgBlock.slice(0, remaining - 3) + '...'
      }
      if (kgBlock.length > 0) remaining -= kgBlock.length + 2
    }

    // 5. 鎯呰妭璁板繂锛堟渶浣庝紭鍏堢骇锛?
    let episodeBlock = ''
    let episodesUsed = 0
    if (this.episodicStore && remaining > 150) {
      this.episodicStore.load()
      let episodes = this.episodicStore.retrieve(query)
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
