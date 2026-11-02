# 💫 Ackem

[![Version](https://img.shields.io/badge/Version-2.0.0-orange?style=for-the-badge)](package.json) [![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/JasonLiu0826/ackem/releases) [![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge)](LICENSE)
[![Local First](https://img.shields.io/badge/Data-Local--First-2ea043?style=for-the-badge)](docs/usage.md#data-and-privacy) [![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI--Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)](docs/usage.md#settings-and-models) [![Electron](https://img.shields.io/badge/Built_with-Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)](package.json)

[中文](README.md) · [Documentation](docs/README.en.md)

**Ackem is a local-first AI companion and task coordinator. AckemCode is its general-purpose agent execution kernel.**

Ackem maintains conversations, memory, personality and emotion, interprets requests and follows up on tasks. AckemCode operates files, commands, search, documents and other tool-supported resources, with independent CLI and Web interfaces.

**A.C.K.E.M — Autonomous Companion Keeping Emotional Memory**

> **Source**: [JasonLiu0826/ackem](https://github.com/JasonLiu0826/ackem)
>
> **Download**: [GitHub Releases](https://github.com/JasonLiu0826/ackem/releases) · **Docs**: [English index](docs/README.en.md)
>
> **Status**: Source is evolving; package features and platform validation follow the corresponding release notes.

## ✨ At a glance

| Capability | What you can do |
|---|---|
| 💬 **Conversation and memory** | Continue conversations, recall facts, retain and correct long-term memory |
| 💞 **Personality, emotion and time** | Maintain companion continuity through personality, relationships and time awareness |
| 🛠️ **General-purpose agent kernel** | Use actual file, command, search and document tools through AckemCode |
| 🧩 **chat / plugin / work** | Select content replies, enabled extensions or real task execution by intent |
| 🔒 **Local-first** | Manage data locally; see the user guide for cloud, channel and network-tool data flow |

---

## 🧭 chat / plugin / work routing

![Ackem request routing](docs/diagrams/request-routing-en.light.svg)

[Full size](docs/diagrams/request-routing-en.light.svg) · [Dark](docs/diagrams/request-routing-en.dark.svg)

Ackem interprets requests as **chat (conversation and content), plugin (an enabled extension), or work (AckemCode acting on real resources)**. These are handling modes rather than three sequential steps. Read-only inspection of actual machine state also belongs to work.

You do not need to select a route first. See [request examples](docs/usage.md#request-handling) and the [routing architecture](docs/architecture.md#routing).

---

## 🚀 Download and installation

Choose a matching platform package from the [main repository Releases](https://github.com/JasonLiu0826/ackem/releases) and follow that release's instructions. Fully extract a Windows portable package before starting `Ackem.exe` or its launcher. Features and validation depend on the release; the current source application version is `2.0.0`.

Configure the model endpoint, key and model name in settings, then send an ordinary message. To operate on a project, explicitly delegate a task in chat or use the work page. See the [user guide](docs/usage.md) for permissions, channels and data locations.

---

## 🎬 Download and usage demos

These GIFs are retained from the original README to illustrate basic operation. Versions, layouts and legacy computer-assistant controls are historical references; see the [user guide](docs/usage.md) for current entry points and permissions.

### Download, extract and launch

![Download, extract and open Ackem](docs/images/01-download-open.gif)

Download the matching release → extract the complete package → launch Ackem → wait for initialization. Filenames and launch instructions depend on that release.

### Everyday conversation

![Ackem everyday conversation demo](docs/images/02-daily-chat.gif)

Configure a model and converse naturally. Current work / AckemCode paths also support real task delegation, as shown in the routing diagram above.

---

## 📷 Reference screenshots

The original README's six screenshots are retained as interface and feature references, not acceptance evidence for the current release. **Legacy computer-assistant controls shown here have been removed; execution now uses work / AckemCode.** Use the full-size links for details.

| 💬 Conversation | 🧠 Memory and associations |
|---|---|
| ![Conversation reference](docs/images/02-home.png) | ![Memory graph reference](docs/images/03-memory-graph.jpg) |
| Chat and relationship state · [Full size](docs/images/02-home.png) | Memory, timelines and associations · [Full size](docs/images/03-memory-graph.jpg) |

| ⚙️ Settings | 🔌 Models and API |
|---|---|
| ![Settings reference](docs/images/03-settings.png) | ![Model and API reference](docs/images/04-model-api.png) |
| Personality and application configuration · [Full size](docs/images/03-settings.png) | Model connection configuration · [Full size](docs/images/04-model-api.png) |

| ✨ Loading | 🔒 First-run confirmation |
|---|---|
| ![Loading reference](docs/images/01-loading.png) | ![First-run confirmation reference](docs/images/05-compliance.png) |
| Startup and resource preparation · [Full size](docs/images/01-loading.png) | Content, privacy and data confirmation · [Full size](docs/images/05-compliance.png) |

---

## 💻 Quick start from source

Current CI uses Windows / Node.js 22. Install application and kernel dependencies separately:

```powershell
git clone https://github.com/JasonLiu0826/ackem.git
cd ackem
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

Start through `npm run dev` because the application needs the Electron preload. Environment troubleshooting, validation and packaging commands live in the [development guide](docs/development.md).

---

## 📚 Documentation and contributing

| Guide | Scope |
|---|---|
| [User guide](docs/usage.md) | Installation, settings, channels, work, data and privacy |
| [Architecture](docs/architecture.md) | Ackem / AckemCode boundaries, routing and task lifecycle |
| [Development](docs/development.md) | Environment, extensions, verification, builds and release |
| [Module reference](docs/modules.md) | Source entry points, kernel adapters, storage and interfaces |
| [Memory, personality, emotion and time](docs/companion-engines.md) | How companion state interprets, remembers and shapes expression |

[Contribute](CONTRIBUTING.md) · [Issues](https://github.com/JasonLiu0826/ackem/issues) · [Changelog](CHANGELOG.md) · [Archive](docs/旧文档/README.md)

License: [AGPL-3.0](LICENSE); third-party details: [NOTICE](NOTICE.md). Configured cloud models, channels and network tools receive relevant content; read [data and privacy](docs/usage.md#data-and-privacy).
