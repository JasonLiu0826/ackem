// [qq/qzone] — QQ 空间 IPC
//
// 与 qq:xxx 分开命名空间：空间功能独立于聊天通道，设置页可以单独测、单独发、单独看历史。

import { ipcMain } from 'electron'
import {
  composeQzoneDraftNow,
  getQzoneStatus,
  listQzoneHistory,
  probeQzone,
  publishQzoneNow,
  removeQzonePost,
  runQzoneInteractionNow
} from '../channels/qq/qzone'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import type { QzonePublishInput } from '../channels/qq/qzone/types'

export function registerQzoneIpc(): void {
  ipcMain.handle('qzone:getStatus', () => {
    const root = resolveDataRoot(loadSettings())
    return getQzoneStatus(root)
  })

  ipcMain.handle('qzone:probe', async () => probeQzone())

  ipcMain.handle('qzone:generateDraft', async (_e, style?: string) => {
    return composeQzoneDraftNow(style as Parameters<typeof composeQzoneDraftNow>[0])
  })

  ipcMain.handle('qzone:publish', async (_e, input: QzonePublishInput) => {
    return publishQzoneNow(input ?? { content: '' })
  })

  ipcMain.handle('qzone:history', (_e, limit?: number) => {
    return listQzoneHistory(Math.min(50, Math.max(1, Math.trunc(limit ?? 20))))
  })

  ipcMain.handle('qzone:delete', async (_e, id: number) => removeQzonePost(Number(id)))

  ipcMain.handle('qzone:interactNow', async () => runQzoneInteractionNow())
}
