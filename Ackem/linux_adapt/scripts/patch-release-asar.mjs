#!/usr/bin/env node
/**
 * 安全更新绿色版 resources/（electron-builder 产物；禁止 @electron/asar extract+pack）。
 * 同步 app.asar + app.asar.unpacked，保留 release/data/。
 * 用法：npm run build && node scripts/patch-release-asar.mjs
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  asarSizeMb,
  killAckem,
  syncBuilderToRelease,
} from './lib/release-integrity.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version === '0.1.0' ? '0.0.0' : pkg.version
const releaseDir = join(root, 'dist', 'release', `Ackem-${version}-win-x64`)
const ebOut = join(root, 'dist', 'green-build-tmp')
const unpacked = join(ebOut, 'win-unpacked')
const rendererOut = join(root, 'out', 'renderer')

function run(cmd) {
  execSync(cmd, { stdio: 'inherit', shell: true })
}

function walkFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkFiles(p).forEach((f) => out.push(f))
    else out.push(p)
  }
  return out
}

if (!existsSync(join(rendererOut, 'index.html'))) {
  console.error('Missing out/renderer — run: npm run build')
  process.exit(1)
}

const indexBundle = walkFiles(join(rendererOut, 'assets')).find((f) => /index-.*\.js$/.test(f))
if (!indexBundle || !readFileSync(indexBundle, 'utf-8').includes('settings-update')) {
  console.error('Renderer build looks incomplete — run: npm run build')
  process.exit(1)
}

killAckem()

console.log('Packaging with electron-builder (safe app.asar)…')
run(
  `npx electron-builder --config electron-builder.yml --win dir --config.directories.output=${ebOut.replace(/\\/g, '/')}`
)

if (!existsSync(join(unpacked, 'resources', 'app.asar'))) {
  console.error('Missing builder output:', join(unpacked, 'resources', 'app.asar'))
  process.exit(1)
}

const result = syncBuilderToRelease(unpacked, releaseDir)

function bundleLauncherAssets(targetDir) {
  const launcherDir = join(root, 'dist', 'launcher')
  const launcherExe = join(launcherDir, 'AckemLauncher.exe')
  if (existsSync(launcherExe)) {
    cpSync(launcherExe, join(targetDir, 'AckemLauncher.exe'))
    console.log('  AckemLauncher.exe —', (statSync(join(targetDir, 'AckemLauncher.exe')).size / (1024 * 1024)).toFixed(1), 'MB')
  }
  for (const name of ['AckemLauncher.ps1', 'AckemLauncher.cmd']) {
    const src = join(launcherDir, name)
    if (existsSync(src)) cpSync(src, join(targetDir, name))
  }
  const legacy = join(targetDir, 'AckemUpdater.exe')
  if (existsSync(legacy)) {
    rmSync(legacy, { force: true })
    console.log('  Removed legacy AckemUpdater.exe')
  }
  const sevenZip = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  const toolsDir = join(targetDir, 'resources', 'tools')
  mkdirSync(toolsDir, { recursive: true })
  if (existsSync(sevenZip)) cpSync(sevenZip, join(toolsDir, '7za.exe'))
}

execSync('node scripts/build-launcher.mjs', { cwd: root, stdio: 'inherit', shell: true })
bundleLauncherAssets(releaseDir)

console.log('\nOK — release program synced (Ackem.exe + resources/, data/ preserved)')
console.log('  app.asar:', asarSizeMb(result.size) + ' MB', '| sha256:', result.sha256.slice(0, 16) + '…')
console.log('  data/ preserved at:', join(releaseDir, 'data'))
console.log('Restart:', join(releaseDir, 'Ackem.exe'))
