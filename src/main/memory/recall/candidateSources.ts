import type Database from 'better-sqlite3'

import { getDatabase } from '../../db/database.js'
import type { RecallQuery } from '../contracts.js'
import { zonedLocalDate } from '../temporal/zonedDate.js'
import type { MemoryFact } from '../semantic/types.js'
import type { Episode } from '../episodes/types.js'
import { loadEpisodesFromDb } from '../../db/repos/episodes.js'
import type { RecallIntentKind } from './recallIntent.js'
import {
  loadEpisodeEvidenceIndex,
  loadFactEvidenceIndex,
  type EpisodeEvidenceMeta,
  type FactEvidenceMeta
} from './evidenceIndex.js'
import { recallTextRelevance } from './recallLexical.js'
import { resolveActionStatusEvidenceEventIds } from './actionStatusEvidence.js'
import { loadTombstoneIndex } from '../governance/tombstoneIndex.js'

export type RecallCandidate = {
  id: string
  source: 'action' | 'fact' | 'episode'
  text: string
  lexicalScore: number
  confidence: number
  evidenceEventIds: string[]
  occurredAt: string | null
  freshness: 'current' | 'stale' | 'unknown'
  factStatus?: MemoryFact['status']
  factSessionId?: string
  factSubcategory?: string
  factTier?: MemoryFact['tier']
  factWeight?: number
  factValidFrom?: string | null
  factValidTo?: string | null
  factSensitivity?: MemoryFact['sensitivity']
  evidenceLatestLocalDate?: string | null
  evidenceSupportingWeight?: number
  actionStatus?: string
  actionNature?: 'plugin' | 'work'
  episodeSessionId?: string
}

const OPEN_ACTION_STATUSES = ['running', 'waiting_permission', 'queued', 'accepted', 'unknown'] as const

/** @deprecated use recallTextRelevance */
export function lexicalOverlapScore(query: string, corpus: string): number {
  return recallTextRelevance(query, corpus)
}

function actionLabel(nature: 'plugin' | 'work', status: string, targetId: string | null, runId: string): string {
  const tag = nature === 'work' ? '工作' : '插件'
  const tgt = targetId ? ` target=${targetId}` : ''
  return `[${tag}] run=${runId} status=${status}${tgt}`
}

type ActionRow = {
  run_id: string
  nature: 'plugin' | 'work'
  status: string
  target_id: string | null
  session_id: string
  updated_at: string
  correlation_id: string
  last_event_id: string
  request_event_id: string
}

/** Open runs always included; terminal runs paginated (Task 12 noise floor). */
export function loadActionCandidates(
  db: Database.Database,
  query: RecallQuery,
  intents: RecallIntentKind[]
): RecallCandidate[] {
  const open = db
    .prepare(
      `SELECT run_id, nature, status, target_id, session_id, updated_at, correlation_id,
              last_event_id, request_event_id
       FROM memory_action_runs
       WHERE session_id = ? AND status IN (${OPEN_ACTION_STATUSES.map(() => '?').join(',')})
       ORDER BY updated_at DESC`
    )
    .all(query.sessionId, ...OPEN_ACTION_STATUSES) as ActionRow[]

  const terminal: ActionRow[] = []
  let afterObservedAt: string | undefined
  let afterRunId: string | undefined
  const pageSize = 200
  for (let page = 0; page < 5; page++) {
    const clauses = [
      'session_id = ?',
      `status NOT IN (${OPEN_ACTION_STATUSES.map(() => '?').join(',')})`
    ]
    const params: unknown[] = [query.sessionId, ...OPEN_ACTION_STATUSES]
    if (afterObservedAt && afterRunId) {
      clauses.push('(updated_at < ? OR (updated_at = ? AND run_id < ?))')
      params.push(afterObservedAt, afterObservedAt, afterRunId)
    }
    const batch = db
      .prepare(
        `SELECT run_id, nature, status, target_id, session_id, updated_at, correlation_id,
                last_event_id, request_event_id
         FROM memory_action_runs
         WHERE ${clauses.join(' AND ')}
         ORDER BY updated_at DESC, run_id DESC
         LIMIT ?`
      )
      .all(...params, pageSize) as ActionRow[]
    terminal.push(...batch)
    if (batch.length < pageSize) break
    const last = batch[batch.length - 1]!
    afterObservedAt = last.updated_at
    afterRunId = last.run_id
  }

  const wantWork = intents.includes('task_progress')
  const wantPlugin = intents.includes('plugin_result')
  const merged = [...open, ...terminal]
  const seen = new Set<string>()

  return merged
    .filter((r) => {
      if (seen.has(r.run_id)) return false
      seen.add(r.run_id)
      if (wantWork && !wantPlugin) return r.nature === 'work'
      if (wantPlugin && !wantWork) return r.nature === 'plugin'
      return true
    })
    .map((r) => {
      const text = actionLabel(r.nature, r.status, r.target_id, r.run_id)
      const evidenceEventIds = resolveActionStatusEvidenceEventIds(db, {
        last_event_id: r.last_event_id,
        request_event_id: r.request_event_id,
        correlation_id: r.correlation_id,
        nature: r.nature,
        status: r.status
      })
      return {
        id: `action:${r.run_id}`,
        source: 'action' as const,
        text,
        lexicalScore: recallTextRelevance(query.text, text),
        confidence: 1,
        evidenceEventIds,
        occurredAt: r.updated_at,
        freshness: OPEN_ACTION_STATUSES.includes(r.status as (typeof OPEN_ACTION_STATUSES)[number])
          ? 'current'
          : 'stale',
        actionStatus: r.status,
        actionNature: r.nature
      }
    })
}

