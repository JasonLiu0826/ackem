import { app, BrowserWindow, screen } from 'electron'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWindowIcon } from './appIcon'
import { getUiTheme } from './uiTheme'
import { createLogger } from './logger'

const __dirname = dirname(fileURLToPath(import.meta.url))
const log = createLogger('petWindow')

/** 每次打开桌宠时的默认尺寸（最小窗口，设计参考 360×540 可手动拉大） */
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
      preload: join(__dirname, '../preload/index.cjs'),
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
      void win.loadFile(join(__dirname, '../renderer/pet.html'))
    })
  } else {
    void win.loadFile(join(__dirname, '../renderer/pet.html'))
  }

  petWindow = win
  return win
}

/** 主显示器工作区右下角（避开任务栏） */
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
