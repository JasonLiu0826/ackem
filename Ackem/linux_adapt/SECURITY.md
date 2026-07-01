# Security Policy

## Supported versions

| Version   | Supported |
|-----------|-----------|
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

Credentials are entered **after install** in **Settings** and stored locally on your PC (see [distribution guide](./docs/distribution-windows.md)).

## Data on your machine

| Data | Typical location |
|------|------------------|
| Memory / imports (portable mode) | Next to `Ackem.exe` → `data/` |
| Memory (user directory mode) | `%LOCALAPPDATA%\Ackem\` |
| App settings & API keys | Electron userData → `ackem-app-settings.json` |

Back up these paths yourself before uninstall or disk migration. Uninstalling the app does **not** upload your data anywhere.

## Codebase locations

| Role | Path |
|------|------|
| GitHub source | Repository root (`Ackem-v0.0.0/`) |
| Windows green build | `dist/release/Ackem-1.0.0-win-x64/` |

See [docs/CODEBASE-PATHS.md](./docs/CODEBASE-PATHS.md).
