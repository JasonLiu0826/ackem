import type { WebContents } from 'electron'

export type BubbleTask = () => Promise<void>

/**
 * Ordered UI emission across parallel wave generators.
 * Wave N tasks run only after wave N-1 is generation-complete and its queue is drained.
 */
export class TurnBubbleQueue {
  private readonly pending = new Map<number, BubbleTask[]>()
  private readonly generationComplete = new Set<number>()
  private displayCursor = 0
  private draining = false
  private aborted = false
  private readonly displayDone = new Set<number>()
  private readonly waveCount: number
  private readonly waiters: Array<() => void> = []

  constructor(
    private readonly webContents: WebContents,
    waveCount: number,
    private readonly signal: AbortSignal
  ) {
    this.waveCount = Math.max(1, waveCount)
    signal.addEventListener('abort', () => this.abort(), { once: true })
  }

  enqueue(waveIndex: number, task: BubbleTask): void {
    if (this.aborted || this.signal.aborted) return
    let list = this.pending.get(waveIndex)
    if (!list) {
      list = []
      this.pending.set(waveIndex, list)
    }
    list.push(task)
    void this.scheduleDrain()
  }

  markGenerationComplete(waveIndex: number): void {
    if (this.aborted) return
    this.generationComplete.add(waveIndex)
    void this.scheduleDrain()
  }

  abort(): void {
    this.aborted = true
    this.pending.clear()
    this.notifyWaiters()
  }

  waitUntilDisplayed(): Promise<void> {
    if (this.aborted || this.signal.aborted) return Promise.resolve()
    if (this.isAllDisplayed()) return Promise.resolve()
    return new Promise((resolve) => {
      this.waiters.push(resolve)
    })
  }

  getWebContents(): WebContents {
    return this.webContents
  }

  private isAllDisplayed(): boolean {
    for (let i = 0; i < this.waveCount; i++) {
      if (!this.displayDone.has(i)) return false
    }
    return true
  }

  private notifyWaiters(): void {
    if (!this.isAllDisplayed()) return
    while (this.waiters.length) {
      this.waiters.shift()?.()
    }
  }

  private waveQueueEmpty(waveIndex: number): boolean {
    return (this.pending.get(waveIndex)?.length ?? 0) === 0
  }

  private canAdvanceCursor(): boolean {
    if (this.displayCursor >= this.waveCount) return false
    if (!this.generationComplete.has(this.displayCursor)) return false
    return this.waveQueueEmpty(this.displayCursor)
  }

  private async scheduleDrain(): Promise<void> {
    if (this.draining || this.aborted || this.signal.aborted) return
    this.draining = true
    try {
      while (!this.aborted && !this.signal.aborted && this.displayCursor < this.waveCount) {
        const wave = this.displayCursor
        const tasks = this.pending.get(wave)
        while (tasks && tasks.length > 0 && !this.aborted && !this.signal.aborted) {
          const task = tasks.shift()!
          await task()
        }
        if (this.canAdvanceCursor()) {
          this.displayDone.add(wave)
          this.displayCursor++
          this.notifyWaiters()
        } else {
          break
        }
      }
    } finally {
      this.draining = false
      if (!this.aborted && !this.signal.aborted && this.displayCursor < this.waveCount) {
        const hasWork =
          (this.pending.get(this.displayCursor)?.length ?? 0) > 0 || this.canAdvanceCursor()
        if (hasWork) void this.scheduleDrain()
      }
    }
  }
}
