// [embeddingReadiness] — embedding 预热就绪状态机（机器状态，文案走 i18n）

export type EmbeddingReadinessPhase =
  | 'idle'
  | 'loading_provider'
  | 'syncing_facts'
  | 'warming_prellm'
  | 'ready'
  | 'degraded'

export type EmbeddingReadinessSnapshot = {
  phase: EmbeddingReadinessPhase
  progress: number
  providerReady: boolean
  factEmbeddingsReady: boolean
  preLlmWarmReady: boolean
  error?: string
}

const PHASE_PROGRESS: Record<EmbeddingReadinessPhase, number> = {
  idle: 0,
  loading_provider: 0.15,
  syncing_facts: 0.5,
  warming_prellm: 0.85,
  ready: 1,
  degraded: 1,
}

let snapshot: EmbeddingReadinessSnapshot = {
  phase: 'idle',
  progress: 0,
  providerReady: false,
  factEmbeddingsReady: false,
  preLlmWarmReady: false,
}

const listeners = new Set<(snap: EmbeddingReadinessSnapshot) => void>()

export function getEmbeddingReadiness(): EmbeddingReadinessSnapshot {
  return { ...snapshot }
}

export function isEmbeddingReadyForChat(): boolean {
  return snapshot.phase === 'ready' || snapshot.phase === 'degraded'
}

export function onReadinessChange(cb: (snap: EmbeddingReadinessSnapshot) => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

function notifyReadinessChanged(): void {
  const snap = getEmbeddingReadiness()
  for (const cb of listeners) cb(snap)
}

export function resetEmbeddingReadiness(): void {
  snapshot = {
    phase: 'idle',
    progress: 0,
    providerReady: false,
    factEmbeddingsReady: false,
    preLlmWarmReady: false,
  }
  notifyReadinessChanged()
}

export function setEmbeddingPhase(
  phase: EmbeddingReadinessPhase,
  patch: Partial<Omit<EmbeddingReadinessSnapshot, 'phase' | 'progress'>> = {}
): void {
  snapshot = {
    ...snapshot,
    ...patch,
    phase,
    progress: PHASE_PROGRESS[phase],
  }
  notifyReadinessChanged()
}
