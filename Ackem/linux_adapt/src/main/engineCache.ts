// [engineCache] — 引擎状态单例缓存
// 避免每次 IPC 调用重新构造 FactStore/EpisodicStore/KnowledgeGraph/VectorStore/retriever
// 使用 TTL + 脏标记模式，按数据根路径隔离

import { FactStore, defaultFactsPath } from './memory/factStore'
import { EpisodicStore, defaultEpisodesPath } from './memory/episodicStore'
import { KnowledgeGraph, defaultKgPath } from './memory/knowledgeGraph'
import { VectorStore } from './memory/vectorStore'
import { MemoryRetriever } from './memory/retriever'
import type { IndexSnapshot } from './indexer'
import type { EmbeddingProvider } from './memory/embedding'
import { createEmbeddingProvider, bootstrapBundledEmbeddingModels } from './memory/embedding'
import { AssociationIndex } from './memory/associationIndex'
import { loadSettings } from './settings'
import { getLocale } from './i18n'
import type { LocalModelId } from './memory/embedding/types'
import { createLogger } from './logger'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { getDatabase } from './db/database'
import {
  computeCorpusHash,
  deleteStaleFactEmbeddings,
  getStoredCorpusHash,
  loadFactEmbeddings,
  setStoredCorpusHash,
  upsertFactEmbeddings,
  deleteFactEmbeddingsForModel,
} from './db/repos/factEmbeddingsRepo'
import { warmupPreLlmEmbeddings, invalidatePreLlmEmbeddingCache } from './embedding/preLlmWarmup'
import {
  resetEmbeddingReadiness,
  setEmbeddingPhase,
} from './embedding/embeddingReadiness'
import type { MemoryFact } from './engine/types'

const log = createLogger('engine-cache')

const CACHE_TTL_MS = 30_000 // 30 秒后重新加载

/** 按 locale 返回默认 embedding 模型 */
function defaultModelForLocale(): LocalModelId {
  return getLocale() === 'en' ? 'bge-small-en' : 'bge-small-zh'
}

export interface EngineCacheEntry {
  store: FactStore
  epStore: EpisodicStore
  kg: KnowledgeGraph
  vs: VectorStore
  retriever: MemoryRetriever
  embeddingProvider: EmbeddingProvider | null
  lastBuilt: number
  dataRoot: string
}

const cacheMap = new Map<string, EngineCacheEntry>()

/** 全局 embedding provider 单例（按 dataRoot 隔离） */
const embeddingProviderMap = new Map<string, EmbeddingProvider>()
/** 全局关联索引单例（按 dataRoot 隔离） */
const associationIndexMap = new Map<string, AssociationIndex>()
/** 进行中的 provider 初始化（并发调用共享同一 Promise） */
const embeddingInitPromises = new Map<string, Promise<EmbeddingProvider | null>>()
/** 记录每个 dataRoot 当前 provider 对应的模型配置，用于检测切换 */
const embeddingConfigMap = new Map<string, string>()
/** 进行中的 fact embedding 构建 */
const factEmbedReadyPromises = new Map<string, Promise<void>>()
/** 后台模型切换重建 */
const embeddingRebuildPromises = new Map<string, Promise<void>>()
/** provider 作废后再预热（避免 UI 长期停在 loading_provider） */
const embeddingRewarmPromises = new Map<string, Promise<void>>()

function factText(f: MemoryFact): string {
  return `${f.subject} ${f.summary} ${f.triggers.join(' ')}`
}

function syncFactStoreEmbeddingCache(entry: EngineCacheEntry): void {
  entry.store._embeddingCache = entry.vs.syncDenseCacheToMap()
}

/** 构建 provider 配置签名（用于检测是否需要重建） */
function providerConfigSignature(settings: ReturnType<typeof loadSettings>): string {
  return `${settings.embeddingActiveModel ?? defaultModelForLocale()}|${settings.embeddingRemoteUrl ?? ''}|${settings.embeddingRemoteModel ?? ''}`
}

