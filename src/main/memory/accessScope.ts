import type Database from 'better-sqlite3'
import { randomBytes } from 'node:crypto'

export type MemoryPurpose = 'conversation' | 'personal_profile' | 'task_supervision' | 'task_execution' | 'system_inspection' | 'user_memory_management' | 'derivation'
type Access = { principal: 'ackem' | 'user'; purpose: MemoryPurpose; taskId?: string; expiresAt: number }
type Scope = { kind: 'personal' | 'task' | 'quarantined'; taskId?: string; domainId?: string }
const contexts = new WeakMap<Database.Database, Map<string, Access>>()

function hasTable(db: Database.Database, name: string): boolean {
  return !!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table', name)
}
function parse(value: unknown): Record<string, unknown> {
  try { const result: unknown = JSON.parse(String(value)); return result && typeof result === 'object' && !Array.isArray(result) ? result as Record<string, unknown> : {} } catch { return {} }
}
function taskScope(db: Database.Database, taskId: string): Scope {
  if (!hasTable(db, 'task_projection')) return { kind: 'quarantined' }
  const row = db.prepare('SELECT snapshot_json FROM task_projection WHERE id=?').get(taskId) as { snapshot_json: string } | undefined
  if (!row) return { kind: 'quarantined' }
  const task = parse(row.snapshot_json)
  return { kind: 'task', taskId, domainId: typeof task.domainId === 'string' ? task.domainId : `user:task:${taskId}` }
}

/** Issued only by trusted host code. Renderer/model supplied purpose, IDs or principal never form a grant. */
export function createMemoryAccess(db: Database.Database, input: Omit<Access, 'expiresAt'>): string {
  if (input.taskId && taskScope(db, input.taskId).kind !== 'task') throw Error('Unknown memory task scope')
  const ref = randomBytes(32).toString('hex')
  const registry = contexts.get(db) ?? new Map<string, Access>()
  const now = Date.now()
  for (const [key, access] of registry) if (access.expiresAt <= now) registry.delete(key)
  if (registry.size >= 4096) throw Error('Memory access capacity reached')
  registry.set(ref, { ...input, expiresAt: now + 10 * 60_000 }); contexts.set(db, registry)
  return ref
}
function resolveAccess(db: Database.Database, ref?: string): Access | undefined {
  if (!ref) return { principal: 'ackem', purpose: 'conversation', expiresAt: Infinity }
  const access = contexts.get(db)?.get(ref)
  return access && access.expiresAt > Date.now() ? access : undefined
}

function canReadScope(db: Database.Database, scope: Scope, access: Access): boolean {
  if (scope.kind === 'quarantined') return false
  if (scope.kind === 'personal') return access.purpose !== 'task_execution'
  if (access.purpose === 'personal_profile') return false
  if (access.taskId && access.taskId !== scope.taskId) return false
  const row = db.prepare('SELECT snapshot_json FROM task_projection WHERE id=?').get(scope.taskId) as { snapshot_json: string } | undefined
  if (!row) return false
  const task = parse(row.snapshot_json)
  if (hasTable(db, 'task_archives') && db.prepare('SELECT 1 FROM task_archives WHERE task_id=?').get(scope.taskId)) return false
  if (hasTable(db, 'task_notification_policy') && db.prepare('SELECT 1 FROM task_notification_policy WHERE task_id=? AND forgotten=1').get(scope.taskId)) return false
  if (access.principal === 'user') return task.ownerPrincipalId === 'user' || task.ownerPrincipalId == null
  if (task.supervisionPolicy !== 'ackem_managed' || task.managerPrincipalId !== 'ackem' || !task.contract || !task.authorityRef || task.domainId !== scope.domainId) return false
  if (!hasTable(db, 'task_authority_grants')) return false
  return !!db.prepare('SELECT 1 FROM task_authority_grants WHERE grant_id=? AND task_id=? AND domain_id=? AND principal_id=? AND revoked_at IS NULL')
    .get(task.authorityRef, scope.taskId, scope.domainId, 'ackem')
}

