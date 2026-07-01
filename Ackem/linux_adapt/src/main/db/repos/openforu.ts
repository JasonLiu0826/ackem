import { getDatabase } from '../database'
import { kvGet, kvSet } from './kv'
import type { OpenForUWorkspace, OpenForUWorkspaceIndex } from '../../extensions/openforu/workspaces'
import type { PlanSession } from '../../../shared/planSession'
import type { AgentRunMeta } from '../../../shared/openforuAgentTypes'

const KV_NS_WORKSPACES = 'openforu.workspaces'
const KV_KEY_INDEX = 'index'

export function saveWorkspaceIndexToDb(dataRoot: string, index: OpenForUWorkspaceIndex): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = new Date().toISOString()
  const del = db.prepare(`DELETE FROM openforu_workspaces`)
  const ins = db.prepare(
    `INSERT INTO openforu_workspaces(id, name, session_id, created_at, updated_at, user_created)
     VALUES (@id, @name, @session_id, @created_at, @updated_at, @user_created)`
  )
  db.transaction(() => {
    del.run()
    for (const w of index.workspaces) {
      ins.run({
        id: w.id,
        name: w.name,
        session_id: w.sessionId,
        created_at: w.createdAt,
        updated_at: w.updatedAt,
        user_created: w.userCreated === true ? 1 : 0
      })
    }
  })()
  kvSet(dataRoot, KV_NS_WORKSPACES, KV_KEY_INDEX, JSON.stringify(index))
}

export function loadWorkspaceIndexFromDb(dataRoot: string): OpenForUWorkspaceIndex | null {
  const blob = kvGet(dataRoot, KV_NS_WORKSPACES, KV_KEY_INDEX)
  if (blob) {
    try {
      return JSON.parse(blob) as OpenForUWorkspaceIndex
    } catch {
      /* fall through */
    }
  }
  const db = getDatabase(dataRoot)
  if (!db) return null
  const rows = db
    .prepare(`SELECT * FROM openforu_workspaces ORDER BY updated_at DESC`)
    .all() as Record<string, unknown>[]
  if (rows.length === 0) return null
  const workspaces: OpenForUWorkspace[] = rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    sessionId: String(r.session_id),
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
    userCreated: Number(r.user_created) === 1 ? true : undefined
  }))
  return { version: '1.0.0', activeWorkspaceId: null, workspaces }
}

export function savePlanSessionToDb(dataRoot: string, session: PlanSession): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = new Date().toISOString()
  const createdAt = session.createdAt ?? updatedAt
  db.prepare(
    `INSERT INTO openforu_sessions(session_id, workspace_id, plan_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET
       plan_json = excluded.plan_json,
       updated_at = excluded.updated_at`
  ).run(session.id, null, JSON.stringify(session), createdAt, updatedAt)
}

export function loadPlanSessionFromDb(dataRoot: string, sessionId: string): PlanSession | null {
  const db = getDatabase(dataRoot)
  if (!db) return null
  const row = db
    .prepare(`SELECT plan_json FROM openforu_sessions WHERE session_id = ?`)
    .get(sessionId) as { plan_json: string } | undefined
  if (!row) return null
  try {
    return JSON.parse(row.plan_json) as PlanSession
  } catch {
    return null
  }
}

export function saveAgentRunToDb(dataRoot: string, run: AgentRunMeta): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const updatedAt = run.updatedAt ?? new Date().toISOString()
  db.prepare(
    `INSERT INTO openforu_runs(
      run_id, session_id, kind, phase, status, artifact_kind, strategy,
      started_at, updated_at, error, run_json
    ) VALUES (
      @run_id, @session_id, @kind, @phase, @status, @artifact_kind, @strategy,
      @started_at, @updated_at, @error, @run_json
    )
    ON CONFLICT(run_id) DO UPDATE SET
      phase = excluded.phase,
      status = excluded.status,
      updated_at = excluded.updated_at,
      error = excluded.error,
      run_json = excluded.run_json`
  ).run({
    run_id: run.runId,
    session_id: run.sessionId,
    kind: run.kind,
    phase: run.phase,
    status: run.status,
    artifact_kind: run.artifactKind ?? null,
    strategy: run.strategy ?? null,
    started_at: run.startedAt,
    updated_at: updatedAt,
    error: run.lastError ?? null,
    run_json: JSON.stringify(run)
  })
}

export function countOpenForuSessionsInDb(dataRoot: string): number {
  const db = getDatabase(dataRoot)
  if (!db) return 0
  const row = db.prepare(`SELECT COUNT(*) AS c FROM openforu_sessions`).get() as { c: number }
  return row?.c ?? 0
}