/** 获取或初始化 embedding provider。模型配置变更时自动重建；并发调用共享同一 init Promise。 */
export async function getOrInitEmbeddingProvider(dataRoot: string): Promise<EmbeddingProvider | null> {
  const settings = loadSettings()
  const sig = providerConfigSignature(settings)

  if (embeddingProviderMap.has(dataRoot) && embeddingConfigMap.get(dataRoot) === sig) {
    return embeddingProviderMap.get(dataRoot)!
  }

  const inFlight = embeddingInitPromises.get(dataRoot)
  if (inFlight) return inFlight

  const old = embeddingProviderMap.get(dataRoot)
  if (old) {
    old.dispose()
    embeddingProviderMap.delete(dataRoot)
    invalidatePreLlmEmbeddingCache()
    log.info('embedding provider 配置变更，重建', { oldName: old.name() })
    void scheduleEmbeddingRebuild(dataRoot)
  }

  const promise = loadEmbeddingProvider(dataRoot, settings, sig)
  embeddingInitPromises.set(dataRoot, promise)
  try {
    return await promise
  } finally {
    embeddingInitPromises.delete(dataRoot)
  }
}

async function loadEmbeddingProvider(
  dataRoot: string,
  settings: ReturnType<typeof loadSettings>,
  sig: string
): Promise<EmbeddingProvider | null> {
  try {
    bootstrapBundledEmbeddingModels(dataRoot)
    const activeModel = settings.embeddingActiveModel ?? defaultModelForLocale()
    const provider = await createEmbeddingProvider({
      dataRoot,
      activeModel,
      remote: settings.embeddingRemoteUrl ? {
        url: settings.embeddingRemoteUrl,
        model: settings.embeddingRemoteModel ?? 'text-embedding-v3',
        apiKey: settings.openforuApiKey || settings.openaiApiKey
      } : undefined
    })
    if (provider.ready()) {
      embeddingConfigMap.set(dataRoot, sig)
      embeddingProviderMap.set(dataRoot, provider)
      log.info('embedding provider 就绪', { name: provider.name(), dim: provider.dimension() })
      return provider
    }
    provider.dispose()
    embeddingConfigMap.delete(dataRoot)
    return null
  } catch (e) {
    const modelOnnx = join(dataRoot, 'models', settings.embeddingActiveModel ?? defaultModelForLocale(), 'model.onnx')
    const modelMissing = !existsSync(modelOnnx)
    log.warn('embedding provider 初始化失败', { error: String(e), modelMissing })
    embeddingConfigMap.delete(dataRoot)
    return null
  }
}

function wireVectorStoreEmbeddings(vs: VectorStore, provider: EmbeddingProvider): void {
  vs.embedQuery = (text: string) => provider.embed(text)
  vs.embedFacts = (texts: string[]) => provider.embedBatch(texts)
}

