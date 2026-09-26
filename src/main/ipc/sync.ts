import { ipcMain, BrowserWindow } from 'electron'
import { SyncClient } from '../sync/SyncClient'
import type { SyncChange } from '../sync/SyncClient'
import { PairingManager } from '../sync/PairingManager'
import { SyncScheduler } from '../sync/SyncScheduler'

let syncClient: SyncClient | null = null
let pairingManager: PairingManager | null = null
let syncScheduler: SyncScheduler | null = null

export function registerSyncIpc(_getMainWindow: () => BrowserWindow | null): void {
  // Initialize sync client
  ipcMain.handle('sync:init', async (_e, workerUrl: string, deviceId: string) => {
    syncClient = new SyncClient(workerUrl, deviceId)
    pairingManager = new PairingManager(syncClient)
    syncScheduler = new SyncScheduler(syncClient)
    return { ok: true }
  })

  // Generate pair code (PC acts as primary, generates code for Android to scan)
  ipcMain.handle('sync:generatePairCode', async () => {
    if (!pairingManager) return { ok: false, error: 'Sync not initialized' }
    try {
      const code = await pairingManager.startPairing()
      return { ok: true, code }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Enter pair code (from Android)
  ipcMain.handle('sync:confirmPair', async (_e, pairCode: string) => {
    if (!pairingManager) return { ok: false, error: 'Sync not initialized' }
    return pairingManager.confirmPairing(pairCode)
  })

  // Manual sync trigger
  ipcMain.handle('sync:trigger', async () => {
    if (!syncScheduler) return { ok: false, error: 'Sync not initialized' }
    try {
      await syncScheduler.triggerSync()
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Start auto sync
  ipcMain.handle('sync:start', async () => {
    if (!syncScheduler) return { ok: false, error: 'Sync not initialized' }
    syncScheduler.start(async () => {
      // Pull changes and merge into local DB
      // Push local changes to server
      // This will be called every 15 minutes
      console.log('[Sync] Running scheduled sync...')
    })
    return { ok: true }
  })

  // Stop auto sync
  ipcMain.handle('sync:stop', async () => {
    syncScheduler?.stop()
    return { ok: true }
  })

  // Pull changes from server
  ipcMain.handle('sync:pull', async (_e, sinceTs: number) => {
    if (!syncClient) return { ok: false, error: 'Sync not initialized' }
    try {
      const changes = await syncClient.pull(sinceTs)
      return { ok: true, changes }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Push changes to server
  ipcMain.handle('sync:push', async (_e, changes: SyncChange[]) => {
    if (!syncClient) return { ok: false, error: 'Sync not initialized' }
    try {
      await syncClient.push(changes)
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  })

  // Get sync status
  ipcMain.handle('sync:status', async () => {
    return {
      initialized: !!syncClient,
      autoSyncRunning: !!syncScheduler
    }
  })
}
