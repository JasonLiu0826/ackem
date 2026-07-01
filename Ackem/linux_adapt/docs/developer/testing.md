# Testing Guide

> **Language:** English · [中文](./testing.zh.md)

> **Audience:** PR authors, contributors, maintainers  
> **Test framework:** Vitest  
> **Code version:** v1.0.0

---

## 1. Quick Commands

| Command | Purpose | Typical duration |
|------|------|----------|
| `npm test` | Main-process unit tests | ~30s |
| `npm run test:renderer` | Renderer tests | ~30s |
| `npm run typecheck` | TypeScript type check | ~20s |
| `npm test -- --run` | Single run (non-watch) | ~30s |
| `npm test -- --coverage` | With coverage report | ~45s |

---

## 2. Testing Strategy

```
┌──────────────────────────────────────────────────┐
│  Engine core (engine/)       Unit tests — high    │
│  L0 interpreter, L2 emotion, L1 relationship      │
│  Parameter math, reunion, psyche — pure logic     │
├──────────────────────────────────────────────────┤
│  Memory system (memory/)     Unit tests — high    │
│  Retrieval scoring, decay, merge/dedup, FTS       │
├──────────────────────────────────────────────────┤
│  Data layer (db/)            Integration — medium │
│  Repository CRUD, transactions, migrations        │
│  (in-memory SQLite)                               │
├──────────────────────────────────────────────────┤
│  Extensions (extensions/)    Integration — medium │
│  Protocol validation, snapshot build, Dispatch      │
├──────────────────────────────────────────────────┤
│  Renderer (renderer/)        Component — low      │
│  Key UI paths (limited coverage today)            │
└──────────────────────────────────────────────────┘
```

### Requirements by layer

| Layer | Approach | Minimum for PRs |
|----|----------|-------------|
| Engine core | Vitest unit tests | New logic must have tests |
| Memory system | Vitest unit tests | Retrieval/decay changes need tests |
| Data layer | Vitest + better-sqlite3 in memory | Schema changes need migration tests |
| Extensions | Vitest + mock IPC | Protocol changes need validation tests |
| UI | Not yet automated | Manual verification of critical paths |

---

## 3. Writing Tests

### Location

Test files live next to source with a `.test.ts` suffix:

```
src/main/engine/
├── emotion.ts
├── emotion.test.ts        ← co-located test
├── relationship.ts
└── relationship.test.ts   ← co-located test
```

### Example

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

### Data layer tests (in-memory SQLite)

```typescript
// src/main/db/repos/memoryFacts.test.ts
import { describe, it, expect, beforeAll } from 'vitest'
import Database from 'better-sqlite3'
import { insertFact, loadFactsFromDb } from './memoryFacts'

describe('memoryFacts repo', () => {
  let db: Database.Database
  beforeAll(() => {
    db = new Database(':memory:')
    // run migrations
  })

  it('should insert and retrieve a fact', () => {
    insertFact('test-root', { id: '1', summary: 'test', ... })
    const facts = loadFactsFromDb('test-root')
    expect(facts).toHaveLength(1)
  })
})
```

---

## 4. Best Practices

| Principle | Notes |
|------|------|
| **Prefer pure functions** | Engine core logic should be pure functions for easy testing |
| **Mock LLM** | Mock all LLM calls in unit tests; no real HTTP |
| **In-memory database** | Data layer tests use `:memory:` SQLite, not the filesystem |
| **Isolate dataRoot** | Each test case uses its own `dataRoot` to avoid state leakage |
| **Snapshot tests sparingly** | Use only for renderer UI; large prompt snapshots are not suitable |
| **Don't test frameworks** | Test business logic, not Electron or React behavior |

---

## 5. CI Integration

Recommended GitHub Actions configuration:

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

## 6. Live E2E Testing

Full end-to-end tests require an LLM API key — **PR authors are not required to run them**:

```bash
# Configure LLM in data/ackem-app-settings.json first
npm run test:e2e    # if present
```

Maintainers run these checks before release:
1. Launch → configure LLM → send message → receive reply
2. Memory retrieval (known facts appear in tierB)
3. Extension loading (Skills/Plugins register correctly)
4. Portable build smoke test (extract and run)

---

## 7. Related Documentation

| Document | Content |
|------|------|
| [dev-setup.md](./dev-setup.md) | Development environment setup |
| [release-checklist.md](./release-checklist.md) | Release checklist |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Contribution guide and PR workflow |

*Testing Guide · Ackem v1.0.0 · 2026-06*
