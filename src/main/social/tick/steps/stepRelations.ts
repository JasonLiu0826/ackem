import { listInteractions } from '../../../db/repos/fcInteractionsRepo'
import { createPost, listPosts } from '../../../db/repos/friendCircleRepo'
import { addSocialEvent, listSocialEvents } from '../../../db/repos/socialEventsRepo'
import { loadCompanionStateFromDb } from '../../../db/repos/companionState'
import { listRegisteredAgents, getRegisteredAgent } from '../../agents/agentRegistry'
import { jealousTemplate } from '../../feed/jealousTemplates'
import { detectJealousy } from '../../jealousy/jealousy'
import { applyGraphAction } from '../../relationship/socialGraphService'
import { enqueueSocialEcho } from '../../echo/socialEchoQueue'
import { writeJealousyMemoryFact, writeMemberPostFact } from '../../memory/socialMemoryWriter'
import { SOCIAL, socialId } from '../../types'

/** Step5: graph deltas from interactions + jealousy detect/apply. */
export function stepRelations(dataRoot: string): {
  graphUpdates: number
  jealousy: number
} {
  const posts = listPosts(dataRoot, undefined, 30)
  let graphUpdates = 0

  for (const post of posts) {
    for (const ix of listInteractions(dataRoot, post.id)) {
      if (ix.actor_kind !== 'agent') continue
      if (ix.actor_id === post.author_id) continue
      applyGraphAction(
        dataRoot,
        ix.actor_id,
        post.author_id,
        ix.type === 'comment' ? 'comment' : 'like',
        ix.sentiment ?? 0
      )
      graphUpdates++
    }
  }

  const members = listRegisteredAgents(dataRoot).filter((a) => a.kind === 'social_member')
  const trustEntries = members.map((a) => {
    const st = loadCompanionStateFromDb(dataRoot, a.session_id)
    return {
      agentId: a.id,
      trust: st?.relationship?.trust ?? 25,
      se: a.se,
      so: a.so,
    }
  })

  const chatEvents = listSocialEvents(dataRoot, 'chat_inflight', SOCIAL.JEALOUSY_CHAT_N)
  const recentAgentIds = chatEvents
    .map((e) => {
      try {
        return (JSON.parse(e.payload) as { agentId?: string }).agentId ?? ''
      } catch {
        return ''
      }
    })
    .filter(Boolean)

  // Prefer real chat share; otherwise pad so gap-based candidates can fire in idle ticks
  const recent =
    recentAgentIds.length > 0 ? recentAgentIds : padFavoriteShare(trustEntries)

  const jealous = detectJealousy(trustEntries, recent)
  const now = new Date().toISOString()
  let jealousyCount = 0

  for (const j of jealous) {
    const agent = getRegisteredAgent(dataRoot, j.agentId)
    const fav = getRegisteredAgent(dataRoot, j.favoriteId)
    if (!agent) continue

    addSocialEvent(dataRoot, {
      id: socialId('jel'),
      type: 'jealousy',
      payload: JSON.stringify({
        agentId: j.agentId,
        favoriteId: j.favoriteId,
        mode: j.mode,
        name: agent.name,
      }),
      created_at: now,
    })

    if (j.mode === 'sour_post') {
      const postId = socialId('jpost')
      createPost(dataRoot, {
        id: postId,
        author_id: agent.id,
        content: jealousTemplate(agent.name, fav?.name ?? '她'),
        created_at: now,
        offline_generated: 0,
        content_source: 'template',
      })
      writeMemberPostFact(dataRoot, agent.id, postId)
    } else if (j.mode === 'whisper') {
      addSocialEvent(dataRoot, {
        id: socialId('jwh'),
        type: 'jealous_whisper',
        payload: JSON.stringify({ agentId: agent.id, name: agent.name }),
        created_at: now,
      })
      enqueueSocialEcho(
        dataRoot,
        `${agent.name}似乎有点在意你最近和别人聊得更多`
      )
    } else if (j.mode === 'memory') {
      writeJealousyMemoryFact(dataRoot, agent.id, j.favoriteId, fav?.name ?? '她')
    }
    jealousyCount++
  }

  return { graphUpdates, jealousy: jealousyCount }
}

function padFavoriteShare(
  entries: Array<{ agentId: string; trust: number }>
): string[] {
  const sorted = [...entries].sort((a, b) => b.trust - a.trust)
  const fav = sorted[0]
  if (!fav) return []
  const n = SOCIAL.JEALOUSY_CHAT_N
  const favSlots = Math.ceil(n * SOCIAL.JEALOUSY_CHAT_SHARE)
  return Array.from({ length: n }, (_, i) =>
    i < favSlots ? fav.agentId : (sorted[1]?.agentId ?? fav.agentId)
  )
}
