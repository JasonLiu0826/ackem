import type { MemoryAuditMode } from './memoryAuditIntent'

export type MemoryAuditFactRow = {
  id: string
  domain: string
  subcategory: string
  domainLabel: string
  subcategoryLabel: string
  subject: string
  summary: string
  weight: number
  confidence: number
  isCore: boolean
  source: '对话' | '导入' | '其他'
}

export type MemoryAuditTimelineRow = {
  dateLabel: string
  type: 'birthday' | 'anniversary' | 'milestone' | 'plan' | 'custom'
  typeLabel: string
  summary: string
}

export type MemoryAuditEpisodeRow = {
  id: string
  summary: string
  dominantEmotion: string
  emotionalIntensity: number
  createdAt: string
}

export type MemoryAuditDomainStat = {
  domain: string
  label: string
  total: number
  listed: number
}

export type MemoryAuditReport = {
  mode: MemoryAuditMode
  generatedAt: string
  stats: {
    totalActiveFacts: number
    factsListed: number
    factsHidden: number
    coreFacts: number
    episodesListed: number
    timelineCount: number
    page?: number
    pageCount?: number
  }
  facts: MemoryAuditFactRow[]
  timeline: MemoryAuditTimelineRow[]
  episodes: MemoryAuditEpisodeRow[]
  domainStats: MemoryAuditDomainStat[]
}

export type MemoryAuditCardPayload = {
  mode: MemoryAuditMode
  displayTitle: string
  cardBody: string
  copyText: string
  stats: MemoryAuditReport['stats']
  domainStats: MemoryAuditDomainStat[]
}
