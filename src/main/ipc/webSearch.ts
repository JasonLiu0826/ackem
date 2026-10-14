import { ipcMain } from 'electron'
import { webSearchStatus, saveWebSearchConfiguration, cancelSearchSetup, pendingSearchSetup } from '../ackemcode/webSearch'
import type { WebSearchConfiguration } from '../../shared/webSearch'
export function registerWebSearchIpc(): void {
  ipcMain.handle('web-search:status', () => webSearchStatus())
  ipcMain.handle('web-search:pending', () => pendingSearchSetup())
  ipcMain.handle('web-search:configure', (_event, input: WebSearchConfiguration) => saveWebSearchConfiguration(input))
  ipcMain.handle('web-search:cancel', (_event, id: string) => { cancelSearchSetup(id); return { ok: true } })
}
