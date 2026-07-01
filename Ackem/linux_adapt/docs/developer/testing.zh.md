# 测试指南 · Testing Guide

> **语言：** 中文 · [English](./testing.md)

> **读者**：PR 作者、贡献者、维护者  
> **测试框架**：Vitest  
> **代码版本**：v1.0.0

---

## 1. 快速命令

| 命令 | 用途 | 预计耗时 |
|------|------|----------|
| `npm test` | 主进程单元测试 | ~30s |
| `npm run test:renderer` | 渲染进程测试 | ~30s |
| `npm run typecheck` | TypeScript 类型检查 | ~20s |
| `npm test -- --run` | 单次运行（非 watch） | ~30s |
| `npm test -- --coverage` | 带覆盖率报告 | ~45s |

---

## 2. 测试策略

```
┌──────────────────────────────────────────────────┐
│  引擎核心 (engine/)       单元测试 — 高频         │
│  L0 interpreter、L2 emotion、L1 relationship      │
│  参数计算、reunion、psyche 等纯函数逻辑            │
├──────────────────────────────────────────────────┤
│  记忆系统 (memory/)       单元测试 — 高频         │
│  检索评分、衰减计算、合并去重、FTS 查询            │
├──────────────────────────────────────────────────┤
│  数据层 (db/)             集成测试 — 中频         │
│  Repository CRUD、事务、迁移（内存 SQLite）        │
├──────────────────────────────────────────────────┤
│  扩展系统 (extensions/)   集成测试 — 中频         │
│  协议验证、snapshot 构建、Dispatch 路由            │
├──────────────────────────────────────────────────┤
│  渲染进程 (renderer/)     组件测试 — 低频         │
│  关键 UI 路径（当前覆盖较少）                       │
└──────────────────────────────────────────────────┘
```

### 各层测试要求

| 层 | 测试方式 | PR 最低要求 |
|----|----------|-------------|
| 引擎核心 | Vitest 单元测试 | 新逻辑必有对应测试 |
| 记忆系统 | Vitest 单元测试 | 修改检索/衰减逻辑必有测试 |
| 数据层 | Vitest + better-sqlite3 内存 | schema 变更必有迁移测试 |
| 扩展 | Vitest + mock IPC | 协议变更必有验证测试 |
| UI | 暂缺 | 手动验证关键路径 |

---

## 3. 编写测试

### 位置

测试文件与源码同目录，使用 `.test.ts` 后缀：

```
src/main/engine/
├── emotion.ts
├── emotion.test.ts        ← 同目录测试
├── relationship.ts
└── relationship.test.ts   ← 同目录测试
```

### 示例

```typescript
// src/main/engine/emotion.test.ts
import { describe, it, expect } from 'vitest'
import { emotionStep } from './emotion'
import { EmotionState } from './types'

describe('emotionStep', () => {
  it('should decay toward baseline when no input', () => {
    const prev: EmotionState = {
      affective: 0.8,
      security: 0.5,
      arousal: 0.3,
      dominance: 0.6,
    }
    const result = emotionStep(prev, { inputValence: 0 })
    expect(result.affective).toBeLessThan(0.8)
    expect(result.affective).toBeGreaterThanOrEqual(0.4)
  })
})
```

### 数据层测试（内存 SQLite）

```typescript
// src/main/db/repos/memoryFacts.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { insertFact, loadFactsFromDb } from './memoryFacts'

describe('memoryFacts repo', () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(':memory:')
    // 运行迁移
  })

  it('should insert and retrieve a fact', () => {
    insertFact('test-root', { id: '1', summary: 'test', ... })
    const facts = loadFactsFromDb('test-root')
    expect(facts).toHaveLength(1)
  })
})
```

---

## 4. 测试最佳实践

| 原则 | 说明 |
|------|------|
| **纯函数优先** | 引擎核心逻辑应写成纯函数，方便测试 |
| **mock LLM** | LLM 调用在单元测试中全部 mock，不发起真实 HTTP 请求 |
| **内存数据库** | 数据层测试使用 `:memory:` SQLite，不依赖文件系统 |
| **dataRoot 隔离** | 每个测试用例使用独立 `dataRoot` 路径，避免状态污染 |
| **快照测试谨慎** | 仅在渲染进程 UI 组件使用，大 prompt 快照不适用 |
| **不要测框架** | 不测 Electron 或 React 框架行为，只测业务逻辑 |

---

## 5. CI 集成

推荐 CI 配置（GitHub Actions）：

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
```

---

## 6. 实机 E2E 测试

完整端到端测试需要 LLM API Key，**不强制 PR 作者运行**：

```bash
# 需在 data/ackem-app-settings.json 中配置 LLM
npm run test:e2e    # 若存在
```

维护者会在 Release 前进行以下实机检查：
1. 启动 → 配置 LLM → 发送消息 → 收到回复
2. 记忆检索（搜索已知事实是否在 tierB 中出现）
3. 扩展加载（Skill/Plugin 正确注册）
4. 绿色版解压即用冒烟测试

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [dev-setup.md](./dev-setup.md) | 开发环境搭建 |
| [release-checklist.md](./release-checklist.md) | 发布检查清单 |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | 贡献指南与 PR 流程 |

*Testing Guide · Ackem v1.0.0 · 2026-06*
