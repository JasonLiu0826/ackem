import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { hasChatHistoryRow, loadChatHistoryFromDb } from '../db/repos/chatHistory.js'
import type { UserEngagementLevel, UserRuntimeContext } from './types'

const ACTIVE_NOW_MIN = 20
const RECENTLY_ACTIVE_MIN = 120

export function resolveUserEngagement(
  lastActiveIso: string,
  now = new Date()
): Pick<UserRuntimeContext, 'lastActiveAt' | 'minutesSinceLastChat' | 'engagement'> {
  const lastMs = new Date(lastActiveIso).getTime()
  const minutesSinceLastChat = Number.isFinite(lastMs)
    ? Math.max(0, Math.round((now.getTime() - lastMs) / 60_000))
    : 9999

  let engagement: UserEngagementLevel
  if (minutesSinceLastChat <= ACTIVE_NOW_MIN) {
    engagement = 'active_now'
  } else if (minutesSinceLastChat <= RECENTLY_ACTIVE_MIN) {
    engagement = 'recently_active'
  } else if (minutesSinceLastChat <= 480) {
    engagement = 'idle'
  } else {
    engagement = 'likely_away'
  }

  return { lastActiveAt: lastActiveIso, minutesSinceLastChat, engagement }
}

type StoredChatRow = { kind?: string; role?: string; content?: string }

export function loadRecentUserSnippets(
  dataRoot: string,
  sessionId: string,
  limit = 5,
  maxChars = 160
): string[] {
  let rows: StoredChatRow[]
  if (hasChatHistoryRow(dataRoot, sessionId)) {
    rows = loadChatHistoryFromDb(dataRoot, sessionId) as StoredChatRow[]
  } else {
    const file = join(dataRoot, 'companion', `chat-history-${sessionId}.json`)
    if (!existsSync(file)) return []
    try {
      rows = JSON.parse(readFileSync(file, 'utf-8')) as StoredChatRow[]
      if (!Array.isArray(rows)) return []
    } catch {
      return []
    }
  }
  return rows
    .filter(
      (r) =>
        (!r.kind || r.kind === 'message') &&
        r.role === 'user' &&
        typeof r.content === 'string' &&
        r.content.trim()
    )
    .slice(-limit)
    .map((r) => r.content!.trim().slice(0, maxChars))
}

export function resolveUserRuntimeContext(
  dataRoot: string,
  sessionId: string,
  lastActiveIso: string,
  now = new Date()
): UserRuntimeContext {
  return {
    ...resolveUserEngagement(lastActiveIso, now),
    recentUserSnippets: loadRecentUserSnippets(dataRoot, sessionId)
  }
}
