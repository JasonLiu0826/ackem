export const MACHINE_MAP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS scan_runs (
  id TEXT PRIMARY KEY,
  trigger TEXT NOT NULL,
  status TEXT NOT NULL,
  steps_total INTEGER NOT NULL DEFAULT 0,
  steps_done INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS map_entries (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  display_name TEXT NOT NULL,
  path TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence TEXT NOT NULL,
  scan_run_id TEXT NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_verified_at TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  UNIQUE(dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_map_entries_category ON map_entries(category, active);
CREATE INDEX IF NOT EXISTS idx_map_entries_scan ON map_entries(scan_run_id);

CREATE TABLE IF NOT EXISTS map_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
