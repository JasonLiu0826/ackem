# Developer Setup

> **Language:** English · [中文](./dev-setup.zh.md)

> **Audience:** Developers running Ackem from source  
> **Code version:** v1.0.0  
> **Platform:** Windows 10/11 64-bit

---

## 1. Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Node.js** | >= 20.x | v22 LTS recommended — [download](https://nodejs.org/) |
| **npm** | >= 10.x | Bundled with Node.js |
| **Git** | >= 2.40 | [download](https://git-scm.com/) |
| **Windows** | 10+ 64-bit | Desktop support is Windows-only for now |

### Optional

| Tool | Purpose |
|------|---------|
| **Visual Studio Build Tools** | Optional — only if `better-sqlite3` native module build fails |
| **ONNX Runtime** | Embedding model inference via `npm i onnxruntime-node` |
| **Python 3.10+** | Voice service (TTS/STT); configure `voice-service/` path in Settings |
| **Ollama / LM Studio** | Local LLM inference (not required; cloud APIs work too) |

---

## 2. Quick Start

```bash
# Clone the repository
git clone https://github.com/JasonLiu0826/Ackem.git
cd Ackem

# Install dependencies
npm ci

# Start development mode
npm run dev
```

On first launch, the `data/` directory structure is created automatically and the SQLite database is initialized.

### Important notes

- The renderer depends on the preload-injected `window.ackem` API — **you must** run inside Electron
- **Do not** open the Vite URL (`http://localhost:5173`) directly in a browser — missing IPC bridge causes a blank screen
- During development, `data/` lives in the working directory and is separate from the portable `data/` next to the green-build exe

---

## 3. LLM Configuration

Ackem needs an LLM API to work properly. Configure it in **Settings → Model & API**:

| Field | Example (Ollama) | Example (OpenAI) |
|------|------------------|------------------|
| Base URL | `http://localhost:11434/v1` | `https://api.openai.com/v1` |
| API Key | `ollama` (placeholder) | `sk-...` |
| Model ID | `qwen2.5:7b` | `gpt-4o-mini` |

You can also edit `data/ackem-app-settings.json` directly:

```json
{
  "openaiBaseUrl": "http://localhost:11434/v1",
  "openaiKey": "ollama",
  "openaiModel": "qwen2.5:7b"
}
```

See [docs/local-models-windows.md](../local-models-windows.md) for detailed configuration.

---

## 4. Available Scripts

| Command | Purpose |
|------|------|
| `npm run dev` | Dev mode (electron-vite dev + hot reload) |
| `npm run dev:win` | Same as above with 8GB memory preset |
| `npm run build` | Compile to `out/` |
| `npm run preview` | Preview production build |
| `npm run typecheck` | TypeScript type check |
| `npm test` | Run tests |
| `npm run dist:green` | Package portable build to `dist/release/` |
| `npm run dist:setup` | Package NSIS installer |
| `npm run prepare:embedding-models` | Download/extract embedding models |
| `npm run sync:release-doc` | Sync docs to `dist/release/doc/` |

---

## 5. Development Directory Layout

```
ackem/
├── src/
│   ├── main/           # Main process (engine, memory, data, IPC)
│   ├── renderer/       # Renderer process (React UI)
│   └── preload/        # Electron preload bridge
├── data/               # Runtime data (gitignored)
├── dist/               # Build output (gitignored)
├── out/                # electron-vite compile output
├── docs/               # Documentation
└── resources/          # App assets
```

See [architecture/00-overall-system.md](./architecture/00-overall-system.md) for the full directory map.

---

## 6. Embedding Models

Ackem uses the **bge-small** model for local semantic search (via ONNX Runtime):

```bash
# Manually prepare embedding models (first dev run auto-extracts)
npm run prepare:embedding-models
```

- Models extract to `data/models/` (~100MB)
- Optional dependency `onnxruntime-node`; when missing, retrieval falls back to TF-IDF
- Check embedding status in **Settings → System**

---

## 7. Troubleshooting

### Out of memory during build

```bash
# Raise Node.js memory limit
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npm run build
```

### `better-sqlite3` build failure

electron-vite handles native module rebuilds automatically. If it still fails:
1. Install Visual Studio Build Tools (Windows)
2. Run `npm run postinstall` to trigger `electron-builder install-app-deps`

### `onnxruntime-node` install failure

This is optional and does not block startup. Embedding retrieval automatically degrades to TF-IDF. To install manually:

```bash
npm install onnxruntime-node
```

### Antivirus false positives

NSIS installers may be flagged by Windows Defender. Use the portable build (`dist:green`) instead, or submit a false-positive report to your AV vendor.

---

## 8. Package Management

| Dependency type | Notes |
|----------|------|
| `dependencies` | Runtime required (better-sqlite3, d3, zustand, ws, opencc, mineflayer, qrcode) |
| `optionalDependencies` | onnxruntime-node (load failure does not break core features) |
| `devDependencies` | Build/dev tools (electron, vite, typescript, vitest, tailwindcss) |

---

## 9. Related Documentation

| Document | Content |
|------|------|
| [architecture/00-overall-system.md](./architecture/00-overall-system.md) | Project structure overview |
| [testing.md](./testing.md) | Testing guide |
| [release-checklist.md](./release-checklist.md) | Release process |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | Contribution guide |
| [DEVELOPER-EXTENSION-PROTOCOL.md](./DEVELOPER-EXTENSION-PROTOCOL.md) | Extension development |

*Developer Setup · Ackem v1.0.0 · 2026-06*
