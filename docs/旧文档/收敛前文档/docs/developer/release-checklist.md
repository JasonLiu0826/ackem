> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# Release checklist

[中文](release-checklist.zh.md)

## Version and build

- [ ] Confirm intended main changes and CHANGELOG.
- [ ] Match root package and builder versions; maintain kernel/API versions separately.
- [ ] Install and build both application and kernel.
- [ ] Run [verification](testing.md), recording platform, failures and skips.
- [ ] Align README, architecture, channels and permission guides with release source.

```powershell
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run typecheck
npm --prefix parts/ackemcode run build
npm run typecheck
npx tsc --noEmit -p tsconfig.node.json
npm run build
npm run dist:green
```

For Windows setup use `npm run dist:setup`. Validate macOS through its actual build/signing flow; configuration alone does not establish platform acceptance.

## Package and privacy

- [ ] Include source/tsx dependencies and compiled channel entry under `resources/ackemcode`.
- [ ] Exclude private app/kernel data, sessions, model keys, `settings.standalone.json`, tokens, logs and environment files.
- [ ] Review resources, voice dependencies and third-party licensing.
- [ ] Use clean machines or copies, not maintainer databases as package templates.
- [ ] Verify bundled documents/resource paths and compute actual package hashes.

## Runtime acceptance

- [ ] chat/plugin/work select appropriate responsibilities; classification failure never fabricates dispatch.
- [ ] Check permissions, amendments, stopping, receipts, acceptance/rework, output and delivery.
- [ ] Check independent work and CLI startup, queue and stop.
- [ ] Verify channel ownership, remote dispatch setting and permissions.
- [ ] Verify restart recovery, history and backup locations.
- [ ] Legacy assistant UI, tools and IPC remain absent.

## Publication

State platform, dependencies, validated scope, limitations and migration changes; link real artifacts. Source-branch capabilities are not automatically in released packages. Add matching release notes without rewriting old filenames or hashes.
