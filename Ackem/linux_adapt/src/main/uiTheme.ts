import { app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { broadcastToRenderers } from './rendererBroadcast'

export type UiThemeMode = 'light' | 'dark'

let currentUiTheme: UiThemeMode = 'dark'

function themeFilePath(): string {
  return join(app.getPath('userData'), 'ui-theme.json')
}

function loadUiThemeFromDisk(): UiThemeMode | null {
  try {
    const p = themeFilePath()
    if (!existsSync(p)) return null
    const raw = JSON.parse(readFileSync(p, 'utf8')) as { mode?: string }
    if (raw.mode === 'light' || raw.mode === 'dark') return raw.mode
  } catch {
    /* ignore */
  }
  return null
}

function saveUiThemeToDisk(mode: UiThemeMode): void {
  try {
    writeFileSync(themeFilePath(), JSON.stringify({ mode }), 'utf8')
  } catch {
    /* ignore */
  }
}

export function initUiThemeFromDisk(): void {
  const stored = loadUiThemeFromDisk()
  if (stored) currentUiTheme = stored
}

export function getUiTheme(): UiThemeMode {
  return currentUiTheme
}

/** 写入磁盘并向所有窗口（主面板 + 桌宠）广播 */
export function setUiTheme(mode: UiThemeMode): void {
  currentUiTheme = mode
  saveUiThemeToDisk(mode)
  broadcastToRenderers('ui:themeChanged', { mode })
}
