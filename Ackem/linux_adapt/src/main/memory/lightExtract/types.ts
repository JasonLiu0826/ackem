import type { Subcategory } from '../taxonomy'

export type FactDraftSource = 'light_rule' | 'explicit_remember' | 'llm'

export type FactDraft = {
  domain: string
  subcategory: Subcategory | 'NOTE'
  subject: string
  summary: string
  weight?: number
  confidence?: number
  triggers?: string[]
  ageMeta?: { birthdayMMDD?: string }
  source: FactDraftSource
  ruleId: string
  familyScope?: 'user'
}

export type ExtractedFactRow = {
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight?: number
  confidence?: number
  selfRelevance?: number
  triggers?: string[]
  ageMeta?: { birthdayMMDD?: string }
}
