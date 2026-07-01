import { BrowserWindow } from 'electron'

export function broadcastToRenderers(channel: string, payload: unknown): void {
  const getAllWindows = BrowserWindow?.getAllWindows
  if (typeof getAllWindows !== 'function') return

  for (const win of getAllWindows.call(BrowserWindow)) {
    if (!win.isDestroyed()) {
      try {
        win.webContents.send(channel, payload)
      } catch {
        /* ignore */
      }
    }
  }
}
