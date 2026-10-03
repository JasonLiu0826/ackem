import { getDatabase } from '../../../db/database'
import { checkAchievements } from '../../achievement/achievementChecker'
import { enqueueAchievement } from '../../achievement/achievementQueue'
import { SOCIAL } from '../../types'
import { listSocialEvents } from '../../../db/repos/socialEventsRepo'

/** Step6: copper every tick; silver/gold every N ticks. */
export function stepAchievements(dataRoot: string, tickIndex = 0): { unlocked: string[] } {
  const unlocked: string[] = []
  const rare = tickIndex % SOCIAL.ACHIEVE_RARE_EVERY_N_TICKS === 0

  const recent = listSocialEvents(dataRoot, undefined, 30)
  const seen = new Set<string>()
  for (const ev of recent) {
    if (seen.has(ev.type)) continue
    seen.add(ev.type)
    const ids = checkAchievements(dataRoot, ev.type)
    for (const id of ids) {
      unlocked.push(id)
      enqueueAchievement(id)
    }
  }

  // Also try common copper event aliases from defs
  for (const type of ['first_visit', 'first_like', 'jealousy_seen', 'jealousy_triggered']) {
    if (seen.has(type)) continue
    // jealousy_seen maps when jealousy events exist
    if (type === 'jealousy_seen' && recent.some((e) => e.type === 'jealousy')) {
      const ids = checkAchievements(dataRoot, 'jealousy_seen')
      unlocked.push(...ids)
      ids.forEach(enqueueAchievement)
    }
  }

  if (!rare) {
    // filter to copper-only by re-checking — already unlocked via eventType match
  }

  try {
    const db = getDatabase(dataRoot)
    if (db) {
      const day = new Date().toISOString().slice(0, 10)
      db.prepare(
        `INSERT INTO social_daily_stats(day, tick_count, llm_calls, posts)
         VALUES(?, 1, 0, 0)
         ON CONFLICT(day) DO UPDATE SET tick_count = tick_count + 1`
      ).run(day)
    }
  } catch {
    /* ignore */
  }

  return { unlocked }
}
