CREATE TABLE IF NOT EXISTS sync_devices (
  device_id TEXT PRIMARY KEY,
  device_name TEXT,
  pair_code TEXT,
  paired_at INTEGER,
  last_sync_ts INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id TEXT PRIMARY KEY,
  session_id TEXT,
  role TEXT,
  content TEXT,
  image_path TEXT,
  created_at INTEGER,
  device_id TEXT,
  synced_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);

CREATE TABLE IF NOT EXISTS memory_facts (
  id TEXT PRIMARY KEY,
  content TEXT,
  confidence REAL,
  created_at INTEGER,
  updated_at INTEGER,
  device_id TEXT
);

CREATE TABLE IF NOT EXISTS settings_kv (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at INTEGER,
  device_id TEXT
);

CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  r2_key TEXT,
  prompt TEXT,
  created_at INTEGER,
  device_id TEXT
);

CREATE TABLE IF NOT EXISTS pair_codes (
  code TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER DEFAULT 0
);
