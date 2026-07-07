import { app, BrowserWindow } from 'electron'
import { resolveRendererHtml } from './outPaths'
import { loadWindowIcon } from './appIcon'

let splashWindow: BrowserWindow | null = null
let splashOpened = false

/** 鍦ㄤ富杩涚▼澶?chunk 鍔犺浇鍓嶅敖鏃╁睍绀哄紑灞忥紙鐙珛闈欐€侀〉 + 杩涘害鏉★級 */
export function openStartupSplash(): void {
  if (splashOpened) return
  splashOpened = true
  if (app.isReady()) {
    void showSplashWindow()
  } else {
    void app.whenReady().then(() => showSplashWindow())
  }
}

async function showSplashWindow(): Promise<void> {
  if (splashWindow && !splashWindow.isDestroyed()) return

  const icon = loadWindowIcon()
  const win = new BrowserWindow({
    width: 960,
    height: 680,
    minWidth: 900,
    minHeight: 620,
    title: 'Ackem',
    icon: icon.isEmpty() ? undefined : icon,
    show: false,
    backgroundColor: '#0f0d14',
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  splashWindow = win
  win.on('closed', () => {
    if (splashWindow === win) splashWindow = null
  })

  try {
    await win.loadFile(resolveRendererHtml('startup.html'))
    win.show()
    win.focus()
  } catch (e) {
    console.error('[Ackem] startup splash failed:', e)
    if (!win.isDestroyed()) win.close()
    splashWindow = null
  }
}

export function closeStartupSplash(): void {
  const win = splashWindow
  splashWindow = null
  if (win && !win.isDestroyed()) {
    win.close()
  }
}
