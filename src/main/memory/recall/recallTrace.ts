import type { RecallItem, RecallTrace } from '../contracts.js'
import type { RecallIntentKind } from './recallIntent.js'

export function emptyRecallTrace(degraded: string[] = []): RecallTrace {
  return {
    intent: [],
    elapsedMs: 0,
    degradedSources: degraded,
    candidateCounts: {},
    selected: [],
    filtered: []
  }
}

export function finalizeRecallTrace(
  startedMs: number,
  intents: RecallIntentKind[],
  candidateCounts: Record<string, number>,
  selected: RecallItem[],
  filtered: Array<{ id: string; reason: string }>,
  degradedSources: string[],
  timing?: { loadMs?: number; rankMs?: number; deadlineExceeded?: boolean }
): RecallTrace {
  const trace: RecallTrace = {
    intent: intents,
    elapsedMs: Math.max(0, Date.now() - startedMs),
    degradedSources,
    candidateCounts,
    selected: selected.map((s) => ({ id: s.id, source: s.source, score: s.score })),
    filtered
  }
  if (timing?.loadMs != null) trace.loadMs = timing.loadMs
  if (timing?.rankMs != null) trace.rankMs = timing.rankMs
  if (timing?.deadlineExceeded) {
    trace.deadlineExceeded = true
    if (!trace.degradedSources.includes('deadline_exceeded_no_sqlite_abort')) {
      trace.degradedSources = [...trace.degradedSources, 'deadline_exceeded_no_sqlite_abort']
    }
  }
  return trace
}
