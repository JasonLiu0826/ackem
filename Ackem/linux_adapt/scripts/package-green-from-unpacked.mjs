#!/usr/bin/env node
/** 从已有 win-unpacked 目录生成绿色版文件夹 + zip（不重新 electron-builder） */
import { execSync } from 'node:child_process'
import { cpSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const unpackedArg = process.argv[2]
const unpacked = unpackedArg ?? join(root, 'dist', 'win-unpacked')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version === '0.1.0' ? '0.0.0' : pkg.version
const releaseRoot = join(root, 'dist', 'release')
const sevenZip = join(root, 'node_modules', '7zip-bin', 'win', 'x64', '7za.exe')

if (!existsSync(unpacked)) throw new Error(`Missing ${unpacked}`)
if (!existsSync(sevenZip)) throw new Error(`Missing ${sevenZip}`)

console.log('Packaging from', unpacked)
try {
  execSync('taskkill /F /IM Ackem.exe', { stdio: 'ignore' })
} catch {
  /* not running */
}
let outRoot = releaseRoot
try {
  rmSync(releaseRoot, { recursive: true, force: true })
} catch (e) {
  if (e?.code !== 'EBUSY' && e?.code !== 'EPERM') throw e
  outRoot = join(root, 'dist', 'ship')
  console.warn(`release/ locked, using ${outRoot}`)
  rmSync(outRoot, { recursive: true, force: true })
}
const greenDir = join(outRoot, `Ackem-${version}-win-x64`)
const zipPath = join(outRoot, `Ackem-${version}-win-x64.zip`)
cpSync(unpacked, greenDir, { recursive: true })

for (const [srcRel, destName] of [
  ['scripts/launch-ackem.bat', '启动 Ackem.bat'],
  ['scripts/uninstall.bat', 'Uninstall Ackem.bat'],
]) {
  cpSync(join(root, srcRel), join(greenDir, destName))
}

const dataDir = join(greenDir, 'data')
if (existsSync(dataDir)) {
  console.warn('Removing data/ from release folder')
  rmSync(dataDir, { recursive: true, force: true })
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

const srcAsar = join(unpacked, 'resources', 'app.asar')
const dstAsar = join(greenDir, 'resources', 'app.asar')
if (sha256(srcAsar) !== sha256(dstAsar)) {
  throw new Error(`app.asar mismatch after copy — file may be locked. Close Ackem/Cursor preview and retry.\n  src: ${sha256(srcAsar)}\n  dst: ${sha256(dstAsar)}`)
}
if (sha256(join(unpacked, 'Ackem.exe')) !== sha256(join(greenDir, 'Ackem.exe'))) {
  throw new Error('Ackem.exe mismatch after copy — aborting release')
}

console.log('Patching Ackem.exe metadata (icon + ProductName)…')
execSync(`node scripts/patch-exe-metadata.mjs "${greenDir.replace(/\\/g, '/')}"`, {
  cwd: root,
  stdio: 'inherit',
})

for (const f of ['ffmpeg.dll', 'icudtl.dat']) {
  if (!existsSync(join(greenDir, f))) throw new Error(`Release missing ${f}`)
}

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
`,
  'utf-8'
)

for (const p of ['Ackem.exe', join('resources', 'app.asar'), '启动 Ackem.bat']) {
  if (!existsSync(join(greenDir, p))) throw new Error(`Release missing ${p}`)
}
if (existsSync(dataDir)) throw new Error(`Release still contains data/`)

console.log('Creating zip…')
execSync(`"${sevenZip}" a -tzip -mx=1 "${zipPath}" *`, { cwd: greenDir, stdio: 'inherit' })
execSync(`"${sevenZip}" t "${zipPath}"`, { stdio: 'inherit' })

console.log('\nDone.')
console.log('  Folder:', greenDir)
console.log('  Zip:   ', zipPath)

const distZip = join(root, 'dist', `Ackem-${version}-win-x64.zip`)
cpSync(zipPath, distZip)
console.log('  Copy:  ', distZip)
