#!/usr/bin/env node
/**
 * 快速启动绿色版：win-unpacked 目录 + zip
 */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { syncGreenReleaseDocs, stripShippedUserData } from './sync-release-doc.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version === '0.1.0' ? '0.0.0' : pkg.version
const dist = join(root, 'dist')
const ebStagingPrimary = join(dist, '_eb-staging')
const ebStagingFallback = join(dist, 'green-build-tmp')
const releaseRoot = join(dist, 'release')
const greenName = `Ackem-${version}-win-x64`
const greenDir = join(releaseRoot, greenName)
const zipPath = join(releaseRoot, `${greenName}.zip`)

const mirror =
  process.env.ELECTRON_BUILDER_BINARIES_MIRROR ||
  'https://ghfast.top/https://github.com/electron-userland/electron-builder-binaries/releases/download/'

function tryRm(path) {
  try {
    rmSync(path, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function resolveEbOutputDir() {
  if (tryRm(ebStagingPrimary)) return 'dist/_eb-staging'
  console.warn('\n⚠ _eb-staging locked — using dist/green-build-tmp (close Ackem/Cursor file locks if builds keep failing)')
  tryRm(ebStagingFallback)
  return 'dist/green-build-tmp'
}

const ebOutputRel = resolveEbOutputDir()
const ebStaging = join(root, ebOutputRel.replace(/\//g, '\\'))
const unpacked = join(ebStaging, 'win-unpacked')

console.log('Building Ackem green release (fast startup)…\n')

execSync('node scripts/build-launcher.mjs', { cwd: root, stdio: 'inherit', shell: true })

execSync(
  `npm run build && npx electron-builder --config electron-builder.yml --win dir --config.directories.output=${ebOutputRel}`,
  {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, ELECTRON_BUILDER_BINARIES_MIRROR: mirror },
}
)

if (!existsSync(unpacked)) {
  throw new Error(`Missing ${unpacked} — electron-builder dir target failed`)
}

console.log('\nPackaging green folder…')
try {
  execSync('taskkill /F /IM Ackem.exe', { stdio: 'ignore' })
} catch {
  /* not running */
}

function syncUnpackedToGreen(sourceDir, targetDir) {
  mkdirSync(dirname(targetDir), { recursive: true })
  if (!existsSync(targetDir)) {
    cpSync(sourceDir, targetDir, { recursive: true })
    return
  }
  console.warn('\n⚠ release/ in use — robocopy in-place sync (close Ackem if copy fails)')
  stripShippedUserData(targetDir)
  const code = execSync(
    `robocopy "${sourceDir}" "${targetDir}" /E /XD data /R:2 /W:2 /NFL /NDL /NJH /NJS /nc /ns /np`,
    { stdio: 'pipe' }
  ).status
  if (code >= 8) {
    throw new Error(`robocopy failed (${code}) — close Ackem.exe and retry npm run dist:green`)
  }
}

if (tryRm(releaseRoot)) {
  cpSync(unpacked, greenDir, { recursive: true })
} else {
  syncUnpackedToGreen(unpacked, greenDir)
}

const extras = [
  ['scripts/launch-ackem.bat', '启动 Ackem.bat'],
  ['scripts/uninstall.bat', 'Uninstall Ackem.bat'],
]
for (const [srcRel, destName] of extras) {
  cpSync(join(root, srcRel), join(greenDir, destName))
}

function bundleLauncherAssets(targetDir) {
  const launcherDir = join(root, 'dist', 'launcher')
  const launcherExe = join(launcherDir, 'AckemLauncher.exe')
  const launcherPs1 = join(launcherDir, 'AckemLauncher.ps1')
  const launcherCmd = join(launcherDir, 'AckemLauncher.cmd')

  if (existsSync(launcherExe)) {
    cpSync(launcherExe, join(targetDir, 'AckemLauncher.exe'))
    console.log(`  AckemLauncher.exe — ${(statSync(join(targetDir, 'AckemLauncher.exe')).size / (1024 * 1024)).toFixed(1)} MB`)
  }
  if (existsSync(launcherPs1)) cpSync(launcherPs1, join(targetDir, 'AckemLauncher.ps1'))
  if (existsSync(launcherCmd)) cpSync(launcherCmd, join(targetDir, 'AckemLauncher.cmd'))
  if (!existsSync(launcherExe) && existsSync(launcherCmd)) {
    console.log('  AckemLauncher.cmd + .ps1 (no native exe — install Go for ~5MB exe)')
  }
  const legacyUpdater = join(targetDir, 'AckemUpdater.exe')
  if (existsSync(legacyUpdater)) {
    rmSync(legacyUpdater, { force: true })
    console.log('  Removed legacy AckemUpdater.exe (full Electron duplicate)')
  }
  const sevenZip = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  const toolsDir = join(targetDir, 'resources', 'tools')
  mkdirSync(toolsDir, { recursive: true })
  if (existsSync(sevenZip)) {
    cpSync(sevenZip, join(toolsDir, '7za.exe'))
  } else {
    console.warn('⚠ Missing 7za.exe — in-app update zip verify may fail')
  }
}

bundleLauncherAssets(greenDir)

/** 便携模式会在 exe 旁生成 data/；本地试跑后若被打进 zip 会泄露记忆/对话/人格状态 */
function stripShippedUserData(targetDir) {
  const dataDir = join(targetDir, 'data')
  if (!existsSync(dataDir)) return
  console.warn('\n⚠ Removing local data/ from release folder (must not be shared):')
  console.warn(' ', dataDir)
  rmSync(dataDir, { recursive: true, force: true })
}

function assertReleaseHasNoUserData(targetDir) {
  const dataDir = join(targetDir, 'data')
  if (existsSync(dataDir)) {
    throw new Error(`Release still contains data/: ${dataDir} — aborting zip`)
  }
}

stripShippedUserData(greenDir)
syncGreenReleaseDocs(greenDir)

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

function assertCopiedBinaryIntegrity(sourceDir, targetDir) {
  const asar = join(sourceDir, 'resources', 'app.asar')
  const size = readFileSync(asar).length
  if (size > 500_000_000) {
    throw new Error(
      `app.asar too large (${Math.round(size / 1024 / 1024)} MB) — use electron-builder, not manual @electron/asar pack`
    )
  }
  for (const rel of ['Ackem.exe', join('resources', 'app.asar')]) {
    const src = join(sourceDir, rel)
    const dst = join(targetDir, rel)
    if (sha256(src) !== sha256(dst)) {
      throw new Error(`${rel} mismatch after copy — close Ackem and retry packaging`)
    }
  }
}

assertCopiedBinaryIntegrity(unpacked, greenDir)

console.log('\nPatching Ackem.exe metadata (icon + ProductName)…')
execSync(`node scripts/patch-exe-metadata.mjs "${greenDir.replace(/\\/g, '/')}"`, {
  cwd: root,
  stdio: 'inherit',
})

for (const f of ['ffmpeg.dll', 'icudtl.dat']) {
  if (!existsSync(join(greenDir, f))) throw new Error(`Release missing ${f}`)
}

rmSync(ebStaging, { recursive: true, force: true })
tryRm(join(dist, 'green-build-tmp'))
if (existsSync(join(dist, 'builder-debug.yml'))) rmSync(join(dist, 'builder-debug.yml'), { force: true })

writeFileSync(
  join(greenDir, 'START.txt'),
  `Ackem ${version} — 快速启动版

用法：
  1. 将整个文件夹放在任意位置（建议 SSD，勿放同步盘根目录）
  2. 双击 Ackem.exe，或双击「启动 Ackem.bat」
  3. 首次启动约 10–30 秒；数据保存在 .\\data\\

若双击后「没反应」：
  - 请看任务栏右下角系统托盘，Ackem 可能已在后台运行
  - 首次启动会解压 embedding，请等待 30 秒再判断
  - 务必完整解压 zip 后再运行，不要直接在 zip 里双击 exe

说明：
  - 解压一次即可，每次启动无需再解压
  - 首次启动会自动创建空的 .\\data\\（请勿把个人 data 文件夹打进 zip 再分享）
  - 卸载：运行 Uninstall Ackem.bat，或在 Ackem 设置 → 其他 → 卸载
  - 更新：设置 → 更新（GitHub / Gitee Releases，保留 data/）

更新提示（开发者）：
  - 请用 npm run dist:green 更新；禁止手动 @electron/asar pack 覆盖 app.asar
`,
  'utf-8'
)

assertReleaseHasNoUserData(greenDir)

function assertReleaseLayout(targetDir) {
  const required = [
    join(targetDir, 'Ackem.exe'),
    join(targetDir, 'resources', 'app.asar'),
    join(targetDir, '启动 Ackem.bat'),
  ]
  for (const p of required) {
    if (!existsSync(p)) throw new Error(`Release missing required file: ${p}`)
  }
}

assertReleaseLayout(greenDir)

function createZip(targetDir, zipOut) {
  const sevenZip = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  if (!existsSync(sevenZip)) {
    throw new Error(`Missing ${sevenZip} — run npm install`)
  }
  if (existsSync(zipOut)) rmSync(zipOut, { force: true })
  // 7za 比 Compress-Archive 可靠；后者在 app.asar 被占用时会打出损坏 zip
  execSync(`"${sevenZip}" a -tzip -mx=1 "${zipOut}" *`, {
    cwd: targetDir,
    stdio: 'inherit',
  })
}

function verifyZip(zipOut) {
  const sevenZip = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')
  execSync(`"${sevenZip}" t "${zipOut}"`, { stdio: 'inherit' })
}

console.log('Creating zip (may take a few minutes)…')
createZip(greenDir, zipPath)
verifyZip(zipPath)

// 同步一份到 dist 根目录，方便查找
const distZip = join(dist, `${greenName}.zip`)
cpSync(zipPath, distZip)

console.log('Syncing docs into green folder…')
syncGreenReleaseDocs(greenDir)

console.log('\nDone.')
console.log('  Folder:', greenDir)
console.log('  Zip:   ', zipPath)
console.log('  Copy:  ', distZip)
console.log('\n用户：解压 zip 一次，之后双击 Ackem.exe 即可快速启动。')
