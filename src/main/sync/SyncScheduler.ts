import type { SyncClient } from './SyncClient'

export class SyncScheduler {
  private syncClient: SyncClient
  private intervalId: ReturnType<typeof setInterval> | null = null
  private syncCallback: (() => Promise<void>) | null = null
  private intervalMs = 15 * 60 * 1000 // 15 minutes

  constructor(syncClient: SyncClient) {
    this.syncClient = syncClient
  }

  start(onSync: () => Promise<void>): void {
    this.syncCallback = onSync
    this.intervalId = setInterval(() => this.doSync(), this.intervalMs)
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  async triggerSync(): Promise<void> {
    await this.doSync()
  }

  private async doSync(): Promise<void> {
    if (this.syncCallback) {
      try {
        await this.syncCallback()
      } catch (e) {
        console.error('[SyncScheduler] Sync failed:', e)
      }
    }
  }
}
