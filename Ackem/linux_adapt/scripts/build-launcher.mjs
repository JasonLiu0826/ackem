#!/usr/bin/env node
/**
 * 构建 AckemLauncher.exe（Go 优先 ~5MB；失败则保留 ps1/cmd 兜底）
 */
import { execSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, statSync, cpSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const launcherDir = join(root, 'launcher')
const outDir = join(root, 'dist', 'launcher')
const outExe = join(outDir, 'AckemLauncher.exe')

mkdirSync(outDir, { recursive: true })

function hasGo() {
  const r = spawnSync('go', ['version'], { stdio: 'pipe', shell: true })
  return r.status === 0
}

function copyScripts() {
  for (const name of ['AckemLauncher.ps1', 'AckemLauncher.cmd']) {
    cpSync(join(launcherDir, name), join(outDir, name))
  }
  console.log('  AckemLauncher.ps1 + .cmd copied (PowerShell fallback)')
}

copyScripts()

let builtExe = false
if (hasGo()) {
  try {
    console.log('Building AckemLauncher.exe with Go…')
    execSync('go build -ldflags="-s -w" -o AckemLauncher.exe .', {
      cwd: launcherDir,
      stdio: 'inherit',
      shell: true
    })
    copyFileSync(join(launcherDir, 'AckemLauncher.exe'), outExe)
    builtExe = true
  } catch (e) {
    console.warn('Go build failed — using ps1/cmd only:', e.message ?? e)
  }
} else {
  console.log('Go not installed — skip native exe (use AckemLauncher.cmd / .ps1, or install Go and re-run)')
}

if (builtExe) {
  const sizeMb = statSync(outExe).size / (1024 * 1024)
  console.log(`OK — ${outExe} (${sizeMb.toFixed(1)} MB)`)
} else {
  console.log(`OK — launcher scripts in ${outDir} (no .exe yet)`)
}
