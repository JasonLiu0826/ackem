import { getDatabase } from '../database'

export function rebuildFactsFts(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.exec(`DELETE FROM memory_facts_fts`)
  const rows = db
    .prepare(`SELECT id, subject, summary, triggers_text FROM memory_facts WHERE status = 'active'`)
    .all() as { id: string; subject: string; summary: string; triggers_text: string }[]
  const ins = db.prepare(
    `INSERT INTO memory_facts_fts(fact_id, subject, summary, triggers_text)
     VALUES (?, ?, ?, ?)`
  )
  const run = db.transaction(() => {
    for (const r of rows) {
      ins.run(r.id, r.subject, r.summary, r.triggers_text ?? '')
    }
  })
  run()
}

export function rebuildEpisodesFts(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.exec(`DELETE FROM episodes_fts`)
  const rows = db.prepare(`SELECT * FROM episodes`).all() as Record<string, unknown>[]
  const ins = db.prepare(
    `INSERT INTO episodes_fts(episode_id, summary, keywords_text, dominant_emotion)
     VALUES (?, ?, ?, ?)`
  )
  const run = db.transaction(() => {
    for (const r of rows) {
      let keywordsText = ''
      try {
        const kw = JSON.parse(String(r.keywords)) as string[]
        keywordsText = kw.join(' ')
      } catch {
        keywordsText = ''
      }
      ins.run(String(r.id), String(r.summary), keywordsText, String(r.dominant_emotion))
    }
  })
  run()
}

// ═══════════════════════════════════════
// Phase 3: 增量 FTS 操作
// ═══════════════════════════════════════

/** 单条插入事实 FTS 索引 */
export function insertFactFts(
  dataRoot: string,
  factId: string,
  subject: string,
  summary: string,
  triggersText: string
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO memory_facts_fts(fact_id, subject, summary, triggers_text) VALUES (?, ?, ?, ?)`
  ).run(factId, subject, summary, triggersText)
}

/** 单条删除事实 FTS 索引 */
export function deleteFactFts(dataRoot: string, factId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM memory_facts_fts WHERE fact_id = ?`).run(factId)
}

/** 单条插入情节 FTS 索引 */
export function insertEpisodeFts(
  dataRoot: string,
  episodeId: string,
  summary: string,
  keywordsText: string,
  dominantEmotion: string
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `INSERT INTO episodes_fts(episode_id, summary, keywords_text, dominant_emotion) VALUES (?, ?, ?, ?)`
  ).run(episodeId, summary, keywordsText, dominantEmotion)
}

/** 单条删除情节 FTS 索引 */
export function deleteEpisodeFts(dataRoot: string, episodeId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM episodes_fts WHERE episode_id = ?`).run(episodeId)
}

function buildFtsMatch(query: string): string | null {
  const q = query.trim()
  if (!q) return null
  const words = q.split(/\s+/).filter((t) => t.length >= 2)
  if (words.length > 0) {
    return words.map((t) => `"${t.replace(/"/g, '""')}"`).join(' OR ')
  }
  if (q.length >= 2) {
    return `"${q.replace(/"/g, '""')}"`
  }
  return null
}

/** FTS5 MATCH；返回 fact id 列表 */
export function searchFactIdsFts(dataRoot: string, query: string, limit: number): string[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const match = buildFtsMatch(query)
  if (!match) return []
  try {
    const rows = db
      .prepare(
        `SELECT fact_id FROM memory_facts_fts WHERE memory_facts_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(match, limit) as { fact_id: string }[]
    if (rows.length > 0) return rows.map((r) => r.fact_id)
  } catch {
    /* fall through to LIKE */
  }
  const like = `%${query.trim()}%`
  const fallback = db
    .prepare(
      `SELECT id FROM memory_facts WHERE status = 'active' AND (
        summary LIKE ? OR triggers_text LIKE ? OR subject LIKE ?
      ) LIMIT ?`
    )
    .all(like, like, like, limit) as { id: string }[]
  return fallback.map((r) => r.id)
}

export function searchEpisodeIdsFts(dataRoot: string, query: string, limit: number): string[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const match = buildFtsMatch(query)
  if (!match) return []
  try {
    const rows = db
      .prepare(
        `SELECT episode_id FROM episodes_fts WHERE episodes_fts MATCH ? ORDER BY rank LIMIT ?`
      )
      .all(match, limit) as { episode_id: string }[]
    return rows.map((r) => r.episode_id)
  } catch {
    return []
  }
}
