import type Database from 'better-sqlite3'

export type FactEvidenceRole = 'supports' | 'corrects' | 'supersedes'

export type FactEvidenceMeta = {
  /** Roles that count toward recall tie-break / returned trace ids. */
  supportingEventIds: string[]
  /** All non-redacted links (for audit); supersedes excluded from scoring. */
  linkedEventIds: string[]
  /** Weighted count for tie-break (supports=1, corrects=1, supersedes=0). */
  supportingWeight: number
  latestEvidenceLocalDate: string | null
  latestEvidenceObservedAt: string | null
}

export type EpisodeEvidenceMeta = {
  eventIds: string[]
  latestEvidenceLocalDate: string | null
}

function roleWeight(role: string): number {
  if (role === 'supports' || role === 'corrects') return 1
  return 0
}

function countsForRanking(role: string): boolean {
  return role === 'supports' || role === 'corrects'
}

export function loadFactEvidenceIndex(db: Database.Database): Map<string, FactEvidenceMeta> {
  const rows = db
    .prepare(
      `SELECT fe.fact_id, fe.event_id, fe.evidence_role, e.local_date, e.observed_at, p.redacted_at
       FROM memory_fact_evidence fe
       JOIN memory_events e ON e.event_id = fe.event_id
       LEFT JOIN memory_event_payloads p ON p.event_id = e.event_id`
    )
    .all() as Array<{
    fact_id: string
    event_id: string
    evidence_role: FactEvidenceRole
    local_date: string
    observed_at: string
    redacted_at: string | null
  }>

  const out = new Map<string, FactEvidenceMeta>()
  for (const row of rows) {
    if (row.redacted_at != null) continue

    const cur = out.get(row.fact_id) ?? {
      supportingEventIds: [],
      linkedEventIds: [],
      supportingWeight: 0,
      latestEvidenceLocalDate: null,
      latestEvidenceObservedAt: null
    }

    cur.linkedEventIds.push(row.event_id)
    if (countsForRanking(row.evidence_role)) {
      cur.supportingEventIds.push(row.event_id)
      cur.supportingWeight += roleWeight(row.evidence_role)
      if (
        !cur.latestEvidenceObservedAt ||
        row.observed_at.localeCompare(cur.latestEvidenceObservedAt) > 0
      ) {
        cur.latestEvidenceObservedAt = row.observed_at
        cur.latestEvidenceLocalDate = row.local_date
      }
    }

    out.set(row.fact_id, cur)
  }
  return out
}

export function loadEpisodeEvidenceIndex(db: Database.Database): Map<string, EpisodeEvidenceMeta> {
  const rows = db
    .prepare(
      `SELECT ee.episode_id, ee.event_id, e.local_date, p.redacted_at
       FROM memory_episode_evidence ee
       JOIN memory_events e ON e.event_id = ee.event_id
       LEFT JOIN memory_event_payloads p ON p.event_id = e.event_id`
    )
    .all() as Array<{ episode_id: string; event_id: string; local_date: string; redacted_at: string | null }>
  const out = new Map<string, EpisodeEvidenceMeta>()
  for (const row of rows) {
    if (row.redacted_at != null) continue
    const cur = out.get(row.episode_id) ?? { eventIds: [], latestEvidenceLocalDate: null }
    cur.eventIds.push(row.event_id)
    if (!cur.latestEvidenceLocalDate || row.local_date.localeCompare(cur.latestEvidenceLocalDate) > 0) {
      cur.latestEvidenceLocalDate = row.local_date
    }
    out.set(row.episode_id, cur)
  }
  return out
}
