// [appIcon] — 解析窗口/托盘图标路径（开发、预览、打包一致）
// 注：仓库 ico/ 下文件扩展名为 .ico，实际为 PNG；运行时须用 .png 供 Electron 加载

import { app, nativeImage, type NativeImage } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createLogger } from './logger'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = createLogger('appIcon')

const WINDOW_NAMES = ['icon.png', 'icon.ico'] as const
const TRAY_NAMES = ['tray.png', 'tray.ico', 'icon.png', 'icon.ico'] as const

function resolveIconPath(fileNames: readonly string[]): string | null {
  const roots = [
    join(process.resourcesPath, 'resources'),
    join(app.getAppPath(), 'resources'),
    join(process.cwd(), 'resources'),
    join(__dirname, '../../resources'),
    join(__dirname, '../../../resources')
  ]
  for (const root of roots) {
    for (const name of fileNames) {
      const p = join(root, name)
      if (existsSync(p)) return p
    }
  }
  return null
}

function loadFromPath(path: string | null): NativeImage {
  if (!path) return nativeImage.createEmpty()
  const img = nativeImage.createFromPath(path)
  if (img.isEmpty()) {
    log.warn('icon file exists but nativeImage is empty (wrong format?)', { path })
    return nativeImage.createEmpty()
  }
  return img
}

/** 窗口 / 任务栏图标 */
export function loadWindowIcon(): NativeImage {
  const path = resolveIconPath(WINDOW_NAMES)
  if (!path) {
    log.warn('window icon not found; tried', { names: WINDOW_NAMES })
    return nativeImage.createEmpty()
  }
  log.info('window icon', { path })
  return loadFromPath(path)
}

/** 系统托盘图标（Windows 建议 16×16） */
export function loadTrayIcon(): NativeImage {
  const path = resolveIconPath(TRAY_NAMES)
  if (!path) {
    log.warn('tray icon not found; tried', { names: TRAY_NAMES })
    return nativeImage.createEmpty()
  }
  log.info('tray icon', { path })
  const img = loadFromPath(path)
  if (img.isEmpty()) return img
  const { width, height } = img.getSize()
  if (width <= 32 && height <= 32) return img
  return img.resize({ width: 16, height: 16 })
}
