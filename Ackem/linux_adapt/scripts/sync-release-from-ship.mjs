#!/usr/bin/env node
/** 用 dist/ship 完整绿色版覆盖 dist/release（修复缺 ffmpeg.dll / 损坏 app.asar） */
import { execSync } from 'node:child_process'
import { copyFileSync, createHash, existsSync, readFileSync, rmSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const version = '0.0.0'
const shipDir = join(root, 'dist', 'ship', `Ackem-${version}-win-x64`)
const releaseDir = join(root, 'dist', 'release', `Ackem-${version}-win-x64`)

if (!existsSync(shipDir)) {
  throw new Error(`Missing ${shipDir} — run: node scripts/package-green-from-unpacked.mjs dist/fresh-build/win-unpacked`)
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function assertSame(relPath) {
  const src = join(shipDir, relPath)
  const dst = join(releaseDir, relPath)
  if (!existsSync(src)) throw new Error(`Missing ship file: ${src}`)
  if (!existsSync(dst)) throw new Error(`Missing release file: ${dst}`)
  const a = sha256(src)
  const b = sha256(dst)
  if (a !== b) {
    console.warn(`${relPath} mismatch — force copying`)
    copyFileSync(src, dst)
    if (sha256(src) !== sha256(dst)) {
      throw new Error(`${relPath} still mismatched after force copy (file locked?)`)
    }
  }
}

try {
  execSync('taskkill /F /IM Ackem.exe', { stdio: 'ignore' })
} catch {
  /* not running */
}

execSync(`robocopy "${shipDir}" "${releaseDir}" /E /IS /IT /R:2 /W:2`, { stdio: 'inherit' })

const nested = join(releaseDir, 'win-unpacked')
if (existsSync(nested)) rmSync(nested, { recursive: true, force: true })

for (const rel of ['Ackem.exe', join('resources', 'app.asar'), 'ffmpeg.dll', 'icudtl.dat']) {
  assertSame(rel)
}

execSync(`node scripts/patch-exe-metadata.mjs "${releaseDir.replace(/\\/g, '/')}"`, {
  cwd: root,
  stdio: 'inherit',
})

console.log('\nRelease ready:', releaseDir)
