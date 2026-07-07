import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { join } from 'node:path'
import { resolvePreloadPath, resolveRendererHtml } from './outPaths'
import { registerBundledNativeDllPaths } from './nativeDllPath'
import { registerIpc, registerExtensionsRendererPush } from './ipc'
import { registerUiIpc, setMainWindowRef, broadcastToRenderers } from './uiWindow'
import { ensureDataLayout } from './layout'
import { loadSettings } from './settings'
import { resolveDataRoot } from './paths'
import { createLogger, setLogDir } from './logger'
import { registerLocalImageProtocol } from './localImageProtocol'
import {
  initDesktopCompanion,
  startDesktopCompanionProactiveTimer,
  stopDesktopCompanionProactiveTimer,
  bootCompanionHarassScheduler,
  stopCompanionHarassScheduler,
  touchDesktopCompanion
} from './extensions/plugins/builtin/desktop-companion/bootstrap'
import { loadTrayIcon, loadWindowIcon } from './appIcon'
import { ACKEM_CANON } from './canon/ackemCanon'
import { isShutdownFinished, markAppQuitting, performAppShutdown } from './shutdown'
import { closeStartupSplash } from './startupSplash'

const log = createLogger('main')

let shutdownPromise: Promise<void> | null = null
let ipcReady = false
let pendingSecondInstance = false

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function focusOrCreateMainWindow(): void {
  if (!ipcReady) {
    pendingSecondInstance = true
    return
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    return
  }
  createWindow()
}

