import { getDatabase } from '../db/database'
import type { FactStore } from './factStore'
import type { MemoryFact } from './semantic/types'
import { canReadMemoryObject, createMemoryAccess } from './accessScope'
import type { EpisodicStore } from './episodicStore'
import { getCurrentAgentId } from '../social/agents/withAgentContext'
import { matchesFactVisibility } from './retrievalScope'

const personalContexts = new WeakMap<object, { ref: string; refreshAt: number }>()

export function readableMemoryEpisodes(store: EpisodicStore, dataRoot: string) {
  const db = getDatabase(dataRoot)
  return db ? store.listAll().filter(ep => canReadMemoryObject(db,'episode',ep.id,ep.sourceSessionId ?? 'default')) : []
}

/** Profile generation/name/age consume personal evidence only, never work-document extraction. */
export function personalFacts(store: FactStore): MemoryFact[] {
  const ownerAgentId = getCurrentAgentId()
  const facts = store.listActive().filter(fact => matchesFactVisibility(fact, ownerAgentId, false))
  // Pure in-memory stores used by consumers have no persisted work provenance.
  if (typeof store.getDataRoot !== 'function') return facts.filter(f => f.contextJson?.nature !== 'work')
  const db = getDatabase(store.getDataRoot())
  if (!db) return facts.filter(f => !f.contextJson?.taskId && f.contextJson?.nature !== 'work' && !f.summary.startsWith('[工作完成]'))
  let cached = personalContexts.get(db)
  if (!cached || cached.refreshAt <= Date.now()) {
    cached = { ref: createMemoryAccess(db, { principal: 'ackem', purpose: 'personal_profile' }), refreshAt: Date.now() + 9 * 60_000 }
    personalContexts.set(db, cached)
  }
  const access = cached.ref
  return facts.filter(f => canReadMemoryObject(db, 'fact', f.id, f.sourceSessionId, access))
}

export function readableMemoryFacts(store: FactStore): MemoryFact[] {
  const facts = store.listActive()
  const db = getDatabase(store.getDataRoot())
  return db ? facts.filter(f => canReadMemoryObject(db, 'fact', f.id, f.sourceSessionId)) : facts.filter(f => !f.contextJson?.taskId && f.contextJson?.nature !== 'work')
}
