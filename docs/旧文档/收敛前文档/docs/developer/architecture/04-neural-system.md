> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../../README.md)。

# Embeddings and semantic assistance

[中文](04-neural-system.zh.md) · [Architecture index](README.md)

Embeddings turn text into vectors for memory retrieval and companion semantic assistance. This is separate from model classification for chat / plugin / work; vector similarity does not grant execution authority or prove completion.

```mermaid
flowchart TB
    accTitle: Embedding Infrastructure And Consumers
    accDescr: Embedding providers produce vectors shared by interpretation, retrieval and semantic matching.

    user_text["User text"]
    embedding_provider[["Embedding provider<br/>Local / remote / noop"]]
    semantic_helpers["Semantic helpers<br/>Anchors · time · scoring"]
    event_interpreter["Companion interpretation"]
    memory_retrieval["Memory retrieval"]
    extension_matching["Extension semantic matching"]
    context["Selected context"]

    user_text --> embedding_provider
    embedding_provider --> semantic_helpers
    semantic_helpers --> event_interpreter
    semantic_helpers --> memory_retrieval
    semantic_helpers --> extension_matching
    event_interpreter --> context
    memory_retrieval --> context
    extension_matching --> context

    classDef neutral fill:#f3f4f6,stroke:#6b7280,stroke-width:1.4px,color:#1f2937
    classDef accent fill:#ede9fe,stroke:#7c3aed,stroke-width:1.6px,color:#3b0764
    classDef primary fill:#dbeafe,stroke:#2563eb,stroke-width:1.6px,color:#1e3a5f
    classDef success fill:#dcfce7,stroke:#16a34a,stroke-width:1.6px,color:#14532d
    class user_text neutral
    class embedding_provider accent
    class semantic_helpers,event_interpreter,memory_retrieval,extension_matching primary
    class context success
```

## Main implementation

| Module | Entry point | Responsibility |
|---|---|---|
| Provider interface | [memory/embedding/provider.ts](../../../../../../src/main/memory/embedding/provider.ts) | Define how vector generation services are used |
| Models and local inference | [memory/embedding/modelManager.ts](../../../../../../src/main/memory/embedding/modelManager.ts) | Manage models; ONNX execution lives in onnxProvider.ts |
| Startup preparation | [memory/embedding/bootstrapBundledModels.ts](../../../../../../src/main/memory/embedding/bootstrapBundledModels.ts) | Prepare bundled model resources |
| Readiness | [embedding/embeddingReadiness.ts](../../../../../../src/main/embedding/embeddingReadiness.ts) | Track semantic infrastructure readiness |
| Semantic fallback | [embedding/semanticFallback.ts](../../../../../../src/main/embedding/semanticFallback.ts) | Provide fallback behavior for semantic helper paths |
| Retrieval consumer | [memory/retriever.ts](../../../../../../src/main/memory/retriever.ts) | Combine retrieval signals into context |

## Boundaries to preserve

- Current configuration and code define providers, models, dimensions, budgets and availability. Missing embeddings may alter retrieval quality or its path.
- Diagnose cold start, model resources and index compatibility separately. Embedding readiness does not mean all agent tools are available.
- Model or index-format changes require checking existing vectors, rebuilding and fallback behavior; see the indexing guide.

[Indexing and scale](../../indexing-and-scale.md) · [Windows local models](../../local-models-windows.md)

[Archived detailed chapter](../../../../公开文档/docs/developer/architecture/04-neural-system.md) is retained for historical reference. Use this chapter, the routing guide and actual source for current responsibilities.
