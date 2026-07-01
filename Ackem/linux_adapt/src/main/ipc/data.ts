// [ipc/data] — 设置、数据目录、导入、索引、文件系统、应用级通道

import { dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { appendOrOverwriteAllowed, importExternalFiles, promoteImportToMemory, readRelFile } from '../fsops'
import { searchChunks } from '../indexer'
import { invalidateEngineCache, invalidateEmbeddingProvider, getCachedEmbeddingProvider } from '../engineCache'
import { reseedAssociationGraphForDataRoot } from '../memory/associationColdStart'
import { onDesktopAgentSettingsSaved } from '../desktop-agent/ipc'
import { syncCompanionHarassScheduler } from '../extensions/plugins/builtin/desktop-companion/bootstrap'
import { databasePath } from '../paths'
import {
  currentDataRoot,
  getOrRebuildIndex,
  loadSettings,
  refreshIndex,
  formatDataRootDisplayPaths,
  resolveDataRoot,
  saveSettings,
  ensureDataLayout
} from './shared'
import { listModelStatus, getModelState, switchModel as switchEmbeddingModel, downloadModel, cancelDownload, bootstrapBundledEmbeddingModels } from '../memory/embedding'
import { isBundledEmbeddingModel, type LocalModelId } from '../memory/embedding/types'
import { initLocale, getLocale, t } from '../i18n'
import type { Locale } from '../i18n/types'
import { zhResources } from '../i18n/zh'
import { enResources } from '../i18n/en'
import {
  rendererI18nOverlayEn,
  rendererI18nOverlayZh
} from '../../shared/i18n/rendererOverlay'
import {
  DECISION_LOG_EMBEDDING_ROUTING_PLANNED,
  listRecentDecisionLogs,
  summarizeRecentDecisions,
} from '../extensions/policy/decisionLogStore'
import {
  getEmbeddingReadiness,
  isEmbeddingReadyForChat,
  onReadinessChange,
} from '../embedding/embeddingReadiness'
import { createLogger } from '../logger'
import { ACKEM_CANON } from '../canon/ackemCanon'
import { loadCreatorMemoryStore } from '../canon/creatorMemory'
import { embeddingSettingsChanged, onlyDesktopAgentSettingsChanged } from '../../shared/settingsChange'

const log = createLogger('ipc-data')

function runSettingsPostSaveHooks(
  prev: ReturnType<typeof loadSettings>,
  s: ReturnType<typeof loadSettings>,
  patch: Parameters<typeof saveSettings>[0]
): void {
  const root = resolveDataRoot(s)
  onDesktopAgentSettingsSaved(root, prev, s)
  const desktopAgentOnly = onlyDesktopAgentSettingsChanged(prev, s)
  if (!desktopAgentOnly) {
    invalidateEngineCache(root)
  }
  if (embeddingSettingsChanged(prev, s)) {
    invalidateEmbeddingProvider(root)
  }
  if (patch.locale) {
    initLocale(patch.locale as Locale)
  }
  if (prev.companionHarassEnabled !== s.companionHarassEnabled) {
    syncCompanionHarassScheduler()
  }
}

function broadcastEmbeddingReadiness(): void {
  const snap = getEmbeddingReadiness()
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('embedding:readiness-changed', snap)
  }
}

onReadinessChange(() => broadcastEmbeddingReadiness())

