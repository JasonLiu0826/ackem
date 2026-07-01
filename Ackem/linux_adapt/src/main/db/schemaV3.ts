/** Phase 3 — 增量迁移（自 user_version 2 → 3）
 *  无新表。Phase 3 的变更在 repo 代码层（增量 INSERT/UPDATE/DELETE 替代全表重写）。
 *  版本号升级用于标记 DB 已完成 Phase 3 迁移。
 */
export const SCHEMA_V3_SQL = ``
