# Task Frame（L0·TF 交付理解）

> **最后更新**：2026-05-24 凌晨  
> **权威文档**：[`docs/mainDocs/对话认知分层_5_28更新.md`](../../../../docs/mainDocs/对话认知分层_5_28更新.md)

本目录实现 **L0·TF**，与 **L0.5 工作意图**、**Extension Dispatch**、**CTX/JP** 正交。

## 职责边界

| 本模块 | 其它层 |
|--------|--------|
| 表格 / 列表 / 对比 | L0.5：是否 `web_search` / 知识卡 |
| 合并多次 `web_search` | Dispatch：哪个扩展执行 |
| `searchSynthesis` 格式分支 | L1–L3：伴侣口吻（不能否决结构） |
| | CTX/JP：扩展何时打扰 |

## 对外 API

```typescript
// 主进程
import {
  resolveUserTaskFrame,
  buildTaskFrameSystemHint,
  buildCardBodyFormatBlock,
  planWebSearchExecution,
  runWebSearchWithTaskFrame
} from '../taskFrame'

// 扩展 / 共享（仅类型与规则，无 LLM）
import {
  detectTaskFrameRules,
  type UserTaskFrame
} from '../../shared/taskFrame'
```

## 数据流

```
context:build → resolveUserTaskFrame → userTaskFrame + systemHint
chat:start    → parseUserTaskFrameFromBody → 合并搜 + synthesis 分支
```

## 测试

`npm test -- src/main/taskFrame/taskFrame.test.ts`

关联：`planDocument/intent.test.ts` · `searchQueryResolver.test.ts`
