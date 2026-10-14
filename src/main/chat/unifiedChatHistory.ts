import { normalizeReplyMetadata, replyHistoryContent, type ReplyMetadata } from '../../shared/response'
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

export type UnifiedChatRow = ReplyMetadata & {
  kind: 'message'
  role: 'user' | 'assistant' | 'system'
  content: string
  files?: import('../../shared/chatAttachments').ChatFile[]
  images?: import('../../shared/chatImages').ChatImage[]
  channel?: ChatChannel
  channelLabel?: '电脑端' | '微信端'
  sentAt?: string
  turnId?: string
  proactiveId?: string
  createdAt?: number
  reasoning?: string
  reasoningStartedAt?: number
  reasoningDurationMs?: number
  generationState?: 'stopped' | 'error' | 'incomplete'
}

function normalizeRow(raw: unknown): UnifiedChatRow | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (r.kind !== 'message') return null
  if (r.role !== 'user' && r.role !== 'assistant' && r.role !== 'system') return null
  if (typeof r.content !== 'string' || !r.content.trim()) return null
  const ch = r.channel === 'weixin' ? 'weixin' : r.channel === 'desktop' ? 'desktop' : undefined
  return {
    ...normalizeReplyMetadata(r),
    kind: 'message',
    role: r.role,
    content: r.content,
    ...(Array.isArray(r.files) ? {files:r.files.filter((f):f is import('../../shared/chatAttachments').ChatFile=>!!f&&typeof f==='object'&&(f.kind==='file'||f.kind==='video'||f.kind==='folder')&&typeof f.path==='string'&&typeof f.name==='string'&&typeof f.size==='number').slice(0,10)} : {}),
      ...(Array.isArray(r.images) ? {images:r.images.filter((i):i is import('../../shared/chatImages').ChatImage=>!!i&&typeof i==='object'&&typeof i.path==='string'&&typeof i.name==='string'&&typeof i.preview==='string'&&/^data:image\/(png|jpeg|gif|webp);base64,/.test(i.preview)).slice(0,4)} : {}),
    channel: ch,
    channelLabel: ch ? channelLabel(ch) : undefined,
    sentAt: typeof r.sentAt === 'string' ? r.sentAt : undefined,
    turnId: typeof r.turnId === 'string' ? r.turnId : undefined,
    proactiveId: typeof r.proactiveId === 'string' ? r.proactiveId : undefined,
    ...(typeof r.createdAt === 'number' && Number.isFinite(r.createdAt) && r.createdAt > 0 ? { createdAt: r.createdAt } : {}),
    ...(r.role === 'assistant' && typeof r.reasoning === 'string' ? { reasoning: r.reasoning } : {}),
    ...(typeof r.reasoningStartedAt === 'number' && Number.isFinite(r.reasoningStartedAt) && r.reasoningStartedAt > 0 ? { reasoningStartedAt: r.reasoningStartedAt } : {}),
    ...(typeof r.reasoningDurationMs === 'number' && Number.isFinite(r.reasoningDurationMs) && r.reasoningDurationMs >= 0 ? { reasoningDurationMs: r.reasoningDurationMs } : {}),
    ...(r.generationState === 'stopped' || r.generationState === 'error' || r.generationState === 'incomplete' ? { generationState: r.generationState } : {}),
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
    .filter((r) => (r.role === 'user' || r.role === 'assistant') && r.origin !== 'companionship')
    .slice(-limit)
    .map((r) => ({
      role: r.role as 'user' | 'assistant',
      content: replyHistoryContent(r.content, r.origin, r.sourceLabel),
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
    ...normalizeReplyMetadata(row as unknown as Record<string, unknown>),
    createdAt: row.createdAt ?? Date.now(),
    kind: 'message',
    role: row.role,
    content: row.content,
    channel: ch,
    channelLabel: channelLabel(ch),
    sentAt: row.sentAt ?? new Date().toISOString(),
    turnId: row.turnId,
    proactiveId: row.proactiveId,
    ...(row.generationState ? { generationState: row.generationState } : {}),
  }
  const existing = loadUnifiedChatRows(dataRoot, sessionId)
  if (row.replyId || row.turnId || row.proactiveId) {
    const prior = existing.find((item) => row.replyId ? item.replyId === row.replyId : row.proactiveId ? item.proactiveId === row.proactiveId : item.turnId === row.turnId && item.role === row.role && item.origin === row.origin)
    if (prior) {
      if (row.origin !== 'action_result' || prior.actionStatus !== 'unknown' || prior.content === full.content) return prior
      Object.assign(prior, full)
      persistChatHistory(dataRoot, sessionId, existing)
      broadcastToRenderers('chat:delivery', { sessionId, row: prior })
      return prior
    }
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

  if (full.origin === 'action_result' || full.origin === 'reminder' || full.origin === 'companionship') broadcastToRenderers('chat:delivery', { sessionId, row: full })
  broadcastToRenderers('chat:message-appended', { sessionId, row: full })
  return full
}
