/**
 * Route v2 §6.1 — per-turn routing trace collector (阶段 0/1).
 *
 * Each routing layer marks one entry. Evidence carries rule identifiers only;
 * the mapper in chat/routeVerdict.ts guarantees no user text reaches the
 * ledger (Codex D1 desensitization rule).
 */

export type RouteLayerName =
  | 'redline'
  | 'gate0'
  | 'catalog'
  | 'deterministic'
  | 'residual'
  | 'probe'
  | 'normalize'
  | 'confirm'

export type RouteLayerMark = {
  layer: RouteLayerName
  ruleId?: string
  evidence?: string
  candidateCount?: number
}

/** A stored mark with its measured duration. */
export type RouteLayerEntry = RouteLayerMark & { ms: number }

export type RouteResidualOutcome = 'ok' | 'timeout' | 'invalid_json' | 'llm_error'

export type RouteTrace = {
  layers: RouteLayerEntry[]
  usedClassifier: boolean
  residualOutcome?: RouteResidualOutcome
  /** Marks one layer entry; `sinceMs` is a performance.now() captured before the work. */
  mark(mark: RouteLayerMark, sinceMs?: number): void
}

const MAX_EVIDENCE_CHARS = 40

function nowMs(): number {
  return typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now()
}

export function createRouteTrace(): RouteTrace {
  const layers: RouteLayerEntry[] = []
  return {
    layers,
    usedClassifier: false,
    mark(mark, sinceMs) {
      const entry: RouteLayerMark = { ...mark }
      if (entry.evidence && entry.evidence.length > MAX_EVIDENCE_CHARS) {
        entry.evidence = entry.evidence.slice(0, MAX_EVIDENCE_CHARS)
      }
      layers.push({
        ...entry,
        ms: sinceMs === undefined ? 0 : Math.max(0, Math.round(nowMs() - sinceMs))
      })
    }
  }
}

/** Shared clock helper so layers and callers agree on the time source. */
export function routeTraceClock(): number {
  return nowMs()
}
