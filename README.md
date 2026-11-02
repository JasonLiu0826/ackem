# 💫 Ackem

![Version](https://img.shields.io/badge/Version-2.0.0-orange?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge)
![Local First](https://img.shields.io/badge/Data-Local--First-2ea043?style=for-the-badge)
![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI--Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)
![Electron](https://img.shields.io/badge/Built_with-Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)

**Ackem** · **A**.C.K.E.M — **A**utonomous **C**ompanion **K**eeping **E**motional **M**emory

**Ackem v2.0.0 (community desktop build)** — A **local-first** AI companion for Windows and macOS. Bring your own LLM (cloud or local); Ackem handles chat, memory, emotion, relationship state, and desktop presence — **all on your hard drive**. This repository continues development on top of the original [JasonLiu0826/Ackem](https://github.com/JasonLiu0826/ackem) v1.0.0.

> **Source**: [this repo](https://github.com/deufe/ackem) · upstream: [JasonLiu0826/Ackem](https://github.com/JasonLiu0826/ackem) · [Gitee mirror](https://gitee.com/jason_2005/ackem)
> **Download**: [releases of this repo](https://github.com/deufe/ackem/releases) (macOS dmg, ready to run) · upstream [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) · [Gitee Releases](https://gitee.com/jason_2005/ackem/releases)
> **Build**: `npm run dist:green` → `dist/release/Ackem-1.0.0-win-x64/` · [Path map](./docs/CODEBASE-PATHS.md) · [Docs languages](./docs/I18N.md)
> **Status:** Ackem is still in **active testing**. As a solo-maintained project, test coverage is limited — you may hit unexpected behavior or rough edges. Frequent crashes and severe lag are uncommon, but imperfections still happen. [Open an Issue](https://github.com/deufe/ackem/issues) if something feels off.

[中文文档](./README.zh.md) · [Privacy & data (EN)](./docs/privacy-and-data.md)

---

## At a glance

Ackem is **not** a web chat box — it is a Windows desktop app that stays with you: tray, optional desktop pet, structured memory, and a companion that remembers context over time.

| | |
|---|---|
| 💬 **Chat** | Any OpenAI-compatible API — DeepSeek, OpenAI, Ollama, LM Studio, etc. |
| 🧠 **Memory** | Conversations become searchable memory; import `.txt` / `.md` as long-term context |
| 💞 **Companion** | Trust, mood, relationship stage, personality presets, diary, optional proactive messages |
| 🔒 **Local-first** | Personal data lives in `./data/` next to the exe — **not** bundled in the release zip |

**You need:** Windows 10/11 64-bit or macOS (Apple Silicon) · an LLM API key or local server · ~10–30 s on first launch (embedding model extracts once). **No Node.js required** for the green release.

---

## 🆕 What's new in the community build (v2.0.0)

On top of upstream v1.0.0, concise but complete:

**🖥️ Ackem Code across all three channels (desktop / QQ / WeChat)**
- Code / file / command tasks on any channel are routed to the local coding agent (`parts/ackemcode`: CLI + daemon + file/command/search tools + Web UI)
- `/code` explicit prefix + intent detection; permission modes configurable (`ACKEMCODE_PERMISSION_MODE`)
- Results go back only to the asking channel; model config synced from Ackem settings; sessions and data dirs kept separate

**🎤 QQ voice messages**
- Her replies can be spoken: text → local TTS (IndexTTS, default `127.0.0.1:8770`) → silk v3 voice message; triggered by probability or `[长语音]`, falls back to text on failure
- Incoming voice messages: OneBot transcode + local ASR → text, then she replies
- TTS health checks, per-length dynamic timeouts, 60 s voice protection

**🌐 QQ channel (OneBot / NapCat)**
- NapCat WebUI QR login, connection probing and status hints, reconnect
- Private chat send/receive, image input, memes, voice; proactive chatting (8:00–22:00, 3 h idle, 3 h cooldown)
- 70 built-in memes (9 mood folders; user folder overrides by name)
- Outbound sanitizing: line breaks, nickname density, emoji density, physical-presence guard

**🌏 Autonomous QZone posts**
- Posts generated from persona / mood / the day's chat; scheduled by active hours, daily cap, minimum interval, visibility (public / friends / private)
- Meme images, dry-run (generate only), a QQ mention after posting, scheduled visits with comments and probabilistic likes (all via OneBot extension actions)

**💬 Unified conversation + owner safety**
- Desktop / QQ / WeChat share one chat history and memory (source tags, timeline merge + dedupe, live push to the desktop UI)
- Owner binding: a private sender must be confirmed on the desktop before authorization; stranger messages never enter the main flow; replies go only to the asking channel

**👧 Freya persona**
- Corpus-reconstructed persona (one of 29 presets) + hormone-pool emotion engine (real-time decay, missing-you drift)
- "What Freya calls you" setting; `{{petname}}` placeholders replaced end-to-end

**🧩 Multimodal & stability**
- Image input: OpenAI multimodal content → Anthropic image blocks (base64 / remote URL)
- Tool-turn multimodal content flattened (fixes base64 JSON being echoed back)
- Local file, code and command tasks use work / AckemCode; the legacy desktop assistant execution channel has been removed
- Remote dispatch for the confirmed QQ / WeChat owner is controlled in Settings → Work and supports `/code`
- Humanized outbound splitting (humanizeReply); online-channel presence boundary (presence-boundary)

**🍎 macOS community build**
- electron-builder mac target + dmg; layered ad-hoc signing script (`sign-freya.sh`)

> Full details in [CHANGELOG.md](./CHANGELOG.md). Issues and PRs are welcome; upstream updates are merged back as PRs.

---

## Screenshots & demo

<details>
<summary><strong>📷 Screenshots</strong> (click to expand)</summary>

<p align="center">
  <img src="./docs/images/01-loading.png" alt="Loading screen" width="640" />
  <br /><em>Loading — first launch extracts the local embedding model; main UI opens when the bar completes</em>
</p>

<p align="center">
  <img src="./docs/images/02-home.png" alt="Home" width="640" />
  <br /><em>Home — chat, memory, games, extensions, settings; relationship & pet preview on the right</em>
</p>

<p align="center">
  <img src="./docs/images/03-memory-graph.jpg" alt="Memory visualization" width="640" />
  <br /><em>Memory — structured recall, timelines, and knowledge connections from your conversations</em>
</p>

<p align="center">
  <img src="./docs/images/03-settings.png" alt="Settings" width="640" />
  <br /><em>Settings — personality, voice, desktop pet, WeChat bridge, extensions, data</em>
</p>

<p align="center">
  <img src="./docs/images/04-model-api.png" alt="Model & API" width="640" />
  <br /><em>Model & API — Base URL, API Key, Model ID</em>
</p>

<p align="center">
  <img src="./docs/images/05-compliance.png" alt="Compliance" width="640" />
  <br /><em>Compliance — privacy, data handling, and adult-mode terms on first run</em>
</p>

</details>

<details>
<summary><strong>🎬 Demo GIFs</strong> (click to expand)</summary>

<p align="center">
  <img src="./docs/images/01-download-open.gif" alt="Download and open" width="640" />
  <br /><em>Download zip → extract → launch Ackem.exe → wait for loading → main UI</em>
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

- **Chat like with a person** — OpenAI-compatible cloud or local Ollama / LM Studio; configure under **Settings → Model & API**.
- **Remember what you talk about** — structured memory, search, timelines, knowledge graph; **import** `.txt` / `.md` as long-term memory.
- **Continuous companionship** — trust, mood, relationship stage, personality presets, companion **diary**, optional proactive outreach.
- **Beyond the main window** — system tray; optional **desktop pet** (geometric orb + Live2D preview).
- **Optional capabilities** — voice STT/TTS, **WeChat** bridge (phone messages, brain on PC), **Extension Center**, experimental **Plan · OpenForU** workspace.
- **Game mode** — experimental; play supported games (e.g. Minecraft) with your companion when extensions allow.

### Where your data lives

Portable green release stores everything under **`data/`** next to `Ackem.exe`: chats, memories, diaries, API keys in settings. **The official zip does not include `data/`** — an empty folder is created on first run. No default telemetry to an Ackem server.

Backup, migration, deletion: [docs/memory-format.md](./docs/memory-format.md) · [docs/distribution-windows.md](./docs/distribution-windows.md)

### For developers

See **[Developers](#developers)** below, [architecture](#seven-system-architecture), and the [document index](#documentation).

---

## 🚀 Download & Install

### macOS (Apple Silicon · M1–M5) — recommended for this repo

Download from [this repo's Releases](https://github.com/deufe/ackem/releases):

| File | Size | SHA256 |
|---|---|---|
| `Ackem-2.0.0-mac-arm64.dmg` | 702 MB | `5e766f77e1063f0cbeaec13beeb34caea4384cc7b0a453e7d854d7aaf52db0ca` |

> ⚠️ This is a community build, **not notarized by Apple**. On first launch macOS shows "damaged" or "unidentified developer" — **this is normal, the file is not damaged**. Follow the two steps below.

**Step 1 — remove the quarantine flag**

Open Terminal:

```bash
xattr -cr /Applications/Ackem.app
```

(If you haven't moved it into Applications yet, use the actual path of `Ackem.app` inside the mounted dmg.)

**Step 2 — right-click open**

In Applications, **right-click Ackem → Open → Open** in the dialog. Subsequent double-clicks work normally.

First launch takes ~10–30 s (local embedding model extracts once).

### Windows

- Official green build (v1.0.0): [upstream Releases](https://github.com/JasonLiu0826/Ackem/releases)
- No Windows installer for v2.0.0 yet — build it on a Windows machine:

```bash
npm install
npm run dist:green   # output in dist/release/
```

### Privacy (please read)

| Official release **does not include** | After first run, **only on your machine** |
|---------------------------------------|-------------------------------------------|
| Your memories, chats, imported files | `data/` (portable, next to exe) |
| API keys or model credentials | Settings in local userData |
| Maintainer or third-party private data | What you configure yourself |

Details: [docs/distribution-windows.md](./docs/distribution-windows.md)

---

## ⚙️ First-run setup (3 minutes)

1. **Compliance** — accept the privacy / data-processing terms on first launch (adult mode asks for age confirmation separately).
2. **Configure model** — go to **Settings → Model & API** and fill in:
   - **Base URL** — OpenAI-compatible endpoint
   - **API Key** — required for cloud models; optional for local ones
   - **Model ID** — e.g. `deepseek-chat`, `gpt-4o-mini`

   | Model provider | Base URL | Model ID (example) |
   |---|---|---|
   | DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
   | OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
   | Local Ollama | `http://127.0.0.1:11434/v1` | `qwen2.5:7b` |
   | Local LM Studio | `http://127.0.0.1:1234/v1` | the model you loaded |

3. **Send a message** — a reply means setup is complete.
4. **Optional** — import `.txt` / `.md` memories, enable voice, connect QQ / WeChat.

> 🔒 API keys stay on your machine (encrypted at rest) — **never uploaded, never bundled**.

---

## 🎛️ How to use (v2.0.0)

### Chat & personality
**Settings → Companion & Personality**: set the display name, gender, and pick a personality preset (29 available). The preset shapes tone, quirks, and boundaries.

### Freya persona & "what she calls you"
After selecting **Freya**, a field appears: **What Freya calls you** — enter your own nickname; leave empty for the default "Darling". It replaces the `{{petname}}` placeholders in the prompts.

### QQ channel (OneBot / NapCat)
**Settings → Mobile → QQ**:
1. Run **NapCat** locally (QQ protocol side; Docker works)
2. Fill in the **NapCat WebUI URL** (default `http://127.0.0.1:6099`) and **WebUI token**
3. Click **Scan to log in** with your phone QQ; then click **Connect listener**
4. Once connected, message her from QQ — voice, images, and memes are supported
5. **The first private chat requests owner binding** — confirm (or reject) it under **Settings → Mobile → QQ → Owner binding**; messages are ignored until confirmed

Full guide: [docs/qq-onebot-setup.md](./docs/qq-onebot-setup.md).

### Autonomous QZone posts
**Settings → Mobile → QQ → QZone** (defaults to **dry run**: generate only, never publish):
- Choose posts per day, minimum interval, active hours, and visibility (public / friends / private)
- Optional images, a QQ mention after posting, scheduled visits to like/comment
- Details: [docs/qq-space.md](./docs/qq-space.md)

### WeChat channel
**Settings → Mobile → WeChat**: message from your phone; the brain, persona, and memory still run locally.

### Ackem Code (desktop agent)
Type **`/code your task`** in chat (or `/电脑 …` on QQ / WeChat), or just say "rename this file for me" — code / file / command tasks are routed to the local coding agent, and results go back only to the asking channel. Permissions can be tightened in Settings. See [docs/ackem-code-bridge.zh.md](./docs/ackem-code-bridge.zh.md).

### Voice
- **TTS playback**: Settings → Voice; the local voice service (Python 3.9+) ships with the app and starts on first use
- **ASR input**: click the mic in the chat box; voice messages on QQ / WeChat are transcribed first

---

## ❓ FAQ

| Problem | Solution |
|---|---|
| "Damaged, cannot open" on launch | Normal for an unsigned build. Run `xattr -cr /Applications/Ackem.app`, then right-click → Open |
| First launch seems stuck | The embedding model is extracting — wait 10–30 s; restart if it hangs longer |
| No reply to messages | Check Base URL / API Key / Model ID under **Settings → Model & API**, and network access |
| QQ shows disconnected | Make sure NapCat is running and the port matches, then click "Reconnect listener" |
| Where is my data? | macOS: `~/Library/Application Support/Ackem`; Windows green build: `data/` next to the exe. See [docs/memory-format.md](./docs/memory-format.md) |
| How to uninstall? | Delete the app; delete the data directory above if you want a clean removal |
| How to update? | Download the new version from this repo's Releases and replace; data is kept |

### macOS (community build, unofficial) {#macos-community-build-unofficial}

> **Official support:** Windows green release only. The Mac builds below are **community-contributed** by [@deufe](https://github.com/deufe) — not maintained or fully verified by the core team. See [Issue #4](https://github.com/JasonLiu0826/ackem/issues/4).

| File | Architecture | Download |
|------|----------------|----------|
| `Ackem-1.0.0-mac-arm64.dmg` | Apple Silicon (M series) | [v3 DMG](https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-arm64.dmg) |
| `Ackem-1.0.0-mac-x64.dmg` | Intel Mac | [v3 DMG](https://github.com/deufe/ackem/releases/download/v1.0.0-mac-community-v3/Ackem-1.0.0-mac-x64.dmg) |

**Use v3 only** (v1/v2 are outdated). SHA256 and install steps: [v1.0.0 Release notes](https://github.com/JasonLiu0826/ackem/releases/tag/v1.0.0) · [appendix doc](./docs/releases/v1.0.0-mac-community-appendix.md)

**First launch (Gatekeeper):** the build is not Apple-signed. After copying to `/Applications`, run `xattr -cr /Applications/Ackem.app`, then **right-click → Open** once. In-app auto-update is **Windows-only**.

---

## Developers

> Ackem is an **Electron app**. The renderer depends on `window.ackem` (preload IPC).
> Use **`npm run dev`** — do not open the Vite URL in a browser alone.
> `npm start` also prepares local development dependencies before launching Electron.

### Prerequisites

- Windows 10/11 · Node.js **20+**

### Daily development

```bash
cd ackem
npm ci
cd parts/ackemcode
npm ci
cd ../..
npm run dev
```

Dev `data/` is in the repo working tree, separate from green release `data/` next to `Ackem.exe`.
Set the chat API address, key, and model in Ackem settings before using chat or coding tasks. No API key is included in the source repository. The coding page uses `parts/ackemcode`; its local daemon starts on demand.

### Build & package

```bash
npm run build          # Compile → out/
npm run dist:green     # Green release → dist/release/
npm run dist:setup     # Optional NSIS installer
```

### Validation

```bash
npm run typecheck
npm run build
cd parts/ackemcode && npm run typecheck
```

This source-only repository excludes local test suites, development notes, credentials, and generated caches.

---

## Seven-System Architecture

| # | System | Description | Docs |
|---|--------|-------------|------|
| ① | Overall | Electron shell, orchestrator, conversation lifecycle | [00-overall-system.md](./docs/developer/architecture/00-overall-system.md) |
| ② | Brain | L0 understanding + L4 memory retrieval & decay | [01-brain-system.md](./docs/developer/architecture/01-brain-system.md) |
| ③ | Heart | L1 relationship + L2 emotion + L3 expression | [02-heart-system.md](./docs/developer/architecture/02-heart-system.md) |
| ④ | Mouth | Prompt assembly + LLM calling | [03-mouth-system.md](./docs/developer/architecture/03-mouth-system.md) |
| ⑤ | Neural | Embedding / vector retrieval | [04-neural-system.md](./docs/developer/architecture/04-neural-system.md) |
| ⑥ | Extension | Skill/Plugin/Dispatch/OpenForU | [05-extension-system.md](./docs/developer/architecture/05-extension-system.md) |
| ⑦ | Time | Temporal awareness, circadian rhythm, reunion, reflection | [06-time-system.md](./docs/developer/architecture/06-time-system.md) |
| — | Data Layer | SQLite schema, Repository pattern, migrations | [07-data-layer.md](./docs/developer/architecture/07-data-layer.md) |
| — | IPC API | `window.ackem.*` preload bridge, push events | [08-ipc-api.md](./docs/developer/architecture/08-ipc-api.md) |

Index: [docs/developer/architecture/README.md](./docs/developer/architecture/README.md)

---

## Documentation

> **Languages:** English (`*.md`) · 中文 (`*.zh.md`) — see [I18N.md](./docs/I18N.md)

| Purpose | English | 中文 |
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
| Personal learning & research | ✅ Yes |
| Open-source project integration (must remain AGPL-3.0) | ✅ Yes |
| Academic research & citation | ✅ Yes |
| Closed-source commercial product | ❌ Commercial license required |
| SaaS service (source code not provided to users) | ❌ Commercial license required |
| Enterprise private deployment (not open-sourced) | ❌ Commercial license required |
| Closed-source API usage (no modification of source) | ⚠️ Gray area, consult us |

### Commercial Licensing

For commercial use, contact: **jasonliu_lyf_2005@qq.com**

### Contributor Agreement

By submitting a contribution to this project, you agree to the [Contributor License Agreement (CLA)](./CLA.md).

Recognized contributors: [CONTRIBUTORS.md](./CONTRIBUTORS.md)

Copyright (C) 2026 Jason Liu (JasonLiu0826)

---

*The open-source edition focuses on local `.txt`/`.md` memory and auditable retrieval. For closed-source commercial deployment or SaaS scenarios, see the commercial licensing terms in [LICENSE](./LICENSE).*
