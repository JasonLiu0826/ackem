import { BrowserWindow, type WebContents } from 'electron'
import { ackemCodeBaseUrl, ensureDaemon } from './ensureDaemon'
import { codeSessionHeaders } from './hostSessionBindings'
import type { AgentEvent } from './client'
export async function runtime(path: string, init?: RequestInit): Promise<unknown> {
  const ready = await ensureDaemon()
  if (!ready.ok) throw new Error(ready.reason || 'AckemCode 未就绪')
  const sessionId = path.match(/^\/api\/session\/([A-Za-z0-9_-]+)/)?.[1]
  const headers = new Headers(init?.headers)
  for (const [name, value] of Object.entries(sessionId ? codeSessionHeaders(sessionId) : {})) headers.set(name, value)
  const res = await fetch(`${ackemCodeBaseUrl()}${path}`, {...init,headers,signal:init?.signal??AbortSignal.timeout(15000)})
  const body = await res.json().catch(() => ({})) as { error?: string; message?: string }
  if (!res.ok) throw Object.assign(new Error(body.message || body.error || `AckemCode HTTP ${res.status}`),{status:res.status})
  return body
}

export function pathFor(sessionId: string, suffix = ''): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) throw new Error('无效会话 ID')
  return `/api/session/${sessionId}${suffix}`
}

export type EventSink = WebContents | null

export function emit(sender: EventSink, taskId: string, turnId: string, event: AgentEvent | { type: 'transport_disconnected' | 'transport_error'; message?: string } | { type: 'file_changed'; path: string; diff: string },context?:{goalRevision:number;controlEpoch:number}): void {
  // sender 为 null 时广播到全部窗口（聊天派工的运行没有发起方 IPC 上下文）。
  if (sender) {
    if (!sender.isDestroyed()) sender.send('workbench:event', { taskId, turnId, event,...context })
    return
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('workbench:event', { taskId, turnId, event,...context })
  }
}

