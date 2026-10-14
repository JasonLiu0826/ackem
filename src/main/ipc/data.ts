import { captureChatAttachments } from '../chat/attachments'
import {recordWorkAttachmentSources} from '../ackemcode/workAttachmentGrants'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { basename } from 'node:path'
import { snapshotChatImages } from '../chat/images'
// [ipc/data] — 设置、数据目录、导入、索引、文件系统、应用级通道

import { existsSync, mkdirSync, statSync, realpathSync } from 'node:fs'
import { isAbsolute, join, resolve, relative } from 'node:path'
import { app, dialog, ipcMain, shell, BrowserWindow } from 'electron'
import { appendOrOverwriteAllowed, importExternalFiles, promoteImportToMemory, readRelFile } from '../fsops'
import { searchChunks } from '../indexer'
import { invalidateEngineCache, invalidateEmbeddingProvider, getCachedEmbeddingProvider } from '../engineCache'
import { reseedAssociationGraphForDataRoot } from '../memory/associationColdStart'
import { onDesktopAgentSettingsSaved } from '../desktop-agent/ipc'
import { syncCompanionHarassScheduler } from '../extensions/plugins/builtin/desktop-companion/bootstrap'
import { databasePath } from '../paths'
import { previewChatFile } from '../chat/filePreview'
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
import { resolveCodeRoot } from '../ackemcode/ensureDaemon'
import { syncRuntimeLlm } from '../ackemcode/syncRuntimeLlm'

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
  const codeRoot = resolveCodeRoot()
  if (codeRoot) syncRuntimeLlm(codeRoot)
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

  ipcMain.handle('dialog:selectChatAttachments', async (_event, kind?:string) => {
    const result=await dialog.showOpenDialog({properties:['openFile','multiSelections'],filters:kind==='image'?[{name:'图片',extensions:['png','jpg','jpeg','gif','webp']}]:kind==='video'?[{name:'视频',extensions:['mp4','mov','webm','mkv','avi','m4v']}]:[{name:'文件、图片和视频',extensions:['*']}]})
    if(result.canceled)return []
    const root=currentDataRoot(),attachments=await captureChatAttachments(result.filePaths,root)
    recordWorkAttachmentSources(root,attachments.map(a=>a.path));return attachments
  })
  ipcMain.handle('chat:captureAttachments', async (_event, entries:Array<{path?:string;name?:string;bytes?:ArrayBuffer}>) => {
    if(!Array.isArray(entries)||entries.length>10)throw Error('最多添加 10 个附件')
    const root=currentDataRoot();mkdirSync(join(root,'attachments'),{recursive:true})
    const dir=await mkdtemp(join(root,'attachments','drop-'))
    try{
      const paths:string[]=[]
      for(const entry of entries){
        if(typeof entry.path==='string'&&entry.path){paths.push(entry.path);continue}
        if(!(entry.bytes instanceof ArrayBuffer)||entry.bytes.byteLength>64*1024*1024||!entry.name)throw Error('拖拽文件无法读取，或内容超过 64MB；请使用＋选择本机文件')
        const name=basename(entry.name);if(!name||name==='.'||name==='..')throw Error('附件文件名无效')
        const itemDir=join(dir,String(paths.length));mkdirSync(itemDir)
        const path=join(itemDir,name);await writeFile(path,Buffer.from(entry.bytes));paths.push(path)
      }
      const attachments=await captureChatAttachments(paths,root);recordWorkAttachmentSources(root,attachments.map(a=>a.path));return attachments
    }finally{await rm(dir,{recursive:true,force:true})}
  })

  ipcMain.handle('dialog:selectChatImages', async () => {
    const result=await dialog.showOpenDialog({properties:['openFile','multiSelections'],filters:[{name:'图片',extensions:['png','jpg','jpeg','gif','webp']}]})
    if(result.canceled)return []
    const root=currentDataRoot(),images=await snapshotChatImages(result.filePaths,root);recordWorkAttachmentSources(root,images.map(a=>a.path));return images
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
    recordWorkAttachmentSources(currentDataRoot(),r.filePaths)
    return { paths: r.filePaths }
  })

  ipcMain.handle('dialog:selectFolder', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const r = win
      ? await dialog.showOpenDialog(win, { properties: ['openDirectory'] })
      : await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (r.canceled) return { path: '' }
    recordWorkAttachmentSources(currentDataRoot(),r.filePaths)
    return { path: r.filePaths[0] ?? '' }
  })

  ipcMain.handle('app:default-cwd', () => {
    // Ackem 管理的默认工作区 (非 data/ 根, 红线允许; 专为 work 任务设计)
    try {
      const root = resolveDataRoot(loadSettings())
      const workspace = join(root, 'workspace')
      mkdirSync(workspace, { recursive: true })
      return workspace
    } catch {
      return app.getPath('home')
    }
  })

  // 聊天/工作台产出文件的可点击打开 (2026-10-04): 渲染层把路径 token 渲染成
  // data-reveal-path 链接, 主进程只允许打开 data 根内部的路径 (防任意路径打开)。
  ipcMain.handle('shell:revealPath', (_e, rawPath: string) => {
    try {
      const clean = String(rawPath ?? '').trim().replace(/^["']+|["']+$/g, '')
      if (!clean || clean.length > 500) return { ok: false }
      const root = realpathSync(resolve(resolveDataRoot(loadSettings())))
      const candidates = isAbsolute(clean) ? [clean] : [join(root, clean), join(root, 'workspace', clean)]
      for (const candidate of candidates) {
        if (!existsSync(candidate)) continue
        const target = realpathSync(candidate)
        const rel = relative(root, target)
        if (rel === '..' || rel.startsWith('..\\') || rel.startsWith('../') || isAbsolute(rel)) continue
        const st = statSync(target)
        if (st.isDirectory()) void shell.openPath(target)
        else shell.showItemInFolder(target)
        return { ok: true, path: target }
      }
      return { ok: false }
    } catch {
      return { ok: false }
    }
  })

  ipcMain.handle('chat:file-preview', (_e, path: string) => previewChatFile(currentDataRoot(), path))

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
      args: {
        relPaths: string[]
        consentAck: boolean
        consentVersion: number
        ownerAgentId?: string
      }
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
        ownerAgentId: args.ownerAgentId,
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
    async (
      _e,
      args: { jobId: string; disabledDraftIds?: string[]; ownerAgentId?: string }
    ) => {
      const root = currentDataRoot()
      const settings = loadSettings()
      const { commitImportJob } = await import('../memory/documentImport/commitImportJob.js')
      return commitImportJob({
        dataRoot: root,
        settings,
        jobId: args.jobId,
        disabledDraftIds: args.disabledDraftIds,
        ownerAgentId: args.ownerAgentId,
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
