/**
 * 棣栨鍚姩锛氭闈㈠揩鎹锋柟寮?+ 渚挎惡鏁版嵁鐩綍 + 鐜鑷锛堟墦鍖呯増锛?
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
const MARKER = '.Ackem-first-run-complete.json'

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

/** 棣栨鍚姩鍦ㄦ闈㈠垱寤?Ackem.lnk锛圵indows锛?*/
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
      description: 'Ackem 鈥?鏈湴 AI 浼翠荆',
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

/** 鎵撳寘鐗堥娆″惎鍔細渚挎惡 data銆佹闈㈠揩鎹锋柟寮忋€乪mbedding 鍏滃簳涓嬭浇 */
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
