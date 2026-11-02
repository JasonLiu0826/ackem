# Development guide

[中文](development.zh.md) · [Documentation](README.en.md)

## Environment

Source quick-start commands have one home in the [README](../README.en.md#quick-start-from-source). Current CI uses Windows / Node.js 22; root build scripts use Windows `set` syntax. macOS configuration does not establish validated runtime, signing or native dependencies.

The application and `parts/ackemcode` have separate dependencies and builds. Desktop adapters need kernel source and tsx; channel adapters need the compiled server. Do not install only root dependencies. The renderer needs `window.ackem`; opening Vite alone lacks full host interfaces.

`better-sqlite3` and `node-pty` must match the Node / Electron ABI loading them. Follow installation logs for platform build tools rather than overwriting Electron dependencies just to run Node tests. See [kernel adapters](modules.md#ackemcode) for models, directories and service reuse.

## Extensions

Existing capabilities use plugin; creating or changing extensions uses work. Generation still needs manifest, registration, permissions, loading and runtime acceptance. Ackem extension contracts differ from kernel skill / plugin interfaces.

| Namespace | Purpose and status |
|---|---|
| `ackem/` | Official built-ins; registration and active state define availability |
| `u/` | Local OpenForU extensions loaded from the active data root |
| `community/` | Signed marketplace protocol; `COMMUNITY_EXTENSIONS_OPEN=false` |

IDs are `<scope>/<name>@<semver>`. Built-in Skills / Plugins live under `src/main/extensions/skills/builtin/` and `plugins/builtin/`. Local extensions live under `<dataRoot>/openforu/uskills/` and `uplugins/`. Source examples and templates do not install themselves.

[protocols.ts](../src/main/extensions/protocols.ts) defines snapshots, events, lifecycle and dispatch; [coordinator.ts](../src/main/extensions/coordinator.ts) assembles registration and runtime. Implement typed handlers, hooks / invoke / Surface and communicate through the contract rather than mutating engine state directly. Callable catalog entries need valid dispatch, implementation and active state; background hooks / skins need not all be route candidates.

The [OpenForU protocol](../src/main/extensions/openforu/PROTOCOL.md) retains Plan, deployment, Worker and Surface details. These extension mechanisms do not route every creation request through old Plan entry points; staging restrictions do not define the kernel's global filesystem boundary.

Current [constants.ts](../src/main/extensions/ecosystem/constants.ts) defines `ACKEM_APP_VERSION='0.0.0'` and `ACKEM_ENGINE_API_VERSION='1.0.0'` independently of the root app version. `engineVersion` and `engineApiVersion` validate app and protocol ranges. Check [manifestValidate.ts](../src/main/extensions/ecosystem/manifestValidate.ts) when changing compatibility; do not mass-edit manifests merely to align documentation versions.

Verify registration, disable / enable, catalog, permissions, actual calls and receipts. Missing, disabled or failed capabilities must be reported accurately. Follow [CONTRIBUTING](../CONTRIBUTING.md).

## Verification

```powershell
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm --prefix parts/ackemcode run typecheck
npm --prefix parts/ackemcode run build
npm run build
```

These cover renderer / shared types, main / preload, kernel types and build, and the application build. The full local suite is not distributed; there is no root `npm test` promise. A few tracked tests do not establish full regression coverage.

| Affected path | Runtime acceptance |
|---|---|
| chat | Conversation, memory, streaming, attachments and history |
| plugin | Actual calls, missing / disabled capability and failure receipts |
| Managed work | Creation, amendments, queues, approvals, tools, acceptance / rework and delivery |
| Stop and recovery | Quiescence receipts, restart and isolation from old events |
| Independent work | Private queue, modes, CLI and actual behavior when hidden |
| QQ / WeChat | Ownership, remote switch, permission changes, requesting-channel replies and shared history |
| Packaging | Clean launch, kernel entries, models, data and resource paths |

Record inputs, actual output, environment and gaps. Real models, channels and services require credentials and live services. Native loading errors are environment failures. Exit code 0 without final counts, early return, skips or unfinished collection do not establish complete success.

## Release

Windows portable: `npm run dist:green`; installer: `npm run dist:setup`. Root builds do not replace kernel builds. Before release, check:

- Version, intended changes and CHANGELOG; application, kernel, schema and extension API versions are independent.
- Source / tsx and compiled service entries plus dependencies under `resources/ackemcode`.
- Runtime acceptance of chat / plugin / work, independent work, channels, stop / recovery and delivery.
- Exclusion of personal data, keys, tokens, kernel sessions, `settings.standalone.json`, logs and `.env`.
- Documentation entry points, images, protocols, third-party notices and actual artifact paths on a copy or clean machine.
- Platform, dependencies, validation scope, limitations, migration and real artifact hashes in release notes; preserve historical filenames and hashes.

`node scripts/sync-release-doc.mjs <portable-directory>` synchronizes packaged documentation. The target must be a mutable release directory. It replaces documentation and strips personal `data/`; never point it at a personal installation in daily use.

## Documentation

See the six categories in the [documentation index](README.en.md). Maintain each full explanation in its primary guide and link elsewhere. Source-adjacent READMEs retain local interfaces and implementation. Keep languages aligned rather than adding another project overview for each concept.

Display entry points are Chinese-first: `README.md` is Chinese and `README.en.md` is English. Other main guides retain `name.zh.md` for Chinese and `name.md` for English; the Chinese index links to Chinese guides first. Provide a language switch and update both languages when meaning changes; a word-for-word translation is not required.

Figures display SVG or Mermaid directly; editable sources live in [diagrams](diagrams/README.en.md). Reading pages contain no folding tags or generation markers.

```powershell
node scripts/render-doc-figures.mjs
node scripts/render-doc-figures.mjs --check
```

Check relative links, headings, source paths, commands and diagram semantics. Documentation edits usually do not need business regression tests; synchronization changes should generate a temporary release copy and verify links and archive exclusion. Retain previous explanations only in the [archive](旧文档/README.md), outside release packages and without placeholder entry pages.
