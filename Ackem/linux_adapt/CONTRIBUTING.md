# Contributing Guide

> **Language:** English · [中文](./CONTRIBUTING.zh.md)

Welcome to Ackem! This guide covers development setup, build, testing, and code conventions.

---

## Welcome contributions

- Bug fixes and regression tests
- Documentation (README, architecture, memory-format, extension protocol)
- Official extensions: validate locally with OpenForU `u/`, then PR to built-in `ackem/`
- Internationalization (i18n) and accessibility improvements
- Performance and security fixes

## Not accepted (for now)

- Large architectural rewrites not discussed in an Issue
- PRs containing API keys, `.env`, or private `data/`
- PRs that try to enable the closed `community/` marketplace pipeline (see extension protocol for v1.0.0 policy)

---

## 1. Development requirements

| Tool | Version | Notes |
|------|----------|------|
| **Node.js** | >= 20.x | v22 LTS recommended |
| **npm** | >= 10.x | Bundled with Node.js |
| **Git** | >= 2.40 | Version control |
| **OS** | Windows 10+ | Desktop support is Windows-only for now |

> Ackem is currently a native Windows app; macOS/Linux builds are not verified.

### Optional dependencies

| Tool | Purpose | Install |
|------|------|----------|
| **ONNX Runtime** | Embedding inference | `npm install onnxruntime-node` |
| **Python 3.10+** | Voice service (TTS/STT) | System install; configure path in Settings |
| **Ollama / LM Studio** | Local LLM inference | External install |

---

## 2. Development setup

### Clone and install

```bash
git clone https://github.com/JasonLiu0826/Ackem.git
cd Ackem
npm ci
```

### Configure LLM

Ackem requires your own LLM API key. Configure in Settings or edit `data/ackem-app-settings.json`:

```json
{
  "openaiBaseUrl": "http://localhost:11434/v1",
  "openaiKey": "ollama",
  "openaiModel": "qwen2.5:7b",
  "embeddingBaseUrl": "http://localhost:11434/v1",
  "embeddingApiKey": "ollama",
  "embeddingModel": "bge-m3"
}
```

### Start dev mode

```bash
npm run dev
```

This will:
1. Start electron-vite dev server (main + renderer + preload)
2. Open an Electron window automatically
3. Hot reload on file changes

First launch creates the `data/` directory and initializes SQLite.

> The renderer depends on preload-injected `window.ackem`; it must run in Electron, not a standalone browser.

---

## 3. Project structure

```
ackem/
├── src/
│   ├── main/              # Main process (Node.js)
│   │   ├── index.ts       #   Entry: window + IPC registration
│   │   ├── engine/        #   Brain + heart + time systems
│   │   ├── memory/        #   L4 memory system
│   │   ├── prompt/        #   Mouth system (prompt templates)
│   │   ├── extensions/    #   Extension system
│   │   ├── db/            #   Data layer (SQLite + repositories)
│   │   ├── ipc/           #   IPC handler implementations
│   │   ├── companion/     #   Companion mode
│   │   ├── canon/         #   Persona system
│   │   ├── embedding/     #   Embedding readiness management
│   │   └── context.ts     #   Runtime context assembly
│   ├── renderer/          # Renderer (React)
│   ├── preload/           # Preload bridge
│   └── shared/            # Shared types
├── data/                  # Runtime data (gitignored)
├── dist/                  # Build output (gitignored)
├── release/               # Package output
├── resources/             # App assets (icons, models)
├── docs/                  # Documentation
└── package.json           # Dependencies and scripts
```

Full directory map: [docs/developer/architecture/00-overall-system.md](./docs/developer/architecture/00-overall-system.md) · Chinese: [00-overall-system.zh.md](./docs/developer/architecture/00-overall-system.zh.md)

---

## 4. Development workflow

### Main process (engine / data / IPC)

Source: `src/main/{engine,memory,db,ipc,...}`

- Restart the Electron window after engine changes
- Use `logger.ts` for structured logs
- Use `engine/tracer.ts` for per-turn decision tracing

### Renderer (UI)

Source: `src/renderer/`

- Renderer hot reload (HMR)
- Call main process via `window.ackem.*`

### Extension development

