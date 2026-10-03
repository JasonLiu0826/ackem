export type MemoryFactStatus = 'active' | 'retired'
export type FactLayer = 'raw' | 'consolidated'
export type MemoryTier = 'core' | 'archival'

/** Memory-domain emotional snapshot; structurally compatible with engine EmotionalContext. */
export interface MemoryEmotionalContext {
  valence: number
  intensity: number
  relStage: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  trust: number
  atmosphere: 'warm' | 'neutral' | 'cool'
}

export interface AgeMeta {
  age: number
  birthdayMMDD?: string
  birthYear?: number
  recordedAt: string
  isEstimate: boolean
}

export interface MemoryFact {
  id: string
  domain: string
  subcategory: string
  subject: string
  summary: string
  weight: number
  confidence: number
  status: MemoryFactStatus
  emotionalContext: MemoryEmotionalContext
  selfRelevance: number
  triggers: string[]
  updateTrail: string[]
  sourceSessionId: string
  sourceTurnIndex: number
  createdAt: string
  updatedAt: string
  /** Monotonic revision per fact row (SQLite index_revision); drives index pending generations. */
  indexRevision?: number
  derivedFrom?: string[]
  factLayer?: FactLayer
  tier?: MemoryTier
  sensitivity?: 'normal' | 'avoid'
  privacyLevel?: 'normal' | 'intimate' | 'explicit'
  sourceChannel?: 'desktop' | 'weixin'
  occurredAt?: string
  scheduledFor?: string
  ownerAgentId?: string
  interactionSurface?: string
  counterpartyKind?: string
  counterpartyId?: string | null
  involvesUser?: boolean
  contextJson?: Record<string, unknown>
  ageMeta?: AgeMeta
}

export interface EvidenceLink {
  factId: string
  eventId: string
  evidenceRole: 'supports' | 'corrects' | 'supersedes'
  createdAt: string
}

export type FactChangeKind = 'inserted' | 'updated' | 'retired' | 'superseded'

export interface FactChangeSet {
  inserted: string[]
  updated: string[]
  retired: string[]
  superseded: string[]
}

/** Durable pending row: fact id + change kind + committed index_revision. */
export interface FactIndexPendingEntry {
  factId: string
  kind: FactChangeKind
  revision: number
}

export type AppliedFactIndexPendingEntry = FactIndexPendingEntry

export interface DerivedFactCandidate {
  subject: string
  summary: string
  domain: string
  subcategory: string
  confidence: number
  evidenceEventIds: string[]
  occurredAt: string | null
  scheduledFor: string | null
  timezone: string
}

export type InvalidationTarget =
  | { kind: 'event'; eventId: string }
  | { kind: 'fact'; factId: string }
  | { kind: 'topic'; normalizedTopic: string }

export interface SemanticFactQuery {
  text: string
  eventTimeRange?: { from: string; to: string }
  limit: number
  includeMuted: boolean
}

export interface FactCandidate {
  factId: string
  summary: string
  score: number
  confidence: number
  evidenceEventIds: string[]
}

export interface SemanticMemory {
  apply(candidates: DerivedFactCandidate[]): Promise<FactChangeSet>
  invalidate(target: InvalidationTarget): Promise<FactChangeSet>
  search(query: SemanticFactQuery): Promise<FactCandidate[]>
}
