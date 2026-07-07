import { app, BrowserWindow, screen } from 'electron'
import { loadWindowIcon } from './appIcon'
import { resolvePreloadPath, resolveRendererHtml } from './outPaths'
import { getUiTheme } from './uiTheme'
import { createLogger } from './logger'

const log = createLogger('petWindow')

/** 姣忔鎵撳紑妗屽疇鏃剁殑榛樿灏哄锛堟渶灏忕獥鍙ｏ紝璁捐鍙傝€?360脳540 鍙墜鍔ㄦ媺澶э級 */
const PET_DEFAULT_WIDTH = 300
const PET_DEFAULT_HEIGHT = 420
const PET_MARGIN = 16

let petWindow: BrowserWindow | null = null
let petAlwaysOnTop = true

export function getPetWindow(): BrowserWindow | null {
  return petWindow
}

export function setPetAlwaysOnTop(v: boolean): void {
  petAlwaysOnTop = v
  petWindow?.setAlwaysOnTop(v, 'floating')
}

export function createPetWindow(): BrowserWindow {
  if (petWindow && !petWindow.isDestroyed()) return petWindow

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  const icon = loadWindowIcon()

  const win = new BrowserWindow({
    width: PET_DEFAULT_WIDTH,
    height: PET_DEFAULT_HEIGHT,
    minWidth: PET_DEFAULT_WIDTH,
    minHeight: PET_DEFAULT_HEIGHT,
    maxWidth: 420,
    maxHeight: 600,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: petAlwaysOnTop,
    skipTaskbar: false,
    show: false,
    title: 'Ackem',
    icon: icon.isEmpty() ? undefined : icon,
    webPreferences: {
      preload: resolvePreloadPath('index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('close', (e) => {
    if (!(app as { isQuitting?: boolean }).isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })

  if (devUrl) {
    const petUrl = `${devUrl.replace(/\/$/, '')}/pet.html`
    void win.loadURL(petUrl).catch((err) => {
      log.error('pet loadURL failed', err)
      void win.loadFile(resolveRendererHtml('pet.html'))
    })
  } else {
    void win.loadFile(resolveRendererHtml('pet.html'))
  }

  petWindow = win
  return win
}

/** 涓绘樉绀哄櫒宸ヤ綔鍖哄彸涓嬭锛堥伩寮€浠诲姟鏍忥級 */
function placePetBottomRight(win: BrowserWindow): void {
  const { width, height } = win.getBounds()
  const { workArea } = screen.getPrimaryDisplay()
  const x = Math.round(workArea.x + workArea.width - width - PET_MARGIN)
  const y = Math.round(workArea.y + workArea.height - height - PET_MARGIN)
  win.setBounds({ x, y, width, height })
}

export function showPetWindow(): void {
  const win = createPetWindow()
  win.setSize(PET_DEFAULT_WIDTH, PET_DEFAULT_HEIGHT)
  placePetBottomRight(win)
  if (!win.isVisible()) win.show()
  win.focus()
  win.webContents.once('did-finish-load', () => {
    if (!win.isDestroyed()) {
      win.webContents.send('ui:themeChanged', { mode: getUiTheme() })
    }
  })
  if (!win.webContents.isLoading()) {
    win.webContents.send('ui:themeChanged', { mode: getUiTheme() })
  }
}

export function hidePetWindow(): void {
  petWindow?.hide()
}

export function destroyPetWindow(): void {
  if (petWindow && !petWindow.isDestroyed()) {
    petWindow.destroy()
  }
  petWindow = null
}

export function isPetVisible(): boolean {
  return petWindow != null && !petWindow.isDestroyed() && petWindow.isVisible()
}
