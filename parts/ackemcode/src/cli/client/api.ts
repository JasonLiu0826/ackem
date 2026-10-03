import type { ChatMessage, EffortLevel, PermissionMode } from '../../shared/types.js'
import { defaultAckemUrl } from '../parseArgv.js'

export function apiBase(): string {
  return defaultAckemUrl().replace(/\/$/, '')
}

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBase()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {})
    }
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) {
    const err = new Error(
      (data as { message?: string }).message ||
        data.error ||
        `HTTP ${res.status} ${path}`
    )
    ;(err as Error & { code?: string }).code = data.error
    throw err
  }
  return data
}

export async function health(): Promise<boolean> {
  try {
    const res = await fetch(`${apiBase()}/api/health`)
    return res.ok
  } catch {
    return false
  }
}

export async function createSession(opts?: {
  sessionId?: string
  cwd?: string
  permissionMode?: PermissionMode
}): Promise<{
  sessionId: string
  mode: PermissionMode
  cwd: string | null
  restored?: boolean
  historyLength?: number
}> {
  return json('/api/session', {
    method: 'POST',
    body: JSON.stringify(opts ?? {})
  })
}

export async function getSession(id: string): Promise<{
  sessionId: string
  mode: PermissionMode
  history: ChatMessage[]
  todos?: Array<{ content: string; status: string; activeForm: string }>
  runtimeCwd: string | null
}> {
  return json(`/api/session/${id}`)
}

export async function getSettings(): Promise<{
  model: string
  effort: EffortLevel
  agentTier: string
  permissionMode: PermissionMode
  contextWindow?: number
  cwd: string
  hasApiKey: boolean
  webSearch?: {
    provider?: string
    apiKey?: string
    customUrl?: string
    maxResults?: number
  }
}> {
  return json('/api/settings')
}

export async function getStandalone(): Promise<{
  model: string
  apiBaseUrl: string
  hasApiKey: boolean
  llmSetupComplete?: boolean
  contextWindow?: number
}> {
  return json('/api/settings/standalone')
}

export async function putStandalone(patch: Record<string, unknown>) {
  return json('/api/settings/standalone', {
    method: 'PUT',
    body: JSON.stringify(patch)
  })
}

export async function putSettings(patch: Record<string, unknown>) {
  return json('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(patch)
  })
}

