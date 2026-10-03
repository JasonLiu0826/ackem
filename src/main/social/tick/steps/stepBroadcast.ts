import { addInteraction, hasLiked } from '../../../db/repos/fcInteractionsRepo'
import { listPosts } from '../../../db/repos/friendCircleRepo'
import { getEdge } from '../../../db/repos/socialGraphRepo'
import { listRegisteredAgents } from '../../agents/agentRegistry'
import { PRIMARY_AGENT_ID } from '../../agents/agentPaths'
import { commentTemplate } from '../../feed/commentTemplates'
import { decideInteraction } from '../../feed/interactionDecision'
import { writeAgentInteractFact } from '../../memory/socialMemoryWriter'
import { socialId } from '../../types'
import { isChatInFlight } from '../chatInFlight'

/** Step3: agents browse recent posts and may like/comment. */
export function stepBroadcast(dataRoot: string): { interactions: number } {
  const agents = listRegisteredAgents(dataRoot).filter(
    (a) => a.kind === 'social_member' && a.id !== PRIMARY_AGENT_ID
  )
  const posts = listPosts(dataRoot, undefined, 20)
  const now = new Date().toISOString()
  let interactions = 0

  for (const post of posts) {
    for (const agent of agents) {
      if (agent.id === post.author_id) continue
      if (isChatInFlight(agent.id)) continue

      const edge = getEdge(dataRoot, agent.id, post.author_id)
      const closeness = Math.max(0.1, Math.min(1, (edge?.trust ?? 25) / 100))
      const decision = decideInteraction({
        se: agent.se,
        sp: agent.sp,
        closeness,
        resonance: closeness,
      })

      if (decision.like && !hasLiked(dataRoot, post.id, 'agent', agent.id)) {
        if (
          addInteraction(dataRoot, {
            id: socialId('like'),
            post_id: post.id,
            actor_kind: 'agent',
            actor_id: agent.id,
            type: 'like',
            content: null,
            sentiment: 0.4,
            created_at: now,
          })
        ) {
          writeAgentInteractFact(dataRoot, agent.id, post.author_id, post.id)
          interactions++
        }
      }

      if (decision.comment) {
        if (
          addInteraction(dataRoot, {
            id: socialId('cmt'),
            post_id: post.id,
            actor_kind: 'agent',
            actor_id: agent.id,
            type: 'comment',
            content: commentTemplate(agent.name),
            sentiment: 0.3,
            created_at: now,
          })
        ) {
          writeAgentInteractFact(dataRoot, agent.id, post.author_id, post.id)
          interactions++
        }
      }
    }
  }
  return { interactions }
}
