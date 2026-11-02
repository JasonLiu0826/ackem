# Ackem

[中文](README.md) · [Documentation](docs/README.en.md)

**Ackem is a local-first AI companion and task coordinator. AckemCode is its general-purpose agent execution kernel.**

Ackem maintains conversations, memory, personality and emotion, interprets requests and follows up on tasks. AckemCode operates files, commands, search, documents and other tool-supported resources, with independent CLI and Web interfaces. A.C.K.E.M means Autonomous Companion Keeping Emotional Memory.

![Ackem request routing](docs/diagrams/request-routing-en.light.svg)

[Full size](docs/diagrams/request-routing-en.light.svg) · [Dark](docs/diagrams/request-routing-en.dark.svg)

Ackem interprets requests as **chat (conversation and content), plugin (an enabled extension), or work (AckemCode acting on real resources)**. These are handling modes rather than three sequential steps. Read-only inspection of actual machine state also belongs to work.

You do not need to select a route first. See [request examples](docs/usage.md#request-handling) and the [routing architecture](docs/architecture.md#routing).

## Installation

Choose a matching platform package from the [main repository Releases](https://github.com/JasonLiu0826/ackem/releases) and follow that release's instructions. Fully extract a Windows portable package before starting `Ackem.exe` or its launcher. Features and validation depend on the release; the current source application version is `2.0.0`.

Configure the model endpoint, key and model name in settings, then send an ordinary message. To operate on a project, explicitly delegate a task in chat or use the work page. See the [user guide](docs/usage.md) for permissions, channels and data locations.

## Quick start from source

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

## Read as needed

| Guide | Scope |
|---|---|
| [User guide](docs/usage.md) | Installation, settings, channels, work, data and privacy |
| [Architecture](docs/architecture.md) | Ackem / AckemCode boundaries, routing and task lifecycle |
| [Development](docs/development.md) | Environment, extensions, verification, builds and release |
| [Module reference](docs/modules.md) | Source entry points, kernel adapters, storage and interfaces |
| [Memory, personality, emotion and time](docs/companion-engines.md) | How companion state interprets, remembers and shapes expression |

[Contribute](CONTRIBUTING.md) · [Issues](https://github.com/JasonLiu0826/ackem/issues) · [Changelog](CHANGELOG.md) · [Archive](docs/旧文档/README.md)

License: [AGPL-3.0](LICENSE); third-party details: [NOTICE](NOTICE.md). Configured cloud models, channels and network tools receive relevant content; read [data and privacy](docs/usage.md#data-and-privacy).
