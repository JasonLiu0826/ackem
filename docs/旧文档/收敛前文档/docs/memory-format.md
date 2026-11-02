> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Data directories and backup

[中文](memory-format.zh.md) · [Path guide](CODEBASE-PATHS.md)

## Active data root

`paths.ts` chooses the root from settings. Portable development uses `<cwd>/data/`; packaged portable mode uses a sibling `data/`. User-directory mode uses `%LOCALAPPDATA%/Ackem` on Windows and `~/Library/Application Support/Ackem` on macOS. Inspect the actual path in settings.

## Main contents

| Path | Contents |
|---|---|
| `ackem.db` | State, history, memory, events, actions, tasks and other structured data |
| `memory/` | Fact compatibility files, archives and recall data |
| `companion/` | Self description, state and compatible history files |
| `diary/` | Diary |
| `imports/` | Imported sources |
| `openforu/` | Local user extensions, sessions and staging |
| `agents/` | Social-member data when used |
| `workspace/` | Default work directory and artifacts when used |
| `_derived/` | Rebuildable retrieval indexes/caches |
| `models/`, `logs/` | Model caches and logs as configured |

`layout.ts` initializes the base layout; other modules create additional data on demand. This is not an exhaustive directory listing. SQLite holds channel data, contracts and events, so copying only Markdown / JSON is insufficient.

## Settings, kernel and artifacts

Electron userData stores application settings and channel session mappings, potentially outside the data root. AckemCode has separate storage: desktop defaults to `<codeRoot>/data/`, channel startup to `~/.ackemcode/`, with an absolute `ACKEMCODE_DATA_DIR` override.

Kernel sessions, model configuration and work artifacts are different data. Work may use directories outside the app root; deleting app data does not delete every artifact.

## Write boundaries

Companion memory and extensions have subsystem-specific write rules. These are not a global Ackem filesystem allowlist. work can operate on external resources under its permission, read-only and exclusion constraints.

Derived indexes can be rebuilt. Databases, contracts, receipts, user sources and work artifacts are not disposable caches. Do not treat all `parts/ackemcode/data/` as build output.

## Backup and migration

1. Stop tasks and exit app/kernel services before copying SQLite and WAL state.
2. Copy active app data, needed userData settings, kernel data and external artifacts.
3. Validate upgrades on a copy. Current migrations extend through V22, with idempotent QQ / Qzone compatibility reconciliation; equal version numbers do not guarantee equal historical branch schemas.
4. Check model settings, owner binding, paths and recovered tasks before running.
5. Backups contain private data and credentials; do not publish them.

[Data layer](developer/architecture/07-data-layer.md) · [Privacy](privacy-and-data.md) · [Kernel](ackemcode-kernel.md)
