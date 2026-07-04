import { basename } from 'node:path'
import { app } from 'electron'
import { openStartupSplash } from './startupSplash.js'

const execBase = basename(process.execPath).toLowerCase()
const isUpdater =
  execBase === 'ackemupdater.exe' ||
  execBase === 'ackemupdater' ||
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
