import { countRecentPosts, createPost } from '../../../db/repos/friendCircleRepo'
import { getDatabase } from '../../../db/database'
import { listSocialEvents } from '../../../db/repos/socialEventsRepo'
import { loadCompanionStateFromDb } from '../../../db/repos/companionState'
import { listRegisteredAgents } from '../../agents/agentRegistry'
import { PRIMARY_AGENT_ID } from '../../agents/agentPaths'
import { generatePost } from '../../feed/contentService'
import { shouldPost } from '../../feed/postDecision'
import { writeMemberPostFact } from '../../memory/socialMemoryWriter'
import { getSocialSettings } from '../../settings'
import { SOCIAL, socialId } from '../../types'
import { isChatInFlight } from '../chatInFlight'

/** Step2: agents may post (skip chatInFlight; cap MAX_POSTS_PER_TICK). */
export async function stepPost(dataRoot: string): Promise<{ posts: number }> {
  const settings = getSocialSettings(dataRoot)
  const agents = listRegisteredAgents(dataRoot).filter(
    (a) => a.kind === 'social_member' && a.id !== PRIMARY_AGENT_ID
  )
  const since = new Date(Date.now() - SOCIAL.POST_WINDOW_MS).toISOString()
  const now = new Date().toISOString()
  const jealousBoost = recentJealousyAgentIds(dataRoot)
  let posts = 0

  for (const agent of agents) {
    if (posts >= SOCIAL.MAX_POSTS_PER_TICK) break
    if (isChatInFlight(agent.id)) continue

    const state = loadCompanionStateFromDb(dataRoot, agent.session_id)
    const aff = state?.emotion?.aff ?? 0
    let aro = state?.emotion?.aro ?? 0
    if (jealousBoost.has(agent.id)) aro = Math.min(1, aro + 0.35)
    const recentCount = countRecentPosts(dataRoot, agent.id, since)
    if (!shouldPost({ recentCount, se: agent.se, aff, aro })) continue

    const { content, source } = await generatePost(
      { name: agent.name, aff, aro },
      settings.contentMode
    )
    const postId = socialId('post')
    createPost(dataRoot, {
      id: postId,
      author_id: agent.id,
      content,
      emotion_label: state?.emotion?.primaryLabel ?? null,
      emotion_valence: aff,
      created_at: now,
      offline_generated: 0,
      content_source: source,
    })
    writeMemberPostFact(dataRoot, agent.id, postId)
    posts++

    if (source === 'llm') {
      try {
        const db = getDatabase(dataRoot)
        if (db) {
          const day = now.slice(0, 10)
          db.prepare(
            `INSERT INTO social_daily_stats(day, tick_count, llm_calls, posts)
             VALUES(?, 0, 1, 1)
             ON CONFLICT(day) DO UPDATE SET
               llm_calls = llm_calls + 1,
               posts = posts + 1`
          ).run(day)
        }
      } catch {
        /* stats best-effort */
      }
    }
  }
  return { posts }
}

function recentJealousyAgentIds(dataRoot: string): Set<string> {
  const ids = new Set<string>()
  for (const e of listSocialEvents(dataRoot, 'jealousy', 12)) {
    try {
      const p = JSON.parse(e.payload) as { agentId?: string; mode?: string }
      if (p.agentId && (p.mode === 'sour_post' || p.mode === 'whisper')) ids.add(p.agentId)
    } catch {
      /* ignore */
    }
  }
  return ids
}
