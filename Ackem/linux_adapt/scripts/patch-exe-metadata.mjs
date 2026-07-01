#!/usr/bin/env node
/** 写入 Ackem.exe 图标与版本信息（防火墙/资源管理器显示 Ackem 而非 Electron） */
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rcedit } from 'rcedit'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const greenDir = process.argv[2] ?? join(root, 'dist', 'release', 'Ackem-0.0.0-win-x64')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version === '0.1.0' ? '0.0.0' : pkg.version
const exePath = join(greenDir, 'Ackem.exe')
const iconPath = join(root, 'build', 'icon.ico')

if (!existsSync(exePath)) throw new Error(`Missing ${exePath}`)
if (!existsSync(iconPath)) throw new Error(`Missing ${iconPath} — run scripts/generate-icons.ps1`)

const winVersion = `${version}.0.0`

await rcedit(exePath, {
  icon: iconPath,
  'version-string': {
    FileDescription: 'Ackem',
    ProductName: 'Ackem',
    InternalName: 'Ackem',
    OriginalFilename: 'Ackem.exe',
    CompanyName: 'Ackem contributors',
    LegalCopyright: 'Copyright © 2026 Ackem contributors',
  },
  'file-version': winVersion,
  'product-version': winVersion,
})

console.log('Patched exe metadata:', exePath)
