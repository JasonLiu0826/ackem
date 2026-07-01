import { loadSettings } from '../../../../settings'
import { resolveDataRoot } from '../../../../paths'
import { loadState, saveState, defaultFullState } from '../../../../engine/state-persistence'
import { defaultPersonalitySlice } from '../../../../personalityPresets'
import { generateOfflineThoughts } from '../../../../engine/offline-thought'
import { traceLatest } from '../../../../engine/tracer'
import { FactStore, defaultFactsPath } from '../../../../memory/factStore'
import type { MemoryFact } from '../../../../engine/types'
import type { EngineSnapshot } from '../../../protocols'
import type { SkillHandler, SkillInvocation, SkillResult } from '../../types'
import { OFFLINE_THOUGHT_MANIFEST } from './manifest'

function resolveDataRootForSkill(): string {
  try {
    return resolveDataRoot(loadSettings())
  } catch {
    return process.env.ACKEM_TEST_DATA_ROOT ?? ''
  }
}

function loadFullState(dataRoot: string, sessionId: string) {
  const settings = loadSettings()
  return (
    loadState(dataRoot, sessionId) ??
    defaultFullState(defaultPersonalitySlice(settings))
  )
}

export async function runOfflineThoughtGeneration(input: {
  dataRoot: string
  sessionId: string
  snapshot?: EngineSnapshot
}): Promise<number> {
  const state = loadFullState(input.dataRoot, input.sessionId)
  if (state.counters.totalTurns <= 0) return 0

  const traces = traceLatest(10)
  if (traces.length === 0) return 0

  // 从记忆库找最相关的近期事实，用于个性化思绪
  let relatedFact: MemoryFact | undefined
  try {
    const store = new FactStore(defaultFactsPath(input.dataRoot))
    store.load()
    const active = store.listActive().slice(0, 20)
    if (active.length > 0 && store._embeddingCache && store._embeddingCache.size > 0) {
      const embeds = active.map(f => store._embeddingCache!.get(f.id) ?? [])
      // 找"最不闲聊"的事实（最高权重 × 最强情感强度的作为首选）
      let best = active[0], bestScore = 0
      for (const f of active) {
        const s = (f.weight / 3) * f.emotionalContext.intensity * f.selfRelevance
        if (s > bestScore) { bestScore = s; best = f }
      }
      relatedFact = best
    }
  } catch { /* 降级 */ }

  const thoughts = generateOfflineThoughts(traces, state.relationship, state.emotion, relatedFact)
  if (thoughts.length === 0) return 0

  state.offlineThoughts = thoughts
  saveState(input.dataRoot, state, input.sessionId)
  return thoughts.length
}

async function execute(invocation: SkillInvocation): Promise<SkillResult> {
  const start = Date.now()
  const dataRoot = resolveDataRootForSkill()
  const sessionId = invocation.snapshot.sessionId || 'default'
  const count = await runOfflineThoughtGeneration({ dataRoot, sessionId, snapshot: invocation.snapshot })

  return {
    ok: true,
    output: '',
    injectToContext: false,
    events: [],
    data: { count },
    durationMs: Date.now() - start
  }
}

export const offlineThoughtSkill: SkillHandler = {
  manifest: OFFLINE_THOUGHT_MANIFEST,
  execute
}
