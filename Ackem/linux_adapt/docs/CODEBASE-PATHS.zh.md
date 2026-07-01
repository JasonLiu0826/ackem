# Ackem 代码库与产物路径说明

> **语言：** 中文 · [English](./CODEBASE-PATHS.md)

> **产品版本**：Ackem **v1.0.0**  
> **更新**：2026-06-30  
> **仓库**：[GitHub](https://github.com/JasonLiu0826/Ackem) · [Gitee](https://gitee.com/jason_2005/ackem)

本文档说明 **Git 仓库里有什么**、**本地构建产物在哪**、**绿色版里有什么**。  
所有路径均为 **相对于对应根目录**，与你在哪台电脑、clone 到哪个文件夹无关。

---

## 1. 两个位置，不要混淆

| 角色 | 根目录 | 典型相对路径 | 用途 |
|------|--------|--------------|------|
| **A. 源码仓库** | `git clone` 后的仓库根 | `./src/`、`./docs/`、`./package.json` | 开发、`git push`、阅读文档 |
| **B. Windows 绿色发行包** | 构建或 Release 解压后的文件夹 | `./Ackem.exe`、`./data/` | 最终用户双击运行；**不含** TypeScript 源码 |

**从源码到绿色版：**

```bash
npm install
npm run dist:green
# → dist/release/Ackem-1.0.0-win-x64/
```

**从 Release 下载：** 解压 `Ackem-v1.0.0-win-x64.zip` 即可，无需 clone 仓库。

---

## 2. 源码仓库目录树（角色 A）

以下路径均相对于 **仓库根**（含 `package.json` 的目录）：

```
./                          ← 仓库根（clone 后的文件夹，名称任意）
├── src/                    ← 主进程 + 渲染进程源码
├── docs/                   ← 对外文档（架构、隐私、分发等）
├── scripts/                ← 构建与工具脚本
├── resources/              ← 图标、embedding 模型等资源
├── voice-service/          ← 可选 TTS 服务（Python）
├── package.json
├── electron-builder.yml
├── out/                    ← npm run build 编译输出（勿提交）
├── node_modules/           ← 依赖（勿提交）
└── dist/                   ← npm run dist:green 打包输出（勿提交）
    └── release/
        └── Ackem-1.0.0-win-x64/   ← 角色 B：绿色版
```

> **版本号说明**：发行文件夹名可能为 `Ackem-1.0.0-win-x64`（electron-builder 构建号），**产品对外版本号为 v1.0.0**。Git Tag 与 Release 使用 **v1.0.0**。

---

## 3. 源码关键目录（角色 A）

| 路径（相对仓库根） | 内容 |
|-------------------|------|
| `src/main/engine/` | 脑+心核心：`orchestrator.ts`、`interpreter.ts`、`relationship.ts`、`emotion.ts`、`psyche.ts` |
| `src/main/memory/` | L4 记忆、embedding、导入 |
| `src/main/prompt/` | 嘴系统 Prompt |
| `src/main/extensions/` | 扩展系统：coordinator、dispatch、openforu |
| `src/main/ipc/` | 渲染进程 API |
| `src/renderer/` | React UI |
| `src/shared/` | 主/渲染共享类型与开关 |
| `electron-builder.yml` | Windows 打包配置 |
| `voice-service/` | 可选 TTS 服务（GPT-SoVITS 等） |

编译：`npm run build` → `out/`（打进 `app.asar`）。

---

## 4. 绿色版目录（角色 B）

以下路径均相对于 **`dist/release/Ackem-1.0.0-win-x64/`**（或 Release zip 解压后的同级目录）：

| 路径 | 内容 |
|------|------|
| `Ackem.exe` | 主程序 |
| `resources/app.asar` | 编译后 JS（**非** TypeScript 源码） |
| `resources/docs/` | 随包分发的文档副本 |
| `resources/models/` | Embedding 等模型（若有） |
| `resources/voice-service/` | 语音服务运行时 |
| `data/` | **用户数据**（首次运行创建；分享 zip 时勿含私人 data） |
| `docs/` | 发行包附带的文档副本 |
| `LICENSE.txt` | AGPL 摘要（若已放置） |

用户 `data/` 由 `src/main/layout.ts` → `ensureDataLayout()` 初始化，结构见 [memory-format.zh.md](./memory-format.zh.md)。

---

## 5. `dist/` 目录（构建产物，勿 push 到 Git）

| 路径（相对仓库根） | 内容 |
|-------------------|------|
| `dist/release/` | 对外绿色版（角色 B 的来源） |
| `dist/fresh-build/` | electron-builder 中间输出 |
| `dist/LICENSE.txt` 等 | 协议副本（模板） |

**.gitignore** 应排除：`dist/`、`node_modules/`、`out/`、`data/`、`.env`。

绿色版体积较大（约 GB 级），通过 **[GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases)** / **[Gitee Releases](https://gitee.com/jason_2005/ackem/releases)** 发布，不进入 Git 历史。

---

## 6. 文档读哪里

| 读者 | 入口 |
|------|------|
| GitHub / Gitee 访客 | 仓库根 [README.zh.md](../README.zh.md) |
| 开发者架构 | [docs/developer/architecture/README.zh.md](./developer/architecture/README.zh.md) |
| 扩展协议 | [docs/developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md](./developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md) |
| 文档总地图 | [docs/OPEN-SOURCE-DOC-MAP.zh.md](./OPEN-SOURCE-DOC-MAP.zh.md) |
| 绿色版用户（离线） | 绿色版内 `docs/README.md` |
| 协议 / legal | 仓库根 `LICENSE`、`CLA.md` |

---

## 7. 版本号约定

| 字段 | v1.0.0 取值 |
|------|-------------|
| 产品 / Git Tag | `v1.0.0` |
| `manifest.engineVersion`（扩展） | `>=1.0.0 <2.0.0`（新扩展建议） |
| 扩展引擎 API `engineApiVersion` | `^1.0.0` |
| electron-builder 目录名 | 可能仍为 `Ackem-1.0.0-win-x64`（构建配置） |

*路径说明 · Ackem v1.0.0*
