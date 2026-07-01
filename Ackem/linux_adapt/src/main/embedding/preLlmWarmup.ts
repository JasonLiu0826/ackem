/**
 * Pre-LLM Embedding 预热与模块级缓存（锚点 / 时间语义 / profile / createTool）
 */

import type { EmbeddingProvider } from '../memory/embedding'
import {
  buildAnchorVectors,
  buildProfileAnchors,
  buildCreateToolAnchor,
} from './anchorVectors'
import { buildTemporalEmbeddings } from '../memory/temporalSignalExtractor'
import {
  buildFatherReferenceEmbeddings,
  FATHER_REFERENCE_ANCHORS,
  FATHER_REFERENCE_CALIBRATION,
  FATHER_REFERENCE_NEUTRAL_ANCHORS,
  loadCreatorMemoryStore,
  type FatherReferenceCluster,
} from '../canon/creatorMemory'
import type { AnchorVectors, ProfileAnchors } from './types'

let cachedAnchorVectors: AnchorVectors | null = null
let cachedProfileAnchors: ProfileAnchors | null = null
let cachedCreateToolAnchor: number[] | null = null
let cachedTemporalEmbeddings: Map<string, number[]> | null = null
let cachedFatherReferenceEmbeddings: Map<
  string,
  { cluster: FatherReferenceCluster; vector: number[] }
> | null = null
let cachedFatherReferenceAnchorSig = ''
let cachedCreatorEntryEmbeddings: Map<string, number[]> | null = null
let cachedCreatorMemorySig = ''
let cachedProviderSig = ''

export function invalidatePreLlmEmbeddingCache(): void {
  cachedAnchorVectors = null
  cachedProfileAnchors = null
  cachedCreateToolAnchor = null
  cachedTemporalEmbeddings = null
  cachedFatherReferenceEmbeddings = null
  cachedFatherReferenceAnchorSig = ''
  cachedCreatorEntryEmbeddings = null
  cachedCreatorMemorySig = ''
  cachedProviderSig = ''
}

export async function getCachedAnchorVectors(
  provider: EmbeddingProvider
): Promise<AnchorVectors> {
  const sig = provider.name()
  if (cachedAnchorVectors && cachedProviderSig === sig) {
    return cachedAnchorVectors
  }
  cachedAnchorVectors = await buildAnchorVectors(provider)
  cachedProfileAnchors = await buildProfileAnchors(provider)
  cachedCreateToolAnchor = await buildCreateToolAnchor(provider)
  cachedProviderSig = sig
  return cachedAnchorVectors
}

export function getCachedProfileAnchors(): ProfileAnchors | null {
  return cachedProfileAnchors
}

export function getCachedCreateToolAnchor(): number[] | null {
  return cachedCreateToolAnchor
}

export async function getCachedTemporalEmbeddings(
  provider: EmbeddingProvider
): Promise<Map<string, number[]>> {
  const sig = provider.name()
  if (cachedTemporalEmbeddings && cachedProviderSig === sig) {
    return cachedTemporalEmbeddings
  }
  cachedTemporalEmbeddings = await buildTemporalEmbeddings(provider)
  if (cachedProviderSig === '') cachedProviderSig = sig
  return cachedTemporalEmbeddings
}

export async function getCachedFatherReferenceEmbeddings(
  provider: EmbeddingProvider
): Promise<Map<string, { cluster: FatherReferenceCluster; vector: number[] }>> {
  const sig = provider.name()
  const anchorSig = [
    ...FATHER_REFERENCE_ANCHORS.ackem_creator,
    ...FATHER_REFERENCE_ANCHORS.user_family,
    ...FATHER_REFERENCE_NEUTRAL_ANCHORS,
    ...FATHER_REFERENCE_CALIBRATION.ackem_creator,
    ...FATHER_REFERENCE_CALIBRATION.user_family,
    ...FATHER_REFERENCE_CALIBRATION.neutral,
  ].join('\n')
  if (
    cachedFatherReferenceEmbeddings &&
    cachedProviderSig === sig &&
    cachedFatherReferenceAnchorSig === anchorSig
  ) {
    return cachedFatherReferenceEmbeddings
  }
  cachedFatherReferenceEmbeddings = await buildFatherReferenceEmbeddings(provider)
  cachedFatherReferenceAnchorSig = anchorSig
  if (cachedProviderSig === '') cachedProviderSig = sig
  return cachedFatherReferenceEmbeddings
}

/** 创造者记忆条目 embedding（按 dataRoot + store 版本缓存） */
export async function getCachedCreatorEntryEmbeddings(
  provider: EmbeddingProvider,
  dataRoot: string
): Promise<Map<string, number[]>> {
  const store = loadCreatorMemoryStore(dataRoot)
  const sig = `${provider.name()}::${store.version}::${store.entries.length}::${store.seededAt ?? ''}`
  if (cachedCreatorEntryEmbeddings && cachedCreatorMemorySig === sig) {
    return cachedCreatorEntryEmbeddings
  }
  const map = new Map<string, number[]>()
  if (!provider.ready() || store.entries.length === 0) {
    cachedCreatorEntryEmbeddings = map
    cachedCreatorMemorySig = sig
    return map
  }
  const texts = store.entries.map((e) => `${e.title} ${e.content}`)
  try {
    const vectors = await provider.embedBatch(texts)
    for (let i = 0; i < store.entries.length; i++) {
      const vec = vectors[i]
      if (vec?.length) map.set(store.entries[i].id, vec)
    }
  } catch {
    for (const entry of store.entries) {
      try {
        const vec = await provider.embed(`${entry.title} ${entry.content}`)
        if (vec.length) map.set(entry.id, vec)
      } catch { /* skip */ }
    }
  }
  cachedCreatorEntryEmbeddings = map
  cachedCreatorMemorySig = sig
  return map
}

/** 启动时预热：锚点 + 时间锚点 + 父亲指称 + Canon-M 条目 embedding（幂等） */
export async function warmupPreLlmEmbeddings(
  provider: EmbeddingProvider,
  dataRoot?: string
): Promise<void> {
  if (!provider.ready()) return
  const tasks: Array<Promise<unknown>> = [
    getCachedAnchorVectors(provider),
    getCachedTemporalEmbeddings(provider),
    getCachedFatherReferenceEmbeddings(provider),
  ]
  if (dataRoot) {
    tasks.push(getCachedCreatorEntryEmbeddings(provider, dataRoot))
  }
  await Promise.all(tasks)
}
