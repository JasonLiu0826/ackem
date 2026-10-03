export type CatalogEntry = {
  id: string
  name: string
  status: 'planned' | 'deprecated' | 'installed' | 'active' | 'disabled' | 'error'
  rejectedInSession?: boolean
  aliases: string[]
  slash: string[]
  capabilityTag: string | null
  family?: string | null
  isUserPlugin?: boolean
  invocationPatterns?: string[]
}

export const RESIDENT_TAGS = new Set(['time', 'remind', 'weather'])
export const SEARCH_TAG = 'search'
export const FILE_TAG = 'file'

export function inferCapabilityTag(entry: {
  id: string
  name: string
  aliases: string[]
}): string | null {
  const blob = `${entry.id} ${entry.name} ${entry.aliases.join(' ')}`.toLowerCase()
  if (/weather|天气/.test(blob)) return 'weather'
  if (/search|搜|检索|bing|web-search/.test(blob)) return 'search'
  if (/backup|file-ops|备份/.test(blob)) return 'file'
  if (/pomodoro|timer|倒计时|番茄|计时/.test(blob)) return 'time'
  if (/remind|提醒/.test(blob)) return 'remind'
  if (/note|笔记|卡/.test(blob)) return 'note'
  return null
}

export function isOfficialBackupEntry(entry: CatalogEntry): boolean {
  return (
    entry.status === 'active' &&
    !entry.rejectedInSession &&
    (entry.capabilityTag === 'file' || /backup|file-ops|备份/i.test(`${entry.id} ${entry.name}`))
  )
}
