# 我的 Skill（模板）

OpenForU uskill 空白模板。**复制到 `data/openforu/uskills/<slug>/` 使用**，不要放在 `src/` 里。

完整协议：[`../../PROTOCOL.md`](../../PROTOCOL.md)

## 快速开始

1. 复制本目录到 `{dataRoot}/openforu/uskills/my-skill/`
2. 编辑 `manifest.json`：改 `id`、`keywords`、**dispatch**（与 keywords 对齐）
3. 编辑 `skill.json`：写 `contextInjection` 或 `onKeyword.reply`
4. 重启 Ackem 或打开扩展中心 → 自创 Skill（扫描后会自动激活）
5. 聊天中说关键词，走 Dispatch → Skill 执行 → LLM 注入

## Skill 类型（OpenForU v1）

| 类型 | v1 支持 |
|------|--------|
| rule + keyword | ✅ Plan 默认路径 |
| tool + llm_function_call | ⚠️ 需手写 functionDef，不走 dispatchExecutor 直执 |
| proactive / workflow | 📋 后续版本 |

## 例题

[`../examples/hello-world/`](../examples/hello-world/) — 问候语 Skill，含完整 dispatch。

Plan 部署实样：`data/openforu/uskills/pomodoro/`。
