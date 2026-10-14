import type Database from 'better-sqlite3'
import { TASK_COMMUNICATION_SCHEMA } from '../tasks/communication'
import { SYSTEM_KNOWLEDGE_SCHEMA } from '../system/introspection'

/** Task state and execution commands are projections of the existing memory ledger. */
export const TASK_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS task_projection (
 id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, permission_mode TEXT NOT NULL,
 queue_order INTEGER NOT NULL, fence INTEGER NOT NULL DEFAULT 0,
 instruction TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
 receipt_revision INTEGER NOT NULL DEFAULT -1
);
CREATE TABLE IF NOT EXISTS task_requests (
 request_id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, result_json TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_execution_outbox (
 command_id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES task_projection(id),
 goal_revision INTEGER NOT NULL, control_epoch INTEGER NOT NULL,
 kind TEXT NOT NULL, payload_json TEXT NOT NULL, state TEXT NOT NULL,
 created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS task_execution_pending ON task_execution_outbox(state,created_at);
CREATE TABLE IF NOT EXISTS task_input_inbox (
 request_id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, input_json TEXT NOT NULL,
 target_ids_json TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS task_input_principals (request_id TEXT PRIMARY KEY, principal_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_authority_grants (grant_id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE, domain_id TEXT NOT NULL, principal_id TEXT NOT NULL, resources_json TEXT NOT NULL, revision INTEGER NOT NULL, revoked_at INTEGER);
`
export function migrateSchemaV20(db: Database.Database): void { db.transaction(() => db.exec(TASK_SCHEMA_SQL+TASK_COMMUNICATION_SCHEMA+SYSTEM_KNOWLEDGE_SCHEMA))() }