function createWindow(): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const windowIcon = loadWindowIcon()
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 900,
    minHeight: 620,
    title: 'Ackem',
    icon: windowIcon.isEmpty() ? undefined : windowIcon,
    show: false,
    backgroundColor: '#0f0d14',
    webPreferences: {
      preload: resolvePreloadPath('index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })
  mainWindow = win
  setMainWindowRef(win)

  const revealMainWindow = (reason: string) => {
    if (win.isDestroyed() || win.isVisible()) return
    win.show()
    win.focus()
    log.info('main window shown', { reason })
  }

  win.on('ready-to-show', () => {
    revealMainWindow('ready-to-show')
  })
  win.webContents.on('did-finish-load', () => {
    closeStartupSplash()
    revealMainWindow('did-finish-load')
  })
  setTimeout(() => revealMainWindow('timeout-fallback'), 2500)
  win.on('focus', () => {
    win.webContents.focus()
    win.webContents.send('window-focused')
    touchDesktopCompanion()
  })
  win.webContents.on('did-fail-load', (_e, code, desc, validatedURL) => {
    log.error('did-fail-load', { code, desc, validatedURL })
    closeStartupSplash()
    revealMainWindow('did-fail-load')
  })
  win.webContents.on('preload-error', (_e, path, err) => {
    log.error('preload-error', { path, err })
  })

  win.on('close', () => {
    if ((app as { isQuitting?: boolean }).isQuitting) return
    markAppQuitting()
    log.info('main window closed 鈥?quitting app')
    app.quit()
  })

  if (devUrl) {
    void win.loadURL(devUrl).then(
      () => {
        win.webContents.openDevTools({ mode: 'detach' })
      },
      (err) => {
        log.error('loadURL failed', err)
        win.webContents.openDevTools({ mode: 'detach' })
      }
    )
  } else {
    void win.loadFile(resolveRendererHtml('index.html'))
  }
}

function createTray(): void {
  const icon = loadTrayIcon()
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: '灞曞紑涓婚潰鏉?, click: () => { mainWindow?.show(); mainWindow?.focus() } },
    {
      label: '鎶樺彔鍒版瀹?,
      click: async () => {
        const { showPetWindow } = await import('./petWindow.js')
        showPetWindow()
        mainWindow?.hide()
      }
    },
    { type: 'separator' },
    { label: '闄即鐘舵€?, enabled: false },
    { type: 'separator' },
    {
      label: '閫€鍑?Ackem',
      click: () => {
        markAppQuitting()
        app.quit()
      }
    }
  ])
  tray.setToolTip('Ackem')
  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

function startProactiveTimer(): void {
  startDesktopCompanionProactiveTimer(() => mainWindow)
}

export function runMainApplication(): void {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'
  registerBundledNativeDllPaths()

  app.on('second-instance', () => {
    focusOrCreateMainWindow()
  })

  app.whenReady().then(async () => {
  const s = loadSettings()
  const dataRoot = resolveDataRoot(s)
  ensureDataLayout(dataRoot)
  setLogDir(join(dataRoot, 'logs'))

  registerIpc()
  ipcReady = true
  registerLocalImageProtocol(dataRoot)
  registerUiIpc()
  createWindow()
  createTray()
  if (pendingSecondInstance) {
    pendingSecondInstance = false
    focusOrCreateMainWindow()
  }

  void (async () => {
    await new Promise<void>((resolve) => setImmediate(resolve))

    try {
      const { runFirstLaunchSetup } = await import('./release/firstRun.js')
      await runFirstLaunchSetup(dataRoot)
    } catch (e) {
      log.warn('first launch setup failed', { error: String(e) })
    }

    try {
      const { bootstrapBundledEmbeddingModels } = await import('./memory/embedding/bootstrapBundledModels.js')
      const emb = bootstrapBundledEmbeddingModels(dataRoot)
      log.info('embedding bootstrap', emb)
    } catch (e) {
      log.warn('embedding bootstrap failed', { error: String(e) })
    }

    log.info('Ackem canon birthday', { birthDate: ACKEM_CANON.birthDate })

    const { setTraceDir } = await import('./engine/tracer.js')
    setTraceDir(dataRoot)

    await initDesktopCompanion()
    startProactiveTimer()
    bootCompanionHarassScheduler()

    void (async () => {
      try {
        const { warmupEmbeddingAtStartup } = await import('./engineCache.js')
        const { getOrRebuildIndex } = await import('./ipc/shared.js')
        const { setEmbeddingPhase } = await import('./embedding/embeddingReadiness.js')
        setEmbeddingPhase('loading_provider')
        await warmupEmbeddingAtStartup(dataRoot, getOrRebuildIndex())
      } catch (e) {
        log.warn('embedding warmup failed', { error: String(e) })
        const { setEmbeddingPhase } = await import('./embedding/embeddingReadiness.js')
        setEmbeddingPhase('degraded', { error: String(e) })
      }
    })()

    if (mainWindow) {
      registerExtensionsRendererPush((channel: string, payload: unknown) => {
        broadcastToRenderers(channel, payload)
      })
    }

    try {
      const { FactStore, defaultFactsPath } = await import('./memory/factStore.js')
      const { EpisodicStore, defaultEpisodesPath } = await import('./memory/episodicStore.js')
      const { exportMemoryArchive } = await import('./memory/archiveExporter.js')
      const store = new FactStore(defaultFactsPath(dataRoot))
      const epStore = new EpisodicStore(defaultEpisodesPath(dataRoot))
      const stats = exportMemoryArchive(dataRoot, store, epStore)
      log.info('archive startup export', { factsExported: stats.factsExported, episodesExported: stats.episodesExported })
    } catch (e) {
      log.error('archive startup export failed', e)
    }

    try {
      const { processPendingSnapshotDiaries } = await import(
        './extensions/skills/builtin/diary-auto/dailyDiary.js'
      )
      await processPendingSnapshotDiaries(dataRoot, s)
    } catch (e) {
      log.error('startup diary generation failed', e)
    }

    try {
      const { tryCatchUpMissedDiary } = await import(
        './extensions/skills/builtin/diary-auto/diaryCatchUp.js'
      )
      await tryCatchUpMissedDiary(dataRoot)
    } catch (e) {
      log.error('startup diary catch-up failed', e)
    }

    try {
      const { bootWeixinChannelOnReady } = await import('./ipc/weixin.js')
      await bootWeixinChannelOnReady()
    } catch (e) {
      log.error('weixin channel boot failed', e)
    }
  })()

  try {
    const { startMediaSessionPolling } = await import('./mediaSession.js')
    startMediaSessionPolling()
  } catch (e) {
    log.error('media session polling start failed', e)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && ipcReady) createWindow()
  })
  })

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })

  app.on('before-quit', (event) => {
    markAppQuitting()
    if (isShutdownFinished()) return

    event.preventDefault()
    if (!shutdownPromise) {
      shutdownPromise = performAppShutdown()
        .then(() => {
          ;(app as { shutdownComplete?: boolean }).shutdownComplete = true
          if (tray) {
            tray.destroy()
            tray = null
          }
          app.exit(0)
        })
        .catch((e) => {
          log.error('shutdown failed', e)
          app.exit(1)
        })
    }
  })
}
