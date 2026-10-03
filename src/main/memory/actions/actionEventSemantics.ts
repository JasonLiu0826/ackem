import type { ActionStatus, MemoryActor, MemoryEventType, MemoryNature } from '../contracts.js'

/** Maps action projection transitions to ledger event types (Task 5). */
export function eventTypeForTransition(
  nature: MemoryNature,
  from: ActionStatus,
  to: ActionStatus
): MemoryEventType {
  if (nature !== 'plugin' && nature !== 'work') {
    throw new Error(`action event mapping requires plugin|work nature, got ${nature}`)
  }
  const prefix = nature === 'plugin' ? 'plugin' : 'work'
  if (to === 'accepted') {
    return nature === 'plugin' ? 'plugin.accepted' : 'work.accepted'
  }
  if (to === 'queued') return `${prefix}.queued` as MemoryEventType
  if (to === 'running') {
    if (from === 'waiting_permission' || from === 'unknown') {
      return nature === 'work' ? 'work.resumed' : 'plugin.running'
    }
    return `${prefix}.running` as MemoryEventType
  }
  if (to === 'waiting_permission') {
    return nature === 'plugin' ? 'plugin.waiting_permission' : 'work.waiting_permission'
  }
  if (to === 'succeeded') return `${prefix}.succeeded` as MemoryEventType
  if (to === 'failed') return `${prefix}.failed` as MemoryEventType
  if (to === 'aborted') return `${prefix}.aborted` as MemoryEventType
  if (to === 'unknown') return nature === 'work' ? 'work.unknown' : 'plugin.unknown'
  throw new Error(`no event type for transition ${from} -> ${to}`)
}

export function actorForTransition(
  nature: MemoryNature,
  trustedReceipt: boolean
): MemoryActor {
  if (trustedReceipt) {
    return nature === 'work' ? 'ackemcode_runtime' : 'plugin_runtime'
  }
  return 'system'
}
