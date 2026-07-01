import type { Episode } from '../../engine/types'
import { getDatabase, withTransaction } from '../database'
import { rebuildEpisodesFts } from './fts'

function rowToEpisode(row: Record<string, unknown>): Episode {
  return {
    id: String(row.id),
    summary: String(row.summary),
    emotionalIntensity: Number(row.emotional_intensity),
    dominantEmotion: String(row.dominant_emotion),
    keywords: JSON.parse(String(row.keywords)) as string[],
    prevEpisodeId: row.prev_episode_id ? String(row.prev_episode_id) : null,
    sourceSessionId: String(row.source_session_id),
    startTurn: Number(row.start_turn),
    endTurn: Number(row.end_turn),
    createdAt: String(row.created_at)
  }
}

export function countEpisodesInDb(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM episodes`).get() as { c: number }
  return row?.c ?? 0
}

export function loadEpisodesFromDb(dataRoot: string): Episode[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(`SELECT * FROM episodes ORDER BY created_at ASC`).all() as Record<
    string,
    unknown
  >[]
  return rows.map(rowToEpisode)
}

export function replaceEpisodesInDb(dataRoot: string, episodes: Episode[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  withTransaction(dataRoot, (d) => {
    d.prepare(`DELETE FROM episodes`).run()
    const ins = d.prepare(
      `INSERT INTO episodes(
        id, summary, emotional_intensity, dominant_emotion, keywords,
        prev_episode_id, source_session_id, start_turn, end_turn, created_at
      ) VALUES (
        @id, @summary, @emotional_intensity, @dominant_emotion, @keywords,
        @prev_episode_id, @source_session_id, @start_turn, @end_turn, @created_at
      )`
    )
    for (const ep of episodes) {
      ins.run({
        id: ep.id,
        summary: ep.summary,
        emotional_intensity: ep.emotionalIntensity,
        dominant_emotion: ep.dominantEmotion,
        keywords: JSON.stringify(ep.keywords),
        prev_episode_id: ep.prevEpisodeId,
        source_session_id: ep.sourceSessionId,
        start_turn: ep.startTurn,
        end_turn: ep.endTurn,
        created_at: ep.createdAt
      })
    }
    rebuildEpisodesFts(dataRoot)
  })
}

/** Phase 3: 单条 INSERT（新增情节）+ 重建 FTS */
export function insertEpisode(dataRoot: string, ep: Episode): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO episodes(
      id, summary, emotional_intensity, dominant_emotion, keywords,
      prev_episode_id, source_session_id, start_turn, end_turn, created_at
    ) VALUES (
      @id, @summary, @emotional_intensity, @dominant_emotion, @keywords,
      @prev_episode_id, @source_session_id, @start_turn, @end_turn, @created_at
    )`
  ).run({
    id: ep.id,
    summary: ep.summary,
    emotional_intensity: ep.emotionalIntensity,
    dominant_emotion: ep.dominantEmotion,
    keywords: JSON.stringify(ep.keywords),
    prev_episode_id: ep.prevEpisodeId,
    source_session_id: ep.sourceSessionId,
    start_turn: ep.startTurn,
    end_turn: ep.endTurn,
    created_at: ep.createdAt
  })
  rebuildEpisodesFts(dataRoot)
}

/** Phase 3: 清空所有情节 */
export function deleteAllEpisodesFromDb(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  withTransaction(dataRoot, (d) => {
    d.prepare(`DELETE FROM episodes`).run()
  })
  rebuildEpisodesFts(dataRoot)
}