/** 确保事实稠密向量 + factStore._embeddingCache 就绪（SQLite 优先，增量 embed） */
export async function ensureFactEmbeddingsReady(entry: EngineCacheEntry): Promise<void> {
  const key = entry.dataRoot
  const existing = factEmbedReadyPromises.get(key)
  if (existing) return existing

  const promise = (async () => {
    const provider =
      entry.embeddingProvider ??
      embeddingProviderMap.get(key) ??
      (await getOrInitEmbeddingProvider(key))
    if (!provider?.ready()) return

    wireVectorStoreEmbeddings(entry.vs, provider)
    const activeFacts = entry.store.listActive().filter((f) => f.status === 'active')
    if (activeFacts.length === 0) return

    const modelSig = provider.name()
    const corpusHash = computeCorpusHash(activeFacts)
    const activeIds = new Set(activeFacts.map((f) => f.id))

    const db = getDatabase(key)
    let loaded = new Map<string, number[]>()

    if (db) {
      const storedHash = getStoredCorpusHash(db, modelSig)
      if (storedHash === corpusHash) {
        loaded = loadFactEmbeddings(db, modelSig)
        if (loaded.size >= activeFacts.length * 0.9) {
          entry.vs.loadDenseCacheFromMap(loaded, corpusHash)
          syncFactStoreEmbeddingCache(entry)
          deleteStaleFactEmbeddings(db, modelSig, activeIds)
          return
        }
      }
    }

    // 增量：已有向量 + 缺失 fact embed
    const merged = new Map(loaded)
    const missing = activeFacts.filter((f) => !merged.has(f.id) || merged.get(f.id)!.length === 0)
    if (missing.length > 0) {
      const texts = missing.map(factText)
      const embeds = await provider.embedBatch(texts)
      for (let i = 0; i < missing.length; i++) {
        if (embeds[i]?.length > 0) merged.set(missing[i].id, embeds[i])
      }
    }

    // 全量 rebuild fallback
    if (merged.size < activeFacts.length) {
      await entry.vs.buildDenseCache(activeFacts)
      syncFactStoreEmbeddingCache(entry)
    } else {
      entry.vs.loadDenseCacheFromMap(merged, corpusHash)
      syncFactStoreEmbeddingCache(entry)
    }

    if (db) {
      const toWrite = activeFacts
        .map((f) => {
          const vector = entry.store._embeddingCache?.get(f.id)
          return vector?.length ? { factId: f.id, updatedAt: f.updatedAt, vector } : null
        })
        .filter((x): x is { factId: string; updatedAt: string; vector: number[] } => x !== null)
      if (toWrite.length > 0) {
        upsertFactEmbeddings(db, modelSig, toWrite)
        setStoredCorpusHash(db, modelSig, corpusHash)
        deleteStaleFactEmbeddings(db, modelSig, activeIds)
      }
    }
  })().finally(() => {
    factEmbedReadyPromises.delete(key)
  })

  factEmbedReadyPromises.set(key, promise)
  return promise
}

/** 新事实入库后增量更新 embedding 缓存 */
export async function refreshFactEmbeddingsForIds(
  dataRoot: string,
  factIds: string[]
): Promise<void> {
  if (factIds.length === 0) return
  const entry = cacheMap.get(dataRoot)
  const provider = embeddingProviderMap.get(dataRoot)
  if (!entry || !provider?.ready()) return

  const facts = factIds
    .map((id) => entry.store.getById(id))
    .filter((f): f is MemoryFact => f !== undefined && f.status === 'active')
  if (facts.length === 0) return

  wireVectorStoreEmbeddings(entry.vs, provider)
  const texts = facts.map(factText)
  const embeds = await provider.embedBatch(texts)
  if (!entry.store._embeddingCache) entry.store._embeddingCache = new Map()
  const db = getDatabase(dataRoot)
  const modelSig = provider.name()
  const toWrite: Array<{ factId: string; updatedAt: string; vector: number[] }> = []

  for (let i = 0; i < facts.length; i++) {
    const vec = embeds[i]
    if (!vec?.length) continue
    entry.store._embeddingCache.set(facts[i].id, vec)
    toWrite.push({ factId: facts[i].id, updatedAt: facts[i].updatedAt, vector: vec })
  }

  // 重建 vs dense from map
  const corpusHash = computeCorpusHash(entry.store.listActive())
  entry.vs.loadDenseCacheFromMap(entry.store._embeddingCache, corpusHash)

  if (db && toWrite.length > 0) {
    upsertFactEmbeddings(db, modelSig, toWrite)
    setStoredCorpusHash(db, modelSig, corpusHash)
  }
}

