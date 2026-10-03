import type { Episode } from './types.js'
import { getDatabase } from '../../db/database.js'
import { insertEpisode } from '../../db/repos/episodes.js'

export function insertEpisodeWithEvidence(
  dataRoot: string,
  episode: Episode,
  evidenceEventIds: string[],
  createdAt: string
): void {
  insertEpisode(dataRoot, episode)
  const db = getDatabase(dataRoot)
  if (!db || evidenceEventIds.length === 0) return
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO memory_episode_evidence (episode_id, event_id, created_at)
     VALUES (?, ?, ?)`
  )
  for (const eventId of evidenceEventIds) {
    stmt.run(episode.id, eventId, createdAt)
  }
}

export function episodeExistsForTerminalEvent(dataRoot: string, terminalEventId: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const row = db
    .prepare(`SELECT 1 FROM memory_episode_evidence WHERE event_id = ? LIMIT 1`)
    .get(terminalEventId)
  return Boolean(row)
}

export function listEpisodeEvidenceEventIds(dataRoot: string, episodeId: string): string[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  return (
    db
      .prepare(`SELECT event_id FROM memory_episode_evidence WHERE episode_id = ? ORDER BY created_at ASC`)
      .all(episodeId) as Array<{ event_id: string }>
  ).map((r) => r.event_id)
}
