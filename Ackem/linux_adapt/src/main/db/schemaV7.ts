/** Phase 7 — 情绪涌现模块
 *  新增 companion_state.emergence_json 列
 *  设计文档：docs/plan/心系统_情绪涌现模块设计_6_11.md
 */
export const SCHEMA_V7_SQL = `
ALTER TABLE companion_state ADD COLUMN emergence_json TEXT;
`
