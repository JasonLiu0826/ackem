import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

export function loadRecentUserSnippets(
  dataRoot: string,
  sessionId: string,
  limit = 5,
  maxChars = 160
): string[] {
  const file = join(dataRoot, 'companion', `chat-history-${sessionId}.json`)
  if (!existsSync(file)) return []
  try {
    const rows = JSON.parse(readFileSync(file, 'utf-8')) as Array<{ role: string; content: string }>
    if (!Array.isArray(rows)) return []
    return rows
      .filter(r => r.role === 'user' && typeof r.content === 'string' && r.content.trim())
      .slice(-limit)
      .map(r => r.content.trim().slice(0, maxChars))
  } catch {
    return []
  }
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
