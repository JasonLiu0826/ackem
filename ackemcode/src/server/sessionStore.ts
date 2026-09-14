import fs from 'node:fs/promises'
import path from 'node:path'
import type { ChatMessage, PermissionMode } from '../shared/types.js'
import {
  flattenMessageContent,
  stripBinaryContentParts
} from '../shared/messageContent.js'
import { ensureDataDir, DATA_DIR } from './settingsStore.js'
import type { TodoItem } from './agent/todos.js'

export const SESSIONS_DIR = path.join(DATA_DIR, 'sessions')

export type SessionAllowMemory = {
  tools: string[]
  rules: string[]
  /** CC additionalWorkingDirectories — granted outside session cwd */
  directories?: string[]
}

export type SnipRecord = {
  at: string
  removedIds: string[]
  summary: string
}

export type ContextCollapseCommit = {
  at: string
  toolCallId: string
  toolName: string
  label: string
  originalChars: number
  collapsedContent: string
}

export type PersistedSession = {
  version: 1
  id: string
  updatedAt: string
  mode: PermissionMode
  todos: TodoItem[]
  /** Full chat history (no system messages) */
  history: ChatMessage[]
  /** Session permission memory (allow_session / allow_always in-session) */
  sessionAllows?: SessionAllowMemory
  /** History snip audit trail for resume filtering (Batch 8). */
  snipRecords?: SnipRecord[]
  /** L3: collapsed tool bodies for resume consistency. */
  collapseCommits?: ContextCollapseCommit[]
}

export type SessionListItem = {
  id: string
  updatedAt: string
  mode: PermissionMode
  historyLength: number
  todoCount: number
  preview: string
}

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function isValidSessionId(id: string): boolean {
  return ID_RE.test(id)
}

function sessionPath(id: string): string {
  if (!isValidSessionId(id)) {
    throw new Error(`invalid session id: ${id}`)
  }
  return path.join(SESSIONS_DIR, `${id}.json`)
}

export async function ensureSessionsDir(): Promise<void> {
  await ensureDataDir()
  await fs.mkdir(SESSIONS_DIR, { recursive: true })
}

export async function saveSession(snap: PersistedSession): Promise<void> {
  await ensureSessionsDir()
  const payload: PersistedSession = {
    version: 1,
    id: snap.id,
    updatedAt: new Date().toISOString(),
    mode: snap.mode,
    todos: snap.todos ?? [],
    history: (Array.isArray(snap.history) ? snap.history : []).map((m) => ({
      ...m,
      content: stripBinaryContentParts(m.content)
    })),
    sessionAllows: snap.sessionAllows,
    snipRecords: Array.isArray(snap.snipRecords) ? snap.snipRecords : undefined,
    collapseCommits: Array.isArray(snap.collapseCommits)
      ? (snap.collapseCommits as ContextCollapseCommit[])
      : undefined
  }
  const tmp = sessionPath(snap.id) + '.tmp'
  const dest = sessionPath(snap.id)
  await fs.writeFile(tmp, JSON.stringify(payload, null, 2), 'utf8')
  await fs.rename(tmp, dest)
}

export async function loadSession(id: string): Promise<PersistedSession | null> {
  if (!isValidSessionId(id)) return null
  try {
    await ensureSessionsDir()
    const raw = await fs.readFile(sessionPath(id), 'utf8')
    const parsed = JSON.parse(raw) as Partial<PersistedSession>
    if (!parsed || parsed.id !== id) return null
    const sa = parsed.sessionAllows
    return {
      version: 1,
      id,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
      mode: (parsed.mode as PermissionMode) || 'default',
      todos: Array.isArray(parsed.todos) ? (parsed.todos as TodoItem[]) : [],
      history: Array.isArray(parsed.history) ? (parsed.history as ChatMessage[]) : [],
      sessionAllows:
        sa && typeof sa === 'object'
          ? {
              tools: Array.isArray(sa.tools)
                ? sa.tools.filter((t): t is string => typeof t === 'string')
                : [],
              rules: Array.isArray(sa.rules)
                ? sa.rules.filter((t): t is string => typeof t === 'string')
                : [],
              directories: Array.isArray(sa.directories)
                ? sa.directories.filter((t): t is string => typeof t === 'string')
                : undefined
            }
          : undefined,
      snipRecords: Array.isArray(parsed.snipRecords)
        ? (parsed.snipRecords as SnipRecord[])
        : undefined,
      collapseCommits: Array.isArray(parsed.collapseCommits)
        ? (parsed.collapseCommits as ContextCollapseCommit[])
        : undefined
    }
  } catch {
    return null
  }
}

/** Delete persisted file. Missing file is ok. */
export async function deleteSession(id: string): Promise<boolean> {
  if (!isValidSessionId(id)) return false
  try {
    await fs.unlink(sessionPath(id))
    return true
  } catch {
    return false
  }
}

export async function listSessionIds(): Promise<string[]> {
  try {
    await ensureSessionsDir()
    const names = await fs.readdir(SESSIONS_DIR)
    return names
      .filter((n) => n.endsWith('.json') && !n.endsWith('.tmp.json'))
      .map((n) => n.replace(/\.json$/, ''))
      .filter(isValidSessionId)
  } catch {
    return []
  }
}

/** Multi-session list for UI (newest first). */
export async function listSessions(): Promise<SessionListItem[]> {
  const ids = await listSessionIds()
  const items: SessionListItem[] = []
  for (const id of ids) {
    const s = await loadSession(id)
    if (!s) continue
    const lastUser = [...s.history].reverse().find((m) => m.role === 'user')
    const preview = flattenMessageContent(lastUser?.content ?? null)
      .replace(/\s+/g, ' ')
      .slice(0, 80)
    items.push({
      id: s.id,
      updatedAt: s.updatedAt,
      mode: s.mode,
      historyLength: s.history.length,
      todoCount: s.todos.length,
      preview
    })
  }
  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
  return items
}
