export const LONG_TERM_SCHEMA = `
CREATE TABLE IF NOT EXISTS task_goals (id TEXT PRIMARY KEY, data_json TEXT NOT NULL, event_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS task_decisions (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, data_json TEXT NOT NULL, event_id TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS task_decisions_task ON task_decisions(task_id);
CREATE TABLE IF NOT EXISTS standing_rules (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, data_json TEXT NOT NULL, event_id TEXT NOT NULL, runs INTEGER NOT NULL DEFAULT 0, last_trigger_at INTEGER);
CREATE TABLE IF NOT EXISTS world_observations (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, source TEXT NOT NULL, sequence INTEGER NOT NULL, data_json TEXT NOT NULL, event_id TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS observation_cursors (source TEXT NOT NULL, task_id TEXT NOT NULL, sequence INTEGER NOT NULL, observed_at INTEGER NOT NULL, PRIMARY KEY(source,task_id));
CREATE TABLE IF NOT EXISTS standing_triggers (id TEXT PRIMARY KEY, rule_id TEXT NOT NULL, task_id TEXT NOT NULL, observation_id TEXT NOT NULL, state TEXT NOT NULL, deadline INTEGER NOT NULL, reserved_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL, run_id TEXT, source_versions_json TEXT NOT NULL, goal_id TEXT);
`
