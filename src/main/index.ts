import { app, BrowserWindow, Tray, Menu, nativeImage } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { registerBundledNativeDllPaths } from './nativeDllPath'
import { registerIpc, registerExtensionsRendererPush } from './ipc'
import { registerUiIpc, setMainWindowRef, broadcastToRenderers } from './uiWindow'
import { ensureDataLayout } from './layout'
import { loadSettings } from './settings'
import { resolveDataRoot } from './paths'
import { createLogger, setLogDir } from './logger'
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

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = createLogger('main')

let shutdownPromise: Promise<void> | null = null

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true'

registerBundledNativeDllPaths()

const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    } else {
      createWindow()
    }
  })
}

// 桌面陪伴由 desktop-companion 插件 bootstrap 管理
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

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
      preload: join(__dirname, '../preload/index.cjs'),
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
    revealMainWindow('did-fail-load')
  })
  win.webContents.on('preload-error', (_e, path, err) => {
    log.error('preload-error', { path, err })
  })

  // 关闭主窗口 → 完全退出（含托盘与后台服务）
  win.on('close', () => {
    if ((app as { isQuitting?: boolean }).isQuitting) return
    markAppQuitting()
    log.info('main window closed — quitting app')
    app.quit()
  })

  if (devUrl) {
    void win.loadURL(devUrl).then(
      () => { win.webContents.openDevTools({ mode: 'detach' }) },
      (err) => {
        log.error('loadURL failed', err)
        win.webContents.openDevTools({ mode: 'detach' })
      }
    )
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ═══════════════════════════════════════════════════════════════
// 系统托盘
// ═══════════════════════════════════════════════════════════════
function createTray(): void {
  const icon = loadTrayIcon()
  tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon)

  const contextMenu = Menu.buildFromTemplate([
    { label: '展开主面板', click: () => { mainWindow?.show(); mainWindow?.focus() } },
    {
      label: '折叠到桌宠',
      click: async () => {
        const { showPetWindow } = await import('./petWindow.js')
        showPetWindow()
        mainWindow?.hide()
      }
    },
    { type: 'separator' },
    {
      label: '陪伴状态',
      enabled: false
    },
    { type: 'separator' },
    {
      label: '退出 Ackem',
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

// ═══════════════════════════════════════════════════════════════
// 主动消息定时器 → desktop-companion/bootstrap
// ═══════════════════════════════════════════════════════════════
function startProactiveTimer(): void {
  startDesktopCompanionProactiveTimer(() => mainWindow)
}

// ═══════════════════════════════════════════════════════════════
// 应用生命周期
// ═══════════════════════════════════════════════════════════════
app.whenReady().then(async () => {
  if (!gotSingleInstanceLock) return
  const s = loadSettings()
  const dataRoot = resolveDataRoot(s)
  ensureDataLayout(dataRoot)
  const { seedIfNeeded } = await import('./social/agents/agentRegistry.js')
  seedIfNeeded(dataRoot)
  const { runUnifiedBondMigration } = await import('./migration/unifiedBondMigration.js')
  runUnifiedBondMigration(dataRoot)
  setLogDir(join(dataRoot, 'logs'))

  const { registerMemorySystemFactory } = await import('./memory/bootstrap.js')
  const { createAckemMemorySystem } = await import('./memory/adapters/composeMemorySystem.js')
  const { getClock } = await import('./memory/temporal/clock.js')
  const { getCodeSessionSnapshot } = await import('./ackemcode/client.js')
  registerMemorySystemFactory((root) =>
    createAckemMemorySystem(root, getClock(), {
      loadReceipt: async (runtimeId) => (await getCodeSessionSnapshot(runtimeId))?.hostTurnReceipt
    })
  )
  try {
    const { resumeQueuedWork } = await import('./channel/executeChannel.js')
    await resumeQueuedWork(dataRoot)
  } catch (e) {
    log.warn('work recovery failed', { error: String(e) })
  }

  try {
    const { recoverSemanticFactIndexes } = await import('./memory/semantic/semanticMemory.js')
    await recoverSemanticFactIndexes(dataRoot)
  } catch (e) {
    log.warn('semantic index recovery failed', { error: String(e) })
  }

  try {
    const { createMemoryJobRunner } = await import('./memory/jobs/memoryJobRunner.js')
    const { startMemoryJobRunner } = await import('./memory/jobs/memoryJobRunnerRegistry.js')
    startMemoryJobRunner(dataRoot, () =>
      createMemoryJobRunner({
        dataRoot,
        loadHostReceipt: async (runtimeId) => (await getCodeSessionSnapshot(runtimeId))?.hostTurnReceipt
      })
    )
  } catch (e) {
    log.warn('memory job runner failed to start', { error: String(e) })
  }

  registerIpc()
  registerUiIpc()
  createWindow()
  createTray()

  void (async () => {
    // 先让主窗口完成首帧渲染，避免首次解压 embedding 阻塞 UI（用户误以为没反应）
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

    // 后台预热 embedding（与窗口加载并行，避免首句 pre-LLM 冷启）
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

    // 启动时导出记忆档案
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

    // 启动时补写退出日快照日记（逻辑在 diary-auto 模块）
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

    try {
      const { seedIfNeeded, startSocialTick, seedPosts, listRegisteredAgents, wireSocialLlmGenerator } =
        await import('./social/index.js')
      const { initDatabase } = await import('./db/database.js')
      if (!initDatabase(dataRoot)) {
        log.error(
          'social system boot skipped: SQLite unavailable. Run: npx electron-builder install-app-deps'
        )
      } else {
        wireSocialLlmGenerator(s)
        seedIfNeeded(dataRoot)
        const members = listRegisteredAgents(dataRoot).filter((a) => a.kind === 'social_member')
        seedPosts(
          dataRoot,
          members.map((m) => ({ id: m.id, name: m.name }))
        )
        startSocialTick(dataRoot)
        log.info('social tick started', { members: members.length })
      }
    } catch (e) {
      log.error('social system boot failed', e)
    }
  })()

  // W7：启动媒体状态轮询（SMTC）
  try {
    const { startMediaSessionPolling } = await import('./mediaSession.js')
    startMediaSessionPolling()
  } catch (e) {
    log.error('media session polling start failed', e)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
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
        ;(app as any).shutdownComplete = true
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
