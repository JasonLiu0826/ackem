/** Independent backoff schedule (ms) after failed attempts 1…5; blueprint Task 9. */
export const JOB_BACKOFF_MS = [1_000, 5_000, 30_000, 300_000, 1_800_000] as const

export const DEFAULT_JOB_MAX_ATTEMPTS = 5

export function nextBackoffIso(fromIso: string, attemptsAfterFailure: number): string {
  const idx = Math.min(Math.max(attemptsAfterFailure, 1), JOB_BACKOFF_MS.length) - 1
  const delay = JOB_BACKOFF_MS[idx]!
  return new Date(Date.parse(fromIso) + delay).toISOString()
}
