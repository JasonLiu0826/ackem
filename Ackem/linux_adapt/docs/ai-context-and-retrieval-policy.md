# AI Context & Retrieval Policy

> **Language:** English · [中文](./ai-context-and-retrieval-policy.zh.md)

> **Product**: Ackem v1.0.0  
> **Core promise**: Memory is retrieved and injected — never bulk-dumped into the LLM context.

---

## 1. Design Principle

Ackem does **not** load your entire memory into the LLM prompt. Instead, it follows a **retrieval-augmented** approach:

1. On each conversation turn, the orchestrator selects only the most relevant memory fragments
2. These fragments are formatted into compact context blocks within the system prompt
3. The LLM sees a focused subset, not the full history

This keeps prompt costs predictable, protects privacy, and avoids overwhelming the model with irrelevant information.

---

## 2. Memory Tiers

| Tier | Content | Always injected? | Source |
|------|---------|------------------|--------|
| **Tier A** | Companion snapshot (self identity, current emotional state, relationship summary) | Yes | `companion/self.md`, orchestrator state |
| **Tier B** | Retrieved facts, episodic memories, knowledge graph associations | No — selected by relevance | `retriever.ts`, `factStore`, `vectorStore` |
| **Canon** | Creator identity, Ackem origin, unalterable personality seeds | Yes | `canon/ackemCanon.ts`, `creatorMemorySeed.ts` |

Tier A and Canon form the stable part of every system prompt. Tier B is dynamically assembled per turn.

---

## 3. Read Path (How Memory Enters the LLM)

```
User message
    │
    ▼
┌──────────────────────────────────────────────────┐
│ Orchestrator (Pre-LLM)                            │
│                                                    │
│  1. L0 interpreter → Event type                   │
│  2. L1 relationship update                        │
│  3. Trigger word matching                         │
│  4. Full-text search (FTS5)                       │
│  5. Semantic search (jaccard + tf-idf)            │
│  6. Embedding vector search (if ONNX available)   │
│  7. Association diffusion (knowledge graph)       │
│  8. Temporal anchor matching                      │
│                                                    │
│  → Merge, deduplicate, rank by relevance           │
│  → Build tierBBlock (character budget capped)      │
└──────────────────────────────────────────────────┘
    │
    ▼
┌──────────────────────────────────────────────────┐
│ context.ts                                        │
│                                                    │
│  · Tier A (companion snapshot)                    │
│  · Canon (creator & origin)                       │
│  · Tier B (retrieved memory)                      │
│  · psycheBlock (emotion/relationship state)       │
│  · Extension context injections                   │
│  · Conversation history (recent messages)          │
│                                                    │
│  → Assemble into system + messages → LLM          │
└──────────────────────────────────────────────────┘
```

### Retrieval Methods (in rough priority order)

| Method | When it runs | Depends on |
|--------|-------------|------------|
| Trigger word match | Always (synchronous) | FactStore trigger index |
| Full-text search (FTS5) | Always | SQLite FTS index |
| Semantic search | Always | `semanticSearch.ts` |
| Embedding vector search | When ONNX runtime available | `memory/embedding/onnxProvider.ts` |
| Association diffusion | When knowledge graph available | `associationColdStart.ts`, `knowledgeGraph.ts` |
| Temporal anchor | When temporal signal detected | `temporalAnchorPolicy.ts` |

### Budget & Capping

All Tier B content is subject to a **character budget** (`TIER_B_CHAR_BUDGET`). If the combined retrieved content exceeds this limit, content is truncated by relevance score:

```
TIER_B_CHAR_BUDGET  →  maximum characters for injected memory
MIN_CONFIDENCE      →  minimum confidence score for injection
```

---

## 4. Write Path (How Memory is Stored)

```
After LLM response
    │
    ▼
┌──────────────────────────────────────────────────┐
│ MemoryIngestPipeline.afterTurnAsync               │
│                                                    │
│  Phase 1 — Light extraction (synchronous)          │
│  · Capture emotional context                       │
│  · Extract simple rule-based facts                 │
│  · Write temporal anchors                          │
│  · Run auto-mirror & contradiction check           │
│                                                    │
│  Phase 2 — LLM extraction (async job)              │
│  · FactExtractor: domain/subject/summary           │
│  · EpisodeExtractor: narrative chunks              │
│  · TripleExtractor: knowledge graph edges          │
│  · Consolidator: merge dedup, decay, auto-retire   │
│                                                    │
│  Phase 3 — Persistence                             │
│  · Write to FactStore (facts.v2.json + SQLite)     │
│  · Write to EpisodicStore                          │
│  · Write to KnowledgeGraph                         │
│  · Update embedding cache                          │
└──────────────────────────────────────────────────┘
```

### Guardrails

- **Canon guard**: Facts contradicting the Ackem creator canon are rejected (`canonCreatorIngestGuard.ts`)
- **Privacy level**: Facts are tagged `normal` / `intimate` / `explicit`; explicit facts are only injected when adult mode is enabled
- **Auto-retire**: Low-confidence or obsolete facts are automatically retired after a decay period
- **User fact guard**: Certain fact types about the user are filtered by `userFactGuard.ts`

---

## 5. Graceful Degradation

Ackem's retrieval pipeline adapts when components are unavailable:

| Missing component | Behavior |
|-------------------|----------|
| ONNX runtime / embedding model | Falls back to FTS5 + semantic (TF-IDF) search only |
| Knowledge graph | Falls back to flat fact retrieval without association expansion |
| No memory at all | Companion operates on Tier A + Canon only |

When embedding is unavailable, a **degraded** indicator is shown in Settings. The user can still chat normally — retrieval will be less semantically precise but functional.

---

## 6. Privacy

- Memory data **never leaves your machine** except as part of the prompt sent to your configured LLM endpoint
- Ackem has **no default telemetry** — conversation content, memory, and usage patterns are not uploaded
- The LLM endpoint is entirely under your control: cloud API or local inference server
- Memory is stored in plain-text `.md`/`.json` files and SQLite — you can audit, backup, or delete everything via `data/`

---

## 7. Related Documentation

- [memory-format.md](./memory-format.md) — data directory layout
- [docs/developer/architecture/01-brain-system.md](./developer/architecture/01-brain-system.md) — Brain system (L4 memory)
- [docs/developer/architecture/04-neural-system.md](./developer/architecture/04-neural-system.md) — Neural system (embedding)
- [docs/developer/architecture/00-overall-system.md](./developer/architecture/00-overall-system.md) — Full conversation lifecycle

*AI Context & Retrieval Policy · Ackem v1.0.0 · 2026-06*
