import { basename } from 'node:path'
import { app } from 'electron'
import { openStartupSplash } from './startupSplash.js'

// 防止 EPIPE 崩溃：管道断开时静默忽略
process.on('uncaughtException', (err: NodeJS.ErrnoException) => {
  if (err?.code === 'EPIPE') return // 静默忽略 EPIPE
  console.error('[Britney] uncaughtException:', err)
})

// 覆盖 console 输出，EPIPE 时静默
const origWarn = console.warn
const origError = console.error
const safeLog = (fn: (...args: unknown[]) => void) => (...args: unknown[]) => {
  try { fn(...args) } catch { /* EPIPE ignored */ }
}
console.warn = safeLog(origWarn)
console.error = safeLog(origError)

const isUpdater =
  basename(process.execPath).toLowerCase() === 'britneyupdater.exe' ||
  process.argv.some((a) => a.startsWith('--britney-updater='))

if (isUpdater) {
  void import('./updater/run.js').then(({ runBritneyUpdater }) => runBritneyUpdater())
} else if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  openStartupSplash()
  void import('./mainBootstrap.js').catch((err) => {
    console.error('[Britney] failed to load main app:', err)
    process.exit(1)
  })
}