function eventScope(db: Database.Database, eventId: string): Scope {
  const row = db.prepare('SELECT e.nature,e.correlation_id,p.content_json,p.redacted_at FROM memory_events e JOIN memory_event_payloads p ON e.event_id=p.event_id WHERE e.event_id=?')
    .get(eventId) as { nature: string; correlation_id: string; content_json: string; redacted_at: string | null } | undefined
  if (!row || row.redacted_at != null) return { kind: 'quarantined' }
  if (hasTable(db, 'memory_tombstones') && db.prepare("SELECT 1 FROM memory_tombstones WHERE scope_type='event' AND scope_id=?").get(eventId)) return { kind: 'quarantined' }
  const content = parse(row.content_json)
  const taskId = typeof content.taskId === 'string' ? content.taskId : typeof content.productTaskId === 'string' ? content.productTaskId : undefined
  if (taskId) return taskScope(db, taskId)
  // Governance payloads can contain private replacements after their original source was removed.
  // The local audit keeps them; an unscoped control event is never conversational evidence.
  if (row.nature === 'memory_control') return { kind: 'quarantined' }
  if (row.nature !== 'work') return { kind: 'personal' }
  const direct = taskScope(db, row.correlation_id)
  if (direct.kind === 'task') return direct
  if (hasTable(db, 'memory_action_runs')) {
    const run = db.prepare('SELECT execution_json FROM memory_action_runs WHERE correlation_id=? LIMIT 1').get(row.correlation_id) as { execution_json: string } | undefined
    const params = parse(run?.execution_json).params as Record<string, unknown> | undefined
    if (typeof params?.productTaskId === 'string') return taskScope(db, params.productTaskId)
  }
  return { kind: 'quarantined' }
}

/** All required sources must be readable, including corrections. Revocation is checked on every call. */
export function canReadMemorySources(db: Database.Database, eventIds: string[], accessContextRef?: string): boolean {
  const access = resolveAccess(db, accessContextRef)
  if (!access) return false
  return eventIds.every(id => canReadScope(db, eventScope(db, id), access))
}
export function memorySourcesCompatible(db: Database.Database, left: string[], right: string[]): boolean {
  const key = (ids: string[]) => {
    const scopes = ids.length ? ids.map(id => eventScope(db, id)) : [{ kind: 'personal' } as Scope]
    if (scopes.some(s => s.kind === 'quarantined')) return undefined
    return JSON.stringify([...new Set(scopes.map(s => `${s.kind}:${s.domainId ?? ''}:${s.taskId ?? ''}`))].sort())
  }
  const a = key(left), b = key(right)
  return a != null && a === b
}

export function canMergeMemoryFact(db: Database.Database, id: string, sessionId: string, incomingSources: string[]): boolean {
  if (!canReadMemoryObject(db, 'fact', id, sessionId)) return false
  const fact = db.prepare('SELECT context_json,derived_from FROM memory_facts WHERE id=?').get(id) as { context_json: string | null; derived_from: string | null } | undefined
  // Derived insights keep their original provenance; a similarity match cannot turn them into a personal fact.
  if (!fact || (fact.derived_from && parseArray(fact.derived_from).length)) return false
  const sources = hasTable(db, 'memory_fact_evidence') ? (db.prepare('SELECT event_id FROM memory_fact_evidence WHERE fact_id=?').all(id) as { event_id: string }[]).map(r => r.event_id) : []
  const context = parse(fact.context_json)
  const required = Array.isArray(context.sourceEventIds) ? context.sourceEventIds.filter((v): v is string => typeof v === 'string') : []
  if (typeof context.taskId === 'string' && !incomingSources.every(e => eventScope(db, e).taskId === context.taskId)) return false
  if (typeof context.taskId === 'string' && !incomingSources.length) return false
  return memorySourcesCompatible(db, [...sources, ...required], incomingSources)
}
function parseArray(value: string): unknown[] { try { const result: unknown = JSON.parse(value); return Array.isArray(result) ? result : [null] } catch { return [null] } }

