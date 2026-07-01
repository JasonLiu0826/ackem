// [ingest] — 记忆摄入管线
// 职责：抽事实、写入 FactStore、自动退役
// 引用：./factExtractor, ./factStore, ./memoryBinding, ../engine/types, ../llmClient
import { captureEmotionalContext } from './memoryBinding'
import { FactExtractor } from './factExtractor'
import { MemoryConsolidator } from './consolidator'
import { EpisodeExtractor } from './episodeExtractor'
import { extractTriples } from './tripleExtractor'
import { MemorySelfEditor } from './memorySelfEditor'
import { exportMemoryArchive } from './archiveExporter'
import { AUTO_RETIRE_CHECK_INTERVAL, CONTRADICTION_SIMILARITY_THRESHOLD, EPISODE_INTERVAL_TURNS, EPISODE_INTERVAL_TURNS_LOW, EPISODE_EMOTION_INTENSITY_THRESHOLD } from '../engine/ackemParams'
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
  /** 同步阶段已写入轻量规则事实，异步 job 仅跑 LLM 抽取 */
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
    /** 关联索引（冷启动关联写入） */
    associationIndex?: AssociationIndex,
    /** 事实 Embedding 缓存（冷启动关联用） */
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

      // 自动生成触发词（LLM 只输出关键词，Intl.Segmenter 补齐缺失的）
      const autoTriggers = extractTriggers(f.subject, f.summary)
      const mergedTriggers = [...new Set([...(f.triggers ?? []), ...autoTriggers])]

      // 名字降权：新增名字前，同 subject 的旧名字 weight-1
      if (f.subcategory === 'BASIC_PROFILE' &&
          (f.subject === '用户姓名' || f.subject === '用户昵称')) {
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

      // FIX-022：时间锚点 — 放宽 recurring/relationship/milestone 写入门槛
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
      // C: 从事实中提取三元组加入知识图谱
      if (kg) {
        const triples = extractTriples(f.subject, f.summary, added.id, {
          subcategory: f.subcategory,
          ageMeta: (f as { ageMeta?: { birthdayMMDD?: string } }).ageMeta,
        })
        for (const t of triples) {
          kg.add(t)
        }
      }

      // C3: 批量矛盾检测 — 收集所有待检查的事实对
      if (added.factLayer !== 'consolidated') {
        const similar = factStore.findSimilarFacts(f.subcategory, f.subject, f.summary, CONTRADICTION_SIMILARITY_THRESHOLD)
          .filter(s => s.id !== added.id)
        for (const s of similar) {
          pendingContradictions.push({ newFact: added, existing: s })
        }

        // 矛盾检测扩大范围：高权重事实（≥1.5）额外用 Embedding 预筛候选
        if (factEmbeddingCache && (f.weight ?? 0) >= 1.5) {
          const addedEmbed = factEmbeddingCache.get(added.id)
          if (addedEmbed) {
            const allActive = factStore.listActive()
            for (const existing of allActive) {
              if (existing.id === added.id) continue
              if (similar.some(s => s.id === existing.id)) continue // 已在 Jaccard 候选里
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

    // FIX-025：冷启动关联 — 用 result.fact.id + strengthenOrCreate/足够强度 add
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

    // C3: 批量执行矛盾检测（一次 LLM 调用处理多对，而非逐对调用）
    if (pendingContradictions.length > 0) {
      const editor = new MemorySelfEditor()
      try {
        await editor.batchResolve(pendingContradictions, factStore, llm)
      } catch { /* self-edit is best-effort */ }
    }
    if (totalTurnsForRetire > 0 && totalTurnsForRetire % AUTO_RETIRE_CHECK_INTERVAL === 0) {
      factStore.autoRetireExpired()
      // 每 10 轮自动导出人类可读的记忆档案
      try {
        exportMemoryArchive(dataRoot, factStore, episodicStore)
      } catch { /* export is best-effort */ }
    }
    // C2: 每 50 轮压实退役事实，防止数组无限增长
    if (totalTurnsForRetire > 0 && totalTurnsForRetire % 50 === 0) {
      factStore.compactFacts()
      // O10：低频场景关联增强 — 为孤儿事实补建关联
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
    // O3: 记忆整合/反思 — ingest 写入后再评估，保证本轮新事实纳入候选
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

    // FIX-015：镜中记忆 + 存量事实矛盾 — ingest 后按间隔自动检测
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

    // 情节记忆 — 自适应频率：取周期内最大情绪强度（非当前轮）
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
      episodeEmotionMax = 0 // 重置周期最大情绪
    }
  }
}

/** 情节周期内最大情绪强度（自适应频率用） */
let episodeEmotionMax = 0
