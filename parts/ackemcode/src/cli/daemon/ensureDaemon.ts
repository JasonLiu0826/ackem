import { spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { health } from '../client/api.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../../..')
const PID_FILE = path.join(os.homedir(), '.ackemcode', 'daemon.pid')

export async function ensureDaemon(opts?: {
  spawnIfMissing?: boolean
  timeoutMs?: number
}): Promise<void> {
  if (await health()) return
  if (opts?.spawnIfMissing === false) {
    throw new Error(
      `AckemCode daemon not reachable. Start it with: npm run daemon`
    )
  }
  await spawnDaemon()
  const deadline = Date.now() + (opts?.timeoutMs ?? 15_000)
  while (Date.now() < deadline) {
    if (await health()) return
    await sleep(300)
  }
  throw new Error('AckemCode daemon failed to become ready within 15s')
}

export async function spawnDaemon(): Promise<void> {
  fs.mkdirSync(path.dirname(PID_FILE), { recursive: true })
  const tsxCli = path.join(ROOT, 'node_modules/tsx/dist/cli.mjs')
  const serverEntry = path.join(ROOT, 'src/server/index.ts')
  // On Windows, detached:true opens a new console (Windows Terminal tab
  // titled node.exe). Hide the process instead; keep it as a child.
  const child = spawn(process.execPath, [tsxCli, serverEntry], {
    detached: process.platform !== 'win32',
    stdio: 'ignore',
    windowsHide: true,
    cwd: ROOT,
    env: { ...process.env }
  })
  child.unref()
  if (child.pid) fs.writeFileSync(PID_FILE, String(child.pid), 'utf8')
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
