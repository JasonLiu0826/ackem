/**
 * 首次启动：桌面快捷方式 + 便携数据目录 + 环境自检（打包版）
 */
import { app, shell } from 'electron'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadSettings, saveSettings } from '../settings'
import { createLogger } from '../logger'
import {
  resolvePackagedAppDir,
  resolveShortcutIconPath,
  resolveUserLaunchPath
} from '../portableEnv'

const log = createLogger('first-run')
const MARKER = '.ackem-first-run-complete.json'

function markerPath(dataRoot: string): string {
  return join(dataRoot, MARKER)
}

export function isFirstRun(dataRoot: string): boolean {
  return !existsSync(markerPath(dataRoot))
}

function markFirstRunComplete(dataRoot: string): void {
  mkdirSync(dataRoot, { recursive: true })
  writeFileSync(
    markerPath(dataRoot),
    JSON.stringify({ completedAt: new Date().toISOString(), appVersion: app.getVersion() }),
    'utf-8'
  )
}

/** 首次启动在桌面创建 Ackem.lnk（Windows） */
export function createDesktopShortcutIfNeeded(): boolean {
  if (process.platform !== 'win32') return false
  const desktop = app.getPath('desktop')
  const shortcutPath = join(desktop, 'Ackem.lnk')
  if (existsSync(shortcutPath)) return false

  const launchTarget = resolveUserLaunchPath()
  const workDir = resolvePackagedAppDir()
  const icon = resolveShortcutIconPath()
  try {
    const ok = shell.writeShortcutLink(shortcutPath, {
      target: launchTarget,
      cwd: workDir,
      description: 'Ackem — 本地 AI 伴侣',
      icon: icon ?? launchTarget,
      iconIndex: 0,
    })
    if (ok) log.info('desktop shortcut created', { shortcutPath })
    else log.warn('desktop shortcut write returned false', { shortcutPath })
    return ok
  } catch (e) {
    log.warn('desktop shortcut failed', { error: String(e) })
    return false
  }
}

/** 打包版首次启动：便携 data、桌面快捷方式、embedding 兜底下载 */
export async function runFirstLaunchSetup(dataRoot: string): Promise<void> {
  if (!app.isPackaged) return
  if (!isFirstRun(dataRoot)) return

  log.info('first launch setup starting')

  const settings = loadSettings()
  if (settings.dataRootMode !== 'portable') {
    saveSettings({ dataRootMode: 'portable' })
    log.info('defaulted dataRootMode to portable')
  }

  createDesktopShortcutIfNeeded()

  markFirstRunComplete(dataRoot)

  try {
    const { bootstrapBundledEmbeddingModelsAsync } = await import(
      '../memory/embedding/bootstrapBundledModels.js'
    )
    const emb = await bootstrapBundledEmbeddingModelsAsync(dataRoot)
    log.info('first launch embedding bootstrap', emb)
  } catch (e) {
    log.warn('first launch embedding bootstrap failed', { error: String(e) })
  }

  log.info('first launch setup complete')
}
