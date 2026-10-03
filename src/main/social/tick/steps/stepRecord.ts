import { addSocialEvent } from '../../../db/repos/socialEventsRepo'
import { socialId } from '../../types'
import { listChatInFlight } from '../chatInFlight'

/** Step1: record pending chat activity as social_events. */
export function stepRecord(dataRoot: string): { recorded: number } {
  const pending = listChatInFlight()
  const now = new Date().toISOString()
  for (const agentId of pending) {
    addSocialEvent(dataRoot, {
      id: socialId('evt'),
      type: 'chat_inflight',
      payload: JSON.stringify({ agentId }),
      created_at: now,
    })
  }
  return { recorded: pending.length }
}
