import type { MemoryFact } from '../../memory/semantic/types.js'
import { getDatabase, withTransaction } from '../database'
import { rebuildFactsFts, upsertFactFtsInTx, deleteFactFts } from './fts'
import { appendPendingFactIndexEntryInTx, appendPendingFactIndexEntriesInTx } from './factIndexPendingRepo'
import { isInsertBlockedByTombstone } from '../../memory/governance/tombstoneGuard'
import { loadTombstoneIndex } from '../../memory/governance/tombstoneIndex.js'

function triggersText(triggers: string[]): string {
  return triggers.join(' ')
}

function factToParams(f: MemoryFact): Record<string, unknown> {
  return {
    id: f.id,
    domain: f.domain,
    subcategory: f.subcategory,
    subject: f.subject,
    summary: f.summary,
    weight: f.weight,
    confidence: f.confidence,
    status: f.status,
    emotional_context: JSON.stringify(f.emotionalContext),
    self_relevance: f.selfRelevance,
    triggers: JSON.stringify(f.triggers),
    triggers_text: triggersText(f.triggers),
    update_trail: JSON.stringify(f.updateTrail),
    source_session_id: f.sourceSessionId,
    source_turn_index: f.sourceTurnIndex,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
    derived_from: f.derivedFrom ? JSON.stringify(f.derivedFrom) : null,
    fact_layer: f.factLayer ?? 'raw',
    tier: f.tier ?? 'archival',
    sensitivity: f.sensitivity ?? 'normal',
    privacy_level: f.privacyLevel ?? 'normal',
    age_value: f.ageMeta?.age ?? null,
    age_birth_year: f.ageMeta?.birthYear ?? null,
    age_birthday_mmdd: f.ageMeta?.birthdayMMDD ?? null,
    age_recorded_at: f.ageMeta?.recordedAt ?? null,
    age_is_estimate: f.ageMeta?.isEstimate ? 1 : 0,
    owner_agent_id: f.ownerAgentId ?? 'default',
    interaction_surface: f.interactionSurface ?? 'desktop_main',
    counterparty_kind: f.counterpartyKind ?? 'user',
    counterparty_id: f.counterpartyId ?? null,
    involves_user: f.involvesUser === false ? 0 : 1,
    occurred_at: f.occurredAt ?? null,
    scheduled_for: f.scheduledFor ?? null,
    context_json: f.contextJson ? JSON.stringify(f.contextJson) : null,
    index_revision: f.indexRevision != null && f.indexRevision > 0 ? f.indexRevision : 1,
  }
}

const INSERT_SQL = `INSERT INTO memory_facts(
  id, domain, subcategory, subject, summary, weight, confidence, status,
  emotional_context, self_relevance, triggers, triggers_text, update_trail,
  source_session_id, source_turn_index, created_at, updated_at,
  derived_from, fact_layer, tier, sensitivity, privacy_level,
  age_value, age_birth_year, age_birthday_mmdd, age_recorded_at, age_is_estimate,
  owner_agent_id, interaction_surface, counterparty_kind, counterparty_id,
  involves_user, occurred_at, scheduled_for, context_json, index_revision
) VALUES (
  @id, @domain, @subcategory, @subject, @summary, @weight, @confidence, @status,
  @emotional_context, @self_relevance, @triggers, @triggers_text, @update_trail,
  @source_session_id, @source_turn_index, @created_at, @updated_at,
  @derived_from, @fact_layer, @tier, @sensitivity, @privacy_level,
  @age_value, @age_birth_year, @age_birthday_mmdd, @age_recorded_at, @age_is_estimate,
  @owner_agent_id, @interaction_surface, @counterparty_kind, @counterparty_id,
  @involves_user, @occurred_at, @scheduled_for, @context_json, @index_revision
)`

