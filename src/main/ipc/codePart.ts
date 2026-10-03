import { ipcMain } from 'electron'
import { ensureDaemon } from '../ackemcode/ensureDaemon'

export function registerCodePartIpc(): void {
  ipcMain.handle('codepart:ensure', () => ensureDaemon())
}
