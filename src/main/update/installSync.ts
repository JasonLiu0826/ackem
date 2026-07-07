import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

export const MAX_ASAR_BYTES = 500_000_000
export const MIN_ASAR_BYTES = 80_000_000

export function sha256(filePath: string): string {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function assertHealthyAsar(asarPath: string, label = 'app.asar'): number {
  if (!existsSync(asarPath)) {
    throw new Error(`Missing ${label}: ${asarPath}`)
  }
  const size = statSync(asarPath).size
  if (size > MAX_ASAR_BYTES) {
    throw new Error(`${label} too large 鈥?refuse to install broken asar pack`)
  }
  if (size < MIN_ASAR_BYTES) {
    throw new Error(`${label} too small 鈥?file may be truncated`)
  }
  return size
}

export function robocopySync(sourceDir: string, targetDir: string, excludeDirs: string[] = ['data']): void {
  const r = spawnSync(
    'robocopy',
    [sourceDir, targetDir, '/E', ...excludeDirs.flatMap((d) => ['/XD', d]), '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'],
    { stdio: 'pipe', shell: true }
  )
  const code = r.status ?? 8
  if (code >= 8) {
    const detail = r.stderr?.length ? r.stderr.toString() : r.stdout?.toString() ?? ''
    throw new Error(`robocopy failed (${code})${detail ? `: ${detail}` : ''}`)
  }
}

export function syncReleaseFromStaging(stagingDir: string, installDir: string): void {
  const srcAsar = join(stagingDir, 'resources', 'app.asar')
  assertHealthyAsar(srcAsar, 'staging app.asar')
  robocopySync(stagingDir, installDir, ['data'])
  const dstAsar = join(installDir, 'resources', 'app.asar')
  assertHealthyAsar(dstAsar, 'installed app.asar')
  if (sha256(srcAsar) !== sha256(dstAsar)) {
    throw new Error('app.asar mismatch after install 鈥?files may be locked')
  }
  if (!existsSync(join(installDir, 'Ackem.exe'))) {
    throw new Error('Ackem.exe missing after install')
  }
}
