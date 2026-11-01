#!/usr/bin/env node
/**
 * Global `ackem` entry. Uses compiled dist when it is up to date;
 * otherwise runs tsx + source so CLI changes show up without a rebuild.
 */
import { existsSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const compiled = path.join(root, 'dist', 'cli', 'main.js')
const src = path.join(root, 'src', 'cli', 'main.tsx')
const tsx = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const extra = process.argv.slice(2)

function mtime(p) {
  try {
    return statSync(p).mtimeMs
  } catch {
    return 0
  }
}

const pairs = [
  [src, compiled],
  [
    path.join(root, 'src', 'cli', 'app', 'App.tsx'),
    path.join(root, 'dist', 'cli', 'app', 'App.js')
  ],
  [
    path.join(root, 'src', 'cli', 'app', 'webSearchSetup.tsx'),
    path.join(root, 'dist', 'cli', 'app', 'webSearchSetup.js')
  ]
]
const stale = pairs.some(([from, to]) => mtime(from) > mtime(to))
const useDist = existsSync(compiled) && !stale
const child = useDist
  ? spawn(process.execPath, [compiled, ...extra], { stdio: 'inherit', cwd: process.cwd() })
  : spawn(process.execPath, [tsx, src, ...extra], { stdio: 'inherit', cwd: process.cwd() })

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