function mapFactRow(
  row: Record<string, unknown>,
  query: RecallQuery,
  intents: RecallIntentKind[],
  evidence: FactEvidenceMeta | undefined
): RecallCandidate {
  const summary = String(row.summary)
  let lexical = recallTextRelevance(query.text, summary)
  if (intents.includes('user_preference') && String(row.subcategory) === 'BASIC_PROFILE') lexical += 2
  const supportW = evidence?.supportingWeight ?? 0
  const baseConf = Number(row.confidence ?? 0.5)
  return {
    id: `fact:${String(row.id)}`,
    source: 'fact',
    text: summary,
    lexicalScore: lexical,
    confidence: Math.min(1, baseConf + supportW * 0.04),
    evidenceEventIds: evidence?.supportingEventIds ?? [],
    occurredAt:
      row.occurred_at != null
        ? String(row.occurred_at)
        : row.updated_at != null
          ? String(row.updated_at)
          : null,
    freshness: row.status === 'active' ? 'current' : 'stale',
    factStatus: row.status as MemoryFact['status'],
    factSessionId: String(row.source_session_id),
    factSubcategory: String(row.subcategory),
    factTier: row.tier as MemoryFact['tier'],
    factWeight: Number(row.weight ?? 1),
    factValidFrom: row.valid_from != null ? String(row.valid_from) : null,
    factValidTo: row.valid_to != null ? String(row.valid_to) : null,
    factSensitivity: (row.sensitivity ?? 'normal') as MemoryFact['sensitivity'],
    evidenceLatestLocalDate: evidence?.latestEvidenceLocalDate ?? null,
    evidenceSupportingWeight: supportW
  }
}

export function loadFactCandidates(
  dataRoot: string,
  query: RecallQuery,
  intents: RecallIntentKind[],
  db?: Database.Database
): RecallCandidate[] {
  const database = db ?? getDatabase(dataRoot)
  if (!database) return []

  const evidenceIndex = loadFactEvidenceIndex(database)
  const tombstones = loadTombstoneIndex(database)
  const rows = database.prepare(`SELECT * FROM memory_facts`).all() as Record<string, unknown>[]
  return rows
    .filter((row) => !tombstones.facts.has(String(row.id)))
    .map((row) => mapFactRow(row, query, intents, evidenceIndex.get(String(row.id))))
}

export function loadEpisodeCandidates(
  dataRoot: string,
  query: RecallQuery,
  db?: Database.Database
): RecallCandidate[] {
  const database = db ?? getDatabase(dataRoot)
  const evidenceIndex = database ? loadEpisodeEvidenceIndex(database) : new Map<string, EpisodeEvidenceMeta>()
  const tombstones = database ? loadTombstoneIndex(database) : { facts: new Set(), episodes: new Set(), events: new Set() }
  const episodes: Episode[] = loadEpisodesFromDb(dataRoot).filter((ep) => !tombstones.episodes.has(ep.id))
  return episodes.map((ep) => {
    const text = ep.summary
    const ev = evidenceIndex.get(ep.id)
    return {
      id: `episode:${ep.id}`,
      source: 'episode' as const,
      text,
      lexicalScore: recallTextRelevance(query.text, text),
      confidence: 0.75,
      evidenceEventIds: ev?.eventIds ?? [],
      occurredAt: ep.createdAt ?? null,
      freshness: 'unknown',
      episodeSessionId: ep.sourceSessionId
    }
  })
}

export function queryLocalDate(query: RecallQuery): string {
  return zonedLocalDate(new Date(query.observedAt), query.timezone)
}
