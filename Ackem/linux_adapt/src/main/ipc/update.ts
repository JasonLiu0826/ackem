import { ipcMain, app, shell } from 'electron'
import type { UpdateChannel, UpdateStartRequest } from '../../shared/updateTypes'
import { checkForUpdates, pickChannelInfo } from '../update/checkRelease'
import { runUpdatePreflight } from '../update/preflight'
import { buildUpdateJob, spawnUpdaterProcess, writeUpdateJob } from '../update/spawnUpdater'
import { loadSettings, saveSettings } from '../settings'
import { markAppQuitting } from '../shutdown'

export function registerUpdateIpc(): void {
  ipcMain.handle('update:getAppVersion', () => app.getVersion())

  ipcMain.handle('update:check', async () => {
    const result = await checkForUpdates()
    saveSettings({ updateLastCheckAt: result.checkedAt })
    return result
  })

  ipcMain.handle(
    'update:start',
    async (_e, req: UpdateStartRequest & { channel: UpdateChannel }) => {
      const pre = runUpdatePreflight()
      if (!pre.ok) {
        return { ok: false as const, reason: pre.reason }
      }

      const check = await checkForUpdates()
      const info = pickChannelInfo(req.channel, check.github, check.gitee)
      if (!info || !info.downloadUrl) {
        return { ok: false as const, reason: 'no_release' as const }
      }

      const job = buildUpdateJob(pre.installDir, {
        channel: req.channel,
        targetVersion: req.targetVersion || info.version,
        downloadUrl: req.downloadUrl || info.downloadUrl,
        expectedSize: req.expectedSize || info.size,
        releasePageUrl: req.releasePageUrl || info.releasePageUrl
      }, info.channel)

      const jobPath = writeUpdateJob(job)
      spawnUpdaterProcess(pre.installDir, jobPath)
      markAppQuitting()
      setTimeout(() => app.quit(), 400)
      return { ok: true as const, jobPath }
    }
  )

  ipcMain.handle('update:openRelease', (_e, url: string) => {
    if (url) void shell.openExternal(url)
  })

  ipcMain.handle('update:getChannelPreference', () => loadSettings().updateChannel ?? 'auto')

  ipcMain.handle('update:setChannelPreference', (_e, channel: UpdateChannel) => {
    saveSettings({ updateChannel: channel })
    return channel
  })
}
