<div align="center">

# 💫 Ackem

### A companion for your days. An agent for your work.

<p><strong>A</strong>utonomous <strong>C</strong>ompanion <strong>K</strong>eeping <strong>E</strong>motional <strong>M</strong>emory<br>
<sub>Conversation · Memory · Personality &amp; emotion · Real task execution</sub></p>

<p>
<a href="package.json"><img alt="Version" src="https://img.shields.io/badge/Version-2.0.0-orange?style=for-the-badge" height="28"></a>
<a href="https://github.com/JasonLiu0826/ackem/releases"><img alt="Platform" src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-0078D6?style=for-the-badge&amp;logo=windows&amp;logoColor=white" height="28"></a>
<a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge" height="28"></a>
<br>
<a href="docs/usage.md#data-and-privacy"><img alt="Local First" src="https://img.shields.io/badge/Data-Local--First-2ea043?style=for-the-badge" height="28"></a>
<a href="docs/usage.md#settings-and-models"><img alt="OpenAI Compatible" src="https://img.shields.io/badge/API-OpenAI--Compatible-412991?style=for-the-badge&amp;logo=openai&amp;logoColor=white" height="28"></a>
<a href="package.json"><img alt="Electron" src="https://img.shields.io/badge/Built_with-Electron-47848F?style=for-the-badge&amp;logo=electron&amp;logoColor=white" height="28"></a>
</p>

<p>
<a href="https://github.com/JasonLiu0826/ackem/releases"><strong>🚀 Download Ackem</strong></a> ·
<a href="docs/usage.md"><strong>📖 Get started</strong></a> ·
<a href="docs/architecture.md"><strong>🧭 Explore the architecture</strong></a>
</p>

[简体中文](README.md) · **English** · [Documentation](docs/README.en.md)

**Ackem is a local-first AI companion and task coordinator.
AckemCode is its general-purpose agent execution kernel.**

<sub>Source is evolving. Package features and platform validation follow the corresponding release notes.</sub>

</div>

---

<div align="center">

## ✨ At a glance

</div>

<table>
<tr>
<td width="50%" valign="top" align="center">
<h3>💬 Ackem · Your companion</h3>
<p>Continue conversations, recall facts, and retain or correct long-term memory.</p>
</td>
<td width="50%" valign="top" align="center">
<h3>🛠️ AckemCode · Your agent</h3>
<p>Operate files, commands, search and documents; also available through independent CLI and Web interfaces.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<h3>🧠 Memory that connects</h3>
<p>Organize related experiences and retrieve relevant context for an ongoing conversation.</p>
</td>
<td width="50%" valign="top" align="center">
<h3>💞 Personality, emotion &amp; time</h3>
<p>Maintain continuity through personality, relationships and awareness of time.</p>
</td>
</tr>
<tr>
<td width="50%" valign="top" align="center">
<h3>🧩 Three routes, one conversation</h3>
<p>Route requests to chat, enabled plugins or work according to intent.</p>
</td>
<td width="50%" valign="top" align="center">
<h3>🔒 Local-first data</h3>
<p>Manage data on your machine; cloud models, channels and network tools send content as configured.</p>
</td>
</tr>
</table>

---

<div align="center">

## 🧭 chat / plugin / work routing

</div>

<p align="center">
<a href="docs/diagrams/request-routing-en.light.svg"><img src="docs/diagrams/request-routing-en.light.svg" alt="Ackem request routing" width="900"></a>
</p>

<div align="center">

[Full size](docs/diagrams/request-routing-en.light.svg) · [Dark](docs/diagrams/request-routing-en.dark.svg)

</div>

Ackem interprets requests as **chat (conversation and content), plugin (an enabled extension), or work (AckemCode acting on real resources)**. These are handling modes rather than three sequential steps. Read-only inspection of actual machine state also belongs to work.

