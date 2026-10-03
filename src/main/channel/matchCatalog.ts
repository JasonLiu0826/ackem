import type { DispatchCatalogEntry } from '../extensions/protocols'
import { inferCapabilityTag, isOfficialBackupEntry, type CatalogEntry } from './catalogTypes'
import { isOfficialBackupUtterance } from './detectMotive'
import { invocationPatternsFor } from './invocationPatterns'
import { matchUserInvocationForDataRoot } from '../route/userInvocations.js'

export type CatalogMatch =
  | { level: 'high'; extensionId: string; reason: 'slash' | 'exact_name' | 'exact_alias' | 'invocation' }
  | { level: 'medium'; extensionIds: string[]; reason: 'capability_tag' | 'family' }
  | { level: 'none' }

function wholeWord(haystack: string, needle: string): boolean {
  const n = needle.trim()
  if (!n) return false
  if (/^[\u4e00-\u9fff]+$/.test(n)) return haystack.includes(n)
  return new RegExp(`(?:^|\\s)${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\s|$)`, 'i').test(
    haystack
  )
}

export function toCatalogEntry(raw: DispatchCatalogEntry): CatalogEntry {
  const aliases = [...(raw.dispatch.keywords ?? [])]
  const slash = raw.dispatch.slash ?? []
  return {
    id: raw.id,
    name: raw.name,
    status: raw.status,
    rejectedInSession: raw.rejectedInSession,
    aliases,
    slash,
    capabilityTag: inferCapabilityTag({ id: raw.id, name: raw.name, aliases }),
    isUserPlugin: raw.id.startsWith('u/') || raw.id.includes('/u/'),
    invocationPatterns: raw.dispatch.invocation ?? []
  }
}

export function matchCatalog(
  text: string,
  catalog: CatalogEntry[],
  dataRoot?: string
): CatalogMatch {
  const t = text.trim()
  const usable = catalog.filter((e) => e.status === 'active' && !e.rejectedInSession)
  if (!usable.length) return { level: 'none' }

  const slashCmd = t.match(/^\/([^\s/]{1,32})(?:\s|$)/)
  if (slashCmd) {
    const cmd = slashCmd[1].toLowerCase()
    const slashHit = usable.find((e) =>
      e.slash.some((s) => s.replace(/^\//, '').toLowerCase() === cmd)
    )
    if (slashHit) return { level: 'high', extensionId: slashHit.id, reason: 'slash' }
  }

  const nameHits = usable.filter((e) => wholeWord(t, e.name))
  if (nameHits.length === 1 && !blockedOfficialBackup(nameHits[0], t)) {
    return { level: 'high', extensionId: nameHits[0].id, reason: 'exact_name' }
  }

  const aliasHits = usable.filter((e) => e.aliases.some((a) => wholeWord(t, a)))
  if (aliasHits.length === 1 && !blockedOfficialBackup(aliasHits[0], t)) {
    return { level: 'high', extensionId: aliasHits[0].id, reason: 'exact_alias' }
  }

  // 用户级调用式 (阶段 4, 设计 §10): 个性化措辞在全局调用式之前匹配。
  if (dataRoot) {
    try {
      const userHit = matchUserInvocationForDataRoot(dataRoot, t)
      if (userHit) {
        const userEntry = usable.find((e) => e.id === userHit.extensionId)
        if (userEntry) return { level: 'high', extensionId: userEntry.id, reason: 'exact_alias' }
      }
    } catch {
      /* user invocation is best-effort; fall through to global invocation */
    }
  }

  const invocationHits = usable.filter((e) => invocationPatternsFor(e).some((p) => p.test(t)))
  if (invocationHits.length === 1) {
    return { level: 'high', extensionId: invocationHits[0].id, reason: 'invocation' }
  }

  const tagHits = usable.filter((e) => e.capabilityTag && inferUseTag(t) === e.capabilityTag)
  if (tagHits.length >= 1) {
    return {
      level: 'medium',
      extensionIds: tagHits.map((e) => e.id),
      reason: 'capability_tag'
    }
  }

  return { level: 'none' }
}

export function inferUseTag(text: string): string | null {
  const t = text
  if (/天气|weather/i.test(t)) return 'weather'
  if (/搜|查一下|查找|search|look up/i.test(t)) return 'search'
  if (
    /倒计时|番茄|计时|闹钟|倒个(?:\s*\d+|钟)|定个时|开始\s*\d+\s*分钟|能不能开始\s*\d+|start\s+\d+\s*(?:minutes|minute|min)\b|start\s+(?:a\s+)?(?:timer|pomodoro)|give me\s+\d+\s*minutes|set a timer/i.test(
      t
    )
  ) {
    return 'time'
  }
  if (/提醒|ping me/i.test(t)) return 'remind'
  if (/备份/.test(t)) return 'file'
  return null
}

function blockedOfficialBackup(entry: CatalogEntry, text: string): boolean {
  return isOfficialBackupEntry(entry) && !isOfficialBackupUtterance(text)
}

export function catalogRevisionOf(catalog: CatalogEntry[]): string {
  return catalog
    .map((e) => `${e.id}:${e.status}`)
    .sort()
    .join('|')
}
