/**
 * socialGraphRepo — Agent↔Agent 关系边
 * 负责：建边 / 查边 / 按 Agent 删边（存边时 agent_a < agent_b）
 */

import { getDatabase } from '../database'

export type SocialGraphEdge = {
  agent_a: string
  agent_b: string
  trust: number
  rifts: number
  momentum: number
  stage: string
  atmosphere: string | null
  updated_at: string
}

export type UpsertEdgeInput = {
  trust?: number
  rifts?: number
  momentum?: number
  stage?: string
  atmosphere?: string | null
}

function canonicalize(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export function upsertEdge(
  dataRoot: string,
  agentA: string,
  agentB: string,
  input: UpsertEdgeInput = {}
): void {
  if (agentA === agentB) return
  const db = getDatabase(dataRoot)
  if (!db) throw new Error('DATABASE_UNAVAILABLE')
  const [a, b] = canonicalize(agentA, agentB)
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO social_graph(agent_a, agent_b, trust, rifts, momentum, stage, atmosphere, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(agent_a, agent_b) DO UPDATE SET
       trust = excluded.trust,
       rifts = excluded.rifts,
       momentum = excluded.momentum,
       stage = excluded.stage,
       atmosphere = excluded.atmosphere,
       updated_at = excluded.updated_at`
  ).run(
    a,
    b,
    input.trust ?? 25,
    input.rifts ?? 0,
    input.momentum ?? 0,
    input.stage ?? 'STRANGER',
    input.atmosphere ?? null,
    now
  )
}

export function getEdge(dataRoot: string, agentA: string, agentB: string): SocialGraphEdge | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const [a, b] = canonicalize(agentA, agentB)
  const row = db
    .prepare(`SELECT * FROM social_graph WHERE agent_a = ? AND agent_b = ?`)
    .get(a, b) as SocialGraphEdge | undefined
  return row ?? null
}

export function deleteByAgent(dataRoot: string, agentId: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  db.prepare(`DELETE FROM social_graph WHERE agent_a = ? OR agent_b = ?`).run(agentId, agentId)
}

export function listEdgesForAgent(dataRoot: string, agentId: string): SocialGraphEdge[] {
  const db = getDatabase(dataRoot)
  if (!db) return []
  return db
    .prepare(`SELECT * FROM social_graph WHERE agent_a = ? OR agent_b = ?`)
    .all(agentId, agentId) as SocialGraphEdge[]
}
