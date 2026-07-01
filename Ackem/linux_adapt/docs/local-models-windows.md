# Local Models on Windows

> **Language:** English · [中文](./local-models-windows.zh.md)

> **Product**: Ackem v1.0.0  
> **Applies to**: Users who want to run LLM inference locally instead of using a cloud API.

---

## 1. Overview

Ackem uses **two kinds** of models:

| Model | Purpose | Where it runs | User configurable? |
|-------|---------|---------------|-------------------|
| **LLM** | Conversation, memory extraction, diary generation | Your configured endpoint (cloud or local) | Yes — **Settings → Model & API** |
| **Embedding** | Semantic search, intent classification | **Local ONNX** (bundled or downloaded) | No — automatic; see note below |

The **LLM** is BYOK (Bring Your Own Key/Model). Ackem does not bundle any LLM.

The **embedding model** (bge-small-zh/en) is bundled with the application or auto-downloaded on first launch. It runs locally via ONNX Runtime.

---

## 2. Local LLM Backends

### Ollama

1. Download & install from [ollama.com](https://ollama.com)
2. Pull a model: `ollama pull qwen2.5:7b` (or any OpenAI-compatible model)
3. Ensure Ollama is running (system tray icon)
4. In Ackem **Settings → Model & API**:

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:11434/v1` |
| API Key | Leave empty (or any placeholder if required) |
| Model ID | `qwen2.5:7b` (or your pulled model name) |

### LM Studio

1. Download & install from [lmstudio.ai](https://lmstudio.ai)
2. Load a model in LM Studio
3. Start the local inference server (click "Start Server")
4. In Ackem **Settings → Model & API**:

| Field | Value |
|-------|-------|
| Base URL | `http://localhost:1234/v1` |
| API Key | Leave empty |
| Model ID | The model name shown in LM Studio |

### Other OpenAI-Compatible Backends

Any server exposing an OpenAI-compatible `/v1/chat/completions` endpoint works:

| Backend | Typical Base URL | Notes |
|---------|-----------------|-------|
| Ollama | `http://localhost:11434/v1` | Free, wide model support |
| LM Studio | `http://localhost:1234/v1` | GUI, easy model browsing |
| Text Generation WebUI (ooba) | `http://localhost:5000/v1` | Requires `--api` flag |
| vLLM | `http://localhost:8000/v1` | Production-grade, GPU recommended |
| LocalAI | `http://localhost:8080/v1` | Docker or native |

---

## 3. Firewall Notes

- All local inference servers listen on `localhost` (127.0.0.1) by default — no firewall configuration needed
- If you use a remote machine on your LAN, replace `localhost` with the machine's LAN IP and ensure the port is reachable
- Ackem never sends your data outside the configured Base URL

---

## 4. Embedding Model (Automatic)

Ackem bundles a small **bge-small** embedding model (Chinese + English variants) for local semantic search:

- Runs via **ONNX Runtime** (`onnxruntime-node`)
- Extracted to `data/models/` on first launch
- ~30 MB download, ~100 MB extracted
- If ONNX Runtime is unavailable or model loading fails, Ackem **gracefully degrades** to TF-IDF keyword search — chat continues without interruption

You can check embedding status in **Settings → System**: a "degraded" indicator shows if vector search is unavailable.

---

## 5. Performance Expectations

| Hardware | LLM (7B Q4) | Embedding |
|----------|-------------|-----------|
| GPU 6GB+ VRAM | 20–40 tok/s | Instant |
| GPU 4GB VRAM | 10–20 tok/s | Instant |
| CPU only, modern | 2–5 tok/s | 10–50ms per query |
| CPU only, older | 1–3 tok/s | 50–200ms per query |

Embedding inference is fast even on CPU (bge-small is ~30MB).

---

## 7. Related Documentation

- [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) — How embedding is used in retrieval
- [docs/developer/architecture/04-neural-system.md](./developer/architecture/04-neural-system.md) — Neural system architecture
- [memory-format.md](./memory-format.md) — Where models are cached (`data/models/`)

*Local Models on Windows · Ackem v1.0.0 · 2026-06*
