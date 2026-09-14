import type { ToolCall } from '../../shared/types.js'
import { getMaxToolConcurrency, isConcurrencySafe } from './registry.js'

export type ToolBatch = {
  /** true = run blocks concurrently (up to max concurrency) */
  isConcurrencySafe: boolean
  calls: ToolCall[]
}

export function parseToolArguments(raw: string): {
  ok: boolean
  input: unknown
} {
  try {
    return { ok: true, input: raw ? JSON.parse(raw) : {} }
  } catch {
    return { ok: false, input: undefined }
  }
}

/**
 * Partition tool calls (Claude Code partitionToolCalls):
 * - consecutive concurrency-safe tools (per **parsed input**) → one parallel batch
 * - each non-safe tool → its own serial batch
 * - JSON parse failure → not concurrency-safe
 */
export function partitionToolCalls(calls: ToolCall[]): ToolBatch[] {
  const batches: ToolBatch[] = []
  for (const call of calls) {
    const parsed = parseToolArguments(call.function.arguments || '')
    const safe =
      parsed.ok && isConcurrencySafe(call.function.name, parsed.input)
    const last = batches[batches.length - 1]
    if (safe && last?.isConcurrencySafe) {
      last.calls.push(call)
    } else {
      batches.push({ isConcurrencySafe: safe, calls: [call] })
    }
  }
  return batches
}

/**
 * Run async tasks with a concurrency limit; results aligned to input order.
 * Mirrors CC `all(generators, maxConcurrency)` ordering guarantees for results array.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next
        next += 1
        results[i] = await fn(items[i]!, i)
      }
    }
  )
  await Promise.all(workers)
  return results
}

export type PreparedToolCall = {
  call: ToolCall
  name: string
  parsedInput: unknown
  /** If set, skip execute and use this as the tool result */
  early?: { ok: boolean; output: string }
}

export type ExecutedToolCall = {
  call: ToolCall
  name: string
  ok: boolean
  output: string
}

/**
 * Execute a prepared batch. Concurrent batches use mapPool; serial runs in order.
 * Results are always returned in the same order as `prepared`.
 */
export async function runPreparedBatch(
  prepared: PreparedToolCall[],
  concurrencySafe: boolean,
  execute: (p: PreparedToolCall) => Promise<{ ok: boolean; output: string }>
): Promise<ExecutedToolCall[]> {
  const runOne = async (p: PreparedToolCall): Promise<ExecutedToolCall> => {
    if (p.early) {
      return { call: p.call, name: p.name, ok: p.early.ok, output: p.early.output }
    }
    const result = await execute(p)
    return { call: p.call, name: p.name, ok: result.ok, output: result.output }
  }

  if (!concurrencySafe || prepared.length <= 1) {
    const out: ExecutedToolCall[] = []
    for (const p of prepared) {
      out.push(await runOne(p))
    }
    return out
  }

  return mapPool(prepared, getMaxToolConcurrency(), runOne)
}

/** Synthetic tool_result when aborted mid-batch (CC query abort path). */
export const ABORT_TOOL_RESULT = 'Tool execution aborted by user.'
