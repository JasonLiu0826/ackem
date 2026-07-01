/** Phase 8 — 事实 Embedding 持久化（按 model_sig 隔离） */
export const SCHEMA_V8_SQL = `
CREATE TABLE IF NOT EXISTS fact_embeddings (
  fact_id TEXT NOT NULL,
  model_sig TEXT NOT NULL,
  dim INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  vector BLOB NOT NULL,
  PRIMARY KEY (fact_id, model_sig)
);
CREATE INDEX IF NOT EXISTS idx_fact_embeddings_model ON fact_embeddings(model_sig);
`
