# Ackem Seven Systems + Data Layer + IPC Architecture (Developer)

> **Language:** English · [中文](./README.zh.md)

> **Product version**: Ackem **v1.0.0**  
> **Audience**: Developers taking over the codebase, extension authors, architecture reviewers  
> **Source of truth**: `src/main/` is authoritative; if this document conflicts with the code, **the code wins**

---

## Architecture Philosophy

Ackem is not a "chat wrapper shell." It is a **stateful local AI companion** built around a core design principle:

**Cognition → Emotion → Expression → Semantics → Execution → Temporal awareness** — six layers working together, plus the data layer, IPC, and application shell.

Each layer solves an independent problem domain, with its own data model and runtime boundary:

```
User message
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│  ① Brain         Understand user intent, recall memories    │
│                    L0 interpreter + L4 memory retrieval       │
└────────────────────────┬────────────────────────────────────┘
                         │ Event + tierBBlock
┌────────────────────────┴────────────────────────────────────┐
│  ② Heart         Relationship state, emotion model,         │
│                    expression strategy                      │
│                    L1 relationship FSM + L2 4D emotion      │
│                    + L3 psyche block                        │
└────────────────────────┬────────────────────────────────────┘
                         │ psycheBlock + ExpressionHint
┌────────────────────────┴────────────────────────────────────┐
│  ③ Mouth         Assemble prompt, invoke LLM                │
│                    Six-layer system prompt + streaming call   │
└────────────────────────┬────────────────────────────────────┘
                         │ LLM response stream
                         ▼
                     ┌──────────┐
                     │  User UI │
                     └──────────┘

  ④ Neural   ──►  Embedding/vectors — semantic infra for Brain
  ⑤ Extension ─►  Skill/Plugin/OpenForU — external capabilities for Mouth
  ⑥ Overall  ──►  Electron shell + IPC + persistence
  ⑦ Time     ──►  Temporal awareness, rhythm curves, reunion impact, reflection

  — Data layer ──►  SQLite Repository, migrations, WAL
  — IPC API    ──►  window.ackem.* preload bridge
```

---

## Reading Order

| Order | Document | One-liner | Lines |
|-------|----------|-----------|-------|
| 1 | [Overall System](./00-overall-system.md) | Electron shell, process boundaries, full turn pipeline, project map | ~250 |
| 2 | [Brain System](./01-brain-system.md) | L0 intent understanding + L4 memory retrieval (no LLM calls) | ~250 |
| 3 | [Heart System](./02-heart-system.md) | L1 relationship FSM + L2 four-dimensional emotion + L3 expression state + emergence | ~280 |
| 4 | [Mouth System](./03-mouth-system.md) | Six-layer prompt assembly + LLM invocation + multi-task prompt system | ~230 |
| 5 | [Neural System](./04-neural-system.md) | ONNX embedding + provider fallback + vector retrieval | ~200 |
| 6 | [Extension System](./05-extension-system.md) | Skill/Plugin/Dispatch scheduling + OpenForU sandbox | ~280 |
| 7 | [Time System](./06-time-system.md) | Temporal awareness, daily rhythm curves, reunion impact, time reflections | ~200 |
| — | [Data Layer](./07-data-layer.md) | 18-table SQLite Schema V1–V10 + Repository pattern | ~250 |
| — | [IPC API](./08-ipc-api.md) | ~100+ `window.ackem.*` APIs + ~30 push events | ~150 |

**Related documents**:
- [Extension Interface Protocol](../DEVELOPER-EXTENSION-PROTOCOL.md)
- [AI Context & Retrieval Policy](../../ai-context-and-retrieval-policy.md)
- [Data Directory Format](../../memory-format.md)
- [Indexing & Scale](../../indexing-and-scale.md)

---

## L0–L4 Layers vs. Seven Systems

