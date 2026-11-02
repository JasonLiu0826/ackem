# Security Policy

## Supported versions

| Version   | Supported |
|-----------|-----------|
| Current main source (app version 2.0.0) | Prioritized for investigation |
| v1.0.0    | ✅        |
| v1.0-rc   | ✅        |
| earlier   | ❌        |

## Reporting a vulnerability

Please **do not** open a public issue for sensitive reports.

Email: **jasonliu_lyf_2005@qq.com** (project maintainer) with:

- Description and impact
- Steps to reproduce
- Affected version / build (Release tag or commit)

We aim to acknowledge within **7 days**.

## What official releases contain

Official **Setup** and **green release (zip)** builds from GitHub Releases include:

- Compiled application (`resources/app.asar`)
- Runtime dependencies required to run Ackem
- Optional static files under `resources/` (models, voice-service)

They **do not** include:

- Your `data/` directory (memory, chat exports, imports, OpenForU workspaces)
- API keys or model credentials
- Developer `.env` files
- Any maintainer machine state

Credentials are entered **after install** in **Settings** and stored locally on your PC (see [distribution guide](docs/usage.md#installation)).

## Data on your machine

| Data | Typical location |
|------|------------------|
| Memory / imports (portable mode) | Next to `Ackem.exe` → `data/` |
| Memory (user directory mode) | `%LOCALAPPDATA%\Ackem\` |
| App settings & API keys | Electron userData → `ackem-app-settings.json` |
| AckemCode sessions and model settings | Actual kernel data directory; see [module reference](docs/modules.md#ackemcode) |
| Work artifacts | User-selected directories, potentially outside the app data root |

Kernel model settings may contain plaintext credentials; application settings encryption does not establish identical protection for kernel configuration. See [data and privacy](docs/usage.md#data-and-privacy) for cloud-model, channel and network-tool data flow.

Back up these locations before uninstall or migration. Uninstalling does not itself upload data, but does not establish removal of kernel data, external artifacts or platform messages.

## Codebase locations

| Role | Path |
|------|------|
| GitHub source | Repository checkout root |
| Windows green build | `dist/release/Ackem-<version>-win-x64/` |

See [module reference](docs/modules.md#source-map). Include the actual Release tag or commit in reports; source capabilities do not describe every historical binary.
