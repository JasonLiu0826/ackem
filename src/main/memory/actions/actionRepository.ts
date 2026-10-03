import type Database from 'better-sqlite3'
import type { ActionExecutionInput, ActionRun, ActionStatus } from '../contracts.js'
import { clampQueryLimit } from '../ledger/queryLimit.js'

export type DbTx = Database.Database

export type ActionRunRow = {
  run_id: string
  parent_run_id: string | null
  nature: 'plugin' | 'work'
  session_id: string
  turn_id: string
  correlation_id: string
  plan_id: string | null
  runtime_id: string | null
  target_id: string | null
  status: ActionStatus
  version: number
  request_event_id: string
  last_event_id: string
  queue_order: number | null
  queued_at: string | null
  started_at: string | null
  completed_at: string | null
  updated_at: string
  execution_json?: string | null
}

function parseExecution(raw: string | null | undefined): ActionExecutionInput | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ActionExecutionInput
    if (!parsed || typeof parsed !== 'object' || typeof parsed.prompt !== 'string') return null
    if (typeof parsed.targetId !== 'string' || !parsed.targetId) return null
    return parsed
  } catch {
    return null
  }
}

function rowToRun(row: ActionRunRow): ActionRun {
  return {
    runId: row.run_id,
    parentRunId: row.parent_run_id,
    nature: row.nature,
    sessionId: row.session_id,
    turnId: row.turn_id,
    correlationId: row.correlation_id,
    runtimeId: row.runtime_id,
    targetId: row.target_id ?? '',
    status: row.status,
    version: row.version,
    queueOrder: row.queue_order,
    updatedAt: row.updated_at,
    completedAt: row.completed_at,
    execution: parseExecution(row.execution_json),
  }
}

export type InsertActionRunInput = ActionRunRow

export class ActionRepository {
  private readonly insertRun
  private readonly updateRun
  private readonly selectById
  private readonly listOpenStmt

  constructor(private readonly db: Database.Database) {
    this.insertRun = db.prepare(`
      INSERT INTO memory_action_runs (
        run_id, parent_run_id, nature, session_id, turn_id, correlation_id, plan_id,
        runtime_id, target_id, status, version, request_event_id, last_event_id,
        queue_order, queued_at, started_at, completed_at, updated_at, execution_json
      ) VALUES (
        @run_id, @parent_run_id, @nature, @session_id, @turn_id, @correlation_id, @plan_id,
        @runtime_id, @target_id, @status, @version, @request_event_id, @last_event_id,
        @queue_order, @queued_at, @started_at, @completed_at, @updated_at, @execution_json
      )
    `)
    this.updateRun = db.prepare(`
      UPDATE memory_action_runs SET
        status = @status,
        version = @version,
        last_event_id = @last_event_id,
        runtime_id = @runtime_id,
        queue_order = @queue_order,
        queued_at = @queued_at,
        started_at = @started_at,
        completed_at = @completed_at,
        updated_at = @updated_at,
        execution_json = COALESCE(@execution_json, execution_json)
      WHERE run_id = @run_id AND version = @expected_version
    `)
    this.selectById = db.prepare(`SELECT * FROM memory_action_runs WHERE run_id = ?`)
    this.listOpenStmt = db.prepare(`
      SELECT * FROM memory_action_runs
      WHERE session_id = ? AND status IN ('accepted','queued','running','waiting_permission','unknown')
      ORDER BY COALESCE(queue_order, 999999), updated_at DESC
      LIMIT ?
    `)
  }

  insert(tx: DbTx, row: InsertActionRunInput): void {
    this.insertRun.run({ ...row, execution_json: row.execution_json ?? null })
  }

  bindRuntime(runId: string, runtimeId: string): void {
    this.db.prepare(`UPDATE memory_action_runs SET runtime_id = ? WHERE run_id = ?`).run(runtimeId, runId)
  }

  updateWithVersion(tx: DbTx, row: ActionRunRow & { expected_version: number }): boolean {
    const info = this.updateRun.run({ ...row, execution_json: row.execution_json ?? null })
    return info.changes === 1
  }

  getById(runId: string): ActionRun | null {
    const row = this.selectById.get(runId) as ActionRunRow | undefined
    return row ? rowToRun(row) : null
  }

  getRow(runId: string): ActionRunRow | null {
    return (this.selectById.get(runId) as ActionRunRow | undefined) ?? null
  }

  listQueued(sessionId: string): ActionRunRow[] {
    return this.db
      .prepare(
        `SELECT * FROM memory_action_runs
         WHERE session_id = ? AND status = 'queued'
         ORDER BY COALESCE(queue_order, 999999), updated_at ASC`
      )
      .all(sessionId) as ActionRunRow[]
  }

  latestInFlightWork(sessionId: string): ActionRun | null {
    const row = this.db.prepare(`
      SELECT * FROM memory_action_runs
      WHERE session_id = ? AND nature = 'work'
        AND status IN ('running', 'waiting_permission', 'unknown')
      ORDER BY updated_at DESC, rowid DESC LIMIT 1
    `).get(sessionId) as ActionRunRow | undefined
    return row ? rowToRun(row) : null
  }

  maxQueueOrder(sessionId: string): number {
    const row = this.db
      .prepare(
        `SELECT MAX(queue_order) AS m FROM memory_action_runs WHERE session_id = ? AND queue_order IS NOT NULL`
      )
      .get(sessionId) as { m: number | null } | undefined
    return row?.m ?? 0
  }

  sessionHasInFlightRunner(sessionId: string): boolean {
    const row = this.db
      .prepare(
        `SELECT 1 AS x FROM memory_action_runs
         WHERE session_id = ? AND status IN ('running','waiting_permission','unknown')
         LIMIT 1`
      )
      .get(sessionId) as { x: number } | undefined
    return row != null
  }

  listPromotableSessions(): string[] {
    const rows = this.db
      .prepare(
        `SELECT DISTINCT q.session_id AS session_id
         FROM memory_action_runs q
         WHERE q.status = 'queued'
           AND NOT EXISTS (
             SELECT 1 FROM memory_action_runs live
             WHERE live.session_id = q.session_id
               AND live.status IN ('running','waiting_permission','unknown')
           )`
      )
      .all() as Array<{ session_id: string }>
    return rows.map((row) => row.session_id)
  }

  listOpen(sessionId: string, limit: number): ActionRun[] {
    const lim = clampQueryLimit(limit)
    const rows = this.listOpenStmt.all(sessionId, lim) as ActionRunRow[]
    return rows.map(rowToRun)
  }
}
