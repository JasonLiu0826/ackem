import { createHash } from 'node:crypto'
import { FactStore, defaultFactsPath } from './factStore'
import { EpisodicStore, defaultEpisodesPath } from './episodicStore'
import { readableMemoryFacts, readableMemoryEpisodes } from './personalFacts'

type Source = { id: string; summary: string }
export type MemorySourceFence = {
  version: 1
  facts: Array<{ id: string; fingerprint: string }>
  episodes: Array<{ id: string; fingerprint: string }>
}
function fingerprint(source: Source): string {
  // Include revisions and content: imported legacy sources may not have a revision counter.
  return createHash('sha256').update(JSON.stringify(source)).digest('hex')
}
/** Capture the actual inputs before an asynchronous model call, not an entire profile epoch. */
export function captureMemorySourceFence(facts: readonly Source[], episodes: readonly Source[] = []): MemorySourceFence {
  return {
    version: 1,
    facts: facts.map(source => ({ id: source.id, fingerprint: fingerprint(source) })),
    episodes: episodes.map(source => ({ id: source.id, fingerprint: fingerprint(source) }))
  }
}
/** Current authorization and content must still match before publication or a retry. */
export function validateMemorySourceFence(dataRoot: string, fence: unknown): boolean {
  try {
    if (!fence || typeof fence !== 'object') return false
    const value = fence as MemorySourceFence
    if (value.version !== 1 || !Array.isArray(value.facts) || !Array.isArray(value.episodes)
      || value.facts.length + value.episodes.length > 1000) return false
    const facts = new FactStore(defaultFactsPath(dataRoot)); facts.load()
    const episodes = new EpisodicStore(defaultEpisodesPath(dataRoot)); episodes.load()
    const currentFacts = new Map(readableMemoryFacts(facts).map(source => [source.id, source]))
    const currentEpisodes = new Map(readableMemoryEpisodes(episodes, dataRoot).map(source => [source.id, source]))
    const matches = (sources: MemorySourceFence['facts'], current: Map<string, Source>) => sources.every(source => {
      if (!source || typeof source.id !== 'string' || typeof source.fingerprint !== 'string') return false
      const record = current.get(source.id)
      return !!record && fingerprint(record) === source.fingerprint
    })
    return matches(value.facts, currentFacts) && matches(value.episodes, currentEpisodes)
  } catch { return false }
}