You do not need to select a route first. See [request examples](docs/usage.md#request-handling) and the [routing architecture](docs/architecture.md#routing).

---

<div align="center">

## 🚀 Download and installation

</div>

Choose a matching platform package from the [main repository Releases](https://github.com/JasonLiu0826/ackem/releases) and follow that release's instructions. Fully extract a Windows portable package before starting `Ackem.exe` or its launcher. Features and validation depend on the release; the current source application version is `2.0.0`.

Configure the model endpoint, key and model name in settings, then send an ordinary message. To operate on a project, explicitly delegate a task in chat or use the work page. See the [user guide](docs/usage.md) for permissions, channels and data locations.

---

<div align="center">

## 🎬 Download and usage demos

</div>

These GIFs are retained from the original README to illustrate basic operation. Versions, layouts and legacy computer-assistant controls are historical references; see the [user guide](docs/usage.md) for current entry points and permissions.

<div align="center">

### Download, extract and launch

</div>

<p align="center">
<a href="docs/images/01-download-open.gif"><img src="docs/images/01-download-open.gif" alt="Download, extract and open Ackem" width="800"></a>
</p>

Download the matching release → extract the complete package → launch Ackem → wait for initialization. Filenames and launch instructions depend on that release.

<div align="center">

### Everyday conversation

</div>

<p align="center">
<a href="docs/images/02-daily-chat.gif"><img src="docs/images/02-daily-chat.gif" alt="Ackem everyday conversation demo" width="800"></a>
</p>

Configure a model and converse naturally. Current work / AckemCode paths also support real task delegation, as shown in the routing diagram above.

---

<div align="center">

## 📷 Reference screenshots

</div>

The original README's six screenshots are retained as interface and feature references, not acceptance evidence for the current release. **Legacy computer-assistant controls shown here have been removed; execution now uses work / AckemCode.** Click a screenshot to view the original.

<table>
<tr>
<td width="50%" align="center" valign="top">
<h3>💬 Conversation</h3>
<a href="docs/images/02-home.png"><img src="docs/images/02-home.png" alt="Chat and relationship state" width="440"></a>
<p><sub>Chat and relationship state · <a href="docs/images/02-home.png">Full size</a></sub></p>
</td>
<td width="50%" align="center" valign="top">
<h3>🧠 Memory and associations</h3>
<a href="docs/images/03-memory-graph.jpg"><img src="docs/images/03-memory-graph.jpg" alt="Memory, timelines and associations" width="440"></a>
<p><sub>Memory, timelines and associations · <a href="docs/images/03-memory-graph.jpg">Full size</a></sub></p>
</td>
</tr>
<tr>
<td width="50%" align="center" valign="top">
<h3>⚙️ Settings</h3>
<a href="docs/images/03-settings.png"><img src="docs/images/03-settings.png" alt="Personality and application configuration" width="440"></a>
<p><sub>Personality and application configuration · <a href="docs/images/03-settings.png">Full size</a></sub></p>
</td>
<td width="50%" align="center" valign="top">
<h3>🔌 Models and API</h3>
<a href="docs/images/04-model-api.png"><img src="docs/images/04-model-api.png" alt="Model connection configuration" width="440"></a>
<p><sub>Model connection configuration · <a href="docs/images/04-model-api.png">Full size</a></sub></p>
</td>
</tr>
<tr>
<td width="50%" align="center" valign="top">
<h3>✨ Loading</h3>
<a href="docs/images/01-loading.png"><img src="docs/images/01-loading.png" alt="Startup and resource preparation" width="440"></a>
<p><sub>Startup and resource preparation · <a href="docs/images/01-loading.png">Full size</a></sub></p>
</td>
<td width="50%" align="center" valign="top">
<h3>🔒 First-run confirmation</h3>
<a href="docs/images/05-compliance.png"><img src="docs/images/05-compliance.png" alt="Content, privacy and data confirmation" width="440"></a>
<p><sub>Content, privacy and data confirmation · <a href="docs/images/05-compliance.png">Full size</a></sub></p>
</td>
</tr>
</table>

---

<div align="center">

## 💻 Quick start from source

</div>

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

<div align="center">

## 📚 Documentation and contributing

</div>

| Guide | Scope |
|---|---|
| [User guide](docs/usage.md) | Installation, settings, channels, work, data and privacy |
| [Architecture](docs/architecture.md) | Ackem / AckemCode boundaries, routing and task lifecycle |
| [Development](docs/development.md) | Environment, extensions, verification, builds and release |
| [Module reference](docs/modules.md) | Source entry points, kernel adapters, storage and interfaces |
| [Memory, personality, emotion and time](docs/companion-engines.md) | How companion state interprets, remembers and shapes expression |

<div align="center">

[Contribute](CONTRIBUTING.md) · [Issues](https://github.com/JasonLiu0826/ackem/issues) · [Changelog](CHANGELOG.md) · [Archive](docs/旧文档/README.md)

License: [AGPL-3.0](LICENSE); third-party details: [NOTICE](NOTICE.md). Configured cloud models, channels and network tools receive relevant content; read [data and privacy](docs/usage.md#data-and-privacy).

</div>
