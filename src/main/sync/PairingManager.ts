import type { SyncClient } from './SyncClient'

export class PairingManager {
  private syncClient: SyncClient

  constructor(syncClient: SyncClient) {
    this.syncClient = syncClient
  }

  async startPairing(): Promise<string> {
    // Generate a 6-digit pair code
    const code = await this.syncClient.generatePairCode()
    return code
  }

  async confirmPairing(pairCode: string): Promise<{ ok: boolean; error?: string }> {
    return this.syncClient.pair(pairCode)
  }
}