export async function setSessionModel(
  sessionId: string,
  body: { model: string; persist: boolean }
) {
  return json<{ ok: boolean; model: string; persist: boolean }>(
    `/api/session/${sessionId}/model`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

export async function setMode(
  sessionId: string,
  body: { cycle?: boolean; mode?: PermissionMode }
) {
  return json<{ ok: boolean; mode: PermissionMode }>(
    `/api/session/${sessionId}/mode`,
    { method: 'POST', body: JSON.stringify(body) }
  )
}

export async function abortTurn(
  sessionId: string,
  body: { restoreInput?: boolean; rewind?: boolean }
) {
  return json<{
    ok: boolean
    abort_ack: {
      restoredUserText?: string
      rewound?: boolean
      filesChanged?: string[]
    }
  }>(`/api/session/${sessionId}/abort`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function sendPermission(
  sessionId: string,
  body: Record<string, unknown>
) {
  return json(`/api/session/${sessionId}/permission`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function sendPlanDecision(
  sessionId: string,
  body: Record<string, unknown>
) {
  return json(`/api/session/${sessionId}/plan-decision`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function sendAskAnswer(
  sessionId: string,
  body: Record<string, unknown>
) {
  return json(`/api/session/${sessionId}/ask-answer`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function getSlashCommands(): Promise<string[]> {
  const data = await json<{ commands: string[] }>('/api/slash/commands')
  return data.commands
}

export async function clearQueue(sessionId: string) {
  return json<{ ok: boolean; removed: number }>(
    `/api/session/${sessionId}/queue/clear`,
    { method: 'POST', body: '{}' }
  )
}

export async function getQueue(sessionId: string): Promise<{
  turnRunning: boolean
  items: Array<{ id: string; text: string; priority: string }>
}> {
  return json(`/api/session/${sessionId}/queue`)
}

export async function getSessionPlan(sessionId: string): Promise<{
  path: string
  content: string
  empty: boolean
}> {
  return json(`/api/session/${sessionId}/plan`)
}

export async function putSessionPlan(sessionId: string, content: string) {
  return json<{ ok: boolean; path: string; chars: number }>(
    `/api/session/${sessionId}/plan`,
    { method: 'PUT', body: JSON.stringify({ content }) }
  )
}

export type SessionListItem = {
  id: string
  updatedAt: string
  mode: PermissionMode
  historyLength: number
  todoCount: number
  preview: string
}

export async function listSessions(): Promise<SessionListItem[]> {
  const data = await json<{ sessions: SessionListItem[] }>('/api/sessions')
  return data.sessions
}

export async function getSessionTodos(sessionId: string) {
  return json<{
    todos: Array<{ content: string; status: string; activeForm: string }>
  }>(`/api/session/${sessionId}/todos`)
}

export async function getBackgroundAgents(sessionId: string) {
  return json<{
    agents: Array<{
      agentId: string
      description: string
      subagentType: string
      status: string
    }>
  }>(`/api/session/${sessionId}/background`)
}

export async function testLlm(body: {
  apiBaseUrl: string
  apiKey: string
  model: string
}) {
  return json<{ ok: boolean; message: string }>('/api/llm/test', {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export async function getRegisteredModels(): Promise<{
  models: Array<{ model: string; apiBaseUrl: string; contextWindow?: number; registeredAt: string }>
  activeModel: string
}> {
  return json('/api/llm/registry')
}

export async function getVendors(): Promise<
  Array<{ id: string; name: string; apiBaseUrl: string; models: string[] }>
> {
  const data = await json<{ vendors: Array<{ id: string; name: string; apiBaseUrl: string; models: string[] }> }>(
    '/api/llm/vendors'
  )
  return data.vendors
}

export type MemoryFileInfo = {
  rel: string
  bytes: number
  updatedAt: string
}

export async function listMemory(cwd?: string): Promise<{
  dir: string
  files: MemoryFileInfo[]
}> {
  const q = cwd ? `?cwd=${encodeURIComponent(cwd)}` : ''
  return json(`/api/memory${q}`)
}

export async function readMemory(
  rel: string,
  cwd?: string
): Promise<{ rel: string; content: string }> {
  const qs = new URLSearchParams({ path: rel })
  if (cwd) qs.set('cwd', cwd)
  return json(`/api/memory/file?${qs}`)
}

export async function writeMemory(rel: string, content: string, cwd?: string) {
  return json<{ rel: string; bytes: number }>('/api/memory/file', {
    method: 'PUT',
    body: JSON.stringify({ path: rel, content, cwd })
  })
}

export async function deleteMemory(rel: string, cwd?: string) {
  return json<{ ok: boolean }>('/api/memory/file', {
    method: 'DELETE',
    body: JSON.stringify({ path: rel, cwd })
  })
}

export type FileHistorySnapshot = {
  messageId: string
  timestamp: string
  fileCount: number
}

export async function getFileHistory(sessionId: string): Promise<{
  snapshots: FileHistorySnapshot[]
  latestMessageId: string | null
}> {
  return json(`/api/session/${sessionId}/file-history`)
}

export async function rewindSession(
  sessionId: string,
  body: { messageId?: string; dryRun?: boolean }
): Promise<{
  ok: boolean
  messageId?: string
  filesChanged?: string[]
  dryRun?: boolean
  error?: string
}> {
  return json(`/api/session/${sessionId}/rewind`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
}

export type McpElicitationPending = {
  id: string
  serverName: string
  message: string
  mode: 'form' | 'url'
  url?: string
}

export async function getElicitationPending(): Promise<{
  pending: McpElicitationPending[]
}> {
  return json('/api/mcp/elicitation/pending')
}

export async function respondElicitation(
  id: string,
  action: 'accept' | 'decline' | 'cancel'
) {
  return json<{ ok: boolean }>(
    `/api/mcp/elicitation/${encodeURIComponent(id)}/respond`,
    {
      method: 'POST',
      body: JSON.stringify({
        action,
        content: action === 'accept' ? {} : undefined
      })
    }
  )
}

export type BrowserOnboardingChoice =
  | 'open_store'
  | 'installed'
  | 'isolated'
  | 'later'
  | 'never'

export async function openBrowserOnboardingStore() {
  return json<{ ok: boolean; url?: string }>(
    '/api/browser-onboarding/open-store',
    { method: 'POST', body: JSON.stringify({}) }
  )
}

export async function respondBrowserOnboarding(
  requestId: string,
  choice: BrowserOnboardingChoice
) {
  return json<{ ok: boolean; keptOpen?: boolean; url?: string }>(
    '/api/browser-onboarding/respond',
    {
      method: 'POST',
      body: JSON.stringify({ requestId, choice })
    }
  )
}
