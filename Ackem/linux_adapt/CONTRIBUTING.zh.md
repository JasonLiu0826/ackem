# 贡献指南 · Contributing Guide

> **语言：** 中文 · [English](./CONTRIBUTING.md)

> 欢迎为 Ackem 贡献代码、文档或反馈！

---

## 欢迎的贡献

- Bug 修复与回归测试
- 文档（README、架构、数据格式、扩展协议）
- 官方扩展：经 OpenForU `u/` 本机验证后，PR 到内置 `ackem/` 目录
- 国际化（i18n）与无障碍改进
- 性能与安全修复

## 暂不接收

- 未在 Issue 中讨论的大型架构重写
- 含 API Key、`.env`、私人 `data/` 的 PR
- 试图启用已关闭的 `community/` 市场流水线

---

## 1. 开发环境要求

| 工具 | 版本要求 | 说明 |
|------|----------|------|
| **Node.js** | >= 20.x | 推荐 v22 LTS |
| **npm** | >= 10.x | 随 Node.js 分发 |
| **Git** | >= 2.40 | 版本管理 |
| **OS** | Windows 10+ | 当前仅支持 Windows 桌面 |

> 当前仅支持 Windows。macOS/Linux 构建尚未验证。

### 可选依赖

| 工具 | 用途 |
|------|------|
| ONNX Runtime | Embedding 模型推理（`npm install onnxruntime-node`） |
| Python 3.10+ | 语音服务（TTS/STT） |
| Ollama / LM Studio | 本地 LLM 推理 |

---

## 2. 搭建开发环境

```bash
git clone https://github.com/JasonLiu0826/Ackem.git
cd Ackem
npm ci
npm run dev
```

首次启动会自动创建 `data/` 目录并初始化 SQLite。

> 渲染进程依赖 `window.ackem` preload API，**必须**在 Electron 中运行，不可在浏览器中单独打开。

### 配置 LLM

编辑 `data/ackem-app-settings.json` 或在设置界面配置：

```json
{
  "openaiBaseUrl": "http://localhost:11434/v1",
  "openaiKey": "ollama",
  "openaiModel": "qwen2.5:7b"
}
```

---

## 3. 可用命令

| 命令 | 用途 |
|------|------|
| `npm run dev` | 启动开发模式 |
| `npm run build` | 编译到 `out/` |
| `npm test` | 运行测试 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run dist:green` | 打包绿色版 |
| `npm run dist:setup` | 打包 NSIS 安装程序 |
| `npm run prepare:embedding-models` | 下载 embedding 模型 |

---

## 4. 项目结构

```
ackem/
├── src/main/           # 主进程（引擎、记忆、数据、IPC）
├── src/renderer/       # 渲染进程（React UI）
├── src/preload/        # Electron preload 桥
├── data/               # 运行数据（gitignored）
├── docs/               # 文档
└── resources/          # 应用资源
```

详细目录见 [architecture/00-overall-system.zh.md](./docs/developer/architecture/00-overall-system.zh.md)。

---

## 5. 代码规范

- TypeScript 严格模式，禁止 `any`
- 文件命名：小写驼峰（`emotion.ts`）
- 函数命名：小写驼峰（`emotionStep()`）
- 类型/接口：PascalCase（`FullState`）
- 常量：大写蛇形（`TIER_B_CHAR_BUDGET`）
- **无类**：优先模块内自由函数
- **无基类/继承**：组合优于继承
- **副作用的函数**：`dataRoot` 作为首参
- 提交消息：`<type>: <描述>`（feat/fix/docs/refactor/perf/test/chore）

---

## 6. PR 流程

1. Fork 仓库，从 `main` 创建特性分支（`fix/`、`feat/`、`docs/`）
2. 确保 `npm test` 全部通过
3. 提交 PR，说明动机、变更范围、验证方式
4. 合并前须同意 [CLA.md](./CLA.md)

---

## 7. 扩展贡献

1. 在本机 `data/openforu/` 用 `u/` 命名空间开发 Skill/Plugin
2. 稳定后 PR 到内置 `ackem/` 目录
3. `community/` 扩展市场未开放

详见 [DEVELOPER-EXTENSION-PROTOCOL.zh.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md)。

---

## 8. 许可证

提交并被合并的代码以 **AGPL-3.0** 发布；您同时授予维护者在 CLA 中描述的多许可权利。

---

## 联系

- 安全问题：[SECURITY.zh.md](./SECURITY.zh.md)
- 邮箱：**jasonliu_lyf_2005@qq.com**

---

*Ackem v1.0.0 · 贡献指南*
