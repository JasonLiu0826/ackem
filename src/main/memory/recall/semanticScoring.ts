import type Database from 'better-sqlite3'
import { loadFactEmbeddings } from '../../db/repos/factEmbeddingsRepo.js'
import { embeddingIndexSignature } from '../embedding/signature.js'
import type { RecallCandidate } from './candidateSources.js'

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA * normB) || 1)
}

/** Optional hot-cache boost; missing provider or vectors preserves lexical fallback. */
export async function attachFactSemanticScores(
  dataRoot: string,
  db: Database.Database,
  queryText: string,
  candidates: RecallCandidate[]
): Promise<void> {
  if (!candidates.some((c) => c.source === 'fact')) return
  const { getCachedEmbeddingProvider } = await import('../../engineCache.js')
  const provider = getCachedEmbeddingProvider(dataRoot)
  if (!provider?.ready()) return
  const vectors = loadFactEmbeddings(db, embeddingIndexSignature(provider.name()))
  if (vectors.size === 0) return
  try {
    const queryVector = await provider.embed(queryText)
    for (const candidate of candidates) {
      if (candidate.source !== 'fact') continue
      const vector = vectors.get(candidate.id.slice('fact:'.length))
      if (vector) candidate.semanticScore = cosine(queryVector, vector)
    }
  } catch {
    // Embedding outage must not prevent exact action/status or lexical recall.
  }
}
