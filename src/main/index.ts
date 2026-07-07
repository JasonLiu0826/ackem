import { basename } from 'node:path'
import { app, protocol } from 'electron'
import { openStartupSplash } from './startupSplash.js'

// 娉ㄥ唽 Ackem-img 涓虹壒鏉冨崗璁紙蹇呴』鍦?app.whenReady 涔嬪墠锛?
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'ackem-img',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
])

// 闃叉 EPIPE 宕╂簝锛氱閬撴柇寮€鏃堕潤榛樺拷鐣?
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE') return // 闈欓粯蹇界暐 EPIPE
  console.error('[Ackem] uncaughtException:', err)
})

// 瑕嗙洊 console 杈撳嚭锛孍PIPE 鏃堕潤榛?
const origWarn = console.warn
const origError = console.error
const safeLog = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
  try { fn(...args) } catch { /* EPIPE ignored */ }
}
console.warn = safeLog(origWarn)
console.error = safeLog(origError)

const isUpdater =
  basename(process.execPath).toLowerCase() === 'ackemupdater.exe' ||
  process.argv.some((a) => a.startsWith('--ackem-updater='))

if (isUpdater) {
  void import('./updater/run.js').then(({ runAckemUpdater }) => runAckemUpdater())
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  openStartupSplash()
  void import('./mainBootstrap.js').catch((err) => {
    console.error('[Ackem] failed to load main app:', err)
    process.exit(1)
  })
}
