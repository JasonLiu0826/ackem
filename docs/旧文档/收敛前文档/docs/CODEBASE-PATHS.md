> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Source, build and runtime paths

[中文](CODEBASE-PATHS.zh.md)

## Source

| Path | Contents |
|---|---|
| `src/main/` | Ackem routing, companion, memory, tasks and channels |
| `src/main/tasks/` | Managed coordination, contracts, persistence, delivery and standing rules |
| `src/main/ackemcode/` | Kernel integration, supervision, independent work and channel bridge |
| `src/preload/`, `src/shared/` | IPC bridge and shared contracts |
| `src/renderer/` | React UI |
| `parts/ackemcode/` | Self-contained general-purpose kernel, server, CLI and Web UI |
| `docs/` | Current guides and separately identified historical releases |
| `scripts/`, `electron-builder.yml` | Build and packaging |
| `resources/`, `assets/`, `voice-service/` | Assets and optional voice services |

## Build and packaging

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run build
npm run dist:green
```

The app builds into `out/`; the kernel into `parts/ackemcode/dist/`. The portable release script derives `dist/release/Ackem-<version>-win-x64/` from root `package.json`. Use actual script output rather than hardcoded old version paths.

Packages place the kernel under `resources/ackemcode/`. Desktop startup needs its source and tsx dependencies; channel startup needs the built server. Root application build does not build the kernel.

## Data and work directories

| Location | Purpose |
|---|---|
| Active Ackem data root | `ackem.db`, memory, history, imports, diary and extensions |
| `<dataRoot>/workspace/` | Default workspace, created when needed |
| Other user-selected directories | Real resources and artifacts, possibly outside the data root |
| Electron userData | `ackem-app-settings.json`, channel session mapping |
| Desktop default `<codeRoot>/data/` | Kernel sessions and model settings |
| Channel default `~/.ackemcode/` | Channel-started kernel sessions and settings |

Portable development uses `<cwd>/data/`; packaged portable mode uses a sibling `data/`. User-directory mode resolves to `%LOCALAPPDATA%/Ackem` on Windows and `~/Library/Application Support/Ackem` on macOS. Electron userData is separate; inspect the running application.

`ACKEMCODE_DATA_DIR` overrides kernel storage. A reused service retains its actual process directory. See [kernel integration](ackemcode-kernel.md).

## Versions and backup

Application, kernel package, SQLite schema and extension API versions are independent. Migrations currently extend through V22; extension validation constants remain defined in `ecosystem/constants.ts`, rather than automatically matching the app version.

Back up active app data, settings, kernel data and work artifacts. They can contain private data or credentials and must not enter public packages. The working directory is not a global permission boundary.

[Documentation](OPEN-SOURCE-DOC-MAP.md) · [Data format](memory-format.md) · [Privacy](privacy-and-data.md)
