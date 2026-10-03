import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { app } from 'electron'
import { syncRuntimeLlm } from './syncRuntimeLlm'

const DEFAULT_PORT = Number(process.env.ACKEMCODE_PORT || 8787)

let spawned: ChildProcess | null = null
let weSpawned = false

export function ackemCodeBaseUrl(): string {
  return process.env.ACKEMCODE_URL || `http://127.0.0.1:${DEFAULT_PORT}`
}

/** ACKEMCODE_ROOT，否则仓库根目录 ackemcode。 */
export function resolveCodeRoot(): string | undefined {
  const fromEnv = process.env.ACKEMCODE_ROOT?.trim()
  if (fromEnv && existsSync(join(fromEnv, 'src', 'server', 'index.ts'))) {
    return fromEnv
  }
  const candidates: string[] = []
  const push = (root: string) => {
    candidates.push(join(root, 'ackemcode'))
    candidates.push(join(root, 'parts', 'ackemcode'))
    candidates.push(join(root, 'vendor', 'ackemcode'))
  }
  try {
    if (typeof app?.getAppPath === 'function') push(app.getAppPath())
  } catch {
    /* tests / not ready */
  }
  // 打包发行版: parts 运行时作为 extraResource 落在 {exe}/resources/ackemcode
  // (electron-builder extraResources / 绿色版脚本拷贝)。app.getAppPath 指向
  // asar, 读不到 resources 下的散装目录, 因此单独入列。
  try {
    const resPath = process.resourcesPath
    if (resPath) {
      candidates.push(join(resPath, 'ackemcode'))
      candidates.push(join(resPath, 'parts', 'ackemcode'))
    }
  } catch {
    /* tests / not ready */
  }
  push(join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'))
  push(process.cwd())
  return candidates.find((r) => existsSync(join(r, 'src', 'server', 'index.ts')))
}

export function stopSpawnedDaemon(): void {
  if (!weSpawned || !spawned) return
  const child = spawned
  spawned = null
  weSpawned = false
  try {
    child.kill()
  } catch {
    /* already gone */
  }
}

export async function ensureDaemon(): Promise<{ ok: boolean; reason?: string }> {
  const base = ackemCodeBaseUrl()
  const codeRoot = resolveCodeRoot()
  if (codeRoot) syncRuntimeLlm(codeRoot)
  if (await ping(base)) return { ok: true }

  if (!codeRoot) {
    return { ok: false, reason: '本机未接入任务运行时' }
  }
  const entry = join(codeRoot, 'src', 'server', 'index.ts')
  const tsx = join(codeRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  if (!existsSync(entry)) {
    return { ok: false, reason: '本机未接入任务运行时' }
  }

  spawned = spawn(process.execPath, existsSync(tsx) ? [tsx, entry] : [entry], {
    cwd: codeRoot,
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
    env: {
      ...process.env,
      ACKEMCODE_PORT: String(DEFAULT_PORT),
      ELECTRON_RUN_AS_NODE: '1'
    }
  })
  weSpawned = true
  spawned.on('exit', () => {
    if (spawned) {
      spawned = null
      weSpawned = false
    }
  })

  for (let i = 0; i < 20; i++) {
    await sleep(250)
    if (await ping(base)) return { ok: true }
  }
  return { ok: false, reason: 'AckemCode daemon 启动超时' }
}

async function ping(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
