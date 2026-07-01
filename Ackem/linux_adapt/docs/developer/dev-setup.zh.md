# 开发环境搭建 · Developer Setup

> **语言：** 中文 · [English](./dev-setup.md)

> **读者**：从源码运行 Ackem 的开发者  
> **代码版本**：v1.0.0  
> **平台**：Windows 10/11 64-bit

---

## 1. 前置要求

| 工具 | 版本 | 说明 |
|------|------|------|
| **Node.js** | >= 20.x | 推荐 v22 LTS，[下载](https://nodejs.org/) |
| **npm** | >= 10.x | 随 Node.js 分发 |
| **Git** | >= 2.40 | [下载](https://git-scm.com/) |
| **Windows** | 10+ 64-bit | 当前仅支持 Windows 桌面 |

### 可选

| 工具 | 用途 |
|------|------|
| **Visual Studio Build Tools** | 可选 — 仅在 `better-sqlite3` 原生模块编译失败时需要 |
| **ONNX Runtime** | Embedding 模型推理，via `npm i onnxruntime-node` |
| **Python 3.10+** | 语音服务（TTS/STT），需在设置中配置 `voice-service/` 路径 |
| **Ollama / LM Studio** | 本地 LLM 推理（非必需，可用云端 API） |

---

## 2. 快速开始

```bash
# 克隆仓库
git clone https://github.com/JasonLiu0826/Ackem.git
cd Ackem

# 安装依赖
npm ci

# 启动开发模式
npm run dev
```

首次启动会自动创建 `data/` 目录结构并初始化 SQLite 数据库。

### 重要提示

- 渲染进程依赖 preload 注入的 `window.ackem` API，**必须**在 Electron 中运行
- **不要**直接在浏览器中打开 Vite 地址（`http://localhost:5173`）——缺少 IPC 桥会导致白屏
- 开发时 `data/` 在工作目录下，与绿色版 exe 旁的 `data/` 相互独立

---

## 3. 配置 LLM

Ackem 需要 LLM API 才能正常工作。在应用 **Settings → Model & API** 中配置：

| 字段 | 示例值（Ollama） | 示例值（OpenAI） |
|------|------------------|------------------|
| Base URL | `http://localhost:11434/v1` | `https://api.openai.com/v1` |
| API Key | `ollama`（占位） | `sk-...` |
| Model ID | `qwen2.5:7b` | `gpt-4o-mini` |

也可直接编辑 `data/ackem-app-settings.json`：

```json
{
  "openaiBaseUrl": "http://localhost:11434/v1",
  "openaiKey": "ollama",
  "openaiModel": "qwen2.5:7b"
}
```

详细配置说明见 [docs/local-models-windows.md](../local-models-windows.md)。

---

## 4. 可用脚本

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发模式（electron-vite dev + 热重载） |
| `npm run dev:win` | 同上，预设 8GB 内存限制 |
| `npm run build` | 编译到 `out/` |
| `npm run preview` | 预览生产构建 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm test` | 运行测试 |
| `npm run dist:green` | 打包绿色版到 `dist/release/` |
| `npm run dist:setup` | 打包 NSIS 安装程序 |
| `npm run prepare:embedding-models` | 下载/解压 embedding 模型 |
| `npm run sync:release-doc` | 同步文档到 `dist/release/doc/` |

---

## 5. 开发目录结构

```
ackem/
├── src/
│   ├── main/           # 主进程（引擎、记忆、数据、IPC）
│   ├── renderer/       # 渲染进程（React UI）
│   └── preload/        # Electron preload 桥
├── data/               # 运行数据（gitignored）
├── dist/               # 构建输出（gitignored）
├── out/                # electron-vite 编译输出
├── docs/               # 文档
└── resources/          # 应用资源
```

完整目录地图见 [architecture/00-overall-system.md](./architecture/00-overall-system.md)。

---

## 6. Embedding 模型

Ackem 使用 **bge-small** 模型进行本地语义搜索（通过 ONNX Runtime）：

```bash
# 手动准备 embedding 模型（首次 dev 会自动解压）
npm run prepare:embedding-models
```

- 模型解压到 `data/models/`（约 100MB）
- 可选依赖 `onnxruntime-node`，缺失时降级到 TF-IDF 检索
- 可在 **Settings → System** 查看 embedding 状态

---

## 7. 常见问题

### 构建内存不足

```bash
# 设置 Node.js 内存上限
$env:NODE_OPTIONS = "--max-old-space-size=8192"
npm run build
```

### `better-sqlite3` 编译失败

electron-vite 自动处理原生模块重编译。若失败：
1. 确保安装了 Visual Studio Build Tools（Windows）
2. 运行 `npm run postinstall` 触发 `electron-builder install-app-deps`

### onnxruntime-node 安装失败

这是可选依赖，不影响应用启动。Embedding 检索会自动降级为 TF-IDF。如需安装：

```bash
npm install onnxruntime-node
```

### 杀软误报

NSIS 安装包可能被 Windows Defender 误报。可改用绿色版（`dist:green`），或向杀软提交误报申诉。

---

## 8. 包管理说明

| 依赖类型 | 说明 |
|----------|------|
| `dependencies` | 运行时必需（better-sqlite3, d3, zustand, ws, opencc, mineflayer, qrcode） |
| `optionalDependencies` | onnxruntime-node（加载失败不影响核心功能） |
| `devDependencies` | 构建/开发工具（electron, vite, typescript, vitest, tailwindcss） |

---

## 9. 相关文档

| 文档 | 内容 |
|------|------|
| [architecture/00-overall-system.md](./architecture/00-overall-system.md) | 项目结构总览 |
| [testing.md](./testing.md) | 测试指南 |
| [release-checklist.md](./release-checklist.md) | 发布流程 |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | 贡献指南 |
| [DEVELOPER-EXTENSION-PROTOCOL.md](./DEVELOPER-EXTENSION-PROTOCOL.md) | 扩展开发 |

*Developer Setup · Ackem v1.0.0 · 2026-06*
