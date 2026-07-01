#!/usr/bin/env node
/**
 * @deprecated 请用 scripts/patch-release-asar.mjs（同步 asar + app.asar.unpacked）
 */
import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

console.warn('sync-release-asar.mjs is deprecated — forwarding to patch-release-asar.mjs\n')
const script = join(dirname(fileURLToPath(import.meta.url)), 'patch-release-asar.mjs')
const r = spawnSync(process.execPath, [script], { stdio: 'inherit' })
process.exit(r.status ?? 1)
