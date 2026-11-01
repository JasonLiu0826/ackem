// [ackemcode/daemon] — 拉起并托管 Ackem Code 本地服务（parts/ackemcode）
// 只监听 127.0.0.1；数据目录默认 ~/.ackemcode（与独立 CLI 共用）。

import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '../logger'
import { hostAppPath } from './hostEnv'

const log = createLogger('ackemcode')

const DEFAULT_PORT = Number(process.env.ACKEMCODE_PORT || 8787)
const READY_TIMEOUT_MS = 30_000
const READY_POLL_MS = 300

let spawned: ChildProcess | null = null
let weSpawned = false
let starting: Promise<{ ok: boolean; reason?: string }> | null = null

export function ackemCodeBaseUrl(): string {
  return (process.env.ACKEMCODE_URL || `http://127.0.0.1:${DEFAULT_PORT}`).replace(/\/$/, '')
}

/** 数据目录：ACKEMCODE_DATA_DIR > ~/.ackemcode */
export function ackemCodeDataDir(): string {
  const fromEnv = process.env.ACKEMCODE_DATA_DIR?.trim()
  if (fromEnv) return fromEnv
  return join(homedir(), '.ackemcode')
}

/** 找 parts/ackemcode 源码/构建目录 */
export function resolveCodeRoot(): string | undefined {
  const candidates: string[] = []
  const push = (root: string | undefined): void => {
    if (!root) return
    candidates.push(join(root, 'parts', 'ackemcode'))
    candidates.push(join(root, 'ackemcode'))
  }
  const fromEnv = process.env.ACKEMCODE_ROOT?.trim()
  if (fromEnv) push(fromEnv)
  push(hostAppPath())
  try {
    if (process.resourcesPath) push(process.resourcesPath)
  } catch {
    /* 同上 */
  }
  push(process.cwd())
  return candidates.find((r) => existsSync(join(r, 'dist', 'server', 'index.js')))
}

/** 健康检查：daemon 已就绪返回 true */
export async function ackemCodeHealthy(): Promise<boolean> {
  try {
    const res = await fetch(`${ackemCodeBaseUrl()}/api/health`, {
      signal: AbortSignal.timeout(1500)
    })
    if (!res.ok) return false
    const body = (await res.json()) as { ok?: boolean; name?: string }
    return body.ok === true && body.name === 'AckemCode'
  } catch {
    return false
  }
}

function spawnDaemon(root: string): ChildProcess {
  const entry = join(root, 'dist', 'server', 'index.js')
  const child = spawn(process.execPath, [entry], {
    cwd: root,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      ACKEMCODE_PORT: String(DEFAULT_PORT),
      ACKEMCODE_DATA_DIR: ackemCodeDataDir()
    },
    stdio: ['ignore', 'pipe', 'pipe']
  })
  child.stdout?.on('data', (d: Buffer) => log.info('daemon:', d.toString().trim()))
  child.stderr?.on('data', (d: Buffer) => log.warn('daemon:', d.toString().trim()))
  child.on('exit', (code) => {
    log.warn('daemon 退出', { code })
    if (spawned === child) {
      spawned = null
      weSpawned = false
    }
  })
  return child
}

async function waitUntilHealthy(): Promise<boolean> {
  const deadline = Date.now() + READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (await ackemCodeHealthy()) return true
    await new Promise((r) => setTimeout(r, READY_POLL_MS))
  }
  return false
}

/** 确保 daemon 可用：已有服务直接复用，否则拉起 parts/ackemcode 内的运行时 */
export function ensureAckemCodeDaemon(): Promise<{ ok: boolean; reason?: string }> {
  if (starting) return starting
  starting = (async () => {
    if (await ackemCodeHealthy()) {
      log.info('复用已在运行的 Ackem Code 服务', { url: ackemCodeBaseUrl() })
      return { ok: true }
    }
    const root = resolveCodeRoot()
    if (!root) {
      log.warn('找不到 parts/ackemcode（未构建或未随包分发）')
      return { ok: false, reason: 'code_runtime_missing' }
    }
    if (!spawned) {
      spawned = spawnDaemon(root)
      weSpawned = true
    }
    if (!(await waitUntilHealthy())) {
      log.error('Ackem Code 服务启动超时')
      return { ok: false, reason: 'code_daemon_timeout' }
    }
    log.info('Ackem Code 服务已就绪', { url: ackemCodeBaseUrl() })
    return { ok: true }
  })().finally(() => {
    starting = null
  })
  return starting
}

function waitExit(child: ChildProcess, ms: number): Promise<boolean> {
  if (child.exitCode !== null || child.signalCode) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      child.off('exit', onExit)
      resolve(false)
    }, ms)
    const onExit = (): void => {
      clearTimeout(timer)
      resolve(true)
    }
    child.once('exit', onExit)
  })
}

/** 退出应用时停掉「我们自己拉起」的那个进程；复用外部服务时不动它 */
export async function stopAckemCodeDaemon(): Promise<void> {
  if (!weSpawned || !spawned) return
  const child = spawned
  spawned = null
  weSpawned = false
  try {
    child.kill('SIGTERM')
  } catch {
    /* 已经退出 */
  }
  // daemon 手上有沙箱/工具时 SIGTERM 可能被忽略，等不到就强杀
  if (await waitExit(child, 2000)) return
  try {
    child.kill('SIGKILL')
  } catch {
    /* 已经退出 */
  }
  await waitExit(child, 1000)
}
