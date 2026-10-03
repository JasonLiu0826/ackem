import { listInteractions } from '../../../db/repos/fcInteractionsRepo'
import { listPosts } from '../../../db/repos/friendCircleRepo'
import { loadCompanionStateFromDb, saveCompanionStateToDb } from '../../../db/repos/companionState'
import { getRegisteredAgent } from '../../agents/agentRegistry'
import { interactionFeedback } from '../../feed/interactionFeedback'
import { SOCIAL } from '../../types'
import { isChatInFlight } from '../chatInFlight'

/** Step4: apply phase-3 confirmation + phase-4 silence to authors. */
export function stepFeedback(dataRoot: string): { updated: number } {
  const posts = listPosts(dataRoot, undefined, 30)
  let updated = 0

  for (const post of posts) {
    if (isChatInFlight(post.author_id)) continue
    const agent = getRegisteredAgent(dataRoot, post.author_id)
    if (!agent || agent.kind !== 'social_member') continue

    const state = loadCompanionStateFromDb(dataRoot, agent.session_id)
    if (!state?.emotion) continue

    const ints = listInteractions(dataRoot, post.id)
    const hoursSince =
      (Date.now() - Date.parse(post.created_at)) / (3600 * 1000)
    const silenceActive =
      ints.length === 0 && hoursSince >= SOCIAL.SILENCE_HOURS_START

    const signal = interactionFeedback({
      aff: state.emotion.aff,
      aro: state.emotion.aro,
      se: agent.se,
      sp: agent.sp,
      so: agent.so,
      closeness: ints.length > 0 ? 0.7 : 0.3,
      resonance: ints.length > 0 ? 0.6 : 0.2,
    })

    const deltaAff = silenceActive ? signal.deltaAff - signal.silence : signal.deltaAff
    const deltaAro = silenceActive ? signal.deltaAro - signal.silence * 0.5 : signal.deltaAro

    if (Math.abs(deltaAff) < 0.001 && Math.abs(deltaAro) < 0.001) continue

    state.emotion.aff = Math.max(-1, Math.min(1, state.emotion.aff + deltaAff))
    state.emotion.aro = Math.max(-1, Math.min(1, state.emotion.aro + deltaAro))
    saveCompanionStateToDb(dataRoot, agent.session_id, state)
    updated++
  }
  return { updated }
}