export function registerDataIpc(): void {
  ipcMain.handle('settings:get', () => loadSettings())
  ipcMain.handle('canon:get', () => ({
    name: ACKEM_CANON.name,
    birthDate: ACKEM_CANON.birthDate,
    creator: { ...ACKEM_CANON.creator },
  }))
  ipcMain.handle('canon:creator-memory:get', () => {
    const root = resolveDataRoot(loadSettings())
    const store = loadCreatorMemoryStore(root)
    return {
      version: store.version,
      documentVersion: store.documentVersion ?? store.version,
      entryCount: store.entries.length,
      decayPolicy: store.decayPolicy,
      seededAt: store.seededAt ?? null,
      entries: store.entries.map((e) => ({
        id: e.id,
        category: e.category,
        title: e.title,
        content: e.content,
        narrativeAt: e.narrativeAt,
      })),
    }
  })
  ipcMain.handle('settings:set', (_e, patch: Parameters<typeof saveSettings>[0]) => {
    const prev = loadSettings()
    const s = saveSettings(patch)
    try {
      runSettingsPostSaveHooks(prev, s, patch)
    } catch (err) {
      log.warn('settings post-save hooks failed (settings still saved)', {
        err: err instanceof Error ? err.message : String(err)
      })
    }
    return s
  })

  // ═══ i18n ═══
  ipcMain.handle('i18n:t', (_e, key: string, params?: Record<string, string | number>) => {
    return t(key, params)
  })
  ipcMain.handle('i18n:getLocale', () => getLocale())
  ipcMain.handle('i18n:setLocale', (_e, locale: Locale) => {
    initLocale(locale)
    const prev = loadSettings()
    const prevModel = prev.embeddingActiveModel ?? 'bge-small-zh'
    // locale → 默认模型映射
    const localeDefault = locale === 'en' ? 'bge-small-en' : 'bge-small-zh'
    // 仅当当前模型是对方语言的内置模型时才自动切换
    const autoSwitchable = ['bge-small-zh', 'bge-small-en']
    const patch: Record<string, string> = { locale }
    if (autoSwitchable.includes(prevModel) && prevModel !== localeDefault) {
      patch.embeddingActiveModel = localeDefault
    }
    const s = saveSettings(patch)
    invalidateEngineCache(resolveDataRoot(s))
    if ('embeddingActiveModel' in patch) {
      invalidateEmbeddingProvider(resolveDataRoot(s))
    }
  })
  ipcMain.handle('i18n:getAllResources', () => {
    return {
      zh: { ...zhResources, ...rendererI18nOverlayZh },
      en: { ...enResources, ...rendererI18nOverlayEn },
      locale: getLocale()
    }
  })

  ipcMain.handle('data:getRoot', () => {
    const s = loadSettings()
    const display = formatDataRootDisplayPaths(s)
    return {
      path: display.absolutePath,
      relativePath: display.relativePath,
      mode: display.mode,
      databasePath: databasePath(display.absolutePath)
    }
  })

  ipcMain.handle('data:ensureLayout', () => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    ensureDataLayout(root)
    return { path: root }
  })

  ipcMain.handle('shell:openData', async () => {
    const root = currentDataRoot()
    await shell.openPath(root)
  })

  ipcMain.handle('dialog:selectFiles', async () => {
    const r = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Text / Markdown / JSON', extensions: ['md', 'txt', 'json'] },
        { name: 'All', extensions: ['*'] }
      ]
    })
    if (r.canceled) return { paths: [] as string[] }
    return { paths: r.filePaths }
  })

  ipcMain.handle('import:files', (_e, paths: string[]) => {
    const root = currentDataRoot()
    ensureDataLayout(root)
    return importExternalFiles(root, paths)
  })

  ipcMain.handle('import:promote', async (_e, rel: string) => {
    const root = currentDataRoot()
    const result = promoteImportToMemory(root, rel)
    if (!result.ok) return result
    refreshIndex()
    let associationSeed = { edgesCreated: 0, factsConsidered: 0, orphansLinked: 0 }
    try {
      associationSeed = await reseedAssociationGraphForDataRoot(root)
    } catch { /* association reseed is best-effort */ }
    return { ...result, associationSeed }
  })

  ipcMain.handle(
    'import:parseDocuments',
    async (
      _e,
      args: { relPaths: string[]; consentAck: boolean; consentVersion: number }
    ) => {
      const root = currentDataRoot()
      const settings = loadSettings()
      const { parseDocumentsToImportJob } = await import(
        '../memory/documentImport/parseDocuments.js'
      )
      return parseDocumentsToImportJob({
        dataRoot: root,
        settings,
        relPaths: args.relPaths ?? [],
        consentAck: Boolean(args.consentAck),
        consentVersion: args.consentVersion ?? 0,
      })
    }
  )

  ipcMain.handle('import:getJob', async (_e, jobId: string) => {
    const root = currentDataRoot()
    const { loadImportJob } = await import('../memory/documentImport/jobStore.js')
    return loadImportJob(root, jobId)
  })

  ipcMain.handle(
    'import:commitJob',
    async (_e, args: { jobId: string; disabledDraftIds?: string[] }) => {
      const root = currentDataRoot()
      const settings = loadSettings()
      const { commitImportJob } = await import('../memory/documentImport/commitImportJob.js')
      return commitImportJob({
        dataRoot: root,
        settings,
        jobId: args.jobId,
        disabledDraftIds: args.disabledDraftIds,
      })
    }
  )

  ipcMain.handle('index:rebuild', async () => {
    const snap = refreshIndex()
    const root = currentDataRoot()
    let associationSeed = { edgesCreated: 0, factsConsidered: 0, orphansLinked: 0 }
    try {
      associationSeed = await reseedAssociationGraphForDataRoot(root)
    } catch { /* association reseed is best-effort */ }
    return { chunks: snap.chunks.length, builtAt: snap.builtAt, associationSeed }
  })

  ipcMain.handle('index:search', (_e, q: string, limit = 20) => {
    const snap = getOrRebuildIndex()
    return searchChunks(snap, q, limit).map((h) => ({
      score: h.score,
      id: h.chunk.id,
      relPath: h.chunk.relPath,
      preview: h.chunk.text.slice(0, 240),
      mtimeMs: h.chunk.mtimeMs
    }))
  })

  ipcMain.handle('fs:readRel', (_e, rel: string, maxBytes?: number) => {
    const s = loadSettings()
    const root = resolveDataRoot(s)
    return readRelFile(root, rel, maxBytes ?? s.singleFileSoftLimitBytes)
  })

  ipcMain.handle(
    'fs:writeAllowed',
    (_e, rel: string, content: string, mode: 'append' | 'overwrite') => {
      const root = currentDataRoot()
      return appendOrOverwriteAllowed(root, rel, content, mode)
    }
  )

  ipcMain.handle('app:reload', (event) => {
    setTimeout(() => event.sender.reloadIgnoringCache(), 150)
    return { ok: true }
  })

  ipcMain.handle('app:uninstallInfo', async () => {
    const { getUninstallInfo } = await import('../release/uninstall.js')
    return getUninstallInfo()
  })

  ipcMain.handle(
    'app:uninstall',
    async (_e, opts: { deleteData?: boolean; removeApp?: boolean } = {}) => {
      const { launchUninstallAndQuit } = await import('../release/uninstall.js')
      await launchUninstallAndQuit(opts)
      return { ok: true as const }
    }
  )

  // ── Embedding 模型管理 ──

  /** 获取 embedding 系统状态：当前 provider + 所有模型可用性 + 预热就绪 */
  ipcMain.handle('embedding:status', () => {
    const root = currentDataRoot()
    const settings = loadSettings()
    const bootstrap = bootstrapBundledEmbeddingModels(root)
    const provider = getCachedEmbeddingProvider(root)
    const models = listModelStatus(root)
    const state = getModelState(root)
    const readiness = getEmbeddingReadiness()
    return {
      activeModel: settings.embeddingActiveModel ?? 'bge-small-zh',
      providerReady: provider?.ready() ?? false,
      providerName: provider?.name() ?? 'none',
      providerDimension: provider?.dimension() ?? 0,
      models,
      state,
      bundledReady: bootstrap.ready,
      bundledMissing: bootstrap.missing,
      bundledZipPresent: bootstrap.zipPresent,
      readiness,
      chatReady: isEmbeddingReadyForChat(),
    }
  })

  ipcMain.handle('embedding:readiness', () => getEmbeddingReadiness())

  /** 切换 embedding 模型 */
  ipcMain.handle('embedding:switch', async (_e, modelId: string) => {
    const root = currentDataRoot()

    if (modelId !== 'none') {
      bootstrapBundledEmbeddingModels(root)
      const ok = switchEmbeddingModel(modelId as LocalModelId, root)
      if (!ok) {
        const hint = isBundledEmbeddingModel(modelId as LocalModelId)
          ? '预装模型未找到，请确认安装包 resources/models 完整或运行 npm run prepare:embedding-models'
          : `模型 ${modelId} 未就绪`
        return { ok: false, error: hint }
      }
    }

    // 更新 settings
    saveSettings({ embeddingActiveModel: modelId as 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh' | 'none' })

    // 作废旧 provider + 引擎缓存，下次对话自动重建
    invalidateEmbeddingProvider(root)
    invalidateEngineCache(root)

    return { ok: true, modelId }
  })

  /** 下载 embedding 模型（支持断点续传） */
  ipcMain.handle('embedding:download', async (event, modelId: string) => {
    const root = currentDataRoot()
    const result = await downloadModel(
      modelId as LocalModelId,
      root,
      (progress) => event.sender.send('embedding:downloadProgress', { modelId, ...progress })
    )
    if (result.ok) {
      // 下载成功后自动切换
      saveSettings({ embeddingActiveModel: modelId as 'bge-small-zh' | 'bge-small-en' | 'm3e-small' | 'bge-base-zh' | 'none' })
      invalidateEmbeddingProvider(root)
      invalidateEngineCache(root)
    }
    return result
  })

  /** 取消正在进行的下载 */
  ipcMain.handle('embedding:downloadCancel', (_e, modelId: string) => {
    cancelDownload(modelId)
    return { ok: true }
  })

  /** FIX-020：近期 proactiveGate 决策日志（可观测 + 规则路由输入） */
  ipcMain.handle('policy:decisionLogRecent', (_e, limit = 20) => {
    const root = currentDataRoot()
    const logs = listRecentDecisionLogs(root, Number(limit) || 20)
    return {
      logs,
      summary: summarizeRecentDecisions(logs),
      embeddingRoutingPlanned: DECISION_LOG_EMBEDDING_ROUTING_PLANNED,
    }
  })
}