/** Legacy personal facts remain usable; work-derived objects with missing proof remain isolated. */
export function canReadMemoryObject(db: Database.Database, kind: 'fact' | 'episode', id: string, sessionId: string, accessContextRef?: string): boolean {
  return readMemoryObject(db, kind, id, sessionId, accessContextRef, new Set(), false)
}
export function canControlMemoryObject(db: Database.Database, kind: 'fact' | 'episode', id: string, sessionId: string, accessContextRef?: string): boolean {
  const access = resolveAccess(db, accessContextRef)
  if (access?.principal === 'user' && access.purpose === 'user_memory_management') return true
  return readMemoryObject(db, kind, id, sessionId, accessContextRef, new Set(), true)
}
export function memoryControlScopeProof(db: Database.Database, kind: 'fact' | 'episode', id: string): { version: 1; taskIds: string[]; quarantined: boolean } {
  const taskIds = new Set<string>(), visited = new Set<string>(), path = new Set<string>()
  let quarantined = false
  const collect = (objectKind: 'fact' | 'episode', objectId: string) => {
    const key = `${objectKind}:${objectId}`
    if (path.has(key) || path.size >= 32 || visited.size >= 128) { quarantined = true; return }
    if (visited.has(key)) return
    path.add(key)
    const table = objectKind === 'fact' ? 'memory_fact_evidence' : 'memory_episode_evidence', field = objectKind === 'fact' ? 'fact_id' : 'episode_id'
    for (const row of db.prepare(`SELECT event_id FROM ${table} WHERE ${field}=?`).all(objectId) as {event_id:string}[]) {
      const scope = eventScope(db,row.event_id)
      if (scope.kind === 'quarantined') quarantined = true
      if (scope.taskId) taskIds.add(scope.taskId)
    }
    if (objectKind === 'fact') {
      const row = db.prepare('SELECT context_json,derived_from,source_session_id FROM memory_facts WHERE id=?').get(objectId) as {context_json:string;derived_from:string|null;source_session_id:string}|undefined
      if (!row) { quarantined = true; path.delete(key); return }
      const context = parse(row.context_json)
      if (typeof context.taskId === 'string') taskIds.add(context.taskId)
      for (const eventId of Array.isArray(context.sourceEventIds) ? context.sourceEventIds : []) {
        if (typeof eventId !== 'string') { quarantined = true; continue }
        const scope = eventScope(db,eventId); if (scope.kind === 'quarantined') quarantined = true; if(scope.taskId)taskIds.add(scope.taskId)
      }
      if (hasTable(db,'task_projection')) for (const task of db.prepare("SELECT id FROM task_projection WHERE json_extract(snapshot_json,'$.codeSessionId')=?").all(row.source_session_id) as {id:string}[]) taskIds.add(task.id)
      for (const factId of row.derived_from ? parseArray(row.derived_from) : []) { if (typeof factId !== 'string') { quarantined = true; continue }; collect('fact',factId) }
    }
    path.delete(key); visited.add(key)
  }
  collect(kind,id)
  return {version:1,taskIds:[...taskIds],quarantined}
}
export function canReplayMemoryControl(db: Database.Database, proof: unknown, accessContextRef?: string): boolean {
  const access = resolveAccess(db,accessContextRef)
  if (!access || access.purpose === 'task_execution' || !proof || typeof proof !== 'object') return false
  const saved = proof as {version?:unknown;taskIds?:unknown;quarantined?:unknown}
  if (saved.version !== 1 || !Array.isArray(saved.taskIds) || saved.taskIds.length > 32 || !saved.taskIds.every(id => typeof id === 'string')) return false
  if (saved.quarantined && !(access.principal === 'user' && access.purpose === 'user_memory_management')) return false
  return saved.taskIds.every(id => canReadScope(db,taskScope(db,id),access))
}
function readMemoryObject(db: Database.Database, kind: 'fact' | 'episode', id: string, sessionId: string, accessContextRef: string | undefined, visited: ReadonlySet<string>, provenanceOnly: boolean): boolean {
  const access = resolveAccess(db, accessContextRef)
  if (!access) return false
  const key = `${kind}:${id}`
  if (visited.has(key) || visited.size >= 32) return false
  const nextVisited = new Set(visited); nextVisited.add(key)
  if (hasTable(db, 'memory_tombstones') && db.prepare('SELECT 1 FROM memory_tombstones WHERE scope_type=? AND scope_id=?').get(kind, id)) return false
  let factRow: { summary: string; context_json: string | null; derived_from: string | null; status: string; sensitivity: string } | undefined
  if (kind === 'fact' && hasTable(db, 'memory_facts')) {
    factRow = db.prepare('SELECT summary,context_json,derived_from,status,sensitivity FROM memory_facts WHERE id=?').get(id) as typeof factRow
    if (!factRow || (!provenanceOnly && (factRow.status !== 'active' || factRow.sensitivity === 'avoid'))) return false
    if (factRow.derived_from) {
      let required: unknown
      try { required = JSON.parse(factRow.derived_from) } catch { return false }
      if (!Array.isArray(required) || !required.every(v => typeof v === 'string')) return false
      for (const factId of required) {
        const source = db.prepare('SELECT source_session_id FROM memory_facts WHERE id=?').get(factId) as { source_session_id: string } | undefined
        const correction = hasTable(db,'memory_events') && !!db.prepare("SELECT 1 FROM memory_events e JOIN memory_event_payloads p ON p.event_id=e.event_id WHERE e.event_type='memory.corrected' AND p.redacted_at IS NULL AND json_extract(p.content_json,'$.newFactId')=? AND json_extract(p.content_json,'$.factId')=?").get(id,factId)
        if (!source || !readMemoryObject(db, 'fact', factId, source.source_session_id, accessContextRef, nextVisited, !!correction)) return false
      }
    }
  }
  const table = kind === 'fact' ? 'memory_fact_evidence' : 'memory_episode_evidence'
  const field = kind === 'fact' ? 'fact_id' : 'episode_id'
  const sources = hasTable(db, table) ? (db.prepare(`SELECT event_id FROM ${table} WHERE ${field}=?`).all(id) as { event_id: string }[]).map(r => r.event_id) : []
  if (factRow && (parse(factRow.context_json).nature === 'work' || factRow.summary.startsWith('[工作完成]')) && !sources.some(eventId => eventScope(db, eventId).kind === 'task')) return false
  if (sources.length && !canReadMemorySources(db, sources, accessContextRef)) return false
  if (kind === 'episode') return sources.length > 0
  if (hasTable(db, 'task_projection')) {
    const tasks = db.prepare("SELECT id FROM task_projection WHERE json_extract(snapshot_json,'$.codeSessionId')=?").all(sessionId) as { id: string }[]
    if (tasks.length && !tasks.every(t => canReadScope(db, taskScope(db, t.id), access))) return false
  }
  if (factRow) {
    const context = parse(factRow.context_json)
    if (Array.isArray(context.sourceEventIds) && context.sourceEventIds.length && !(context.sourceEventIds.every(v => typeof v === 'string') && canReadMemorySources(db, context.sourceEventIds as string[], accessContextRef))) return false
    if (typeof context.taskId === 'string') return canReadScope(db, taskScope(db, context.taskId), access)
    if ((context.nature === 'work' || factRow.summary.startsWith('[工作完成]')) && !sources.length) return false
  }
  if (sources.length) return true
  return canReadScope(db, { kind: 'personal' }, access)
}
