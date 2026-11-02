> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../README.md)。

# Windows distribution and updates

[中文](distribution-windows.zh.md) · [Release checklist](developer/release-checklist.md)

Select a matching package from [Releases](https://github.com/JasonLiu0826/ackem/releases) and read its platform, dependencies and limitations. Current source does not automatically describe published package features or validation.

## Artifacts

`npm run dist:green` produces `dist/release/Ackem-<version>-win-x64/`; `npm run dist:setup` builds optional setup. Actual names follow build output. Prepared release packages do not require development dependencies.

Packages include the app, resources and AckemCode runtime. Build the app and kernel separately; check desktop source/tsx and channel compiled entry requirements under `resources/ackemcode`.

## Data

Portable mode usually uses a sibling `data/`; user-directory mode uses platform paths. Settings use Electron userData. Kernel data and artifacts can live elsewhere. Packages must not contain maintainer data, sessions or credentials.

Stop tasks/services and back up app data, settings, kernel data and artifacts before updating. Do not overwrite private data or treat a live database copy as a reliable backup.

Uninstalling or deleting the application does not remove every memory, kernel session or external artifact. See [privacy and data](privacy-and-data.md).

## Acceptance

Validate chat/plugin/work, task stopping/acceptance/delivery, independent work/CLI and configured channel authorization. The removed legacy assistant must not be required.

macOS installation/signing follows the specific release notes. Old package documents under `docs/旧文档/公开文档/docs/releases/` remain historical.

[Setup](developer/dev-setup.md) · [Paths](CODEBASE-PATHS.md) · [Data](memory-format.md)
