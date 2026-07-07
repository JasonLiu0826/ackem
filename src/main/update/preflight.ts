import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { app } from 'electron'

/** Preflight check before spawning updater */
export function runUpdatePreflight(): { ok: true; installDir: string } | { ok: false; reason: string } {
  const installDir = join(app.getPath('exe'), '..')
  if (!existsSync(installDir)) {
    return { ok: false, reason: 'install_dir_missing' }
  }
  return { ok: true, installDir }
}

export function resolveLauncherExePath(installDir: string): string {
  const launcher = `${installDir}\\AckemLauncher.exe`
  if (existsSync(launcher)) return launcher
  const cmd = `${installDir}\\AckemLauncher.cmd`
  if (existsSync(cmd)) return cmd
  // 鍏煎鏃х豢鑹茬増
  const legacy = `${installDir}\\AckemUpdater.exe`
  if (existsSync(legacy)) return legacy
  return app.getPath('exe')
}

/** @deprecated use resolveLauncherExePath */
export function resolveUpdaterExePath(installDir: string): string {
  return resolveLauncherExePath(installDir)
}

export function spawnLauncherProcess(installDir: string, jobPath: string): void {
  const target = resolveLauncherExePath(installDir)
  const arg = `--Ackem-updater=${jobPath}`

  if (target.toLowerCase().endsWith('.cmd')) {
    const child = spawn('cmd.exe', ['/c', target, arg], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      cwd: installDir
    })
    child.unref()
    return
  }

  const child = spawn(target, [arg], {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
    cwd: installDir
  })
  child.unref()
}
