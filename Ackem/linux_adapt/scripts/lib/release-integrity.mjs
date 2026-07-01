import { createHash } from 'node:crypto'
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/** electron-builder 绿色版 app.asar 正常约 380–450 MB；手动 @electron/asar pack 常 >700 MB 且无法启动 */
export const MAX_ASAR_BYTES = 500_000_000
export const MIN_ASAR_BYTES = 80_000_000

export function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function asarSizeMb(bytes) {
  return Math.round(bytes / 1024 / 1024)
}

export function assertHealthyAsar(asarPath, label = 'app.asar') {
  if (!existsSync(asarPath)) {
    throw new Error(`Missing ${label}: ${asarPath}`)
  }
  const size = statSync(asarPath).size
  if (size > MAX_ASAR_BYTES) {
    throw new Error(
      `${label} too large (${asarSizeMb(size)} MB) — likely manual @electron/asar pack; use electron-builder instead`
    )
  }
  if (size < MIN_ASAR_BYTES) {
    throw new Error(`${label} too small (${asarSizeMb(size)} MB) — file may be truncated or corrupt`)
  }
  return size
}

export function killAckem() {
  try {
    execSync('taskkill /F /IM Ackem.exe', { stdio: 'ignore' })
  } catch {
    /* not running */
  }
}

/** robocopy 0–7 = success；>=8 = failure */
export function robocopySync(sourceDir, targetDir, { excludeDirs = ['data'] } = {}) {
  const xd = excludeDirs.map((d) => `/XD ${d}`).join(' ')
  const r = spawnSync(
    'robocopy',
    [sourceDir, targetDir, '/E', ...excludeDirs.flatMap((d) => ['/XD', d]), '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'],
    { stdio: 'pipe', shell: true }
  )
  const code = r.status ?? 8
  if (code >= 8) {
    const detail = r.stderr?.length ? r.stderr.toString() : r.stdout?.toString() ?? ''
    throw new Error(`robocopy failed (${code}) — close Ackem.exe and retry${detail ? `\n${detail}` : ''}`)
  }
}

/** 从 builder win-unpacked 同步到绿色版 release（跳过 data/）；含 Ackem.exe 内嵌 asar 校验 */
export function syncBuilderToRelease(unpackedDir, releaseDir) {
  if (!existsSync(unpackedDir)) {
    throw new Error(`Missing builder output: ${unpackedDir}`)
  }
  const srcAsar = join(unpackedDir, 'resources', 'app.asar')
  assertHealthyAsar(srcAsar, 'builder app.asar')

  const dstAsar = join(releaseDir, 'resources', 'app.asar')
  const beforeHash = existsSync(dstAsar) ? sha256(dstAsar) : null

  robocopySync(unpackedDir, releaseDir, { excludeDirs: ['data'] })

  assertHealthyAsar(dstAsar, 'release app.asar')
  const afterHash = sha256(dstAsar)
  const srcHash = sha256(srcAsar)
  if (srcHash !== afterHash) {
    throw new Error('app.asar mismatch after sync — file may be locked')
  }

  const exe = join(releaseDir, 'Ackem.exe')
  if (!existsSync(exe)) {
    throw new Error('Ackem.exe missing after sync')
  }

  const unpacked = join(releaseDir, 'resources', 'app.asar.unpacked')
  if (existsSync(join(unpackedDir, 'resources', 'app.asar.unpacked')) && !existsSync(unpacked)) {
    throw new Error('app.asar.unpacked missing after sync')
  }

  return { size: statSync(dstAsar).size, sha256: afterHash, changed: beforeHash !== afterHash }
}

/** @deprecated 使用 syncBuilderToRelease；保留别名避免旧脚本 import 失败 */
export function syncBuilderResources(unpackedDir, releaseDir) {
  return syncBuilderToRelease(unpackedDir, releaseDir)
}
