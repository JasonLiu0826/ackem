# uskills 目录 — 用户自创 Skill

> **权威协议**：[`../PROTOCOL.md`](../PROTOCOL.md)（含 CTX + JP + Dispatch 三层接入说明）  
> **部署位置**：`{dataRoot}/openforu/uskills/`（不是本仓库目录）

每个 Skill 是一个子目录，包含 `manifest.json` 和 `skill.json`。

## 目录结构

```
uskills/
├── CATALOG.md           ← 本文件
├── _template/           ← 空白模板（复制到 data/openforu/uskills/）
├── examples/hello-world/← 最小可运行例题
└── （部署后）data/openforu/uskills/<slug>/
    ├── manifest.json
    └── skill.json
```

## 创建新 Skill

1. **推荐**：Ackem Plan 对话 → 自动部署到 `data/openforu/uskills/`
2. **手改**：复制 `_template/` 或 `examples/hello-world/` 到 `data/openforu/uskills/<slug>/`
3. 确保 `manifest.dispatch` 完整（否则 **不会进入调度 catalog**）
4. 扩展中心 → **自创 Skill** → 启用
5. 聊天中说 `keywords` 里的词 → Dispatch `auto_invoke` → context 注入

## manifest.json 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | `u/<name>@<version>`（如 `u/my-timer@1.0.0`） |
| name | string | 显示名称 |
| version | string | semver |
| category | "skill" | 固定 |
| skillType | "rule" \| "tool" \| "proactive" \| "workflow" | OpenForU v1 Plan 生成 **rule** |
| triggers | SkillTrigger[] | v1 推荐 `["keyword"]` |
| keywords | string[] | keyword 触发必填；须与 `dispatch.keywords` 对齐 |
| permissions | string[] | 见下表 |
| **dispatch** | DispatchConfig | **必填**，见 PROTOCOL.md §3.2 |
| timeoutMs | number | 默认 5000 |
| adultModeSafe | boolean | 成人模式是否可用 |

## skill.json 结构

```json
{
  "version": "1.0.0",
  "onKeyword": { "reply": "触发时的行为描述" },
  "promptTemplates": {
    "contextInjection": "注入 LLM 的完整指示（推荐显式填写）",
    "userFacing": "可选：短反馈文案"
  }
}
```

至少要有 **contextInjection** 或 **onKeyword.reply** 之一。

## 权限（uskill v1）

| 权限 | v1 实际效果 |
|------|------------|
| engine_read | 可读引擎快照 |
| engine_inject | 通过 contextInjection 注入对话 |
| system_notification | 可写入 manifest，**尚无独立通知执行器** |
| readonly | 只读标记 |

## 与官方 Skill 的关系

协议与 `skills/types.ts` 相同；用户扩展额外要求 `u/` 前缀 + `dispatch` + 落盘 `data/openforu/`。

## 升级路径

满意后可整理后 PR 到官方 `skills/builtin/`。详见 [`../PROTOCOL.md`](../PROTOCOL.md)。
