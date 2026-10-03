import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import {
  hasChatHistoryRow,
  loadChatHistoryFromDb,
  saveChatHistoryToDb as defaultSaveChatHistory
} from '../db/repos/chatHistory'
import { reconcileLegacyChatProjectionFromDb } from '../memory/governance/chatHistoryProjection'
import { broadcastToRenderers } from '../rendererBroadcast'
import { engineSessionId, type ChatChannel, channelLabel } from '../session/canonical'
import { createLogger } from '../logger'

const log = createLogger('unified-chat')

export type ChatProjectionError = {
  sessionId: string
  turnId?: string
  role: UnifiedChatRow['role']
  message: string
  at: string
}

const projectionErrors: ChatProjectionError[] = []
let persistChatHistory = defaultSaveChatHistory

export function setChatHistoryPersisterForTests(
  persister: typeof defaultSaveChatHistory | null
): void {
  persistChatHistory = persister ?? defaultSaveChatHistory
}

export function listChatProjectionErrors(): readonly ChatProjectionError[] {
  return projectionErrors
}

export function resetChatProjectionErrorsForTests(): void {
  projectionErrors.length = 0
}

function recordProjectionError(error: ChatProjectionError): void {
  projectionErrors.push(error)
  log.warn('chat projection error', error)
}

export type UnifiedChatRow = {
  kind: 'message'
  role: 'user' | 'assistant' | 'system'
  content: string
  channel?: ChatChannel
  channelLabel?: '电脑端' | '微信端'
  sentAt?: string
  turnId?: string
  proactiveId?: string
}

function normalizeRow(raw: unknown): UnifiedChatRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'message') return null
  if (r.role !== 'user' && r.role !== 'assistant' && r.role !== 'system') return null
  if (typeof r.content !== 'string' || !r.content.trim()) return null
  const ch = r.channel === 'weixin' ? 'weixin' : r.channel === 'desktop' ? 'desktop' : undefined
  return {
    kind: 'message',
    role: r.role,
    content: r.content,
    channel: ch,
    channelLabel: ch ? channelLabel(ch) : undefined,
    sentAt: typeof r.sentAt === 'string' ? r.sentAt : undefined,
    turnId: typeof r.turnId === 'string' ? r.turnId : undefined,
    proactiveId: typeof r.proactiveId === 'string' ? r.proactiveId : undefined,
  }
}

export function loadUnifiedChatRows(dataRoot: string, sessionId = engineSessionId()): UnifiedChatRow[] {
  const fromDb = loadChatHistoryFromDb(dataRoot, sessionId)
  const rows: UnifiedChatRow[] = []
  for (const raw of fromDb) {
    const n = normalizeRow(raw)
    if (n) rows.push(n)
  }
  if (hasChatHistoryRow(dataRoot, sessionId)) {
    reconcileLegacyChatProjectionFromDb(dataRoot, sessionId, { maxAttempts: 3 })
    return rows
  }

  const legacy = join(dataRoot, 'companion', `chat-history-${sessionId}.json`)
  if (!existsSync(legacy)) return []
  try {
    const parsed = JSON.parse(readFileSync(legacy, 'utf-8')) as unknown[]
    if (!Array.isArray(parsed)) return []
    for (const raw of parsed) {
      const n = normalizeRow(raw)
      if (n) rows.push(n)
    }
    if (rows.length > 0) persistChatHistory(dataRoot, sessionId, rows)
  } catch (e) {
    log.warn('legacy chat load failed', e)
  }
  return rows
}

export function loadMergedRecentMessages(
  dataRoot: string,
  limit = 24,
  sessionId = engineSessionId()
): Array<{ role: 'user' | 'assistant'; content: string; channel?: ChatChannel; sentAt?: string }> {
  const rows = loadUnifiedChatRows(dataRoot, sessionId)
  const sorted = [...rows].sort((a, b) => {
    const ta = a.sentAt ? Date.parse(a.sentAt) : 0
    const tb = b.sentAt ? Date.parse(b.sentAt) : 0
    return ta - tb
  })
  return sorted
    .filter((r) => r.role === 'user' || r.role === 'assistant')
    .slice(-limit)
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: r.content,
      channel: r.channel,
      sentAt: r.sentAt,
    }))
}

export function appendUnifiedChatMessage(
  dataRoot: string,
  row: Omit<UnifiedChatRow, 'kind' | 'sentAt' | 'channelLabel'> & {
    sentAt?: string
    channel?: ChatChannel
  },
  sessionId = engineSessionId()
): UnifiedChatRow {
  const ch = row.channel ?? 'desktop'
  const full: UnifiedChatRow = {
    kind: 'message',
    role: row.role,
    content: row.content,
    channel: ch,
    channelLabel: channelLabel(ch),
    sentAt: row.sentAt ?? new Date().toISOString(),
    turnId: row.turnId,
    proactiveId: row.proactiveId,
  }
  const existing = loadUnifiedChatRows(dataRoot, sessionId)
  if (row.turnId) {
    const prior = existing.find((item) => item.turnId === row.turnId && item.role === row.role)
    if (prior) return prior
  }
  existing.push(full)
  try {
    persistChatHistory(dataRoot, sessionId, existing)
  } catch (e) {
    recordProjectionError({
      sessionId,
      turnId: row.turnId,
      role: row.role,
      message: e instanceof Error ? e.message : String(e),
      at: new Date().toISOString(),
    })
    throw e
  }

  const legacyDir = join(dataRoot, 'companion')
  mkdirSync(legacyDir, { recursive: true })
  writeFileSync(
    join(legacyDir, `chat-history-${sessionId}.json`),
    JSON.stringify(existing.slice(-2000)),
    'utf-8'
  )

  broadcastToRenderers('chat:message-appended', { sessionId, row: full })
  return full
}
