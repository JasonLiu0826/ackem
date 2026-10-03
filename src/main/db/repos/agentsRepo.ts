/**
 * agentsRepo — agents 表 CRUD
 * 负责：社会成员与主体 Ackem 的注册行读写
 */

import { getDatabase } from '../database'

export type AgentKind = 'primary' | 'social_member'
export type AgentOrigin = 'builtin' | 'user'
export type PersonaSource = 'preset' | 'character_card' | 'preset+card'

export type AgentRow = {
  id: string
  name: string
  kind: AgentKind
  origin: AgentOrigin
  deletable: number
  preset_id: string
  gender: 'female' | 'male'
  session_id: string
  se: number
  sp: number
  so: number
  persona_source: PersonaSource | null
  persona_path: string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export type AgentInsert = {
  id: string
  name: string
  kind: AgentKind
  origin: AgentOrigin
  deletable: number
  preset_id: string
  gender: 'female' | 'male'
  session_id: string
  se: number
  sp: number
  so: number
  persona_source?: PersonaSource | null
  persona_path?: string | null
  avatar_url?: string | null
  created_at: string
  updated_at: string
}

export type AgentUpdatePatch = Partial<{
  name: string
  preset_id: string
  gender: 'female' | 'male'
  se: number
  sp: number
  so: number
  deletable: number
  persona_source: PersonaSource | null
  persona_path: string | null
  avatar_url: string | null
  updated_at: string
}>

function rowFromDb(r: Record<string, unknown>): AgentRow {
  return {
    id: String(r.id),
    name: String(r.name),
    kind: r.kind as AgentKind,
    origin: r.origin as AgentOrigin,
    deletable: Number(r.deletable),
    preset_id: String(r.preset_id),
    gender: r.gender as 'female' | 'male',
    session_id: String(r.session_id),
    se: Number(r.se),
    sp: Number(r.sp),
    so: Number(r.so),
    persona_source: (r.persona_source as PersonaSource | null) ?? null,
    persona_path: r.persona_path != null ? String(r.persona_path) : null,
    avatar_url: r.avatar_url != null ? String(r.avatar_url) : null,
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
  }
}

export function insertAgent(dataRoot: string, row: AgentInsert): void {
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  db.prepare(
    `INSERT INTO agents(
      id, name, kind, origin, deletable, preset_id, gender, session_id,
      se, sp, so, persona_source, persona_path, avatar_url, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    row.id,
    row.name,
    row.kind,
    row.origin,
    row.deletable,
    row.preset_id,
    row.gender,
    row.session_id,
    row.se,
    row.sp,
    row.so,
    row.persona_source ?? null,
    row.persona_path ?? null,
    row.avatar_url ?? null,
    row.created_at,
    row.updated_at
  )
}

export function getAgent(dataRoot: string, id: string): AgentRow | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db.prepare(`SELECT * FROM agents WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  return row ? rowFromDb(row) : null
}

export function listAgents(dataRoot: string): AgentRow[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db.prepare(`SELECT * FROM agents ORDER BY kind ASC, created_at ASC`).all() as Record<string, unknown>[]
  return rows.map(rowFromDb)
}

export function listSocialMembers(dataRoot: string): AgentRow[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  const rows = db
    .prepare(`SELECT * FROM agents WHERE kind = 'social_member' ORDER BY created_at ASC`)
    .all() as Record<string, unknown>[]
  return rows.map(rowFromDb)
}

export function updateAgent(dataRoot: string, id: string, patch: AgentUpdatePatch): void {
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  const keys = Object.keys(patch) as (keyof AgentUpdatePatch)[]
  if (keys.length === 0) return
  const sets: string[] = []
  const vals: unknown[] = []
  for (const k of keys) {
    if (patch[k] === undefined) continue
    sets.push(`${k} = ?`)
    vals.push(patch[k])
  }
  if (sets.length === 0) return
  if (!patch.updated_at) {
    sets.push(`updated_at = ?`)
    vals.push(new Date().toISOString())
  }
  vals.push(id)
  db.prepare(`UPDATE agents SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
}

/** 删除可删角色（deletable=1）；主体与锁定内置不可删 */
export function deleteAgent(dataRoot: string, id: string): boolean {
  const db = getDatabase(dataRoot)
  if (!db) return false
  const r = db.prepare(`DELETE FROM agents WHERE id = ? AND deletable = 1`).run(id)
  return r.changes > 0
}

export function countUserAgents(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM agents WHERE origin = 'user'`).get() as { c: number }
  return row?.c ?? 0
}
