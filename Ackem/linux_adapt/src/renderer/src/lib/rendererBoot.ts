/**
 * FIX-036 — 检测是否在浏览器直开 Vite（无 Electron preload）
 */
export function isAckemPreloadAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.ackem !== 'undefined'
}

export function formatMissingPreloadError(): string {
  const en =
    'window.ackem is missing. If you opened http://localhost:5173 in a browser, close it and start Electron instead (npm run dev or 一键启动.bat). In Electron, check preload errors in DevTools.'
  const zh =
    '未检测到 window.ackem。若在浏览器打开 http://localhost:5173 会出现此情况，请关闭浏览器并用 npm run dev / 一键启动.bat 启动 Electron；若在 Electron 内仍如此，请检查 preload 是否报错。'
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return en
  }
  return zh
}

export const BOOT_CONNECTING_ZH = '正在连接主进程…'
export const BOOT_CONNECTING_EN = 'Connecting to main process…'

export function formatBootConnectingMessage(): string {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return BOOT_CONNECTING_EN
  }
  return BOOT_CONNECTING_ZH
}
