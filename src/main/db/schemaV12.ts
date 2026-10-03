import type Database from 'better-sqlite3'

export const SCHEMA_V12_VERSION = 12

/** Social tables are intentionally independent of V11 so this migration is repeatable. */
export function migrateSchemaV12(db: Database.Database): void {
  db.exec(`
CREATE TABLE IF NOT EXISTS friend_circle (id TEXT PRIMARY KEY, author_id TEXT NOT NULL, content TEXT NOT NULL, emotion_label TEXT, emotion_valence REAL, created_at TEXT NOT NULL, last_interaction_at TEXT, offline_generated INTEGER NOT NULL DEFAULT 0, content_source TEXT NOT NULL DEFAULT 'template', provenance_json TEXT);
CREATE INDEX IF NOT EXISTS idx_fc_created ON friend_circle(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fc_author ON friend_circle(author_id, created_at DESC);
CREATE TABLE IF NOT EXISTS fc_interactions (id TEXT PRIMARY KEY, post_id TEXT NOT NULL, actor_kind TEXT NOT NULL CHECK(actor_kind IN ('user','agent')), actor_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('like','comment')), content TEXT, sentiment REAL, created_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_fc_like_once ON fc_interactions(post_id,actor_kind,actor_id) WHERE type='like';
CREATE INDEX IF NOT EXISTS idx_fc_int_post ON fc_interactions(post_id);
CREATE TABLE IF NOT EXISTS user_friendships (id TEXT PRIMARY KEY,user_id TEXT NOT NULL DEFAULT 'local',agent_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),requested_at TEXT NOT NULL,responded_at TEXT,UNIQUE(user_id,agent_id));
CREATE TABLE IF NOT EXISTS social_events (id TEXT PRIMARY KEY,type TEXT NOT NULL,payload TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_se_time ON social_events(created_at DESC); CREATE INDEX IF NOT EXISTS idx_se_type ON social_events(type);
CREATE TABLE IF NOT EXISTS notification_reads (user_id TEXT NOT NULL DEFAULT 'local',event_id TEXT NOT NULL,read_at TEXT NOT NULL,PRIMARY KEY(user_id,event_id));
CREATE TABLE IF NOT EXISTS social_daily_stats (day TEXT PRIMARY KEY,tick_count INTEGER NOT NULL DEFAULT 0,llm_calls INTEGER NOT NULL DEFAULT 0,posts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS user_blocks (user_id TEXT NOT NULL DEFAULT 'local',agent_id TEXT NOT NULL,block_type TEXT NOT NULL CHECK(block_type IN ('mute','block')),created_at TEXT NOT NULL,PRIMARY KEY(user_id,agent_id));
CREATE TABLE IF NOT EXISTS groups (id TEXT PRIMARY KEY,name TEXT NOT NULL,owner_kind TEXT NOT NULL CHECK(owner_kind IN ('user','agent')),owner_id TEXT NOT NULL,created_at TEXT NOT NULL,dissolved_at TEXT);
CREATE TABLE IF NOT EXISTS group_members (group_id TEXT NOT NULL,member_kind TEXT NOT NULL CHECK(member_kind IN ('user','agent')),member_id TEXT NOT NULL,role TEXT NOT NULL DEFAULT 'member',joined_at TEXT NOT NULL,PRIMARY KEY(group_id,member_kind,member_id));
CREATE TABLE IF NOT EXISTS group_messages (id TEXT PRIMARY KEY,group_id TEXT NOT NULL,sender_kind TEXT NOT NULL CHECK(sender_kind IN ('user','agent','system')),sender_id TEXT NOT NULL,content TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_gm_group_time ON group_messages(group_id,created_at);
CREATE TABLE IF NOT EXISTS group_join_requests (id TEXT PRIMARY KEY,group_id TEXT NOT NULL,user_id TEXT NOT NULL DEFAULT 'local',status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected')),requested_at TEXT NOT NULL,responded_at TEXT);
CREATE TABLE IF NOT EXISTS achievements (achievement_id TEXT PRIMARY KEY,unlocked_at TEXT NOT NULL,payload TEXT);
CREATE TABLE IF NOT EXISTS achievement_progress (key TEXT PRIMARY KEY,value REAL NOT NULL DEFAULT 0,updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS social_meta (key TEXT PRIMARY KEY,value TEXT NOT NULL);
`)
}
