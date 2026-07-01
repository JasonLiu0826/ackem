# Ackem Codebase & Build Artifact Paths

> **Language:** English · [中文](./CODEBASE-PATHS.zh.md)

> **Product version:** Ackem **v1.0.0**  
> **Updated:** 2026-06-30  
> **Repository:** [GitHub](https://github.com/JasonLiu0826/Ackem) · [Gitee](https://gitee.com/jason_2005/ackem)

This document explains **what is in the Git repository**, **where local build outputs go**, and **what the green (portable) release contains**.  
All paths are **relative to the corresponding root** — independent of machine, drive letter, or clone folder name.

---

## 1. Two locations — do not confuse them

| Role | Root | Typical relative paths | Purpose |
|------|------|------------------------|---------|
| **A. Source repository** | After `git clone` | `./src/`, `./docs/`, `./package.json` | Development, `git push`, reading docs |
| **B. Windows green release** | Built or extracted release folder | `./Ackem.exe`, `./data/` | End users double-click to run; **no** TypeScript source |

**From source to green release:**

```bash
npm install
npm run dist:green
# → dist/release/Ackem-1.0.0-win-x64/
```

**From Release download:** extract `Ackem-v1.0.0-win-x64.zip` — no need to clone the repo.

---

## 2. Source repository tree (role A)

Paths are relative to the **repository root** (directory containing `package.json`):

```
./                          ← repo root (folder name after clone is arbitrary)
├── src/                    ← main + renderer source
├── docs/                   ← public docs (architecture, privacy, distribution, …)
├── scripts/                ← build & utility scripts
├── resources/              ← icons, embedding models, …
├── voice-service/          ← optional TTS service (Python)
├── package.json
├── electron-builder.yml
├── out/                    ← npm run build output (do not commit)
├── node_modules/           ← dependencies (do not commit)
└── dist/                   ← npm run dist:green output (do not commit)
    └── release/
        └── Ackem-1.0.0-win-x64/   ← role B: green release
```

> **Version naming:** the release folder may be named `Ackem-1.0.0-win-x64` (electron-builder build id). The **public product version is v1.0.0**. Git tags and Releases use **v1.0.0**.

---

## 3. Key source directories (role A)

| Path (relative to repo root) | Contents |
|------------------------------|----------|
| `src/main/engine/` | Brain + heart core: `orchestrator.ts`, `interpreter.ts`, `relationship.ts`, … |
| `src/main/memory/` | L4 memory, embedding, import |
| `src/main/prompt/` | Mouth system prompts |
| `src/main/extensions/` | Extension system: coordinator, dispatch, OpenForU |
| `src/main/ipc/` | Renderer-facing API |
| `src/renderer/` | React UI |
| `src/shared/` | Shared types & feature flags |
| `electron-builder.yml` | Windows packaging config |
| `voice-service/` | Optional TTS (GPT-SoVITS, etc.) |

Build: `npm run build` → `out/` (packaged into `app.asar`).

---

## 4. Green release layout (role B)

Paths are relative to **`dist/release/Ackem-1.0.0-win-x64/`** (or the same layout after extracting the Release zip):

| Path | Contents |
|------|----------|
| `Ackem.exe` | Main executable |
| `resources/app.asar` | Compiled JS (**not** TypeScript source) |
| `resources/docs/` | Bundled doc copy |
| `resources/models/` | Embedding models (if shipped) |
| `resources/voice-service/` | Voice runtime |
| `data/` | **User data** (created on first run; never share private data in zips) |
| `docs/` | Doc copy shipped with the release |
| `LICENSE.txt` | AGPL summary (if present) |

User `data/` is initialized by `src/main/layout.ts` → `ensureDataLayout()`. See [memory-format.md](./memory-format.md).

---

## 5. `dist/` directory (build artifacts — do not push to Git)

| Path (relative to repo root) | Contents |
|------------------------------|----------|
| `dist/release/` | Public green release (source of role B) |
| `dist/fresh-build/` | electron-builder intermediate output |
| `dist/LICENSE.txt`, etc. | License template copies |

**.gitignore** should exclude: `dist/`, `node_modules/`, `out/`, `data/`, `.env`.

Large green releases (~GB) are published via **[GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases)** / **[Gitee Releases](https://gitee.com/jason_2005/ackem/releases)**, not Git history.

---

## 6. Where to read documentation

| Reader | Entry |
|--------|-------|
| GitHub / Gitee visitors | Repo root [README.md](../README.md) |
| Developer architecture | [docs/developer/architecture/README.md](./developer/architecture/README.md) |
| Extension protocol | [docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.md) |
| Doc map (maintainers) | [docs/OPEN-SOURCE-DOC-MAP.md](./OPEN-SOURCE-DOC-MAP.md) |
| Green release users (offline) | `docs/README.md` inside the release folder |
| Legal | Repo root `LICENSE`, `CLA.md` |

---

## 7. Version fields

| Field | v1.0.0 value |
|-------|--------------|
| Product / Git tag | `v1.0.0` |
| `manifest.engineVersion` (extensions) | `>=1.0.0 <2.0.0` (recommended for new extensions) |
| Extension API `engineApiVersion` | `^1.0.0` |
| electron-builder folder name | May remain `Ackem-1.0.0-win-x64` (build config) |

*Path guide · Ackem v1.0.0*
