import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { selectedDisplayTaskOf, useWorkbenchStore } from '../../../store/workbenchStore'
import type { CliTerminalEvent } from '../../../../../shared/terminal'

export function TerminalPanel(): JSX.Element {
  const task = useWorkbenchStore(selectedDisplayTaskOf)
  const taskId = task?.coordinatorTaskId ?? task?.displayChildId ?? task?.id
  const cwd = task?.cwd
  const host = useRef<HTMLDivElement>(null)
  const terminalId = useRef<string>()
  const [status, setStatus] = useState('正在启动 AckemCode CLI…')
  const [generation, setGeneration] = useState(0)
  const [connected, setConnected] = useState(false)
  useEffect(() => {
    if (!host.current || !taskId) return
    let disposed = false, sequence = 0
    terminalId.current = undefined
    setStatus('正在启动 AckemCode CLI…'); setConnected(false)
    const terminal = new Terminal({ cursorBlink: true, fontSize: 13, fontFamily: 'Cascadia Code, Consolas, monospace', scrollback: 3000, theme: { background: '#090e14', foreground: '#d5dce5', cursor: '#72dae6' } })
    const fit = new FitAddon()
    terminal.loadAddon(fit); terminal.open(host.current); fit.fit()
    const early: CliTerminalEvent[] = []
    const consume = (event: CliTerminalEvent) => {
      if (event.terminalId !== terminalId.current || event.seq <= sequence) return
      sequence = event.seq
      if (event.data) terminal.write(event.data)
      if (event.exitCode !== undefined) { setConnected(false); setStatus(`CLI 已退出 · ${event.exitCode}`) }
    }
    const unsubscribe = window.ackem.workbench.onCliData(event => {
      if (!terminalId.current) { if (early.length < 2000) early.push(event); return }
      consume(event)
    })
    const input = terminal.onData(data => {
      if (terminalId.current) void window.ackem.workbench.cliInput({ terminalId: terminalId.current, data }).catch(error => setStatus(String(error)))
    })
    const observer = new ResizeObserver(() => {
      if (disposed) return
      fit.fit()
      if (terminalId.current) void window.ackem.workbench.cliResize({ terminalId: terminalId.current, cols: terminal.cols, rows: terminal.rows }).catch(() => {})
    })
    observer.observe(host.current)
    void window.ackem.workbench.cliOpen({ taskId, cwd, cols: terminal.cols, rows: terminal.rows }).then(snapshot => {
      if (disposed) return
      terminalId.current = snapshot.terminalId
      terminal.write(snapshot.buffer)
      sequence = snapshot.seq
      setConnected(!snapshot.exited); setStatus(snapshot.exited ? 'CLI 已退出' : snapshot.cwd)
      early.filter(event => event.terminalId === snapshot.terminalId).sort((a,b) => a.seq-b.seq).forEach(consume)
      early.length = 0
      terminal.focus()
    }).catch(error => { if (!disposed) setStatus(String(error)) })
    return () => { disposed = true; unsubscribe(); observer.disconnect(); input.dispose(); terminal.dispose() }
  }, [taskId, cwd, generation])
  async function close(): Promise<void> {
    const id = terminalId.current
    if (!id) return
    try {
      await window.ackem.workbench.cliClose(id)
      if (terminalId.current !== id) return
      terminalId.current = undefined
      setConnected(false); setStatus('CLI 已关闭')
    } catch (error) {
      if (terminalId.current === id) setStatus(String(error))
    }
  }
  return <div className="wb-panel" style={{ minWidth: 0 }}>
    <div className="wb-panel-head">AckemCode CLI <span style={{ marginLeft: 'auto' }}>独立会话</span>
      {connected ? <button className="wb-ghost" onClick={() => void close()}>关闭</button> : <button className="wb-ghost" onClick={() => setGeneration(value => value+1)}>重连</button>}
    </div>
    <div style={{ fontSize: 11, color: '#8997a9', padding: '6px 12px', overflowWrap: 'anywhere' }}>{status}</div>
    <div ref={host} style={{ flex: 1, minHeight: 100, minWidth: 0, padding: 8, overflow: 'hidden' }} />
  </div>
}
