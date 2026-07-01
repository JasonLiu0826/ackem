# 索引与规模

> **语言：** 中文 · [English](./indexing-and-scale.md)

> **产品**：Ackem v1.0.0  
> **读者**：长期用户、记忆量大的使用者

---

## 1. `_derived/` 是什么

`data/_derived/` 存放 **可重建的派生索引**：

| 内容 | 说明 | 可重建 |
|------|------|--------|
| 向量缓存 (Embedding) | 记忆事实的向量表示，用于语义搜索 | ✅ 点击"重建索引" |
| FTS 索引 | SQLite FTS5 全文搜索索引 | ✅ 自动维护 |
| 关联图缓存 | 记忆关联的图结构缓存 | ✅ 自动重建 |

这些文件不包含原始数据，只包含加速检索所需的派生结构。删除后不会丢失任何记忆，仅首次检索会变慢。

---

## 2. 重建索引

在 **设置 → 记忆** 中点击"重建索引"将：

1. 清空 `fact_embeddings` 表
2. 重新计算所有事实的向量 Embedding（需 ONNX Runtime 可用）
3. 重建 FTS5 索引
4. 重建记忆关联图

重建期间聊天功能不受影响，但语义检索可能暂时降级为 TF-IDF。

---

## 3. 规模预期

| 数据量 | 预期表现 |
|--------|----------|
| < 10,000 条事实 | FTS 毫秒级，语义搜索 < 100ms |
| 10,000–50,000 条事实 | FTS 毫秒级，语义搜索 < 500ms |
| > 50,000 条事实 | 检索可能变慢，建议重建索引 |
| 单个 Markdown 导入 > 10MB | 导入耗时可能 > 30s，建议拆分文件 |

---

## 4. 版本兼容性

| 场景 | 行为 |
|------|------|
| 新版 Ackem 读取旧版 `_derived/` | 自动重建不兼容的派生索引 |
| 旧版 Ackem 读取新版 `_derived/` | 不保证兼容，建议删除 `_derived/` 让新版重建 |
| SQLite schema 版本不匹配 | 自动迁移（V1→V10），`_derived/` 可能需重建 |

---

## 5. 相关文档

| 文档 | 内容 |
|------|------|
| [memory-format.zh.md](./memory-format.zh.md) | 数据目录结构 |
| [ai-context-and-retrieval-policy.zh.md](./ai-context-and-retrieval-policy.zh.md) | 检索策略 |
| [architecture/07-data-layer.zh.md](./developer/architecture/07-data-layer.zh.md) | 迁移策略 |

*索引与规模 · Ackem v1.0.0*
