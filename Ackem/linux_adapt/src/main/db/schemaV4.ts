/** Phase 4 — 记忆联想层 + 遗忘体系
 *  新增 memory_associations、temporal_anchors 表
 *  memory_facts 新增 sensitivity 列
 */
export const SCHEMA_V4_SQL = `
CREATE TABLE IF NOT EXISTS memory_associations (
  id                TEXT PRIMARY KEY,
  fact_id_a         TEXT NOT NULL,
  fact_id_b         TEXT NOT NULL,
  association_type  TEXT NOT NULL,
  strength          REAL NOT NULL,
  created_at        TEXT NOT NULL,
  last_activated_at TEXT,
  FOREIGN KEY (fact_id_a) REFERENCES memory_facts(id),
  FOREIGN KEY (fact_id_b) REFERENCES memory_facts(id)
);
CREATE INDEX IF NOT EXISTS idx_assoc_a ON memory_associations(fact_id_a);
CREATE INDEX IF NOT EXISTS idx_assoc_b ON memory_associations(fact_id_b);
CREATE INDEX IF NOT EXISTS idx_assoc_strength ON memory_associations(strength);

CREATE TABLE IF NOT EXISTS temporal_anchors (
  id                TEXT PRIMARY KEY,
  anchor_date       TEXT NOT NULL,
  anchor_type       TEXT NOT NULL,
  recurrence_rule   TEXT,
  linked_fact_ids   TEXT NOT NULL,
  emotional_valence REAL,
  emotional_intensity REAL,
  domain            TEXT,
  summary           TEXT,
  created_at        TEXT NOT NULL,
  last_triggered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_anchor_date ON temporal_anchors(anchor_date);

ALTER TABLE memory_facts ADD COLUMN sensitivity TEXT DEFAULT 'normal';
CREATE INDEX IF NOT EXISTS idx_facts_sensitivity ON memory_facts(sensitivity);
`
