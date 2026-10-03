import { getDatabase } from '../../db/database.js'
import { kvGet, kvSet } from '../../db/repos/kv.js'
import { JOB_TYPE_ACTION_RECONCILE } from '../derivation/derivationVersion.js'
import { JOB_EFFECT_APPLIED } from '../jobs/jobEffectKeys.js'

const NS = 'memory_metrics'
const RECALL_SAMPLES = 'recall_latency_samples_v1'
const TX_SAMPLES = 'transaction_latency_samples_v1'
const MAX_SAMPLES = 64

function parseSamples(raw: string | null): number[] {
  if (!raw?.trim()) return []
  try {
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return []
    return arr.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
  } catch {
    return []
  }
}

function appendSample(dataRoot: string, key: string, ms: number): void {
  const samples = parseSamples(kvGet(dataRoot, NS, key))
  samples.push(Math.max(0, ms))
  while (samples.length > MAX_SAMPLES) samples.shift()
  kvSet(dataRoot, NS, key, JSON.stringify(samples))
}

export function recordRecallLatencySample(dataRoot: string, elapsedMs: number): void {
  appendSample(dataRoot, RECALL_SAMPLES, elapsedMs)
}

export function recordTransactionLatencySample(dataRoot: string, elapsedMs: number): void {
  appendSample(dataRoot, TX_SAMPLES, elapsedMs)
}

/** Capture elapsed at call site; persist sample asynchronously (no import/wait skew). */
export function scheduleRecallLatencySample(dataRoot: string, elapsedMs: number): void {
  const ms = Math.max(0, elapsedMs)
  queueMicrotask(() => recordRecallLatencySample(dataRoot, ms))
}

export function scheduleTransactionLatencySample(dataRoot: string, elapsedMs: number): void {
  const ms = Math.max(0, elapsedMs)
  queueMicrotask(() => recordTransactionLatencySample(dataRoot, ms))
}

export function percentile95(samples: number[]): number | undefined {
  if (samples.length === 0) return undefined
  const sorted = [...samples].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[idx]
}

export function readRecallP95Ms(dataRoot: string): number | undefined {
  return percentile95(parseSamples(kvGet(dataRoot, NS, RECALL_SAMPLES)))
}

export function readTransactionP95Ms(dataRoot: string): number | undefined {
  return percentile95(parseSamples(kvGet(dataRoot, NS, TX_SAMPLES)))
}

/** Derived from persisted reconcile job `applied` effects (not a separate KV counter). */
export function readActionReconcileCount(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c FROM memory_job_effects
       WHERE job_type = ? AND effect_key = ?`
    )
    .get(JOB_TYPE_ACTION_RECONCILE, JOB_EFFECT_APPLIED) as { c: number } | undefined
  return row?.c ?? 0
}