const UPDATE_SQL = `UPDATE memory_facts SET
  domain=@domain, subcategory=@subcategory, subject=@subject, summary=@summary,
  weight=@weight, confidence=@confidence, status=@status,
  emotional_context=@emotional_context, self_relevance=@self_relevance,
  triggers=@triggers, triggers_text=@triggers_text, update_trail=@update_trail,
  source_session_id=@source_session_id, source_turn_index=@source_turn_index,
  created_at=@created_at, updated_at=@updated_at,
  derived_from=@derived_from, fact_layer=@fact_layer, tier=@tier, sensitivity=@sensitivity,
  privacy_level=@privacy_level,
  age_value=@age_value, age_birth_year=@age_birth_year, age_birthday_mmdd=@age_birthday_mmdd,
  age_recorded_at=@age_recorded_at, age_is_estimate=@age_is_estimate,
  owner_agent_id=@owner_agent_id, interaction_surface=@interaction_surface,
  counterparty_kind=@counterparty_kind, counterparty_id=@counterparty_id,
  involves_user=@involves_user, occurred_at=@occurred_at, scheduled_for=@scheduled_for,
  context_json=@context_json, index_revision=index_revision+1
WHERE id=@id`

function rowToFact(row: Record<string, unknown>): MemoryFact {
  const age = row.age_value != null ? Number(row.age_value) : 0
  const hasAgeMeta = age > 0
  return {
    id: String(row.id),
    domain: String(row.domain),
    subcategory: String(row.subcategory),
    subject: String(row.subject),
    summary: String(row.summary),
    weight: Number(row.weight),
    confidence: Number(row.confidence),
    status: row.status as MemoryFact['status'],
    emotionalContext: JSON.parse(String(row.emotional_context)) as MemoryFact['emotionalContext'],
    selfRelevance: Number(row.self_relevance),
    triggers: JSON.parse(String(row.triggers)) as string[],
    updateTrail: JSON.parse(String(row.update_trail)) as string[],
    sourceSessionId: String(row.source_session_id),
    sourceTurnIndex: Number(row.source_turn_index),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    indexRevision: Number(row.index_revision ?? 1) || 1,
    derivedFrom: row.derived_from ? (JSON.parse(String(row.derived_from)) as string[]) : undefined,
    factLayer: row.fact_layer as MemoryFact['factLayer'],
    tier: row.tier as MemoryFact['tier'],
    sensitivity: (row.sensitivity ?? 'normal') as MemoryFact['sensitivity'],
    privacyLevel: (row.privacy_level ?? 'normal') as MemoryFact['privacyLevel'],
    ownerAgentId: row.owner_agent_id != null ? String(row.owner_agent_id) : 'default',
    interactionSurface: row.interaction_surface != null ? String(row.interaction_surface) : 'desktop_main',
    counterpartyKind: row.counterparty_kind != null ? String(row.counterparty_kind) : 'user',
    counterpartyId: row.counterparty_id != null ? String(row.counterparty_id) : null,
    involvesUser: row.involves_user === 0 || row.involves_user === false ? false : true,
    occurredAt: row.occurred_at != null ? String(row.occurred_at) : undefined,
    scheduledFor: row.scheduled_for != null ? String(row.scheduled_for) : undefined,
    contextJson: row.context_json
      ? (JSON.parse(String(row.context_json)) as Record<string, unknown>)
      : undefined,
    ageMeta: hasAgeMeta ? {
      age,
      birthdayMMDD: row.age_birthday_mmdd != null ? String(row.age_birthday_mmdd) : undefined,
      birthYear: row.age_birth_year != null ? Number(row.age_birth_year) : undefined,
      recordedAt: row.age_recorded_at != null ? String(row.age_recorded_at) : String(row.created_at),
      isEstimate: row.age_is_estimate === 1
    } : undefined
  }
}

