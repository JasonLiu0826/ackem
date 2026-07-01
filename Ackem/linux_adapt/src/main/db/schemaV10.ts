/** Phase 10 — memory_facts 新增成人记忆隐私等级 */
export const SCHEMA_V10_SQL = `
ALTER TABLE memory_facts ADD COLUMN privacy_level TEXT DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS idx_facts_privacy_level ON memory_facts(privacy_level);
`
