# Memory, personality, emotion and time

[中文](companion-engines.zh.md) · [Documentation](README.en.md)

These systems maintain companion continuity: memory supplies retrievable facts and action evidence, personality and emotion shape relationship state and expression, and time interprets intervals, dates and rhythm. They supply context to conversation and coordination; execution authority and acceptance belong to [tasks](architecture.md#tasks).

## Memory

```mermaid
flowchart TB
    accTitle: Companion Understanding And Memory Flow
    accDescr: Event interpretation, companion hints and retrieved memories contribute different context to the response.

    input_text["User message"]
    event_interpreter["L0 event interpretation<br/>Rules and semantic fallback"]
    companion_hints["Companion hints<br/>DND · memory intent · verbosity"]
    memory_retrieval["L4 memory retrieval<br/>Recall · rank · trim"]
    relationship_emotion["Relationship and emotion"]
    prompt_context["Reply context<br/>Event · psyche · Tier B"]

    input_text --> event_interpreter
    input_text --> companion_hints
    input_text --> memory_retrieval
    event_interpreter --> relationship_emotion
    relationship_emotion --> prompt_context
    companion_hints --> prompt_context
    memory_retrieval --> prompt_context

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    classDef success fill:#dcfce7,stroke:#16a34a,stroke-width:1.6px,color:#14532d
    class input_text neutral
    class event_interpreter,companion_hints,relationship_emotion primary
    class memory_retrieval accent
    class prompt_context success
```

### Retrieval, recording and control

[engine/orchestrator.ts](../src/main/engine/orchestrator.ts) prepares psyche and reply context through interpretation and retrieval. Companion rules in [interpreter.ts](../src/main/engine/interpreter.ts) differ from global semantic routing. A rule path without a model call does not establish a model-free application.

[factStore.ts](../src/main/memory/factStore.ts), [retriever.ts](../src/main/memory/retriever.ts) and [ingest.ts](../src/main/memory/ingest.ts) implement facts, recall and ingestion. Conversation injects selected relevant fragments rather than the entire fact store. Stable identity / Canon, Tier B and recent history have distinct roles. Policy, budgets and privacy levels constrain injection.

[MemorySystem](../src/main/memory/memorySystem.ts) combines chat and actions through [composeMemorySystem.ts](../src/main/memory/adapters/composeMemorySystem.ts):

| Interface | Purpose |
|---|---|
| `record` | Record chat, routing, plans and execution-receipt events |
| `recall` | Retrieve related events and facts |
| `control` | Correction, muting, forgetting, deletion and related controls |
| `recover` | Recover pending state from records and runtime snapshots |

The [action ledger](../src/main/memory/actions/actionRepository.ts) retains execution evidence. User statements, model inferences, plans and actual receipts have different evidentiary value. Recalling a discussed operation does not establish execution. Goal revisions and publication fences prevent old results from replacing current task state; see architecture for control semantics.

### Indexes and recovery

Retrieval can combine full-text / keywords, vectors, associations and temporal signals depending on the query and runtime state. [Embeddings](modules.md#embedding) are infrastructure rather than execution authority.

Rebuild derived indexes through supported application entry points. Rebuilding does not erase facts, recreate tasks or perform schema migrations. Do not delete tables while running or treat databases and artifacts as caches. Agent file processing and long-term memory ingestion serve different purposes; not every task resource needs memory import first.

Performance depends on fact count, document size, hardware, model and cold / warm startup. Record actual scale and latency rather than retaining old fixed-millisecond promises. Data locations and backup procedures live in the [user guide](usage.md#data-and-privacy).

## Personality and emotion

```mermaid
flowchart TB
    accTitle: Companion State And Expression Layers
    accDescr: Interpreted events update relationship and emotion. Psyche and auxiliary continuity modules shape expression.

    interpreted_event["Interpreted event"]
    relationship_state["L1 · Relationship<br/>Stage · trust · rifts"]
    emotion_state["L2 · Emotion<br/>aff · sec · aro · dom"]
    psyche_context["L3 · Psyche<br/>Silence · barriers · intensity"]
    continuity_modules["Continuity modules<br/>Emergence · rhythm · reunion"]
    expression["Psyche block and expression hints"]

    interpreted_event --> relationship_state
    relationship_state --> emotion_state
    emotion_state --> psyche_context
    continuity_modules --> psyche_context
    psyche_context --> expression

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    classDef success fill:#dcfce7,stroke:#16a34a,stroke-width:1.6px,color:#14532d
    class interpreted_event,continuity_modules neutral
    class relationship_state,emotion_state primary
    class psyche_context accent
    class expression success
```

[relationship.ts](../src/main/engine/relationship.ts) updates relationship state and modulation. [emotion.ts](../src/main/engine/emotion.ts) combines events, existing state and memory echoes. [psyche.ts](../src/main/engine/psyche.ts) turns state into expressive hints.

[personalityPresets.ts](../src/main/personalityPresets.ts) contains presets; [personalityVoice.ts](../src/main/personalityVoice.ts) provides expression helpers. [state-persistence.ts](../src/main/engine/state-persistence.ts) persists state with orchestration. Source defines curves, thresholds, rhythm gates and activation; old formulas do not establish current behavior.

Personality and emotion shape tone, companion policy and psyche context, not evidence that files changed, commands succeeded or tasks passed acceptance. Across channels, check identity and session scope rather than assuming shared personality means identical state, execution and permissions.

Freya persona and corpus remain under [freya/](freya/README.md) as character material, separate from current execution architecture.

## Time

```mermaid
flowchart TB
    accTitle: Companion Time Awareness Context Flow
    accDescr: Clock and semantic time signals affect retrieval, emotion and special-date hints before psyche assembly.

    user_message["User message"]
    prepare_time["Prepare temporal context<br/>Clock · gap · semantic signals"]
    temporal_recall["Recall modulation<br/>Temporal boosts and anchors"]
    emotion_time["Emotion modulation<br/>Weekdays · holidays · reunion"]
    special_dates["Special dates and reflection"]
    psyche_context["Psyche and prompt hints"]

    user_message --> prepare_time
    prepare_time --> temporal_recall
    prepare_time --> emotion_time
    prepare_time --> special_dates
    temporal_recall --> psyche_context
    emotion_time --> psyche_context
    special_dates --> psyche_context

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    class user_message neutral
    class prepare_time,temporal_recall,emotion_time,special_dates primary
    class psyche_context accent
```

| Implementation | Responsibility |
|---|---|
| [clock.ts](../src/main/memory/temporal/clock.ts), [timezonePolicy.ts](../src/main/memory/temporal/timezonePolicy.ts) | Clock and timezone |
| [temporalParser.ts](../src/main/memory/temporal/temporalParser.ts) | Conversational dates, ranges and time expressions |
| [temporalContextModulator.ts](../src/main/memory/temporalContextModulator.ts) | Temporal modulation of recall and context |
| [specialDateDetector.ts](../src/main/engine/temporalAwareness/specialDateDetector.ts) | Birthday, anniversary and related hints |
| [temporalProactiveTrigger.ts](../src/main/engine/temporalAwareness/temporalProactiveTrigger.ts) | Temporal signals for companion policies |

Temporal anchors inform retrieval. Dates, relationship duration and reunion intervals may affect emotion, psyche and expression. Proactive output remains policy-gated. Check timezone, parsing window and the actual clock for ranges such as today, tomorrow and last week.

Companion time hints, [long-term goals](../src/main/tasks/longTerm.ts) and kernel scheduling tools have separate lifecycles. Mentioning a time does not authorize a background task or platform publication. Continuing execution still needs the relevant task, authorization and receipts.