export function countFactsInDb(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM memory_facts`).get() as { c: number }
  return row?.c ?? 0
}

export function loadFactsFromDb(dataRoot: string): MemoryFact[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(`SELECT * FROM memory_facts`).all() as Record<string, unknown>[]
  return rows.map(rowToFact)
}

export function loadFactsByOwner(dataRoot: string, ownerAgentId: string): MemoryFact[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(`SELECT * FROM memory_facts WHERE owner_agent_id = ?`)
    .all(ownerAgentId) as Record<string, unknown>[]
  return rows.map(rowToFact)
}

export function deleteFactsByOwner(dataRoot: string, ownerAgentId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM memory_facts WHERE owner_agent_id = ?`).run(ownerAgentId)
  rebuildFactsFts(dataRoot)
}

export function deleteImportSeedsByOwner(dataRoot: string, ownerAgentId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(
    `DELETE FROM memory_facts WHERE owner_agent_id = ? AND interaction_surface = 'import'`
  ).run(ownerAgentId)
  rebuildFactsFts(dataRoot)
}

export function replaceFactsInDb(dataRoot: string, facts: MemoryFact[]): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  withTransaction(dataRoot, (d) => {
    d.prepare(`DELETE FROM memory_facts`).run()
    const ins = d.prepare(INSERT_SQL)
    const blockedFactIds = loadTombstoneIndex(d).facts
    const pending: Array<{ factId: string; kind: 'inserted' | 'retired'; revision: number }> = []
    for (const f of facts) {
      if (blockedFactIds.has(f.id)) continue
      ins.run(factToParams(f))
      pending.push({
        factId: f.id,
        kind: f.status === 'active' ? 'inserted' : 'retired',
        revision: f.indexRevision != null && f.indexRevision > 0 ? f.indexRevision : 1
      })
    }
    appendPendingFactIndexEntriesInTx(d, pending)
    rebuildFactsFts(dataRoot)
  })
}

/** Phase 3: 单条 INSERT（新增事实） */
export function insertFact(dataRoot: string, fact: MemoryFact): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  if (isInsertBlockedByTombstone(db, fact.id)) return
  db.transaction(() => {
    db.prepare(INSERT_SQL).run(factToParams(fact))
    const revRow = db
      .prepare(`SELECT index_revision FROM memory_facts WHERE id = ?`)
      .get(fact.id) as { index_revision: number }
    fact.indexRevision = Number(revRow.index_revision) || 1
    appendPendingFactIndexEntryInTx(db, {
      factId: fact.id,
      kind: 'inserted',
      revision: fact.indexRevision
    })
    upsertFactFtsInTx(
      db,
      fact.id,
      fact.subject,
      fact.summary,
      triggersText(fact.triggers),
      'active'
    )
  })()
}

/** Phase 3: 单条 UPDATE（修改事实） */
export function updateFactInDb(dataRoot: string, fact: MemoryFact): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.transaction(() => {
    db.prepare(UPDATE_SQL).run(factToParams(fact))
    const revRow = db
      .prepare(`SELECT index_revision FROM memory_facts WHERE id = ?`)
      .get(fact.id) as { index_revision: number }
    fact.indexRevision = Number(revRow.index_revision) || 1
    const pendingKind = fact.status === 'active' ? 'updated' : 'retired'
    appendPendingFactIndexEntryInTx(db, {
      factId: fact.id,
      kind: pendingKind,
      revision: fact.indexRevision
    })
    upsertFactFtsInTx(
      db,
      fact.id,
      fact.subject,
      fact.summary,
      triggersText(fact.triggers),
      fact.status === 'active' ? 'active' : 'retired'
    )
  })()
}

/** Phase 3: 单条 DELETE（删除/compact 事实） */
export function deleteFactFromDb(dataRoot: string, id: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.transaction(() => {
    const revRow = db
      .prepare(`SELECT index_revision FROM memory_facts WHERE id = ?`)
      .get(id) as { index_revision: number } | undefined
    const revision = Number(revRow?.index_revision) || 1
    db.prepare(`DELETE FROM memory_facts WHERE id = ?`).run(id)
    appendPendingFactIndexEntryInTx(db, {
      factId: id,
      kind: 'retired',
      revision
    })
    db.prepare(`DELETE FROM memory_facts_fts WHERE fact_id = ?`).run(id)
  })()
}