| Layer | Name | Owner | Core files |
|-------|------|-------|------------|
| L0 | Event interpretation | **Brain** | `engine/interpreter.ts` — keywords + rules, zero LLM |
| L0.5 | Intent routing | **Brain** + **Neural** | embedding semantic fallback + Dispatch routing |
| L1 | Relationship state | **Heart** | `engine/relationship.ts` — stage FSM + trust + rupture |
| L2 | Emotion model | **Heart** | `engine/emotion.ts` — four-dimensional recurrence + noise + modulation |
| L3 | Expression / psyche block | **Heart** | `engine/psyche.ts` — prompt psyche narrative |
| L4 | Memory | **Brain** | `memory/retriever.ts` + `ingest.ts` — multi-path recall + write |
| — | Prompt / LLM | **Mouth** | `prompt/` + `context.ts` — system prompt assembly |
| — | Embedding | **Neural** | `memory/embedding/` — ONNX inference + Provider abstraction |
| — | Extension execution | **Extension** | `extensions/coordinator.ts` — Dispatch + Skill/Plugin |
| — | Temporal awareness | **Time** | `temporalAwareness/` — holidays / time-of-day / rhythm / reunion / reflection |
| — | Data persistence | **Data layer** | `db/` — SQLite Repository, migrations, WAL management |
| — | IPC communication | **IPC** | `ipc/` — main process ↔ renderer bridge |

---

## Main Data Flow (One Conversation Turn)

```
User input
  │
  ▼
ipc/chat.ts ────────────────────────────────── IPC entry
  │
  ▼
extensions/dispatch/ ───────────────────────── Dispatch routing
  │  plan? auto_invoke? invoke_surface? chat?
  │
  ▼
orchestrator.runPreLlmTurn()
  │  ├─ L0  interpretInput()          → Event
  │  ├─ L0.5 interpretWithEmbedding()  → intent fallback
  │  ├─ L1  updateRelationship()      → trust / stage / atmosphere
  │  ├─ L2  emotionStep()             → four-dimensional emotion
  │  ├─ L3  buildPsycheBlock()        → psyche narrative block
  │  ├─ L4  retriever.retrieve()      → tierBBlock
  │  ├─     temporalAwareness/        → time / special days
  │  ├─     emergence/                → long-chat emergence
  │  └─     strategy/injectionPolicy  → slot competition
  │
  ▼
context.ts ─────────────────────────────── assemble system + messages
  │  Tier A + Tier B + Canon + psyche + extension inject + history
  │
  ▼
LLM streaming call ─────────────────────── stream to UI
  │
  ▼
MemoryIngestPipeline.afterTurnAsync() ──── fact extraction + persist
  │  state persistence state-persistence.ts
  │  extension afterAssistantMessage hook
  │
  ▼
Wait for next turn
```

---

## Design Highlights

| Design decision | Choice | Rationale |
|-----------------|--------|-----------|
| Process model | Electron main process + renderer process | Native desktop experience; direct access to filesystem and SQLite |
| Language | TypeScript end-to-end | Shared types across main/renderer; lower cognitive overhead |
| Persistence | SQLite + JSON + Markdown | SQLite for structured query performance; md/json for human auditability |
| Local ML | ONNX Runtime | Offline-capable, privacy-friendly; bge-small model ~30MB only |
| LLM interface | OpenAI-compatible (this one format only) | De facto standard; Ollama / LM Studio / cloud all supported |
| Extension interface | Protocol boundary + EngineSnapshot | Prevents extensions from breaking the engine core; keeps architecture clean |
| Memory strategy | Retrieve-then-inject | Does not stuff full history into the prompt; controls cost and privacy |

---

## Maintenance Notes

- **Pre-LLM pipeline changes**: start from `engine/orchestrator.ts`
- **Extension integration**: read `extensions/protocols.ts` + [05-extension-system.md](./05-extension-system.md)
- **Memory into the model**: read [04-neural-system.md](./04-neural-system.md) + [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md)
- **Emotion / relationship rules**: read `engine/ackemParams.ts` (single source for all parameters)

*Ackem Architecture · v1.0.0 · 2026-06*
