// [ingest] 鈥?璁板繂鎽勫叆绠＄嚎
// 鑱岃矗锛氭娊浜嬪疄銆佸啓鍏?FactStore銆佽嚜鍔ㄩ€€褰?
// 寮曠敤锛?/factExtractor, ./factStore, ./memoryBinding, ../engine/types, ../llmClient
import { captureEmotionalContext } from './memoryBinding'
import { FactExtractor } from './factExtractor'
import { MemoryConsolidator } from './consolidator'
import { EpisodeExtractor } from './episodeExtractor'
import { extractTriples } from './tripleExtractor'
import { MemorySelfEditor } from './memorySelfEditor'
import { exportMemoryArchive } from './archiveExporter'
import { AUTO_RETIRE_CHECK_INTERVAL, CONTRADICTION_SIMILARITY_THRESHOLD, EPISODE_INTERVAL_TURNS, EPISODE_INTERVAL_TURNS_LOW, EPISODE_EMOTION_INTENSITY_THRESHOLD } from '../engine/AckemParams'
import { getLastConsolidationTurn, setLastConsolidationTurn } from '../engine/state-persistence'
import { traceLatest } from '../engine/tracer'
import { countRawActiveFactsInStore, evaluateAutoConsolidation } from './autoConsolidationPolicy'
import { runAutoMirrorAndContradictionCheck } from './autoMirrorCheck'
import { detectAnchorType, shouldWriteTemporalAnchor, writeTemporalAnchor } from './temporalAnchorPolicy'
import type { FactStore } from './factStore'
import type { EpisodicStore } from './episodicStore'
import type { KnowledgeGraph } from './knowledgeGraph'
import type { L1State, EmotionState, LlmClient, MemoryFact } from '../engine/types'
import type { AssociationIndex } from './associationIndex'
import { cosineSimilarity } from './factEmbeddingCache'
import { seedAssociationsForNewFacts } from './associationColdStart'
import { extractTriggers } from './triggerExtractor'
import { vetCreatorContradictingFact } from '../canon/canonCreatorIngestGuard'
import { filterExtractedUserFacts } from './userFactGuard'
import { createLogger } from '../logger'
import type { AdultMemoryPrivacyLevel } from '../prompt/adult-mode'

const log = createLogger('ingest')

export type PrefetchedFact = {
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers?: string[]
}

export type IngestTurnOptions = {
  skipLlmExtraction?: boolean
  prefetchedFacts?: PrefetchedFact[]
  /** 鍚屾闃舵宸插啓鍏ヨ交閲忚鍒欎簨瀹烇紝寮傛 job 浠呰窇 LLM 鎶藉彇 */
  lightDraftsFromSync?: boolean
  adultPrivacyLevel?: AdultMemoryPrivacyLevel
}

export class MemoryIngestPipeline {
  private readonly extractor = new FactExtractor()
  private readonly episodeExtractor = new EpisodeExtractor()

