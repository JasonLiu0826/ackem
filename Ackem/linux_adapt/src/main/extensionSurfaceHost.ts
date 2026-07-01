import { BrowserWindow, ipcMain } from 'electron'
import { loadWindowIcon } from './appIcon'
import { resolvePreloadPath } from './outPaths'
import { createLogger } from './logger'
import {
  bindSurfaceWidgetWebContents,
  getSurfaceWidgetState,
  invokeSurfaceWidget,
  unregisterSurfaceWidgetSession
} from './extensions/openforu/surface/surfaceWidgetRuntime'

const log = createLogger('extensionSurface')

const surfaceWindows = new Map<string, BrowserWindow>()
const surfaceContextByWebContentsId = new Map<number, { extensionId: string; title: string }>()

let surfaceIpcRegistered = false

export type OpenExtensionSurfaceInput = {
  extensionId: string
  title: string
  html: string
}

function surfacePreloadPath(): string {
  return resolvePreloadPath('surfacePreload.cjs')
}

export function registerSurfaceIpc(): void {
  if (surfaceIpcRegistered) return
  surfaceIpcRegistered = true

  ipcMain.handle('surface:getContext', (event) => {
    return surfaceContextByWebContentsId.get(event.sender.id) ?? null
  })

  ipcMain.handle('surface:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.close()
    }
    return { ok: true }
  })

  ipcMain.handle('surface:invoke', (event, payload: { action?: string; data?: unknown }) => {
    const ctx = surfaceContextByWebContentsId.get(event.sender.id)
    if (!ctx) return { ok: false, error: 'no surface context' }
    const action = String(payload?.action ?? '').trim()
    if (!action) return { ok: false, error: 'action 为空' }
    return invokeSurfaceWidget(ctx.extensionId, action, payload?.data)
  })

  ipcMain.handle('surface:getState', (event) => {
    const ctx = surfaceContextByWebContentsId.get(event.sender.id)
    if (!ctx) return null
    return getSurfaceWidgetState(ctx.extensionId)
  })
}

function bindSurfaceContext(win: BrowserWindow, extensionId: string, title: string): void {
  const wcId = win.webContents.id
  surfaceContextByWebContentsId.set(wcId, { extensionId, title })
  win.on('closed', () => {
    surfaceContextByWebContentsId.delete(wcId)
  })
}

export function getExtensionSurfaceWindow(extensionId: string): BrowserWindow | null {
  const win = surfaceWindows.get(extensionId)
  if (win && !win.isDestroyed()) return win
  return null
}

export function closeExtensionSurface(extensionId: string): void {
  const win = surfaceWindows.get(extensionId)
  if (!win || win.isDestroyed()) {
    surfaceWindows.delete(extensionId)
    return
  }
  win.close()
  surfaceWindows.delete(extensionId)
}

/** JE-3b / W2-D：打开 uplugin 独立 Surface 窗口（surfacePreload 窄 API） */
export function openExtensionSurface(input: OpenExtensionSurfaceInput): { ok: boolean; error?: string } {
  registerSurfaceIpc()

  const { extensionId, title, html } = input

  const existing = getExtensionSurfaceWindow(extensionId)
  if (existing) {
    existing.show()
    existing.focus()
    return { ok: true }
  }

  const icon = loadWindowIcon()
  const win = new BrowserWindow({
    width: 720,
    height: 520,
    minWidth: 400,
    minHeight: 300,
    title,
    show: false,
    autoHideMenuBar: true,
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: surfacePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  bindSurfaceContext(win, extensionId, title)
  bindSurfaceWidgetWebContents(extensionId, win.webContents)

  win.on('closed', () => {
    surfaceWindows.delete(extensionId)
    unregisterSurfaceWidgetSession(extensionId)
  })

  const dataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(html)}`
  void win
    .loadURL(dataUrl)
    .then(() => {
      win.show()
    })
    .catch((err) => {
      log.error('surface loadURL failed', err)
      win.close()
    })

  surfaceWindows.set(extensionId, win)
  return { ok: true }
}
