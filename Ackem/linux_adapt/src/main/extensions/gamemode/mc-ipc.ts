// [extensions/gamemode/mc-ipc] — @deprecated mc:* 通道，转发至 ext:gamemode:invoke

import { ipcMain } from 'electron'
import type { ExtensionsCoordinator } from '../coordinator'
import type { McGameEvent } from './providers/minecraft/types'

export interface McIpcContext {
  loadSettings(): import('../../settings').AppSettings
  resolveDataRoot(s: import('../../settings').AppSettings): string
  currentDataRoot(): string
  currentSessionId(): string
  mergeEngineState(root: string, s: import('../../settings').AppSettings): import('../../engine/types').FullState
  getOrRebuildIndex(): import('../../indexer').IndexSnapshot
}

async function mcInvoke(
  getCoordinator: () => ExtensionsCoordinator | null,
  method: string,
  params?: Record<string, unknown>
): Promise<unknown> {
  const coord = getCoordinator()
  if (!coord) {
    throw new Error('ExtensionsCoordinator not initialized')
  }
  const result = await coord.gameMode.invoke('minecraft', method, params)
  if (!result.ok) {
    throw new Error(result.error ?? `gamemode invoke failed: ${method}`)
  }
  return result.data
}

/** @deprecated 使用 ext:gamemode:invoke；保留兼容旧前端 mc* API */
export function registerMcIpc(
  _ctx: McIpcContext,
  getCoordinator: () => ExtensionsCoordinator | null
): void {
  ipcMain.handle('mc:react', async (_e, event: McGameEvent) => {
    return mcInvoke(getCoordinator, 'react', { event })
  })

  ipcMain.handle('mc:parseLog', async (_e, line: string) => {
    return mcInvoke(getCoordinator, 'parseLog', { line })
  })

  ipcMain.handle('mc:status', async () => {
    return mcInvoke(getCoordinator, 'getWsStatus')
  })

  ipcMain.handle('mc:setEngineState', async () => {
    return mcInvoke(getCoordinator, 'syncEngineState')
  })

  ipcMain.handle('mc:botStart', async (_e, botCfg: { host: string; port?: number; username: string; password?: string }) => {
    return mcInvoke(getCoordinator, 'botStart', botCfg as unknown as Record<string, unknown>)
  })

  ipcMain.handle('mc:botStop', async () => mcInvoke(getCoordinator, 'botStop'))

  ipcMain.handle('mc:botStatus', async () => mcInvoke(getCoordinator, 'botStatus'))

  ipcMain.handle('mc:botDebug', async () => mcInvoke(getCoordinator, 'botDebug'))

  ipcMain.handle('mc:logStart', async (_e, logPath: string) => {
    return mcInvoke(getCoordinator, 'logStart', { logPath })
  })

  ipcMain.handle('mc:logStop', async () => mcInvoke(getCoordinator, 'logStop'))

  ipcMain.handle('mc:logStatus', async () => mcInvoke(getCoordinator, 'logStatus'))
}
