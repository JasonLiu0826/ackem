import type { MemoryJobRunner } from '../contracts.js'
import { createMemoryJobRunner } from './memoryJobRunner.js'

const runners = new Map<string, MemoryJobRunner>()

export function getOrCreateMemoryJobRunner(
  dataRoot: string,
  factory?: () => MemoryJobRunner
): MemoryJobRunner {
  let runner = runners.get(dataRoot)
  if (!runner) {
    runner = factory?.() ?? createMemoryJobRunner({ dataRoot })
    runners.set(dataRoot, runner)
  }
  return runner
}

export function startMemoryJobRunner(dataRoot: string, factory?: () => MemoryJobRunner): MemoryJobRunner {
  const runner = getOrCreateMemoryJobRunner(dataRoot, factory)
  runner.start()
  return runner
}

export function stopMemoryJobRunner(dataRoot: string): void {
  const runner = runners.get(dataRoot)
  if (!runner) return
  runner.stop()
  runners.delete(dataRoot)
}

export function stopAllMemoryJobRunners(): void {
  for (const root of [...runners.keys()]) {
    stopMemoryJobRunner(root)
  }
}

/** Fire-and-forget single pass (e.g. right after turn.finalized); shares claim gate with poll. */
export function nudgeMemoryJobRunner(dataRoot: string): void {
  const runner = runners.get(dataRoot)
  if (!runner) return
  void runner.runOnce(new Date().toISOString())
}

export function resetMemoryJobRunnersForTests(): void {
  runners.clear()
}
