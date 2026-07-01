// [foregroundHistory] — 前台检测历史
// 职责：记录每次前台窗口检测结果，定时扫描生成候选长时习惯
// 设计文档：docs/plan/主动策略调度loop详细设计_6_11.md

import { getDatabase } from '../db/database'
import { upsertHabit } from '../memory/habitsStore'

export type ForegroundScene = 'meeting' | 'presentation' | 'focus' | 'other'

/** 记录一条前台检测 */
export function recordForegroundDetection(
  dataRoot: string,
  title: string,
  scene: ForegroundScene
): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    'INSERT INTO foreground_history (title, scene, detected_at) VALUES (?, ?, ?)'
  ).run(title, scene, Date.now())
}

/** 每小时扫描前台历史，检测候选长时习惯 */
export function scanForegroundHistory(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0

  const now = Date.now()
  // 看最近 28 天的数据
  const cutoff = now - 28 * 86400000

  // 清掉过期历史
  db.prepare('DELETE FROM foreground_history WHERE detected_at < ?').run(cutoff)

  // 按 (weekday, hour_range, scene) 聚合
  const rows = db
    .prepare(
      `SELECT
         CAST(strftime('%w', detected_at / 1000, 'unixepoch') AS INTEGER) AS wd,
         CAST(strftime('%H', detected_at / 1000, 'unixepoch') AS INTEGER) AS hr,
         scene,
         COUNT(*) as cnt,
         MIN(detected_at) as first_at,
         MAX(detected_at) as last_at
       FROM foreground_history
       WHERE detected_at >= ?
         AND scene IN ('meeting', 'presentation', 'focus')
       GROUP BY wd, hr, scene
       HAVING cnt >= 3`
    )
    .all(cutoff) as Array<{
    wd: number; hr: number; scene: string; cnt: number
    first_at: number; last_at: number
  }>

  let habitsCreated = 0

  for (const row of rows) {
    // 检查是否跨 ≥2 周
    const weeksSpan = Math.ceil((row.last_at - row.first_at) / (7 * 86400000))
    if (weeksSpan < 2) continue

    const habitType = row.scene === 'focus' ? 'busy_focus' : 'busy_meeting'
    const noteMap: Record<string, string> = {
      meeting: '会议',
      presentation: '演示/PPT',
      focus: '专注模式',
    }

    upsertHabit(dataRoot, {
      type: habitType,
      scope: 'long_term',
      weekday: row.wd,
      hourStart: row.hr,
      hourEnd: row.hr + 1,
      confidence: Math.min(0.95, 0.6 + (row.cnt - 3) * 0.1),
      source: 'foreground_detect',
      note: `每周${['日', '一', '二', '三', '四', '五', '六'][row.wd]}${row.hr}点·${noteMap[row.scene] ?? row.scene}`,
    })

    habitsCreated++
  }

  return habitsCreated
}
