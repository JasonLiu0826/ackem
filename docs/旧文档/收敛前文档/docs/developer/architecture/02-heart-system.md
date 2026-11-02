> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Personality, relationships and emotion

[中文](02-heart-system.zh.md) · [Architecture index](README.md)

This layer maintains companion relationships and expressive state, supplying personality, emotion and rhythm hints for replies. File operations, commands and task acceptance are handled by the work / AckemCode path.

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

## Main implementation

| Module | Entry point | Responsibility |
|---|---|---|
| Relationship state | [engine/relationship.ts](../../../../../../src/main/engine/relationship.ts) | Update relationships and modulation from interactions and existing state |
| Emotion state | [engine/emotion.ts](../../../../../../src/main/engine/emotion.ts) | Update emotion from events and memory echoes |
| Psyche context | [engine/psyche.ts](../../../../../../src/main/engine/psyche.ts) | Turn state into expressive hints for prompts |
| Presets and expression | [personalityPresets.ts](../../../../../../src/main/personalityPresets.ts) | Personality presets; expression helpers live in personalityVoice.ts |
| Orchestration and persistence | [engine/orchestrator.ts](../../../../../../src/main/engine/orchestrator.ts) | Prepare next-state drafts and persist through state-persistence.ts |

## Boundaries to preserve

- Personality and emotion affect expression; they do not establish task completion. Use task records and kernel receipts for execution state.
- Relationship updates, emotion and proactive policies contribute to the companion experience. Source code defines parameters, gates and activation.
- Cross-channel state depends on user identity and session scope. Check how callers select the user and session when reading state logic.

[Cross-channel conversation](../../cross-channel-conversation.md) · [Perception layer](../../perception-layer.md)

[Archived detailed chapter](../../../../公开文档/docs/developer/architecture/02-heart-system.md) is retained for historical reference. Use this chapter, the routing guide and actual source for current responsibilities.
