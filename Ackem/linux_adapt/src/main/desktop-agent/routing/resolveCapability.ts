import type { EmbeddingProvider } from '../../memory/embedding'
import { cosineSimilarity } from '../../memory/factEmbeddingCache'
import type { RouteIndex } from '../../embedding/types'
import {
  HIGH_CONFIDENCE_THRESHOLD,
  MID_CONFIDENCE_THRESHOLD
} from '../../embedding/types'
import type { DesktopAgentSettingsSlice } from '../../../shared/desktopAgent'
import {
  getDesktopAgentCapabilityDef,
  listRoutableDesktopAgentCapabilities,
  type DesktopAgentCapabilityMatch
} from '../../../shared/desktopAgentCapabilities'
import { detectInvestigationIntent } from '../investigation/intentRouter'
import { isDesktopAgentCleanupIntent } from '../../../shared/desktopAgentIntentGuards'

const indexByKey = new Map<string, RouteIndex>()

function cacheKey(dataRoot: string, settings: DesktopAgentSettingsSlice): string {
  return [
    dataRoot,
    settings.desktopAgentAllowAppControl,
    settings.desktopAgentAllowFileWrite,
    settings.desktopAgentAllowDocumentRead,
    settings.desktopAgentAllowDownload,
    settings.desktopAgentAllowDelete,
    settings.desktopAgentAllowInstall
  ].join('|')
}

export async function buildDesktopAgentCapabilityRouteIndex(
  provider: EmbeddingProvider,
  settings: DesktopAgentSettingsSlice
): Promise<RouteIndex> {
  const caps = listRoutableDesktopAgentCapabilities(settings)
  const allQueries: Array<{ extId: string; query: string }> = []
  for (const cap of caps) {
    for (const q of cap.exampleQueries) {
      allQueries.push({ extId: cap.id, query: q })
    }
  }
  const embeddings = await provider.embedBatch(allQueries.map((q) => q.query))
  return {
    entries: allQueries.map((q, i) => ({
      extensionId: q.extId,
      query: q.query,
      embedding: embeddings[i] ?? []
    }))
  }
}

export async function getDesktopAgentCapabilityRouteIndex(
  dataRoot: string,
  provider: EmbeddingProvider,
  settings: DesktopAgentSettingsSlice
): Promise<RouteIndex> {
  const key = cacheKey(dataRoot, settings)
  const cached = indexByKey.get(key)
  if (cached) return cached
  const index = await buildDesktopAgentCapabilityRouteIndex(provider, settings)
  indexByKey.set(key, index)
  return index
}

export function invalidateDesktopAgentCapabilityRouteIndex(dataRoot?: string): void {
  if (!dataRoot) {
    indexByKey.clear()
    return
  }
  for (const key of indexByKey.keys()) {
    if (key.startsWith(`${dataRoot}|`)) indexByKey.delete(key)
  }
}

function bestCapabilityFromEmbedding(
  queryEmbed: number[],
  index: RouteIndex
): { capabilityId: string; score: number; matchedQuery: string } | null {
  let best: { capabilityId: string; score: number; matchedQuery: string } | null = null
  for (const entry of index.entries) {
    if (!entry.embedding.length) continue
    const score = cosineSimilarity(queryEmbed, entry.embedding)
    if (score < MID_CONFIDENCE_THRESHOLD) continue
    if (!best || score > best.score) {
      best = { capabilityId: entry.extensionId, score, matchedQuery: entry.query }
    }
  }
  return best
}

function matchFromRegexFallback(userText: string): DesktopAgentCapabilityMatch | null {
  if (isDesktopAgentCleanupIntent(userText)) {
    const def = getDesktopAgentCapabilityDef('organize_files')
    if (def) {
      return {
        capabilityId: def.id,
        label: def.label,
        handler: def.handler,
        score: 0.55,
        matchedQuery: userText.trim(),
        routingHint: def.routingHint,
        source: 'regex_fallback'
      }
    }
  }

  const inv = detectInvestigationIntent(userText)
  if (inv?.templateId === 'games') {
    const def = getDesktopAgentCapabilityDef('investigate_games')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  if (inv?.templateId === 'documents') {
    const def = getDesktopAgentCapabilityDef('investigate_documents')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  if (/能做什么|你会什么|有什么功能|电脑助手.*功能/i.test(userText)) {
    const def = getDesktopAgentCapabilityDef('capability_help')!
    return {
      capabilityId: def.id,
      label: def.label,
      handler: def.handler,
      score: 0.5,
      matchedQuery: userText.trim(),
      routingHint: def.routingHint,
      source: 'regex_fallback'
    }
  }
  return null
}

export type ResolveDesktopAgentCapabilityInput = {
  dataRoot: string
  userText: string
  queryEmbed?: number[]
  settings: DesktopAgentSettingsSlice
  provider: EmbeddingProvider | null | undefined
}

export async function resolveDesktopAgentCapability(
  input: ResolveDesktopAgentCapabilityInput
): Promise<DesktopAgentCapabilityMatch | null> {
  const trimmed = input.userText.trim()
  if (!trimmed) return null

  if (input.provider?.ready() && input.queryEmbed?.length) {
    const index = await getDesktopAgentCapabilityRouteIndex(
      input.dataRoot,
      input.provider,
      input.settings
    )
    const best = bestCapabilityFromEmbedding(input.queryEmbed, index)
    if (best) {
      const def = getDesktopAgentCapabilityDef(best.capabilityId)
      if (def && best.score >= MID_CONFIDENCE_THRESHOLD) {
        if (
          isDesktopAgentCleanupIntent(trimmed) &&
          (def.handler === 'investigate_games' || def.handler === 'investigate_documents')
        ) {
          const organize = getDesktopAgentCapabilityDef('organize_files')
          if (organize) {
            return {
              capabilityId: organize.id,
              label: organize.label,
              handler: organize.handler,
              score: best.score,
              matchedQuery: trimmed,
              routingHint: organize.routingHint,
              source: 'embedding'
            }
          }
        }
        return {
          capabilityId: def.id,
          label: def.label,
          handler: def.handler,
          score: best.score,
          matchedQuery: best.matchedQuery,
          routingHint: def.routingHint,
          source: best.score >= HIGH_CONFIDENCE_THRESHOLD ? 'embedding' : 'embedding'
        }
      }
    }
  }

  return matchFromRegexFallback(trimmed)
}