/** 模型切换后后台重建全部事实 embedding */
export function scheduleEmbeddingRebuild(dataRoot: string): Promise<void> {
  const existing = embeddingRebuildPromises.get(dataRoot)
  if (existing) return existing

  const promise = (async () => {
    invalidatePreLlmEmbeddingCache()
    const db = getDatabase(dataRoot)
    const provider = await getOrInitEmbeddingProvider(dataRoot)
    if (!provider?.ready()) return

    if (db) deleteFactEmbeddingsForModel(db, provider.name())

    invalidateEngineCache(dataRoot)
    const entry = cacheMap.get(dataRoot)
    if (entry) {
      entry.embeddingProvider = provider
      wireVectorStoreEmbeddings(entry.vs, provider)
      factEmbedReadyPromises.delete(dataRoot)
      await ensureFactEmbeddingsReady(entry)
      await warmupPreLlmEmbeddings(provider, dataRoot)
      setEmbeddingPhase('ready', {
        providerReady: true,
        factEmbeddingsReady: true,
        preLlmWarmReady: true,
      })
    }
  })().finally(() => {
    embeddingRebuildPromises.delete(dataRoot)
  })

  embeddingRebuildPromises.set(dataRoot, promise)
  return promise
}

/** 启动时后台预热 embedding + 引擎缓存（与窗口加载并行，避免首句 pre-LLM 冷启） */
export async function warmupEmbeddingAtStartup(
  dataRoot: string,
  index: IndexSnapshot
): Promise<void> {
  setEmbeddingPhase('loading_provider')
  const provider = await getOrInitEmbeddingProvider(dataRoot)
  if (!provider?.ready()) {
    log.warn('embedding 启动预热跳过（provider 不可用）')
    setEmbeddingPhase('degraded', { error: 'provider_unavailable' })
    return
  }
  setEmbeddingPhase('syncing_facts', { providerReady: true })
  const entry = getOrCreateEngineCache(dataRoot, index)
  entry.embeddingProvider = provider
  wireVectorStoreEmbeddings(entry.vs, provider)
  await ensureFactEmbeddingsReady(entry)
  setEmbeddingPhase('warming_prellm', { factEmbeddingsReady: true })
  await warmupPreLlmEmbeddings(provider, dataRoot)
  setEmbeddingPhase('ready', { preLlmWarmReady: true })
  log.info('embedding 启动预热完成', { name: provider.name() })
}

/** provider 作废或切换后重新走完整预热（与启动时相同） */
export function scheduleEmbeddingRewarm(dataRoot: string): Promise<void> {
  const existing = embeddingRewarmPromises.get(dataRoot)
  if (existing) return existing

  const promise = (async () => {
    const { getOrRebuildIndex } = await import('./ipc/shared.js')
    await warmupEmbeddingAtStartup(dataRoot, getOrRebuildIndex())
  })()
    .catch((e) => {
      log.warn('embedding 再预热失败', { error: String(e) })
      const recovered = embeddingProviderMap.get(dataRoot)?.ready()
      if (recovered) {
        setEmbeddingPhase('ready', {
          providerReady: true,
          factEmbeddingsReady: true,
          preLlmWarmReady: true,
        })
        return
      }
      setEmbeddingPhase('degraded', { error: String(e) })
    })
    .finally(() => {
      embeddingRewarmPromises.delete(dataRoot)
    })

  embeddingRewarmPromises.set(dataRoot, promise)
  return promise
}

export function getOrCreateEngineCache(
  dataRoot: string,
  index: IndexSnapshot
): EngineCacheEntry {
  const key = dataRoot
  const now = Date.now()
  const existing = cacheMap.get(key)

  if (existing && (now - existing.lastBuilt) < CACHE_TTL_MS) {
    return existing
  }

  const store = new FactStore(defaultFactsPath(dataRoot))
  store.load()
  const epStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
  const kg = new KnowledgeGraph(defaultKgPath(dataRoot))
  kg.load()
  const vs = new VectorStore()
  vs.build(store.listActive())

  const cachedProvider = embeddingProviderMap.get(dataRoot) ?? null
  if (cachedProvider?.ready()) {
    wireVectorStoreEmbeddings(vs, cachedProvider)
  }
  if (!cachedProvider && !embeddingInitPromises.has(dataRoot)) {
    void getOrInitEmbeddingProvider(dataRoot).then(async (provider) => {
      if (provider) {
        const e = cacheMap.get(key)
        if (e) {
          e.embeddingProvider = provider
          wireVectorStoreEmbeddings(e.vs, provider)
          await ensureFactEmbeddingsReady(e)
        }
      }
    })
  }

  let assocIndex = associationIndexMap.get(dataRoot)
  if (!assocIndex) {
    assocIndex = new AssociationIndex()
    assocIndex.load(dataRoot)
    associationIndexMap.set(dataRoot, assocIndex)
  }

  const retriever = new MemoryRetriever(store, index, epStore, kg, vs, assocIndex)

  const entry: EngineCacheEntry = {
    store, epStore, kg, vs, retriever,
    embeddingProvider: cachedProvider,
    lastBuilt: now,
    dataRoot
  }
  cacheMap.set(key, entry)
  return entry
}

