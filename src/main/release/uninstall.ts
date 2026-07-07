/**
 * Ackem 鍗歌浇锛氭闈㈠揩鎹锋柟寮忋€佸彲閫夊垹闄ゆ暟鎹?绋嬪簭锛涙敮鎸佽缃唴瑙﹀彂鎴栬繍琛?Uninstall Ackem.bat
 */
import { app, shell } from 'electron'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { spawn } from 'node:child_process'
import { loadSettings } from '../settings'
import { resolveDataRoot } from '../paths'
import { createLogger } from '../logger'
import { markAppQuitting, performAppShutdown } from '../shutdown'
import { resolvePackagedAppDir } from '../portableEnv'

const log = createLogger('uninstall')

export type UninstallMode = 'dev' | 'portable' | 'installed'

export type UninstallInfo = {
  mode: UninstallMode
  installDir: string
  dataRoot: string
  batPath: string | null
  nsisUninstaller: string | null
}

export type UninstallLaunchOptions = {
  deleteData?: boolean
  removeApp?: boolean
}

function exeDir(): string {
  return resolvePackagedAppDir()
}

function resolveNsisUninstaller(installDir: string): string | null {
  const candidates = [
    join(installDir, 'Uninstall Ackem.exe'),
    join(installDir, 'Uninstall.exe')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function resolveUninstallBatPath(): string | null {
  const candidates = [
    join(exeDir(), 'Uninstall Ackem.bat'),
    join(process.resourcesPath, 'uninstall.bat'),
    join(exeDir(), 'resources', 'uninstall.bat')
  ]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  if (!app.isPackaged) {
    const dev = join(process.cwd(), 'scripts', 'uninstall.bat')
    if (existsSync(dev)) return dev
  }
  return null
}

export function getUninstallInfo(): UninstallInfo {
  const installDir = exeDir()
  const dataRoot = resolveDataRoot(loadSettings())
  const nsisUninstaller = resolveNsisUninstaller(installDir)
  let mode: UninstallMode = 'dev'
  if (app.isPackaged) {
    mode = nsisUninstaller ? 'installed' : 'portable'
  }
  return {
    mode,
    installDir,
    dataRoot,
    batPath: resolveUninstallBatPath(),
    nsisUninstaller
  }
}

function spawnDetachedUninstall(batPath: string, args: string[]): void {
  const child = spawn('cmd.exe', ['/c', batPath, ...args], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: dirname(batPath)
  })
  child.unref()
}

export async function launchUninstallAndQuit(opts: UninstallLaunchOptions): Promise<void> {
  markAppQuitting()
  await performAppShutdown()

  const info = getUninstallInfo()
  const deleteData = Boolean(opts.deleteData)
  const removeApp = Boolean(opts.removeApp)

  if (info.nsisUninstaller && !removeApp && !deleteData) {
    shell.openPath(info.nsisUninstaller)
    app.quit()
    return
  }

  const bat = info.batPath
  if (!bat) {
    log.warn('uninstall.bat not found', info)
    if (deleteData && existsSync(info.dataRoot)) {
      shell.trashItem(info.dataRoot).catch(() => {})
    }
    app.quit()
    return
  }

  const args: string[] = []
  if (deleteData) args.push('/DATA')
  if (removeApp || info.mode === 'portable') args.push('/REMOVE_APP')

  log.info('launching uninstall helper', { bat, args })
  spawnDetachedUninstall(bat, args)
  app.quit()
}
