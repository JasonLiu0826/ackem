import { randomUUID } from 'node:crypto'
import { ensureDaemon, ackemCodeBaseUrl } from './ensureDaemon'
import { broadcastToRenderers } from '../rendererBroadcast'
import type { WebSearchConfiguration, WebSearchStatus, WebSearchResult, WebSearchSetupRequest } from '../../shared/webSearch'

const pending = new Map<string, { request: WebSearchSetupRequest; resolve: (configured: boolean) => void }>()
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ready = await ensureDaemon()
  if (!ready.ok) throw new Error(ready.reason ?? 'AckemCode 搜索运行时不可用')
  const res = await fetch(`${ackemCodeBaseUrl()}${path}`, { ...init, signal: init?.signal ?? AbortSignal.timeout(30_000) })
  const body = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(body.error ?? `web-search HTTP ${res.status}`)
  return body
}
export const webSearchStatus = () => request<WebSearchStatus>('/api/web-search/config')
export const pendingSearchSetup = () => [...pending.values()].map(p => p.request)
export async function saveWebSearchConfiguration(input: WebSearchConfiguration): Promise<WebSearchStatus> {
  const status = await request<WebSearchStatus>('/api/web-search/config', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
  if (!status.ready) throw new Error('配置尚未就绪，请检查服务商、密钥或运行环境设置。')
  for (const p of pending.values()) p.resolve(true)
  return status
}
export function cancelSearchSetup(requestId?: string): void {
  for (const [id, p] of pending) if (!requestId || requestId === id) p.resolve(false)
}
async function configureForFirstSearch(query: string): Promise<boolean> {
  const id = randomUUID()
  return new Promise(resolve => {
    const finish = (configured: boolean) => { clearTimeout(timer); pending.delete(id); broadcastToRenderers('chat:web-search-setup', { requestId: id, query, status: 'closed' }); resolve(configured) }
    const timer = setTimeout(() => finish(false), 60_000)
    const setup: WebSearchSetupRequest = { requestId: id, query, status: 'pending' }
    pending.set(id, { request: setup, resolve: finish })
    broadcastToRenderers('chat:web-search-setup', setup)
  })
}
export async function runSharedWebSearch(input: Record<string, unknown>): Promise<WebSearchResult> {
  let status = await webSearchStatus()
  if (!status.enabled) return { ok: false, output: 'web-search 已被运行环境禁用，这次未联网搜索。' }
  if (!status.ready) {
    if (!await configureForFirstSearch(String(input.query ?? ''))) return { ok: false, output: '尚未配置 web-search，这次未联网搜索。配置后可重新发送问题。' }
    status = await webSearchStatus()
    if (!status.ready) return { ok: false, output: 'web-search 配置未就绪，这次未联网搜索。' }
  }
  return request<WebSearchResult>('/api/web-search', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}
