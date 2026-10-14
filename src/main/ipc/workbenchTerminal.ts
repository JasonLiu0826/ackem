import { app, ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { CliTerminalService } from '../ackemcode/terminalService'
import { resolveCliNode } from '../ackemcode/cliNode'
import { launchExternalCli } from '../ackemcode/externalCli'
import { ackemCodeBaseUrl, ensureDaemon, resolveCodeRoot } from '../ackemcode/ensureDaemon'
import { ensureDefaultWorkDirectory } from '../ackemcode/workDirectory'
import { resolveDataRoot } from '../paths'
import { loadSettings } from '../settings'
import type { CliOpenInput, CliLaunchInput, ExternalCliSnapshot } from '../../shared/terminal'

export const workbenchCliTerminals = new CliTerminalService()
const owners = new Set<number>()
const pending = new Map<string, { ownerId: number; taskId: string; promise: Promise<unknown> }>()
const removedTasks = new Set<string>()
const externalLaunches = new Map<string, Promise<ExternalCliSnapshot>>()
export async function closeWorkbenchTaskClis(taskId: string, ownerId?: number): Promise<void> {
  const launches = [...pending.entries()].filter(([,launch]) => launch.taskId === taskId && (ownerId === undefined || launch.ownerId === ownerId))
  const added = new Set<string>()
  const mark = (key:string) => { if (!removedTasks.has(key)) added.add(key); removedTasks.add(key) }
  for (const [key] of launches) mark(key)
  for (const owner of ownerId === undefined ? owners : [ownerId]) mark(`${owner}:${taskId}`)
  // Removal invalidates the launch before waiting: a late daemon reply cannot spawn an orphan.
  try {
    await Promise.all(launches.map(([,launch]) => launch.promise.catch(() => {})))
    await workbenchCliTerminals.closeTask(taskId, ownerId)
  } catch (error) {
    // The caller keeps the task when stop is unconfirmed. Its surviving terminal must remain inspectable.
    for (const key of added) removedTasks.delete(key)
    throw error
  }
}
export function registerWorkbenchTerminalIpc(): void {
  ipcMain.handle('workbench:cli-launch', async (event, input: CliLaunchInput) => {
    if (!input || typeof input.taskId !== 'string' || !input.taskId || input.taskId.length > 200 || (input.cwd !== undefined && (typeof input.cwd !== 'string' || !input.cwd))) throw Error('Invalid CLI launch')
    const key = `${event.sender.id}:${input.taskId}`
    const previous = externalLaunches.get(key)
    if (previous) return previous
    const launch = (async (): Promise<ExternalCliSnapshot> => {
      // Synchronize the same standalone model/key configuration used by AckemCode.
      const ready = await ensureDaemon()
      if (!ready.ok) throw Error(ready.reason || 'AckemCode is unavailable')
      if (event.sender.isDestroyed()) throw Error('CLI launcher was closed')
      const root = resolveCodeRoot()
      if (!root) throw Error('AckemCode installation is unavailable')
      const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), entry = join(root, 'src', 'cli', 'main.tsx')
      if (!existsSync(tsx) || !existsSync(entry)) throw Error('AckemCode CLI installation is incomplete')
      const cwd = input.cwd || ensureDefaultWorkDirectory(resolveDataRoot(loadSettings()))
      const sessionId = `cli_${randomUUID()}`
      const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      for (const name of ['npm_lifecycle_event', 'ACKEM_DEV', 'ACKEM_URL', 'ELECTRON_RUN_AS_NODE']) delete env[name]
      env.ACKEMCODE_URL = ackemCodeBaseUrl()
      const pid = await launchExternalCli({ executable: resolveCliNode(), args: [tsx, entry, '--session', sessionId, '--cwd', cwd, '--url', ackemCodeBaseUrl()], cwd, env })
      // No managed session, host task, PTY subscription or page-owned lifecycle.
      return { pid, sessionId, cwd }
    })()
    externalLaunches.set(key, launch)
    try { return await launch } finally { externalLaunches.delete(key) }
  })
  app.on('before-quit', () => { void workbenchCliTerminals.disposeAll().catch(() => {}) })
  ipcMain.handle('workbench:cli-open', async (event, input: CliOpenInput) => {
    const key = `${event.sender.id}:${input.taskId}`
    if (removedTasks.has(key)) throw Error('CLI task was removed')
    const previous = pending.get(key)
    if (previous) return previous.promise
    if (!owners.has(event.sender.id)) {
      owners.add(event.sender.id)
      event.sender.once('destroyed', () => {
        owners.delete(event.sender.id)
        for (const removed of removedTasks) if (removed.startsWith(`${event.sender.id}:`)) removedTasks.delete(removed)
        void workbenchCliTerminals.disposeOwner(event.sender.id).catch(() => {})
      })
    }
    const launch = (async () => {
      const ready = await ensureDaemon()
      if (!ready.ok) throw Error(ready.reason || 'AckemCode is unavailable')
      if (event.sender.isDestroyed()) throw Error('Terminal client was closed')
      if (removedTasks.has(key)) throw Error('CLI task was removed')
      const root = resolveCodeRoot()
      if (!root) throw Error('AckemCode installation is unavailable')
      const tsx = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), entry = join(root, 'src', 'cli', 'main.tsx')
      if (!existsSync(tsx) || !existsSync(entry)) throw Error('AckemCode CLI installation is incomplete')
      const cwd = input.cwd || ensureDefaultWorkDirectory(resolveDataRoot(loadSettings()))
      const sessionId = `cli_${randomUUID()}`
      const env = Object.fromEntries(Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      delete env.npm_lifecycle_event
      delete env.ACKEM_DEV
      delete env.ACKEM_URL
      delete env.ELECTRON_RUN_AS_NODE
      env.ACKEMCODE_URL = ackemCodeBaseUrl()
      // New standalone identity; no host capability, WorkContract or managed session is passed.
      const snapshot = workbenchCliTerminals.open(event.sender.id, input.taskId, { executable: resolveCliNode(), args: [tsx, entry, '--session', sessionId, '--cwd', cwd, '--url', ackemCodeBaseUrl()], env, cwd, sessionId, cols: input.cols, rows: input.rows }, payload => {
        if (!event.sender.isDestroyed()) event.sender.send('workbench:cli-data', payload)
      })
      return snapshot
    })()
    pending.set(key, { ownerId: event.sender.id, taskId: input.taskId, promise: launch })
    try { return await launch } finally { pending.delete(key) }
  })
  ipcMain.handle('workbench:cli-input', (event, input: { terminalId: string; data: string }) => workbenchCliTerminals.input(event.sender.id, input.terminalId, input.data))
  ipcMain.handle('workbench:cli-resize', (event, input: { terminalId: string; cols: number; rows: number }) => workbenchCliTerminals.resize(event.sender.id, input.terminalId, input.cols, input.rows))
  ipcMain.handle('workbench:cli-close', async (event, terminalId: string) => { await workbenchCliTerminals.close(event.sender.id, terminalId); return { ok: true } })
  ipcMain.handle('workbench:cli-close-task', async (event, taskId: string) => {
    if (typeof taskId !== 'string' || !taskId || taskId.length > 200) throw Error('Invalid CLI task')
    await closeWorkbenchTaskClis(taskId, event.sender.id)
    return { ok: true }
  })
}
