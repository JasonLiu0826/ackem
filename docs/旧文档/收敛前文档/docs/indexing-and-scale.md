> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Retrieval indexes, scale and rebuilding

[中文](indexing-and-scale.zh.md)

Ackem combines fact retrieval, full-text/keyword, vectors and associations according to query and runtime availability. Embedding supports retrieval; it is not execution authority or the sole routing basis.

## Sources and derived data

`_derived/` and some vector caches accelerate retrieval. SQLite facts, history, events, contracts and receipts include authoritative data. FTS/vector structures may also live in the database; not every index is a file under `_derived/`.

Use application rebuild entry points rather than deleting tables while running. Index rebuilding does not recreate facts, clear tasks or replace schema migration.

## Scale

Performance depends on facts, document size, model, hardware, cache state and retrieval strategy. Public documentation does not promise fixed latency at a specific data volume. Record workload, cold/warm state and measured retrieval time.

Import large files according to actual parser support. Kernel file tools and long-term memory imports serve different purposes; task resources do not all need to become memory.

## Compatibility

Base migrations currently reach V22, with compatibility reconciliation and module initialization. Rebuild incompatible derived caches through supported paths. Databases and artifacts are not disposable caches. Older programs are not guaranteed to read newer data; validate on a copy.

[Data format](memory-format.md) · [Context policy](ai-context-and-retrieval-policy.md) · [Data layer](developer/architecture/07-data-layer.md)
