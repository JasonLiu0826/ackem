/** Phase 6 — 主动策略调度 Loop 增强
 *  新增 user_habits / foreground_history / decision_log 三张表
 *  设计文档：docs/plan/主动策略调度loop详细设计_6_11.md
 */
export const SCHEMA_V6_SQL = `
CREATE TABLE IF NOT EXISTS user_habits (
  id                TEXT PRIMARY KEY,
  type              TEXT NOT NULL,
  scope             TEXT NOT NULL,
  weekday           INTEGER,
  hour_start        INTEGER NOT NULL,
  hour_end          INTEGER NOT NULL,
  confidence        REAL NOT NULL DEFAULT 0,
  occurrence_count  INTEGER NOT NULL DEFAULT 1,
  first_seen_at     INTEGER NOT NULL,
  last_confirmed_at INTEGER NOT NULL,
  expires_at        INTEGER,
  source            TEXT NOT NULL,
  suppress_target   TEXT,
  note              TEXT NOT NULL,
  created_at        INTEGER NOT NULL,
  updated_at        INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habits_scope ON user_habits(scope);
CREATE INDEX IF NOT EXISTS idx_habits_timeslot ON user_habits(weekday, hour_start, hour_end);
CREATE INDEX IF NOT EXISTS idx_habits_expires ON user_habits(expires_at);

CREATE TABLE IF NOT EXISTS foreground_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  scene       TEXT NOT NULL,
  detected_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fg_history_time ON foreground_history(detected_at);

CREATE TABLE IF NOT EXISTS decision_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  signal_json    TEXT NOT NULL,
  decision       TEXT NOT NULL,
  reason         TEXT NOT NULL,
  tool_decision  TEXT,
  user_feedback  TEXT,
  created_at     INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_decision_log_time ON decision_log(created_at);
`
