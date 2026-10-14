import { execFile } from 'node:child_process'
import { realpathSync, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

export type ExternalCliLaunch = { executable: string; args: string[]; cwd: string; env: Record<string, string> }
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`

/** Pass arguments as PowerShell literals, never as a cmd/start command string. */
export function externalCliScript(launch: ExternalCliLaunch): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    "$Host.UI.RawUI.WindowTitle = 'AckemCode CLI'",
    "$Host.UI.RawUI.BackgroundColor = 'Black'",
    "$Host.UI.RawUI.ForegroundColor = 'White'",
    'Clear-Host',
    '[Console]::InputEncoding = [System.Text.UTF8Encoding]::new()',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new()',
    `Set-Location -LiteralPath ${literal(launch.cwd)}`,
    `$cliArgs = @(${launch.args.map(literal).join(', ')})`,
    `& ${literal(launch.executable)} @cliArgs`
  ].join('\r\n')
}

/** A real Windows console hosts the existing Ink CLI. It is not a renderer/PTY panel. */
export async function launchExternalCli(launch: ExternalCliLaunch): Promise<number> {
  if (process.platform !== 'win32') throw Error('CLI 独立窗口目前支持 Windows')
  if (!isAbsolute(launch.cwd) || !isAbsolute(launch.executable)) throw Error('CLI requires absolute runtime and working directory paths')
  const cwd = realpathSync(launch.cwd)
  if (!statSync(cwd).isDirectory()) throw Error('CLI working directory is unavailable')
  const shell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const encoded = Buffer.from(externalCliScript({ ...launch, cwd }), 'utf16le').toString('base64')
  const argumentsText = `-NoLogo -NoProfile -NoExit -EncodedCommand ${encoded}`
  const helper = [
    "$ErrorActionPreference = 'Stop'",
    `$console = Start-Process -FilePath ${literal(shell)} -ArgumentList ${literal(argumentsText)} -WorkingDirectory ${literal(cwd)} -WindowStyle Normal -PassThru`,
    '$console.Id'
  ].join('\r\n')
  return new Promise((resolve, reject) => {
    execFile(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(helper, 'utf16le').toString('base64')], {
      cwd, env: launch.env, windowsHide: true, encoding: 'utf8', timeout: 15_000, maxBuffer: 16 * 1024
    }, (error, stdout) => {
      if (error) { reject(Error('无法打开 AckemCode CLI 独立窗口，请检查终端运行环境')); return }
      const pid = Number(stdout.trim())
      if (!Number.isSafeInteger(pid) || pid <= 0) { reject(Error('AckemCode CLI 窗口启动未确认')); return }
      resolve(pid)
    })
  })
}
