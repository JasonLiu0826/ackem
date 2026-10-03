/**
 * Per dataRoot in-process gate: one claim wave at a time; at most N handlers in flight;
 * at most one handler per session. Poll, nudge, and manual runOnce share this gate.
 */

type Waiter = {
  sessionId: string
  resolve: () => void
}

const coordinators = new Map<string, JobRunCoordinator>()

export type JobRunCoordinatorSnapshot = {
  globalInFlight: number
  sessionsInFlight: string[]
  maxGlobal: number
}

export class JobRunCoordinator {
  private tickChain: Promise<void> = Promise.resolve()
  private globalInFlight = 0
  private readonly sessionsInFlight = new Set<string>()
  private readonly waiters: Waiter[] = []

  constructor(readonly maxGlobal: number) {}

  snapshot(): JobRunCoordinatorSnapshot {
    return {
      globalInFlight: this.globalInFlight,
      sessionsInFlight: [...this.sessionsInFlight],
      maxGlobal: this.maxGlobal
    }
  }

  /** Serializes claim waves; errors in one tick do not break the chain. */
  scheduleTick<T>(run: () => Promise<T>): Promise<T> {
    const next = this.tickChain.then(() => run())
    this.tickChain = next.then(() => undefined).catch(() => undefined)
    return next
  }

  async acquire(sessionId: string): Promise<void> {
    if (this.canAcquire(sessionId)) {
      this.take(sessionId)
      return
    }
    await new Promise<void>((resolve) => {
      this.waiters.push({ sessionId, resolve })
    })
  }

  release(sessionId: string): void {
    if (this.globalInFlight <= 0) return
    this.globalInFlight -= 1
    this.sessionsInFlight.delete(sessionId)
    this.drainWaiters()
  }

  private canAcquire(sessionId: string): boolean {
    return this.globalInFlight < this.maxGlobal && !this.sessionsInFlight.has(sessionId)
  }

  private take(sessionId: string): void {
    this.globalInFlight += 1
    this.sessionsInFlight.add(sessionId)
  }

  private drainWaiters(): void {
    for (let i = 0; i < this.waiters.length; ) {
      const w = this.waiters[i]!
      if (!this.canAcquire(w.sessionId)) {
        i += 1
        continue
      }
      this.waiters.splice(i, 1)
      this.take(w.sessionId)
      w.resolve()
    }
  }
}

export function getJobRunCoordinator(dataRoot: string, maxGlobal = 2): JobRunCoordinator {
  const key = `${dataRoot}:${maxGlobal}`
  let c = coordinators.get(key)
  if (!c) {
    c = new JobRunCoordinator(maxGlobal)
    coordinators.set(key, c)
  }
  return c
}

export function resetJobRunCoordinatorsForTests(): void {
  coordinators.clear()
}
