> 历史归档：保留旧版内容，仅供追溯；当前实现请阅读[新版文档导航](../../../../README.md)。

# Source validation

[中文](testing.zh.md)

This repository publishes application source. Local test suites, test helpers, audit snapshots, credentials and generated caches are excluded.

Install both dependency sets:

```bash
npm ci
npm --prefix parts/ackemcode ci
```

Validate the desktop renderer and compile the application:

```bash
npm run typecheck
npm run build
```

Validate the independent runtime and CLI:

```bash
npm --prefix parts/ackemcode run typecheck
```

The root typecheck covers the renderer and shared types. The application build compiles the main process, preload and renderer. These checks do not constitute an end-to-end runtime test. CI runs on Windows with Node.js 22.