- [Extension protocol](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md) · [中文](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md)
- Skill: implement `ExtensionSkill` under `extensions/skills/`
- Plugin: implement `ExtensionPlugin`; UI via Surface windows
- OpenForU: user extensions under `data/openforu/` with `u/` namespace; PR to built-ins when stable

---

## 5. Build

### Dev build

```bash
npm run build
```

Compiles main + renderer + preload to `dist/`.

### Production package

```bash
npm run build:win
```

Uses electron-builder + NSIS for a Windows installer. Output: `release/Ackem-{version}-win-x64/`

### Build notes

| Issue | Fix |
|------|------|
| Out of memory | `NODE_OPTIONS=--max-old-space-size=8192` |
| `better-sqlite3` native module | electron-vite handles rebuild |
| `onnxruntime-node` optional | Missing is OK; embedding degrades |
| AV false positives | Portable build avoids some NSIS flags |

---

## 6. Testing

| Command | Purpose |
|------|------|
| `npm test` | Main-process unit tests (LLM mocked, offline) |
| `npm run test:renderer` | Renderer critical paths |
| `npm run typecheck` | TypeScript type check |
| `npm run lint` | ESLint |

### Test strategy

| Layer | Method | Coverage |
|----|------|----------|
| Engine core | Unit tests (Vitest) | L0/L1/L2 logic, parameter math |
| Memory | Unit tests | Retrieval scoring, decay, merge/dedup |
| Data layer | Integration (in-memory SQLite) | Repository CRUD, transactions, migrations |
| Extensions | Integration (mock IPC) | Protocol validation, snapshot build |

Live LLM E2E requires an API key; not mandatory for every PR.

---

## 7. Code conventions

### TypeScript

- Strict mode: `strict: true`, `noUncheckedIndexedAccess: true`
- No `any`; prefer `unknown`
- No `require()`; use ESM `import`
- Filenames: lowercase camelCase

### Naming

| Kind | Style | Example |
|------|------|------|
| Files/dirs | lowercase camelCase | `emotion.ts`, `factStore.ts` |
| Functions | lowercase camelCase | `emotionStep()`, `getDatabase()` |
| Types/interfaces | PascalCase | `FullState`, `MemoryFact` |
| Constants | UPPER_SNAKE | `TIER_B_CHAR_BUDGET` |
| Repositories | Free functions | `loadFactsFromDb()`, `insertFact()` |

### Principles

- **No classes:** prefer module-level free functions and plain data interfaces
- **No base classes/inheritance:** composition over inheritance
- **Side-effect functions:** `dataRoot` as first parameter
- **Comments:** only when WHY is non-obvious
- **Error handling:** validate only at system boundaries
- **Small PRs, one concern per PR**

### Commit messages

```
<type>: <short description>

<optional: details>
```

Types: `feat:` / `fix:` / `docs:` / `refactor:` / `perf:` / `test:` / `chore:`

---

## 8. PR workflow

1. Fork (or open a branch as collaborator)
2. Branch from `main`: `fix/...`, `docs/...`, `feat/...`
3. Ensure `npm test` passes
4. Open PR to `main` with motivation, scope, and verification steps
5. Agree to [CLA.md](./CLA.md) before merge

### Review checklist

| Check | Notes |
|--------|------|
| Type safety | No `any`, no type-assertion bypasses |
| Error handling | Validation at boundaries; no redundant try/catch internally |
| Performance | No blocking on hot paths; SQLite queries use transactions |
| Compatibility | Schema changes must use migration versions (V11+) |
| Docs | Architecture changes update `docs/developer/architecture/` |

---

## 9. License

Merged code is released under **AGPL-3.0**; you also grant the maintainer multi-license rights described in the CLA.

---

## Contact

- Security: [SECURITY.md](./SECURITY.md)
- General discussion: GitHub Issues / Discussions

---

## Related resources

| Resource | Link |
|------|------|
| System architecture | [docs/developer/architecture/](./docs/developer/architecture/) |
| Extension protocol | [docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md) |
| Data directory format | [docs/memory-format.md](./docs/memory-format.md) |
| AI retrieval policy | [docs/ai-context-and-retrieval-policy.md](./docs/ai-context-and-retrieval-policy.md) |

---

*Ackem v1.0.0 · Contributing Guide*
