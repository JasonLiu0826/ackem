# 馃挮 Ackem

![Version](https://img.shields.io/badge/Version-1.0.0-orange?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge)
![Local First](https://img.shields.io/badge/Data-Local--First-2ea043?style=for-the-badge)
![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI--Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)
![Electron](https://img.shields.io/badge/Built_with-Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)

**Ackem** 路 **A**.C.K.E.M 鈥?**A**utonomous **C**ompanion **K**eeping **E**motional **M**emory  
*淇濇寔鎯呮劅璁板繂鐨勮嚜涓讳紮浼?

**Ackem v1.0.0** 鈥?A **local-first** AI companion for Windows. Bring your own LLM (cloud or local); Ackem handles chat, memory, emotion, relationship state, and desktop presence 鈥?**all on your hard drive**.

> **Source**: [GitHub](https://github.com/JasonLiu0826/Ackem) 路 [Gitee mirror](https://gitee.com/jason_2005/Ackem)  
> **Download**: [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) 路 [Gitee Releases](https://gitee.com/jason_2005/Ackem/releases)  
> **Build**: `npm run dist:green` 鈫?`dist/release/Ackem-1.0.0-win-x64/` 路 [Path map](./docs/CODEBASE-PATHS.md) 路 [Docs languages](./docs/I18N.md)  
> **Status:** Ackem is still in **active testing**. As a solo-maintained project, test coverage is limited 鈥?you may hit unexpected behavior or rough edges. Frequent crashes and severe lag are uncommon, but imperfections still happen. [Open an Issue](https://github.com/JasonLiu0826/Ackem/issues) if something feels off.

[涓枃鏂囨。](./README.zh.md) 路 [Privacy & data (EN)](./docs/privacy-and-data.md)

---

## At a glance

Ackem is **not** a web chat box 鈥?it is a Windows desktop app that stays with you: tray, optional desktop pet, structured memory, and a companion that remembers context over time.

| | |
|---|---|
| 馃挰 **Chat** | Any OpenAI-compatible API 鈥?DeepSeek, OpenAI, Ollama, LM Studio, etc. |
| 馃 **Memory** | Conversations become searchable memory; import `.txt` / `.md` as long-term context |
| 馃挒 **Companion** | Trust, mood, relationship stage, personality presets, diary, optional proactive messages |
| 馃敀 **Local-first** | Personal data lives in `./data/` next to the exe 鈥?**not** bundled in the release zip |

**You need:** Windows 10/11 64-bit 路 an LLM API key or local server 路 ~10鈥?0 s on first launch (embedding model extracts once). **No Node.js required** for the green release.

---

## Screenshots & demo

<details>
<summary><strong>馃摲 Screenshots</strong> (click to expand)</summary>

<p align="center">
  <img src="./docs/images/01-loading.png" alt="Loading screen" width="640" />
  <br /><em>Loading 鈥?first launch extracts the local embedding model; main UI opens when the bar completes</em>
</p>

<p align="center">
  <img src="./docs/images/02-home.png" alt="Home" width="640" />
  <br /><em>Home 鈥?chat, memory, games, extensions, settings; relationship & pet preview on the right</em>
</p>

<p align="center">
  <img src="./docs/images/03-memory-graph.jpg" alt="Memory visualization" width="640" />
  <br /><em>Memory 鈥?structured recall, timelines, and knowledge connections from your conversations</em>
</p>

<p align="center">
  <img src="./docs/images/03-settings.png" alt="Settings" width="640" />
  <br /><em>Settings 鈥?personality, voice, desktop pet, WeChat bridge, extensions, data</em>
</p>

<p align="center">
  <img src="./docs/images/04-model-api.png" alt="Model & API" width="640" />
  <br /><em>Model & API 鈥?Base URL, API Key, Model ID</em>
</p>

<p align="center">
  <img src="./docs/images/05-compliance.png" alt="Compliance" width="640" />
  <br /><em>Compliance 鈥?privacy, data handling, and adult-mode terms on first run</em>
</p>

</details>

<details>
<summary><strong>馃幀 Demo GIFs</strong> (click to expand)</summary>

<p align="center">
  <img src="./docs/images/01-download-open.gif" alt="Download and open" width="640" />
  <br /><em>Download zip 鈫?extract 鈫?launch Ackem.exe 鈫?wait for loading 鈫?main UI</em>
</p>

<p align="center">
  <img src="./docs/images/02-daily-chat.gif" alt="Daily chat" width="640" />
  <br /><em>Configure your model, then chat; replies use memory and relationship state</em>
</p>

</details>

---

## In depth

### What is Ackem?

Ackem is a **local-first** Windows desktop application: you configure your LLM endpoint, and Ackem orchestrates **conversation, memory, emotion & relationship state, and desktop companionship** while keeping data on **your machine**.

### What you can do

- **Chat like with a person** 鈥?OpenAI-compatible cloud or local Ollama / LM Studio; configure under **Settings 鈫?Model & API**.
- **Remember what you talk about** 鈥?structured memory, search, timelines, knowledge graph; **import** `.txt` / `.md` as long-term memory.
- **Continuous companionship** 鈥?trust, mood, relationship stage, personality presets, companion **diary**, optional proactive outreach.
- **Beyond the main window** 鈥?system tray; optional **desktop pet** (geometric orb + Live2D preview).
- **Optional capabilities** 鈥?voice STT/TTS, **WeChat** bridge (phone messages, brain on PC), **Extension Center**, experimental **Plan 路 OpenForU** workspace.
- **Game mode** 鈥?experimental; play supported games (e.g. Minecraft) with your companion when extensions allow.

### Where your data lives

Portable green release stores everything under **`data/`** next to `Ackem.exe`: chats, memories, diaries, API keys in settings. **The official zip does not include `data/`** 鈥?an empty folder is created on first run. No default telemetry to an Ackem server.

Backup, migration, deletion: [docs/memory-format.md](./docs/memory-format.md) 路 [docs/distribution-windows.md](./docs/distribution-windows.md)

### For developers

See **[Developers](#developers)** below, [architecture](#seven-system-architecture), and the [document index](#documentation).

---

## Quick Start (End Users)

For: **downloaded the official Release**, no Node.js needed.

### Privacy (please read)

| Official release **does not include** | After first run, **only on your machine** |
|---------------------------------------|-------------------------------------------|
| Your memories, chats, imported files | `data/` (portable, next to exe) |
| API keys or model credentials | Settings in local userData |
| Maintainer or third-party private data | What you configure yourself |

Details: [docs/distribution-windows.md](./docs/distribution-windows.md)

### Steps

1. **Download** 鈥?`Ackem-v1.0.0-win-x64.zip` from [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) or [Gitee Releases](https://gitee.com/jason_2005/Ackem/releases)
2. **Extract** 鈥?fully to an SSD path (do not run inside the zip)
3. **Launch** 鈥?`Ackem.exe` or `鍚姩 Ackem.bat`; first launch ~10鈥?0 s ([loading screen](#screenshots--demo))
4. **Compliance** 鈥?accept privacy terms ([screenshot](#screenshots--demo))
5. **Configure model** 鈥?**Settings 鈫?Model & API**: Base URL, API Key (cloud), Model ID
6. **First chat** 鈥?send a message; optionally import `.txt`/`.md` memories

> **Sharing the zip:** never re-pack your personal `data/` folder 鈥?it contains chats, memory, and keys.

---

## Developers

> Ackem is an **Electron app**. The renderer depends on `window.Ackem` (preload IPC).  
> Use **`npm run dev`** 鈥?do not open the Vite URL in a browser alone.

### Prerequisites

- Windows 10/11 路 Node.js **20+** 路 `npm ci`

### Daily development

```bash
cd Ackem-v0.0.0
npm install
npm run dev
```

Dev `data/` is in the repo working tree, separate from green release `data/` next to `Ackem.exe`.

### Build & package

```bash
npm run build          # Compile 鈫?out/
npm run dist:green     # Green release 鈫?dist/release/
npm run dist:setup     # Optional NSIS installer
```

### Testing

```bash
npm run typecheck
npm test
npm run test:renderer
```

---

## Seven-System Architecture

| # | System | Description | Docs |
|---|--------|-------------|------|
| 鈶?| Overall | Electron shell, orchestrator, conversation lifecycle | [00-overall-system.md](./docs/developer/architecture/00-overall-system.md) |
| 鈶?| Brain | L0 understanding + L4 memory retrieval & decay | [01-brain-system.md](./docs/developer/architecture/01-brain-system.md) |
| 鈶?| Heart | L1 relationship + L2 emotion + L3 expression | [02-heart-system.md](./docs/developer/architecture/02-heart-system.md) |
| 鈶?| Mouth | Prompt assembly + LLM calling | [03-mouth-system.md](./docs/developer/architecture/03-mouth-system.md) |
| 鈶?| Neural | Embedding / vector retrieval | [04-neural-system.md](./docs/developer/architecture/04-neural-system.md) |
| 鈶?| Extension | Skill/Plugin/Dispatch/OpenForU | [05-extension-system.md](./docs/developer/architecture/05-extension-system.md) |
| 鈶?| Time | Temporal awareness, circadian rhythm, reunion, reflection | [06-time-system.md](./docs/developer/architecture/06-time-system.md) |
| 鈥?| Data Layer | SQLite schema, Repository pattern, migrations | [07-data-layer.md](./docs/developer/architecture/07-data-layer.md) |
| 鈥?| IPC API | `window.Ackem.*` preload bridge, push events | [08-ipc-api.md](./docs/developer/architecture/08-ipc-api.md) |

Index: [docs/developer/architecture/README.md](./docs/developer/architecture/README.md)

---

## Documentation

> **Languages:** English (`*.md`) 路 涓枃 (`*.zh.md`) 鈥?see [I18N.md](./docs/I18N.md)

| Purpose | English | 涓枃 |
|---------|---------|------|
| Repo paths & build | [CODEBASE-PATHS.md](./docs/CODEBASE-PATHS.md) | [CODEBASE-PATHS.zh.md](./docs/CODEBASE-PATHS.zh.md) |
| Doc map (maintainers) | [OPEN-SOURCE-DOC-MAP.md](./docs/OPEN-SOURCE-DOC-MAP.md) | [OPEN-SOURCE-DOC-MAP.zh.md](./docs/OPEN-SOURCE-DOC-MAP.zh.md) |
| Extension protocol | [DEVELOPER-EXTENSION-PROTOCOL.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md) | [DEVELOPER-EXTENSION-PROTOCOL.zh.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md) |
| Developer setup | [dev-setup.md](./docs/developer/dev-setup.md) | [dev-setup.zh.md](./docs/developer/dev-setup.zh.md) |
| Architecture index | [architecture/README.md](./docs/developer/architecture/README.md) | [architecture/README.zh.md](./docs/developer/architecture/README.zh.md) |
| Data directory | [memory-format.md](./docs/memory-format.md) | [memory-format.zh.md](./docs/memory-format.zh.md) |
| AI context & retrieval | [ai-context-and-retrieval-policy.md](./docs/ai-context-and-retrieval-policy.md) | [ai-context-and-retrieval-policy.zh.md](./docs/ai-context-and-retrieval-policy.zh.md) |
| Privacy & data | [privacy-and-data.md](./docs/privacy-and-data.md) | [privacy-and-data.zh.md](./docs/privacy-and-data.zh.md) |
| Local models | [local-models-windows.md](./docs/local-models-windows.md) | [local-models-windows.zh.md](./docs/local-models-windows.zh.md) |
| Adult mode & safety | [adult-and-safety-policy.md](./docs/adult-and-safety-policy.md) | [adult-and-safety-policy.zh.md](./docs/adult-and-safety-policy.zh.md) |
| Perception | [perception-layer.md](./docs/perception-layer.md) | [perception-layer.zh.md](./docs/perception-layer.zh.md) |
| Sensitive capabilities | [sensitive-capabilities.md](./docs/sensitive-capabilities.md) | [sensitive-capabilities.zh.md](./docs/sensitive-capabilities.zh.md) |
| Windows distribution | [distribution-windows.md](./docs/distribution-windows.md) | [distribution-windows.zh.md](./docs/distribution-windows.zh.md) |
| Indexing & scale | [indexing-and-scale.md](./docs/indexing-and-scale.md) | [indexing-and-scale.zh.md](./docs/indexing-and-scale.zh.md) |
| Security | [SECURITY.md](./SECURITY.md) | [SECURITY.zh.md](./SECURITY.zh.md) |
| Contributing | [CONTRIBUTING.md](./CONTRIBUTING.md) | [CONTRIBUTING.zh.md](./CONTRIBUTING.zh.md) |
| Code of Conduct | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | [CODE_OF_CONDUCT.zh.md](./CODE_OF_CONDUCT.zh.md) |

---

## License

This project is open-sourced under the [AGPL-3.0](./LICENSE) license.

| Use case | Allowed |
|----------|---------|
| Personal learning & research | 鉁?Yes |
| Open-source project integration (must remain AGPL-3.0) | 鉁?Yes |
| Academic research & citation | 鉁?Yes |
| Closed-source commercial product | 鉂?Commercial license required |
| SaaS service (source code not provided to users) | 鉂?Commercial license required |
| Enterprise private deployment (not open-sourced) | 鉂?Commercial license required |
| Closed-source API usage (no modification of source) | 鈿狅笍 Gray area, consult us |

### Commercial Licensing

For commercial use, contact: **jasonliu_lyf_2005@qq.com**

### Contributor Agreement

By submitting a contribution to this project, you agree to the [Contributor License Agreement (CLA)](./CLA.md).

Copyright (C) 2026 Jason Liu (JasonLiu0826)

---

*The open-source edition focuses on local `.txt`/`.md` memory and auditable retrieval. For closed-source commercial deployment or SaaS scenarios, see the commercial licensing terms in [LICENSE](./LICENSE).*
