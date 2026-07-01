/** Phase 5 — 年龄动态计算 + 用户名字记忆
 *  memory_facts 新增 ageMeta 五列
 *  设计文档：docs/prompt/年龄动态计算设计_6_11.md
 */
export const SCHEMA_V5_SQL = `
ALTER TABLE memory_facts ADD COLUMN age_value INTEGER;
ALTER TABLE memory_facts ADD COLUMN age_birth_year INTEGER;
ALTER TABLE memory_facts ADD COLUMN age_birthday_mmdd TEXT;
ALTER TABLE memory_facts ADD COLUMN age_recorded_at TEXT;
ALTER TABLE memory_facts ADD COLUMN age_is_estimate INTEGER DEFAULT 0;
`