/** 强制刷新指定数据根的缓存 */
export function invalidateEngineCache(dataRoot: string): void {
  cacheMap.delete(dataRoot)
  factEmbedReadyPromises.delete(dataRoot)
}

/** 作废指定 dataRoot 的 embedding provider，下次引擎缓存重建时会重新创建 */
export function invalidateEmbeddingProvider(dataRoot: string): void {
  const provider = embeddingProviderMap.get(dataRoot)
  if (provider) {
    provider.dispose()
    embeddingProviderMap.delete(dataRoot)
    embeddingConfigMap.delete(dataRoot)
    embeddingInitPromises.delete(dataRoot)
    invalidatePreLlmEmbeddingCache()
    resetEmbeddingReadiness()
    setEmbeddingPhase('loading_provider')
    log.info('embedding provider 已作废', { dataRoot })
    void scheduleEmbeddingRewarm(dataRoot)
  }
}

/** 获取关联索引（与 retriever 共用单例） */
export function getAssociationIndex(dataRoot: string): AssociationIndex {
  let assocIndex = associationIndexMap.get(dataRoot)
  if (!assocIndex) {
    assocIndex = new AssociationIndex()
    assocIndex.load(dataRoot)
    associationIndexMap.set(dataRoot, assocIndex)
  }
  return assocIndex
}

/** 获取当前 embedding provider（只读，不触发初始化） */
export function getCachedEmbeddingProvider(dataRoot: string): EmbeddingProvider | null {
  return embeddingProviderMap.get(dataRoot) ?? null
}

/** 等待 embedding provider 就绪并刷新引擎缓存（E2E 测试用） */
export async function ensureEmbeddingReady(
  dataRoot: string,
  index: IndexSnapshot,
  timeoutMs = 45_000
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const provider = await getOrInitEmbeddingProvider(dataRoot)
    if (provider?.ready()) {
      invalidateEngineCache(dataRoot)
      const entry = getOrCreateEngineCache(dataRoot, index)
      entry.embeddingProvider = provider
      wireVectorStoreEmbeddings(entry.vs, provider)
      await ensureFactEmbeddingsReady(entry)
      await warmupPreLlmEmbeddings(provider, dataRoot)
      setEmbeddingPhase('ready', {
        providerReady: true,
        factEmbeddingsReady: true,
        preLlmWarmReady: true,
      })
      return true
    }
    getOrCreateEngineCache(dataRoot, index)
    await new Promise((r) => setTimeout(r, 400))
  }
  return false
}

/** 清空所有缓存 */
export function clearEngineCache(): void {
  cacheMap.clear()
  for (const provider of embeddingProviderMap.values()) {
    provider.dispose()
  }
  embeddingProviderMap.clear()
  embeddingInitPromises.clear()
  embeddingConfigMap.clear()
  associationIndexMap.clear()
  factEmbedReadyPromises.clear()
  embeddingRebuildPromises.clear()
  invalidatePreLlmEmbeddingCache()
  resetEmbeddingReadiness()
}

/** 获取当前缓存的 FactStore（如已缓存），否则返回 null */
export function getCachedFactStore(dataRoot: string): FactStore | null {
  return cacheMap.get(dataRoot)?.store ?? null
}
