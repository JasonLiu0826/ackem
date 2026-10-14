import { randomUUID } from 'node:crypto'
import { isAbsolute, resolve } from 'node:path'
import { realpathSync, statSync } from 'node:fs'
import { spawn, type IPty } from 'node-pty'
import type { CliTerminalEvent, CliTerminalSnapshot } from '../../shared/terminal'

type Terminal = { ownerId: number; taskId: string; pty: IPty; snapshot: CliTerminalSnapshot; output: (event: CliTerminalEvent) => void; closing?: Promise<void> }
type Launch = { executable: string; args: string[]; env: Record<string, string>; cwd: string; sessionId: string; cols: number; rows: number }
const BUFFER_LIMIT = 256 * 1024
export class CliTerminalService {
  private terminals = new Map<string, Terminal>()
  constructor(private launcher: (launch: Launch) => IPty = input => spawn(input.executable, input.args, { name: 'xterm-256color', cwd: input.cwd, env: input.env, cols: input.cols, rows: input.rows, useConptyDll: process.platform === 'win32' })) {}
  open(ownerId: number, taskId: string, launch: Launch, output: Terminal['output']): CliTerminalSnapshot {
    if (!taskId || taskId.length > 200 || !isAbsolute(launch.cwd)) throw Error('CLI requires a task and an absolute working directory')
    const cwd = realpathSync(resolve(launch.cwd))
    if (!statSync(cwd).isDirectory()) throw Error('CLI working directory is unavailable')
    const existing = [...this.terminals.values()].find(t => t.ownerId === ownerId && t.taskId === taskId && !t.snapshot.exited)
    if (existing) {
      if (existing.snapshot.cwd !== cwd) throw Error('Close the current CLI before changing its working directory')
      return { ...existing.snapshot }
    }
    if ([...this.terminals.values()].filter(t => t.ownerId === ownerId).length >= 16) throw Error('Close an existing CLI before opening another')
    const terminalId = randomUUID()
    const pty = this.launcher({ ...launch, cwd, ...size(launch.cols, launch.rows) })
    const snapshot: CliTerminalSnapshot = { terminalId, sessionId: launch.sessionId, cwd, buffer: '', seq: 0, exited: false }
    const terminal = { ownerId, taskId, pty, snapshot, output }
    this.terminals.set(terminalId, terminal)
    pty.onData(data => {
      snapshot.buffer = (snapshot.buffer + data).slice(-BUFFER_LIMIT)
      output({ terminalId, seq: ++snapshot.seq, data })
    })
    pty.onExit(({ exitCode }) => {
      snapshot.exited = true
      output({ terminalId, seq: ++snapshot.seq, exitCode })
      this.terminals.delete(terminalId)
    })
    return { ...snapshot }
  }
  input(ownerId: number, terminalId: string, data: string): void {
    if (typeof data !== 'string' || data.length > 16 * 1024) throw Error('Terminal input is too large')
    this.owned(ownerId, terminalId).pty.write(data)
  }
  resize(ownerId: number, terminalId: string, cols: number, rows: number): void {
    const terminal = this.owned(ownerId, terminalId), dimensions = size(cols, rows)
    terminal.pty.resize(dimensions.cols, dimensions.rows)
  }
  close(ownerId: number, terminalId: string): Promise<void> {
    const terminal = this.owned(ownerId, terminalId)
    if (terminal.closing) return terminal.closing
    terminal.closing = new Promise<void>((resolveClose,reject) => {
      const timer=setTimeout(()=>{listener.dispose();reject(Error('CLI stop is not yet confirmed'))},10_000)
      const listener=terminal.pty.onExit(()=>{clearTimeout(timer);listener.dispose();resolveClose()})
      try { terminal.pty.kill() } catch(error) {clearTimeout(timer);listener.dispose();reject(error)}
    }).catch(error => { terminal.closing = undefined; throw error })
    return terminal.closing
  }
  async disposeOwner(ownerId: number): Promise<void> { await Promise.all([...this.terminals].filter(([,terminal])=>terminal.ownerId===ownerId).map(([id])=>this.close(ownerId,id))) }
  async disposeAll(): Promise<void> { await Promise.all([...this.terminals].map(([id,terminal])=>this.close(terminal.ownerId,id))) }
  async closeTask(taskId: string, ownerId?: number): Promise<void> { await Promise.all([...this.terminals].filter(([,terminal])=>terminal.taskId===taskId && (ownerId === undefined || terminal.ownerId === ownerId)).map(([id,terminal])=>this.close(terminal.ownerId,id))) }
  private owned(ownerId: number, terminalId: string): Terminal {
    const terminal = this.terminals.get(terminalId)
    if (!terminal || terminal.ownerId !== ownerId) throw Error('Terminal is unavailable to this client')
    return terminal
  }
}
function size(cols: number, rows: number): { cols: number; rows: number } {
  if (!Number.isFinite(cols) || !Number.isFinite(rows)) throw Error('Invalid terminal dimensions')
  return { cols: Math.max(20, Math.min(500, Math.round(cols))), rows: Math.max(5, Math.min(300, Math.round(rows))) }
}
