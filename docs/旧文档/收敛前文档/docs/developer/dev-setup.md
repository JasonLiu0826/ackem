> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# Developer setup

[中文](dev-setup.zh.md) · [Paths](../CODEBASE-PATHS.md)

## Environment

Current CI uses Windows and Node.js 22. Native dependencies include `better-sqlite3` and `node-pty`; follow installation logs for platform build tools. macOS build configuration exists, but runtime and package validation are separate.

## Install both dependency sets

```powershell
git clone https://github.com/JasonLiu0826/ackem.git
cd ackem
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

Root dependencies are insufficient for the independent kernel. Desktop startup requires kernel source and tsx; channel startup also requires `dist/server/index.js`.

Run through Electron. The renderer requires `window.ackem` from preload; a standalone Vite page lacks the full host API.

## Model and channels

Configure endpoint, key and model in application settings. Old examples using `openaiKey` / `openaiModel` are obsolete; current fields are defined in `settings.ts` and shared types. The settings file lives in Electron userData.

Work can use a separate AckemCode model configuration. Desktop and channel synchronization still differ. The service defaults to localhost port 8787; confirm its actual model and data directory before reusing it.

QQ / WeChat need channel configuration and owner confirmation. Remote code dispatch additionally requires **Settings → Work execution**. No legacy assistant switch is needed.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Electron development |
| `npm run typecheck` | Renderer and shared types |
| `npx tsc --noEmit -p tsconfig.node.json` | Main/preload types |
| `npm --prefix parts/ackemcode run typecheck` | Kernel, CLI and Web UI types |
| `npm run build` | Application build |
| `npm --prefix parts/ackemcode run build` | Kernel build |
| `npm --prefix parts/ackemcode run cli` | Independent CLI |
| `npm run dist:green` / `npm run dist:setup` | Windows packaging |
| `npm run prepare:embedding-models` | Local embedding assets |

The root build script uses Windows `set` syntax. macOS packaging configuration does not make every npm script portable without adaptation.

## Data and verification

Portable development uses the working directory's `data/`. Kernel data, settings and work directories are separate; see the [kernel guide](../ackemcode-kernel.md).

The public repository does not distribute the complete local test suite. Native modules must match the Node/Electron ABI that loads them. Do not overwrite Electron native dependencies merely to run Node tests. Compilation still requires manual routing, tool, stop and delivery acceptance.

[Verification](testing.md) · [Architecture](architecture/README.md) · [Contributing](../../../../../CONTRIBUTING.md)
