import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'

export type NotificationKind = 'progress' | 'approval' | 'information' | 'failure' | 'result' | 'stopped'
export interface TaskNotificationInput {
  taskId: string; goalRevision: number; deliverySurface: 'chat' | 'workbench'
  sourceConversationId: string; kind: NotificationKind; factFingerprint: string
  eventId: string; expiresAt?: number; priority?: number
}
export interface TaskNotification extends TaskNotificationInput {
  notificationId: string; createdAt: number; notBefore: number; deliveredAt: number | null
}
export const TASK_COMMUNICATION_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_notification_outbox (
 notification_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, goal_revision INTEGER NOT NULL,
 delivery_surface TEXT NOT NULL, source_conversation_id TEXT NOT NULL, kind TEXT NOT NULL,
 fact_fingerprint TEXT NOT NULL, event_id TEXT NOT NULL, priority INTEGER NOT NULL,
 created_at INTEGER NOT NULL, not_before INTEGER NOT NULL, expires_at INTEGER,
 delivered_at INTEGER, superseded_by TEXT, suppressed INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS task_notification_policy (
 task_id TEXT PRIMARY KEY, muted INTEGER NOT NULL DEFAULT 0, forgotten INTEGER NOT NULL DEFAULT 0,
 last_reported_event_id TEXT, last_reported_fingerprint TEXT, last_reported_at INTEGER);
`
type Row = Record<string, any>
const terminal = (kind: NotificationKind) => ['result', 'stopped', 'failure'].includes(kind)

/** Scheduling only. Delivery must use ReplyTransport with notificationId as its idempotency key. */
export class TaskNotificationOutbox {
  constructor(private readonly db: Database.Database, private readonly intervalMs = 120_000,
    private readonly now: () => number = Date.now) { db.exec(TASK_COMMUNICATION_SCHEMA) }

  enqueue(input: TaskNotificationInput): string | null {
    return this.db.transaction(() => {
      const policy = this.db.prepare('SELECT * FROM task_notification_policy WHERE task_id=?').get(input.taskId) as Row | undefined
      if (policy?.forgotten || (policy?.muted && input.kind === 'progress') || !terminal(input.kind)&&policy?.last_reported_fingerprint === input.factFingerprint) return null
      const key = `${input.taskId}:${input.goalRevision}:${input.kind}:${terminal(input.kind) ? '' : input.factFingerprint}`
      const id = `notification:${createHash('sha256').update(key).digest('hex')}`
      if (this.db.prepare('SELECT notification_id FROM task_notification_outbox WHERE notification_id=?').get(id)) return id
      if(terminal(input.kind))this.db.prepare("UPDATE task_notification_outbox SET superseded_by=? WHERE task_id=? AND goal_revision<=? AND kind='progress' AND delivered_at IS NULL AND superseded_by IS NULL").run(id,input.taskId,input.goalRevision)
      if (input.kind==='progress' && this.db.prepare(`SELECT notification_id FROM task_notification_outbox WHERE task_id=? AND goal_revision>=? AND kind IN ('result','stopped','failure') LIMIT 1`).get(input.taskId,input.goalRevision)) return null
      const now = this.now()
      if (input.kind === 'progress' || terminal(input.kind)) {
        this.db.prepare(`UPDATE task_notification_outbox SET superseded_by=? WHERE task_id=? AND kind='progress' AND delivered_at IS NULL AND notification_id<>?`).run(id, input.taskId, id)
      }
      this.db.prepare(`INSERT OR IGNORE INTO task_notification_outbox VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,NULL,0)`).run(
        id, input.taskId, input.goalRevision, input.deliverySurface, input.sourceConversationId,
        input.kind, input.factFingerprint, input.eventId, input.priority ?? (input.kind === 'progress' ? 0 : 10),
        now, input.kind === 'progress' ? Math.max(now, (policy?.last_reported_at ?? now - this.intervalMs) + this.intervalMs) : now,
        input.expiresAt ?? null, null)
      return id
    })()
  }

  pending(context: { conversationId?: string; chatGenerating?: boolean; unrelatedTopic?: boolean; includeInactiveResults?:boolean; limit?: number } = {}): TaskNotification[] {
    const rows = this.db.prepare(`SELECT o.* FROM task_notification_outbox o LEFT JOIN task_notification_policy p ON p.task_id=o.task_id
      WHERE delivered_at IS NULL AND superseded_by IS NULL AND suppressed=0 AND COALESCE(p.forgotten,0)=0
      AND NOT (kind='progress' AND COALESCE(p.muted,0)=1) AND not_before<=? AND (expires_at IS NULL OR expires_at>?)
      ORDER BY priority DESC,created_at LIMIT ?`).all(this.now(), this.now(), Math.min(100, Math.max(1, context.limit ?? 20))) as Row[]
    return rows.filter(r => r.delivery_surface !== 'chat' ||
      ((r.source_conversation_id === context.conversationId || context.includeInactiveResults&&terminal(r.kind)) && !context.chatGenerating && !(r.kind === 'progress' && context.unrelatedTopic)))
      .map(r => ({ notificationId:r.notification_id, taskId:r.task_id, goalRevision:r.goal_revision,
        deliverySurface:r.delivery_surface, sourceConversationId:r.source_conversation_id, kind:r.kind,
        factFingerprint:r.fact_fingerprint,eventId:r.event_id, priority:r.priority,createdAt:r.created_at,
        notBefore:r.not_before,expiresAt:r.expires_at,deliveredAt:r.delivered_at }))
  }

  markDelivered(id: string): boolean {
    return this.db.transaction(() => {
      const r = this.db.prepare('SELECT * FROM task_notification_outbox WHERE notification_id=? AND delivered_at IS NULL AND superseded_by IS NULL AND suppressed=0').get(id) as Row | undefined
      if (!r) return false
      const policy = this.db.prepare('SELECT forgotten FROM task_notification_policy WHERE task_id=?').get(r.task_id) as Row | undefined
      if (policy?.forgotten) return false
      this.db.prepare('UPDATE task_notification_outbox SET delivered_at=? WHERE notification_id=?').run(this.now(), id)
      this.reportQueried(r.task_id,r.fact_fingerprint,r.event_id)
      return true
    })()
  }

  reportQueried(taskId: string, fingerprint: string, eventId = ''): void {
    this.db.prepare(`INSERT INTO task_notification_policy(task_id,last_reported_fingerprint,last_reported_event_id,last_reported_at) VALUES (?,?,?,?)
      ON CONFLICT(task_id) DO UPDATE SET last_reported_fingerprint=excluded.last_reported_fingerprint,last_reported_event_id=excluded.last_reported_event_id,last_reported_at=excluded.last_reported_at`).run(taskId,fingerprint,eventId,this.now())
    this.db.prepare('UPDATE task_notification_outbox SET superseded_by=? WHERE task_id=? AND fact_fingerprint=? AND delivered_at IS NULL').run('queried',taskId,fingerprint)
  }

  suppressTask(taskId: string, forget = false): void {
    this.db.transaction(() => {
      this.db.prepare(`INSERT INTO task_notification_policy(task_id,muted,forgotten) VALUES (?,1,?) ON CONFLICT(task_id) DO UPDATE SET muted=1,forgotten=MAX(forgotten,excluded.forgotten)`).run(taskId,forget ? 1 : 0)
      if (forget) {
        this.db.prepare(`UPDATE task_notification_outbox SET suppressed=1,fact_fingerprint='',event_id='' WHERE task_id=?`).run(taskId)
        this.db.prepare(`UPDATE task_notification_policy SET last_reported_fingerprint=NULL,last_reported_event_id=NULL WHERE task_id=?`).run(taskId)
      }
    })()
  }
  unmuteTask(taskId: string): void { this.db.prepare('UPDATE task_notification_policy SET muted=0 WHERE task_id=? AND forgotten=0').run(taskId) }
  supersedeTask(taskId: string, goalRevision: number): void {
    this.db.prepare(`UPDATE task_notification_outbox SET superseded_by='goal_updated' WHERE task_id=? AND goal_revision<? AND delivered_at IS NULL`).run(taskId,goalRevision)
  }
}
