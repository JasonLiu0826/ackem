# 数据目录格式

> **语言：** 中文 · [English](./memory-format.md)

> **产品版本**：Ackem **v1.0.0**  
> **代码依据**：`src/main/layout.ts` · `src/main/paths.ts`  
> **原则**：本地优先；结构化数据在 `ackem.db`；人类可读 md/json 可备份与审计。

---

## 1. 数据根位置

| 模式 | 路径 |
|------|------|
| **便携（绿色版默认）** | `<Ackem.exe 同级>/data/` |
| **用户目录** | `%LOCALAPPDATA%\Ackem\` |

在应用 **设置 → 数据与备份** 可查看当前绝对路径。

---

## 2. 目录树（v1.0.0）

```
data/
├── README.md                 # 首次启动自动生成说明
├── ackem.db                  # SQLite：状态、扩展 registry KV 等
├── imports/                  # 用户导入的 txt/md/json 原件
├── memory/
│   ├── facts/facts.v2.json   # 结构化事实（权威之一）
│   └── archive/              # 导出的人类可读记忆归档 md
├── companion/
│   ├── self.md               # 伴侣第一人称镜中记忆
│   ├── state.md              # 伴侣快照占位
│   └── chat-history-*.json   # 会话历史（按配置）
├── diary/                    # 日记 md
├── openforu/
│   ├── uskills/              # 用户 Skill（u/）
│   ├── uplugins/             # 用户 Plugin（u/）
│   ├── sessions/             # Plan 工作区
│   └── staging/              # 部署暂存
├── extensions/               # 扩展 registry 镜像（skills/plugins）
├── _derived/                 # 派生索引（可删，应用可重建）
├── models/                   # 用户侧 embedding 模型缓存
├── logs/                     # 运行日志
├── preferences/              # 偏好
├── portrait/                 # 肖像相关
├── weather/                  # 天气缓存
└── packs/                    # Persona Pack 预留
```

`community/` 市场扩展目录在 v1.0.0 **未启用**。

---

## 3. 权威 vs 派生

| 类型 | 路径 | 说明 |
|------|------|------|
| **权威** | `imports/`、`memory/` 下 md/json、`companion/`、`diary/` | 备份必含 |
| **权威** | `ackem.db` | 关系/情绪/注册表等；备份建议含 |
| **派生** | `_derived/`、`data/models/` 部分缓存 | 删除后变慢，不丢核心记忆 |

设置中的 **重建索引** 会刷新派生层。

---

## 4. AI 写入白名单（摘要）

引擎与扩展 **不得** 随意写入用户整个磁盘。允许写入范围由代码白名单控制，主要包括：

- `data/memory/`、`data/diary/`、`data/companion/`（引擎记忆管线）
- `data/openforu/`（用户扩展）
- `data/extensions/`、`data/staging/`（扩展暂存与 registry）
- `data/logs/`

扩展协议详见 [DEVELOPER-EXTENSION-PROTOCOL.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.md)。

---

## 5. 备份与迁移

1. **完全退出** Ackem（含托盘）
2. 拷贝整棵 `data/` 到新机器同路径（便携）或在新安装后替换用户目录
3. 不要分享含私人对话的 `data/` zip

官方安装包 **从不包含** 你的 `data/`。

---

## 6. 相关文档

| 文档 | 内容 |
|------|------|
| [distribution-windows.zh.md](./distribution-windows.zh.md) | 分发说明 |
| [CODEBASE-PATHS.md](./CODEBASE-PATHS.md) | 路径总览 |
| [ai-context-and-retrieval-policy.zh.md](./ai-context-and-retrieval-policy.zh.md) | 记忆如何注入 LLM |

*数据目录格式 · Ackem v1.0.0 · 2026-06*
