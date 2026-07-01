# 问候世界（Hello World uskill）

最小可运行 **uskill 例题**，演示与官方 Skill 相同的 **Dispatch 调度链**。

## 三层分工中的位置

1. **CTX**：提供时段/场景（dispatch 的 `active_hours` 预筛）
2. **Dispatch + JP**：`routeDispatch` 匹配 keywords → `filterDispatchedCatalogByProfile` 过滤用户偏好
3. **Skill 执行**：`executeDispatchedExtension` → `contextInjection` 注入 LLM

## 文件

- `manifest.json` — id、keywords、**dispatch**（进 catalog 的关键）
- `skill.json` — `contextInjection` 控制 Ackem 怎么热情回应

## 部署

```text
复制本目录 → data/openforu/uskills/hello-world/
改 manifest.id 为 u/hello-world@1.0.0（或新版本）
扩展中心 → 自创 Skill → 启用
对 Ackem 说「你好」
```

## 工作原理

1. 用户输入含 keywords
2. `collectDispatchCandidates` + LLM 精判 → `auto_invoke`
3. `uskillRuntime.buildUskillContextInjection` 取 injection
4. 注入主聊天 LLM，伴侣用更热情语气回复

## 下一步

- 用 Plan 创建更复杂 Skill（见 `data/openforu/uskills/pomodoro/`）
- 阅读 [`../../PROTOCOL.md`](../../PROTOCOL.md)
