import { BrowserWindow, ipcMain } from 'electron'
import { createLogger } from './logger'
import { broadcastToRenderers } from './rendererBroadcast'

export { broadcastToRenderers } from './rendererBroadcast'
import {
  createPetWindow,
  getPetWindow,
  hidePetWindow,
  isPetVisible,
  setPetAlwaysOnTop,
  showPetWindow
} from './petWindow'
import { getUiTheme, initUiThemeFromDisk, setUiTheme, type UiThemeMode } from './uiTheme'

const log = createLogger('uiWindow')

export type UiViewLevel = 0 | 1 | 2 | 3

let mainWindowRef: BrowserWindow | null = null
let currentLevel: UiViewLevel = 2

export function setMainWindowRef(win: BrowserWindow | null): void {
  mainWindowRef = win
}

export function getMainWindowRef(): BrowserWindow | null {
  return mainWindowRef
}

export type ChatBubblePayload = {
  text: string
  role?: 'assistant' | 'user'
  emotionLabel?: string
}

export function notifyUiChatBubble(payload: ChatBubblePayload): void {
  if (!payload.text?.trim()) return
  broadcastToRenderers('ui:chatBubble', payload)
}

export function expandToMain(opts?: { tab?: string }): void {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.show()
    mainWindowRef.focus()
    mainWindowRef.webContents.send('ui:expand', opts ?? {})
  }
  hidePetWindow()
  currentLevel = 2
  broadcastToRenderers('ui:level', { level: 2 })
}

export function registerUiIpc(): void {
  initUiThemeFromDisk()

  ipcMain.handle('ui:getTheme', () => ({ mode: getUiTheme() }))

  ipcMain.handle('ui:setTheme', (_e, mode: unknown) => {
    const m: UiThemeMode = mode === 'light' ? 'light' : 'dark'
    setUiTheme(m)
    return { ok: true, mode: m }
  })

  ipcMain.handle('ui:getLevel', () => ({ level: currentLevel, petVisible: isPetVisible() }))

  ipcMain.handle('ui:showPet', () => {
    showPetWindow()
    if (mainWindowRef && !mainWindowRef.isDestroyed()) {
      mainWindowRef.hide()
    }
    currentLevel = 0
    return { ok: true, level: 0 }
  })

  ipcMain.handle('ui:hidePet', () => {
    hidePetWindow()
    return { ok: true }
  })

  ipcMain.handle('ui:expandToMain', (_e, opts?: { tab?: string }) => {
    expandToMain(opts)
    return { ok: true, level: 2 }
  })

  ipcMain.handle('ui:setAlwaysOnTop', (_e, v: boolean) => {
    setPetAlwaysOnTop(Boolean(v))
    return { ok: true }
  })

  ipcMain.handle('ui:setLevel', (_e, level: UiViewLevel) => {
    if (level === 0) {
      showPetWindow()
      mainWindowRef?.hide()
      currentLevel = 0
    } else if (level === 3) {
      expandToMain()
      currentLevel = 3
      broadcastToRenderers('ui:level', { level: 3 })
    } else {
      expandToMain()
      currentLevel = level === 1 ? 1 : 2
      broadcastToRenderers('ui:level', { level: currentLevel })
    }
    return { ok: true, level: currentLevel }
  })

  log.info('ui IPC registered')
}
