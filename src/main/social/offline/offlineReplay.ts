import { createPost, listPosts } from '../../db/repos/friendCircleRepo'
import { addInteraction } from '../../db/repos/fcInteractionsRepo'
import { getSocialMeta, setSocialMeta } from '../../db/repos/socialMetaRepo'
import { loadCompanionStateFromDb } from '../../db/repos/companionState'
import { listRegisteredAgents } from '../agents/agentRegistry'
import { PRIMARY_AGENT_ID } from '../agents/agentPaths'
import { postTemplate } from '../feed/postTemplates'
import { writeMemberPostFact, writeAgentInteractFact } from '../memory/socialMemoryWriter'
import { SOCIAL, socialId } from '../types'
import { narrativeFor } from './narrativeGenerator'
import { offlinePressure } from './offlinePressure'

export function offlineEventCount(hours: number): number {
  if (hours < SOCIAL.SILENCE_HOURS_START) return 0
  return Math.min(SOCIAL.OFFLINE_MAX_EVENTS, Math.max(2, Math.floor(hours)))
}

export type OfflineReplayResult = {
  show: boolean
  hours: number
  narrative: string
  eventCount: number
  postsCreated: number
  alreadyApplied: boolean
}

/**
 * Materialize offline social activity once per silence window, then return narrative.
 * Idempotent via meta key offline_replay_for = last_social_active_at.
 */
export function runOfflineReplay(dataRoot: string): OfflineReplayResult {
  const last = getSocialMeta(dataRoot, 'last_social_active_at')
  const hours = last ? (Date.now() - Date.parse(last)) / 3_600_000 : 0
  const n = offlineEventCount(hours)
  if (n <= 0) {
    return { show: false, hours: 0, narrative: '', eventCount: 0, postsCreated: 0, alreadyApplied: false }
  }

  const appliedFor = getSocialMeta(dataRoot, 'offline_replay_for')
  const alreadyApplied = Boolean(last && appliedFor === last)

  const members = listRegisteredAgents(dataRoot).filter(
    (a) => a.kind === 'social_member' && a.id !== PRIMARY_AGENT_ID
  )
  if (members.length === 0) {
    return {
      show: true,
      hours,
      narrative: narrativeFor(['世界安静了一会儿']),
      eventCount: n,
      postsCreated: 0,
      alreadyApplied,
    }
  }

  let postsCreated = 0
  const bits: string[] = []
  const now = Date.now()

  if (!alreadyApplied) {
    for (let i = 0; i < n; i++) {
      const agent = members[i % members.length]!
      const state = loadCompanionStateFromDb(dataRoot, agent.session_id)
      const aff = state?.emotion?.aff ?? 0.1
      const aro = state?.emotion?.aro ?? 0.2
      const pressure = offlinePressure(hours, agent.se, aff, aro)
      // Skip very low-pressure slots so silence doesn't flood feed
      if (pressure < 0.002 && i > 0) {
        bits.push(`${agent.name}安静地待着`)
        continue
      }

      const createdAt = new Date(now - ((n - i) * Math.max(hours, 1) * 3_600_000) / n).toISOString()
      const postId = socialId('off')
      createPost(dataRoot, {
        id: postId,
        author_id: agent.id,
        content: postTemplate(agent.name, aff, aro),
        emotion_label: state?.emotion?.primaryLabel ?? null,
        emotion_valence: aff,
        created_at: createdAt,
        offline_generated: 1,
        content_source: 'template',
      })
      writeMemberPostFact(dataRoot, agent.id, postId)
      postsCreated++
      bits.push(`${agent.name}发了动态`)

      // Peer like on ~half of offline posts
      if (i % 2 === 0 && members.length > 1) {
        const peer = members[(i + 1) % members.length]!
        if (peer.id !== agent.id) {
          addInteraction(dataRoot, {
            id: socialId('offlike'),
            post_id: postId,
            actor_kind: 'agent',
            actor_id: peer.id,
            type: 'like',
            content: null,
            sentiment: 0.35,
            created_at: createdAt,
          })
          writeAgentInteractFact(dataRoot, peer.id, agent.id, postId)
          bits.push(`${peer.name}给${agent.name}点了赞`)
        }
      }
    }

    if (last) setSocialMeta(dataRoot, 'offline_replay_for', last)
    // Keep last_social_active_at until user acks; do not refresh here
  } else {
    // Already applied: summarize recent offline posts for banner
    const recent = listPosts(dataRoot, undefined, n * 2).filter((p) => p.offline_generated === 1)
    for (const p of recent.slice(0, n)) {
      const name = members.find((m) => m.id === p.author_id)?.name ?? '某人'
      bits.push(`${name}发了动态`)
    }
    if (bits.length === 0) bits.push('大家各自过着日子')
  }

  return {
    show: true,
    hours,
    narrative: narrativeFor(bits.slice(0, 6)),
    eventCount: n,
    postsCreated,
    alreadyApplied,
  }
}
