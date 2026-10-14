export type CrashAction = { action: 'restart'; delayMs: number } | { action: 'error' }

const DELAYS_MS = [100, 400]

export class CrashLoopGuard {
  private crashes: number[] = []

  constructor(
    private readonly windowMs = 30_000,
    private readonly maxCrashes = 3
  ) {}

  recordReady(): void {
    this.crashes = []
  }

  recordCrash(now = Date.now()): CrashAction {
    const cutoff = now - this.windowMs
    this.crashes = this.crashes.filter((t) => t >= cutoff)
    this.crashes.push(now)
    if (this.crashes.length >= this.maxCrashes) {
      return { action: 'error' }
    }
    const delayMs = DELAYS_MS[Math.min(this.crashes.length - 1, DELAYS_MS.length - 1)]
    return { action: 'restart', delayMs }
  }
}
