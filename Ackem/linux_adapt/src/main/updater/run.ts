import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { resolvePreloadPath, resolveRendererHtml } from '../outPaths'
import { readUpdateJob, runUpdatePipeline, launchAckem } from '../update/pipeline'

let mainWindow: BrowserWindow | null = null

function resolveUpdaterPreload(): string {
  return resolvePreloadPath('updaterPreload.cjs')
}

function resolveUpdaterHtml(): string {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    return `${devUrl.replace(/\/$/, '')}/updater.html`
  }
  return resolveRendererHtml('updater.html')
}

function createUpdaterWindow(jobPath: string): BrowserWindow {
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 560,
    minHeight: 420,
    title: 'Ackem Update',
    backgroundColor: '#0f0d14',
    autoHideMenuBar: true,
    webPreferences: {
      preload: resolveUpdaterPreload(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl.replace(/\/$/, '')}/updater.html?job=${encodeURIComponent(jobPath)}`)
  } else {
    void win.loadFile(resolveRendererHtml('updater.html'), {
      query: { job: jobPath }
    })
  }
  return win
}

export async function runAckemUpdater(): Promise<void> {
  const arg = process.argv.find((a) => a.startsWith('--ackem-updater='))
  if (!arg) {
    console.error('Missing --ackem-updater=job.json')
    app.quit()
    return
  }
  const jobPath = arg.slice('--ackem-updater='.length).replace(/^"|"$/g, '')

  await app.whenReady()

  ipcMain.handle('updater:getJobPath', () => jobPath)
  ipcMain.handle('updater:readJob', () => readUpdateJob(jobPath))
  ipcMain.handle('updater:start', async () => {
    const job = readUpdateJob(jobPath)
    await runUpdatePipeline(job, mainWindow)
    return { ok: true }
  })
  ipcMain.handle('updater:launchAckem', () => {
    const job = readUpdateJob(jobPath)
    launchAckem(job.ackemExe)
    app.quit()
  })
  ipcMain.handle('updater:openRelease', () => {
    const job = readUpdateJob(jobPath)
    void shell.openExternal(job.releasePageUrl)
  })
  ipcMain.handle('updater:quit', () => app.quit())

  mainWindow = createUpdaterWindow(jobPath)
  mainWindow.on('closed', () => {
    mainWindow = null
    app.quit()
  })
}
