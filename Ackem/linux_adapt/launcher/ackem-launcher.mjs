#!/usr/bin/env node
/** pkg 兜底启动器（Go 不可用时的 fallback，仍比整份 Ackem.exe 小很多） */
import { spawn, spawnSync } from 'node:child_process'
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync
} from 'node:fs'
import { dirname, join } from 'node:path'
import { pipeline } from 'node:stream/promises'

const MIN_ASAR = 80_000_000
const MAX_ASAR = 500_000_000

function installDir() {
  return dirname(process.execPath)
}

function log(msg) {
  console.log(msg)
}

function fail(msg) {
  console.error('ERROR:', msg)
  process.exit(1)
}

function launchAckem() {
  const exe = join(installDir(), 'Ackem.exe')
  if (!existsSync(exe)) fail(`Ackem.exe not found: ${exe}`)
  const child = spawn(exe, [], { detached: true, stdio: 'ignore', cwd: installDir() })
  child.unref()
  process.exit(0)
}

function readJob(path) {
  const clean = path.replace(/^"|"$/g, '')
  return JSON.parse(readFileSync(clean, 'utf-8'))
}

async function downloadFile(url, dest, expectedSize) {
  const part = `${dest}.part`
  let startAt = 0
  if (existsSync(part)) startAt = statSync(part).size
  else if (existsSync(dest)) rmSync(dest, { force: true })

  const headers = { 'User-Agent': 'Ackem-Desktop-Updater/1.0', Accept: '*/*' }
  if (startAt > 0) headers.Range = `bytes=${startAt}-`

  const res = await fetch(url, { headers })
  if (!res.ok && res.status !== 206) fail(`Download HTTP ${res.status}`)

  let totalBytes = expectedSize
  const cr = res.headers.get('content-range')
  if (cr) {
    const m = /\/(\d+)$/.exec(cr)
    if (m) totalBytes = Number(m[1])
  } else {
    const len = res.headers.get('content-length')
    if (len) totalBytes = startAt + Number(len)
  }

  mkdirSync(dirname(dest), { recursive: true })
  const flags = startAt > 0 ? 'a' : 'w'
  const out = createWriteStream(part, { flags })
  let downloaded = startAt
  const body = res.body
  if (!body) fail('No response body')
  const reader = body.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!value) continue
    out.write(Buffer.from(value))
    downloaded += value.length
  }
  await new Promise((resolve, reject) => {
    out.end(() => resolve(undefined))
    out.on('error', reject)
  })
  renameSync(part, dest)
  log(`Download complete (${(downloaded / 1e6).toFixed(1)} MB).`)
}

function runSevenZip(args) {
  const exe = join(installDir(), 'resources', 'tools', '7za.exe')
  if (!existsSync(exe)) fail(`Missing 7za.exe: ${exe}`)
  const r = spawnSync(exe, args, { stdio: 'inherit', shell: true })
  if (r.status !== 0) fail('7za failed')
}

function assertHealthyAsar(path) {
  if (!existsSync(path)) fail(`Missing app.asar: ${path}`)
  const size = statSync(path).size
  if (size < MIN_ASAR || size > MAX_ASAR) fail(`app.asar size out of range: ${size}`)
}

function robocopySync(src, dst) {
  const r = spawnSync(
    'robocopy',
    [src, dst, '/E', '/XD', 'data', '/R:2', '/W:2', '/NFL', '/NDL', '/NJH', '/NJS', '/nc', '/ns', '/np'],
    { stdio: 'inherit', shell: true }
  )
  const code = r.status ?? 8
  if (code >= 8) fail(`robocopy failed (${code})`)
}

function resolveStagingDir(extractDir, version) {
  const v = version.replace(/^v/i, '')
  const named = join(extractDir, `Ackem-${v}-win-x64`)
  const candidates = [named, extractDir]
  for (const e of readdirSync(extractDir, { withFileTypes: true })) {
    if (e.isDirectory()) candidates.push(join(extractDir, e.name))
  }
  for (const c of candidates) {
    if (existsSync(join(c, 'Ackem.exe'))) return c
  }
  fail(`Missing Ackem.exe in ${extractDir}`)
}

async function runUpdate(jobPath) {
  const job = readJob(jobPath)
  log('Ackem Update')
  log(`${job.currentVersion} → ${job.targetVersion} (${job.channel})`)
  log('Step 1/4 — Download')
  await downloadFile(job.downloadUrl, job.zipPath, job.expectedSize)
  log('Step 2/4 — Verify')
  const size = statSync(job.zipPath).size
  if (job.expectedSize > 0 && size !== job.expectedSize) {
    fail(`Size mismatch: expected ${job.expectedSize}, got ${size}`)
  }
  runSevenZip(['t', job.zipPath])
  log('Step 3/4 — Extract')
  rmSync(job.extractDir, { recursive: true, force: true })
  mkdirSync(job.extractDir, { recursive: true })
  runSevenZip(['x', job.zipPath, `-o${job.extractDir}`, '-y'])
  const staging = resolveStagingDir(job.extractDir, job.targetVersion)
  assertHealthyAsar(join(staging, 'resources', 'app.asar'))
  log('Step 4/4 — Install (data/ preserved)')
  robocopySync(staging, job.installDir)
  assertHealthyAsar(join(job.installDir, 'resources', 'app.asar'))
  if (!existsSync(join(job.installDir, 'Ackem.exe'))) fail('Ackem.exe missing after install')
  log('Update finished. Starting Ackem…')
  launchAckem()
}

const updaterArg = process.argv.find((a) => a.startsWith('--ackem-updater='))
if (updaterArg) {
  void runUpdate(updaterArg.slice('--ackem-updater='.length))
} else {
  launchAckem()
}
