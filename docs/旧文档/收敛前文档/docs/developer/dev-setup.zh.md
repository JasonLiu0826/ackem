> 历史归档（六类收敛前）：保留当时说明，仅供追溯；当前入口见[文档导航](../../../../README.md)。

# 开发环境与启动

[English](dev-setup.md) · [路径说明](../CODEBASE-PATHS.zh.md)

## 环境

当前 CI 使用 Windows 与 Node.js 22。应用包含 `better-sqlite3`、`node-pty` 等原生模块；安装失败时按构建日志准备相应平台编译工具。仓库包含 macOS 构建配置，跨平台运行和打包需分别验证。

## 安装两套依赖

```powershell
git clone https://github.com/JasonLiu0826/ackem.git
cd ackem
npm ci
npm --prefix parts/ackemcode ci
npm --prefix parts/ackemcode run build
npm run dev
```

不要只安装根依赖。AckemCode 是独立子包；桌面适配需要内核 tsx 和源码，渠道适配还需要 `dist/server/index.js`。

从 Electron 启动应用，渲染层依赖 `window.ackem` preload。单独打开 Vite 页面不具备完整宿主接口。

## 模型与渠道

在应用设置中填写真实的 Base URL、API Key 和模型名。不要依赖旧文档中的 `openaiKey` / `openaiModel` 示例；当前设置字段与持久化以 `settings.ts` 和共享类型为准，设置文件在 Electron userData。

工作执行可单独配置 AckemCode 模型。桌面与渠道的同步逻辑仍有差异；服务默认使用本机 8787，复用已启动服务前先核对实际模型与数据目录。

QQ / 微信需要配置渠道并在桌面确认机主；远程代码派工另需开启 **设置 → 工作执行**。不需要旧电脑助手开关。

## 开发命令

| 命令 | 用途 |
|---|---|
| `npm run dev` | Electron 开发模式 |
| `npm run typecheck` | 渲染层与共享类型 |
| `npx tsc --noEmit -p tsconfig.node.json` | 主进程与 preload 类型 |
| `npm --prefix parts/ackemcode run typecheck` | 内核服务、CLI 与 Web UI 类型 |
| `npm run build` | 主应用编译 |
| `npm --prefix parts/ackemcode run build` | 独立内核编译 |
| `npm --prefix parts/ackemcode run cli` | 独立 CLI |
| `npm run dist:green` / `npm run dist:setup` | Windows 打包 |
| `npm run prepare:embedding-models` | 准备本地 embedding 资源 |

根 `build` 脚本使用 Windows `set` 语法；不能仅根据 macOS 打包配置就认定这些 npm 脚本可以跨平台原样运行。

## 数据与验证

开发便携模式使用工作目录 `data/`。内核数据、设置和工作目录分别存储，参考[内核文档](../ackemcode-kernel.zh.md)。

公开仓库不分发完整本地测试套件。原生模块必须匹配运行它的 Node / Electron ABI；不要为跑 Node 测试随意覆盖 Electron 的原生依赖。编译成功仍需执行路由、工具、任务停止与交付的手工验收。

[源码验证](testing.zh.md) · [架构](architecture/README.zh.md) · [贡献](../../../../../CONTRIBUTING.zh.md)