  async afterTurnAsync(
    dataRoot: string,
    sessionId: string,
    turnIndex: number,
    userMsg: string,
    companionMsg: string,
    locale: string,
    llm: LlmClient,
    l1: L1State,
    l2: EmotionState,
    factStore: FactStore,
    totalTurnsForRetire: number,
    episodicStore?: EpisodicStore,
    /** Recent exchanges (user+assistant pairs) for episode generation */
    recentExchangesForEpisode?: Array<{ user: string; assistant: string }>,
    kg?: KnowledgeGraph,
    /** 鍏宠仈绱㈠紩锛堝喎鍚姩鍏宠仈鍐欏叆锛?*/
    associationIndex?: AssociationIndex,
    /** 浜嬪疄 Embedding 缂撳瓨锛堝喎鍚姩鍏宠仈鐢級 */
    factEmbeddingCache?: Map<string, number[]>,
    options?: IngestTurnOptions
  ): Promise<void> {
    type ExtractedFactRow = {
      domain: string
      subcategory: string
      subject: string
      summary: string
      weight?: number
      confidence?: number
      selfRelevance?: number
      triggers?: string[]
    }

    let ex: { facts: ExtractedFactRow[] }
    if (options?.prefetchedFacts?.length) {
      ex = { facts: options.prefetchedFacts }
    } else if (options?.skipLlmExtraction) {
      ex = { facts: [] }
    } else {
      ex = await this.extractor.extract(
        userMsg,
        companionMsg,
        turnIndex,
        sessionId,
        locale,
        llm,
        l1,
        l2
      )
    }

    if (options?.lightDraftsFromSync) {
      factStore.load()
      const existingThisTurn = factStore
        .listActive()
        .filter((f) => f.sourceTurnIndex === turnIndex && f.sourceSessionId === sessionId)
      ex.facts = ex.facts.filter(
        (f) =>
          !existingThisTurn.some(
            (e) => e.subcategory === f.subcategory && e.subject === f.subject
          )
      )
    }

    ex.facts = filterExtractedUserFacts(ex.facts, userMsg)
    const emo = captureEmotionalContext(l1, l2)
    factStore.load()
    const pendingContradictions: Array<{ newFact: MemoryFact; existing: MemoryFact }> = []
    const newFactsThisTurn: MemoryFact[] = []
    for (const f of ex.facts) {
      const canonVet = vetCreatorContradictingFact(f)
      if (canonVet.reject) {
        log.info('CANON-M-5 reject Tier B fact', {
          reason: canonVet.reason,
          subject: f.subject,
          summary: f.summary.slice(0, 80),
        })
        continue
      }

      // 鑷姩鐢熸垚瑙﹀彂璇嶏紙LLM 鍙緭鍑哄叧閿瘝锛孖ntl.Segmenter 琛ラ綈缂哄け鐨勶級
      const autoTriggers = extractTriggers(f.subject, f.summary)
      const mergedTriggers = [...new Set([...(f.triggers ?? []), ...autoTriggers])]

      // 鍚嶅瓧闄嶆潈锛氭柊澧炲悕瀛楀墠锛屽悓 subject 鐨勬棫鍚嶅瓧 weight-1
      if (f.subcategory === 'BASIC_PROFILE' &&
          (f.subject === '鐢ㄦ埛濮撳悕' || f.subject === '鐢ㄦ埛鏄电О')) {
        factStore.downgradeNameFacts(f.subject)
      }

      const result = factStore.addFactDetailed({
        domain: f.domain,
        subcategory: f.subcategory,
        subject: f.subject,
        summary: f.summary,
        weight: f.weight,
        confidence: f.confidence,
        selfRelevance: f.selfRelevance,
        triggers: mergedTriggers,
        sourceSessionId: sessionId,
        sourceTurnIndex: turnIndex,
        emotionalContext: emo,
        privacyLevel: options?.adultPrivacyLevel ?? 'normal',
        ageMeta: (f as any).ageMeta
      })

      // FIX-022锛氭椂闂撮敋鐐?鈥?鏀惧 recurring/relationship/milestone 鍐欏叆闂ㄦ
      if (shouldWriteTemporalAnchor({
        isNew: result.isNew,
        weight: f.weight ?? 0,
        intensity: emo.intensity,
        fact: result.fact,
        userMsg,
      })) {
        const anchorType = detectAnchorType(result.fact, userMsg)
        writeTemporalAnchor(dataRoot, result.fact, anchorType)
      }
      const added = result.fact
      if (result.isNew) {
        newFactsThisTurn.push(added)
      }
      // C: 浠庝簨瀹炰腑鎻愬彇涓夊厓缁勫姞鍏ョ煡璇嗗浘璋?
      if (kg) {
        const triples = extractTriples(f.subject, f.summary, added.id, {
          subcategory: f.subcategory,
          ageMeta: (f as { ageMeta?: { birthdayMMDD?: string } }).ageMeta,
        })
        for (const t of triples) {
          kg.add(t)
        }
      }

      // C3: 鎵归噺鐭涚浘妫€娴?鈥?鏀堕泦鎵€鏈夊緟妫€鏌ョ殑浜嬪疄瀵?
      if (added.factLayer !== 'consolidated') {
        const similar = factStore.findSimilarFacts(f.subcategory, f.subject, f.summary, CONTRADICTION_SIMILARITY_THRESHOLD)
          .filter(s => s.id !== added.id)
        for (const s of similar) {
          pendingContradictions.push({ newFact: added, existing: s })
        }

        // 鐭涚浘妫€娴嬫墿澶ц寖鍥达細楂樻潈閲嶄簨瀹烇紙鈮?.5锛夐澶栫敤 Embedding 棰勭瓫鍊欓€?
        if (factEmbeddingCache && (f.weight ?? 0) >= 1.5) {
          const addedEmbed = factEmbeddingCache.get(added.id)
          if (addedEmbed) {
            const allActive = factStore.listActive()
            for (const existing of allActive) {
              if (existing.id === added.id) continue
              if (similar.some(s => s.id === existing.id)) continue // 宸插湪 Jaccard 鍊欓€夐噷
              const existingEmbed = factEmbeddingCache.get(existing.id)
              if (!existingEmbed) continue
              const cosine = cosineSimilarity(addedEmbed, existingEmbed)
              if (cosine > 0.75) {
                pendingContradictions.push({ newFact: added, existing })
              }
            }
          }
        }
      }
    }

    // FIX-025锛氬喎鍚姩鍏宠仈 鈥?鐢?result.fact.id + strengthenOrCreate/瓒冲寮哄害 add
    if (associationIndex && newFactsThisTurn.length > 0) {
      try {
        seedAssociationsForNewFacts({
          newFacts: newFactsThisTurn,
          factStore,
          associationIndex,
          embedCache: factEmbeddingCache,
        })
      } catch { /* cold-start association is best-effort */ }
    }

    // C3: 鎵归噺鎵ц鐭涚浘妫€娴嬶紙涓€娆?LLM 璋冪敤澶勭悊澶氬锛岃€岄潪閫愬璋冪敤锛?
    if (pendingContradictions.length > 0) {
      const editor = new MemorySelfEditor()
      try {
        await editor.batchResolve(pendingContradictions, factStore, llm)
      } catch { /* self-edit is best-effort */ }
    }
    if (totalTurnsForRetire > 0 && totalTurnsForRetire % AUTO_RETIRE_CHECK_INTERVAL === 0) {
      factStore.autoRetireExpired()
      // 姣?10 杞嚜鍔ㄥ鍑轰汉绫诲彲璇荤殑璁板繂妗ｆ
      try {
        exportMemoryArchive(dataRoot, factStore, episodicStore)
      } catch { /* export is best-effort */ }
    }
    // C2: 姣?50 杞帇瀹為€€褰逛簨瀹烇紝闃叉鏁扮粍鏃犻檺澧為暱
    if (totalTurnsForRetire > 0 && totalTurnsForRetire % 50 === 0) {
      factStore.compactFacts()
      // O10锛氫綆棰戝満鏅叧鑱斿寮?鈥?涓哄鍎夸簨瀹炶ˉ寤哄叧鑱?
      if (associationIndex && factEmbeddingCache) {
        try {
          const orphans = factStore.listActive().filter(f =>
            !associationIndex!.getAssociations(f.id, 0.1).length
          )
          for (const orphan of orphans.slice(0, 3)) {
            const orphanEmb = factEmbeddingCache.get(orphan.id)
            if (!orphanEmb) continue
            for (const other of factStore.listActive()) {
              if (other.id === orphan.id) continue
              if (other.domain !== orphan.domain) continue
              const otherEmb = factEmbeddingCache.get(other.id)
              if (!otherEmb) continue
              const cosine = cosineSimilarity(orphanEmb, otherEmb)
              if (cosine > 0.7) {
                associationIndex.add({
                  fact_id_a: orphan.id,
                  fact_id_b: other.id,
                  association_type: 'thematic',
                  strength: 0.2
                })
                break
              }
            }
          }
        } catch { /* association rebuild is best-effort */ }
      }
    }
    // O3: 璁板繂鏁村悎/鍙嶆€?鈥?ingest 鍐欏叆鍚庡啀璇勪及锛屼繚璇佹湰杞柊浜嬪疄绾冲叆鍊欓€?
    if (totalTurnsForRetire > 0) {
      const rawFactCount = countRawActiveFactsInStore(factStore)
      const lastConsolidationTurn = getLastConsolidationTurn(dataRoot, sessionId)
      const turnsSinceConsolidation = totalTurnsForRetire - lastConsolidationTurn
      const recentTraces = traceLatest(turnsSinceConsolidation)
      if (evaluateAutoConsolidation({ turnsSinceConsolidation, rawFactCount, recentTraces })) {
        setLastConsolidationTurn(dataRoot, totalTurnsForRetire, sessionId)
        const consolidator = new MemoryConsolidator()
        try {
          await consolidator.consolidate(factStore, llm, emo, sessionId, turnIndex)
        } catch { /* consolidation is best-effort, don't block the pipeline */ }
      }
    }

    // FIX-015锛氶暅涓蹇?+ 瀛橀噺浜嬪疄鐭涚浘 鈥?ingest 鍚庢寜闂撮殧鑷姩妫€娴?
    if (totalTurnsForRetire > 0) {
      const selfFactAddedThisTurn = ex.facts.some(
        (f) => f.subcategory === 'SELF_PERCEPTION' || f.subcategory === 'OUR_BOND'
      )
      try {
        await runAutoMirrorAndContradictionCheck({
          dataRoot,
          sessionId,
          turn: totalTurnsForRetire,
          factStore,
          llm,
          selfFactAddedThisTurn,
        })
      } catch { /* mirror audit is best-effort */ }
    }

    // 鎯呰妭璁板繂 鈥?鑷€傚簲棰戠巼锛氬彇鍛ㄦ湡鍐呮渶澶ф儏缁己搴︼紙闈炲綋鍓嶈疆锛?
    episodeEmotionMax = Math.max(episodeEmotionMax, emo.intensity)
    const episodeInterval = episodeEmotionMax > EPISODE_EMOTION_INTENSITY_THRESHOLD
      ? EPISODE_INTERVAL_TURNS : EPISODE_INTERVAL_TURNS_LOW
    if (
      episodicStore &&
      recentExchangesForEpisode &&
      recentExchangesForEpisode.length >= 3 &&
      totalTurnsForRetire > 0 &&
      totalTurnsForRetire % episodeInterval === 0
    ) {
      try {
        const result = await this.episodeExtractor.extract(
          recentExchangesForEpisode,
          { start: turnIndex - recentExchangesForEpisode.length + 1, end: turnIndex },
          llm
        )
        if (result) {
          episodicStore.load()
          const prev = episodicStore.latest()
          episodicStore.add({
            summary: result.summary,
            emotionalIntensity: result.emotionalIntensity,
            dominantEmotion: result.dominantEmotion,
            keywords: result.keywords,
            prevEpisodeId: prev?.id ?? null,
            sourceSessionId: sessionId,
            startTurn: turnIndex - recentExchangesForEpisode.length + 1,
            endTurn: turnIndex
          })
        }
      } catch { /* episode generation is best-effort */ }
      episodeEmotionMax = 0 // 閲嶇疆鍛ㄦ湡鏈€澶ф儏缁?
    }
  }
}

/** 鎯呰妭鍛ㄦ湡鍐呮渶澶ф儏缁己搴︼紙鑷€傚簲棰戠巼鐢級 */
let episodeEmotionMax = 0
