#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rcedit } from 'rcedit'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = process.argv[2] ?? join(root, 'dist', 'Ackem-0.0.0-win-x64')
const iconPath = join(root, 'build', 'icon.ico')
const exePath = join(targetDir, 'Ackem.exe')

if (!existsSync(iconPath)) throw new Error(`Missing ${iconPath}`)
if (!existsSync(exePath)) throw new Error(`Missing ${exePath}`)

await rcedit(exePath, { icon: iconPath })
console.log('Patched exe icon:', exePath)
