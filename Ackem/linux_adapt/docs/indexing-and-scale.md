# Indexing & Scale

> **Language:** English · [中文](./indexing-and-scale.zh.md)

> **Product:** Ackem v1.0.0  
> **Audience:** Long-term users with large memory libraries

---

## 1. What is `_derived/`?

`data/_derived/` stores **rebuildable derived indexes**:

| Content | Description | Rebuildable |
|---------|-------------|-------------|
| Vector cache (embeddings) | Vector representations of memory facts for semantic search | ✅ “Rebuild index” in Settings |
| FTS index | SQLite FTS5 full-text index | ✅ Maintained automatically |
| Association graph cache | Cached graph structure for memory links | ✅ Rebuilt automatically |

These files are not source data. Deleting them loses no memories — only the first search after deletion may be slower.

---

## 2. Rebuild index

**Settings → Memory → Rebuild index** will:

1. Clear the `fact_embeddings` table  
2. Recompute embeddings for all facts (requires ONNX Runtime)  
3. Rebuild the FTS5 index  
4. Rebuild the memory association graph  

Chat continues during rebuild; semantic search may temporarily fall back to TF-IDF.

---

## 3. Scale expectations

| Data volume | Expected behavior |
|-------------|-------------------|
| < 10,000 facts | FTS in milliseconds; semantic search < 100 ms |
| 10,000–50,000 facts | FTS in milliseconds; semantic search < 500 ms |
| > 50,000 facts | Search may slow; rebuild index recommended |
| Single Markdown import > 10 MB | Import may take > 30 s; split large files |

---

## 4. Version compatibility

| Scenario | Behavior |
|----------|----------|
| New Ackem reads old `_derived/` | Rebuilds incompatible derived indexes |
| Old Ackem reads new `_derived/` | Not guaranteed; delete `_derived/` and let new version rebuild |
| SQLite schema mismatch | Auto-migration (V1→V10); `_derived/` may need rebuild |

---

## 5. Related docs

| Doc | Topic |
|-----|-------|
| [memory-format.md](./memory-format.md) | Data layout |
| [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) | Retrieval policy |
| [developer/architecture/07-data-layer.md](./developer/architecture/07-data-layer.md) | Migrations |

*Indexing & Scale · Ackem v1.0.0*
