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
    return process.env.Ackem_TEST_DATA_ROOT ?? ''
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

  // 浠庤蹇嗗簱鎵炬渶鐩稿叧鐨勮繎鏈熶簨瀹烇紝鐢ㄤ簬涓€у寲鎬濈华
  let relatedFact: MemoryFact | undefined
  try {
    const store = new FactStore(defaultFactsPath(input.dataRoot))
    store.load()
    const active = store.listActive().slice(0, 20)
    if (active.length > 0 && store._embeddingCache && store._embeddingCache.size > 0) {
      const embeds = active.map(f => store._embeddingCache!.get(f.id) ?? [])
      // 鎵?鏈€涓嶉棽鑱?鐨勪簨瀹烇紙鏈€楂樻潈閲?脳 鏈€寮烘儏鎰熷己搴︾殑浣滀负棣栭€夛級
      let best = active[0], bestScore = 0
      for (const f of active) {
        const s = (f.weight / 3) * f.emotionalContext.intensity * f.selfRelevance
        if (s > bestScore) { bestScore = s; best = f }
      }
      relatedFact = best
    }
  } catch { /* 闄嶇骇 */ }

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
