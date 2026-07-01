# 💫 Ackem

![Version](https://img.shields.io/badge/Version-1.0.0-orange?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)
![License](https://img.shields.io/badge/License-AGPL--3.0-blue?style=for-the-badge)
![Local First](https://img.shields.io/badge/Data-Local--First-2ea043?style=for-the-badge)
![OpenAI Compatible](https://img.shields.io/badge/API-OpenAI--Compatible-412991?style=for-the-badge&logo=openai&logoColor=white)
![Electron](https://img.shields.io/badge/Built_with-Electron-47848F?style=for-the-badge&logo=electron&logoColor=white)

**Ackem** · **A**.C.K.E.M — 保持情感记忆的自主伙伴  
*Autonomous Companion Keeping Emotional Memory*

**Ackem v1.0.0** — 运行在你 Windows 电脑上的 **本地优先** AI 伴侣。自备大模型（云端或本机），Ackem 负责对话、记忆、情绪与关系、桌宠陪伴 — **数据都在本机硬盘**。

> **源码**：[GitHub](https://github.com/JasonLiu0826/Ackem) · [Gitee 镜像](https://gitee.com/jason_2005/ackem)  
> **下载**：[GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) · [Gitee Releases](https://gitee.com/jason_2005/ackem/releases)  
> **构建**：`npm run dist:green` → `dist/release/Ackem-1.0.0-win-x64/` · [路径说明](./docs/CODEBASE-PATHS.zh.md) · [文档语言](./docs/I18N.zh.md)  
> **状态：** Ackem 目前仍处于**测试与快速迭代**阶段。个人维护，测试覆盖面有限，使用中可能遇到预期之外的情况或细节瑕疵；一般不会出现频繁闪退或严重卡顿，但完善度仍在持续改进。欢迎 [提交 Issue](https://github.com/JasonLiu0826/Ackem/issues) 反馈。

English: [README.md](./README.md) · [Privacy & data](./docs/privacy-and-data.md)

---

## 一句话了解

Ackem **不是**网页聊天框，而是常驻桌面的 Windows 应用：系统托盘、可选桌宠、结构化记忆，以及能记住上下文的 AI 伴侣。

| | |
|---|---|
| 💬 **对话** | 任意 OpenAI 兼容接口 — DeepSeek、OpenAI、Ollama、LM Studio 等 |
| 🧠 **记忆** | 对话写入可检索记忆；可导入 `.txt` / `.md` 作为长期上下文 |
| 💞 **陪伴** | 信任、情绪、关系阶段、人格预设、日记、可选主动消息 |
| 🔒 **本地优先** | 个人数据在 exe 旁 `./data/` — **官方 zip 不含** `data/` |

**你需要：** Windows 10/11 64 位 · 大模型 API 或本机推理服务 · 首次启动约 10–30 秒（embedding 模型解压一次）。绿色版 **无需 Node.js**。

---

## 界面与演示

<details>
<summary><strong>📷 界面截图</strong>（点击展开）</summary>

<p align="center">
  <img src="./docs/images/01-loading.png" alt="加载界面" width="640" />
  <br /><em>加载界面 — 首次启动解压本地 embedding 模型，进度条完成后进入主界面</em>
</p>

<p align="center">
  <img src="./docs/images/02-home.png" alt="主页面" width="640" />
  <br /><em>主页面 — 对话、记忆、游戏、扩展与设置；右侧为关系状态与桌宠预览</em>
</p>

<p align="center">
  <img src="./docs/images/03-memory-graph.jpg" alt="记忆可视化" width="640" />
  <br /><em>记忆 — 对话沉淀为结构化回忆、时间线与知识关联</em>
</p>

<p align="center">
  <img src="./docs/images/03-settings.png" alt="设置界面" width="640" />
  <br /><em>设置 — 人格、语音、桌宠、微信通道、扩展与数据管理</em>
</p>

<p align="center">
  <img src="./docs/images/04-model-api.png" alt="配置模型" width="640" />
  <br /><em>模型与 API — Base URL、API Key、模型 ID</em>
</p>

<p align="center">
  <img src="./docs/images/05-compliance.png" alt="合规勾选" width="640" />
  <br /><em>合规 — 首次运行确认隐私、数据处理与成人模式条款</em>
</p>

</details>

<details>
<summary><strong>🎬 演示 GIF</strong>（点击展开）</summary>

<p align="center">
  <img src="./docs/images/01-download-open.gif" alt="下载并打开" width="640" />
  <br /><em>下载 zip → 解压 → 启动 Ackem.exe → 等待加载 → 进入主界面</em>
</p>

<p align="center">
  <img src="./docs/images/02-daily-chat.gif" alt="日常对话" width="640" />
  <br /><em>配置模型后自然聊天；回复会结合记忆与关系状态</em>
</p>

</details>

---

## 详细介绍

### Ackem 是什么？

Ackem 是 **本地优先** 的 Windows 桌面程序：你配置大模型接口，Ackem 负责 **对话、记忆、情绪与关系状态、桌宠陪伴**，数据保存在 **你自己的电脑** 上。

### 你可以用它做什么

- **像和人聊天一样对话** — 云端或本机 Ollama / LM Studio；在 **设置 → 模型与 API** 填写即可。
- **记住你们说过的事** — 结构化记忆、搜索、时间线、知识图谱；**导入** txt / md 作为长期记忆。
- **有连续感的陪伴** — 信任、情绪、关系阶段、人格预设、伴侣 **日记**、可选主动找你聊几句。
- **不只在主窗口** — 系统托盘；可选 **桌宠** 小窗（几何光球 + Live2D 预览）。
- **可选能力** — 语音识别与播报、**微信** 通道（手机发消息、大脑在本机）、**扩展中心**、实验中的 **Plan · OpenForU**。
- **游戏模式** — 实验中；可与伴侣一起玩支持的游戏（如 Minecraft，视扩展而定）。

### 数据在哪里

绿色版默认把全部个人数据放在 **exe 同级的 `data/`**：聊天记录、记忆、日记、设置里的 API Key 等。**官方 zip 不含 `data/`**，首次运行才在本机生成空目录。无默认上传到 Ackem 服务器的遥测。

备份、迁移、删除：[docs/memory-format.zh.md](./docs/memory-format.zh.md) · [docs/distribution-windows.zh.md](./docs/distribution-windows.zh.md)

### 给开发者

请看下方 **[开发者](#开发者)**、[系统架构](#系统架构七系统) 与 [文档索引](#文档)。

---

## 5 分钟上手（终端用户）

适用：**已下载官方 Release**，本机 **无需 Node.js**。

### 隐私说明（必读）

| 官方包 **不含** | 首次运行后 **仅在本机** |
|----------------|------------------------|
| 用户记忆、聊天记录、导入文件 | `data/`（便携模式，exe 旁） |
| API Key、模型凭证 | 设置 → 本机 userData |
| 维护者或他人的私人数据 | 由你自己配置与写入 |

详见 [docs/distribution-windows.zh.md](./docs/distribution-windows.zh.md)。

### 步骤

1. **下载** — [GitHub Releases](https://github.com/JasonLiu0826/Ackem/releases) 或 [Gitee Releases](https://gitee.com/jason_2005/ackem/releases) 获取 `Ackem-v1.0.0-win-x64.zip`
2. **解压** — 完整解压到 SSD 目录（勿在 zip 内直接运行）
3. **启动** — 双击 `Ackem.exe` 或 `启动 Ackem.bat`；首次约 10–30 秒（见 [加载界面](#界面与演示)）
4. **合规确认** — 勾选隐私与数据处理条款（见 [合规截图](#界面与演示)）
5. **配置模型** — **设置 → 模型与 API**：Base URL、API Key（云端必填）、模型 ID
6. **首次对话** — 发一条消息确认回复；可选导入 txt/md 记忆

> **分享 zip 前：** 切勿把个人 `data/` 文件夹打进压缩包 — 其中含对话、记忆与密钥。

---

## 开发者

> Ackem 是 **Electron 应用**，渲染进程依赖 `window.ackem`（preload IPC）。  
> 请用 **`npm run dev`** 启动，不要在浏览器单独打开 Vite 地址。

### 环境

- Windows 10/11 · Node.js **20+** · `npm ci`

### 日常开发

```bash
cd Ackem-v0.0.0
npm install
npm run dev
```

开发时 `data/` 在工作目录下，与绿色版 exe 旁的 `data/` 相互独立。

### 构建与打包

```bash
npm run build          # 编译 → out/
npm run dist:green     # 绿色版 → dist/release/
npm run dist:setup     # 可选 NSIS 安装包
```

### 测试

```bash
npm run typecheck
npm test
npm run test:renderer
```

---

## 系统架构（七系统）

| # | 系统 | 说明 | 文档 |
|---|------|------|------|
| ① | 整体 | Electron、orchestrator、一轮对话链路 | [00-overall-system.md](./docs/developer/architecture/00-overall-system.md) |
| ② | 脑 | L0 理解 + L4 记忆检索与衰减 | [01-brain-system.md](./docs/developer/architecture/01-brain-system.md) |
| ③ | 心 | L1 关系 + L2 情绪 + L3 表达 | [02-heart-system.md](./docs/developer/architecture/02-heart-system.md) |
| ④ | 嘴 | Prompt 组装 + LLM 调用 | [03-mouth-system.md](./docs/developer/architecture/03-mouth-system.md) |
| ⑤ | 神经 | Embedding / 向量检索 | [04-neural-system.md](./docs/developer/architecture/04-neural-system.md) |
| ⑥ | 扩展 | Skill/Plugin/Dispatch/OpenForU | [05-extension-system.md](./docs/developer/architecture/05-extension-system.md) |
| ⑦ | 时间 | 时间感知、作息曲线、重逢、感慨 | [06-time-system.md](./docs/developer/architecture/06-time-system.md) |
| — | 数据层 | SQLite 模式、Repository、迁移 | [07-data-layer.md](./docs/developer/architecture/07-data-layer.md) |
| — | IPC 接口 | `window.ackem.*` preload 桥、推送事件 | [08-ipc-api.md](./docs/developer/architecture/08-ipc-api.md) |

索引：[docs/developer/architecture/README.md](./docs/developer/architecture/README.md)

---

## 文档

> **语言：** English（`*.md`）· 中文（`*.zh.md`）— 见 [I18N.zh.md](./docs/I18N.zh.md)

| 用途 | English | 中文 |
|------|---------|------|
| 代码库与产物路径 | [CODEBASE-PATHS.md](./docs/CODEBASE-PATHS.md) | [CODEBASE-PATHS.zh.md](./docs/CODEBASE-PATHS.zh.md) |
| 开源文档地图（维护者） | [OPEN-SOURCE-DOC-MAP.md](./docs/OPEN-SOURCE-DOC-MAP.md) | [OPEN-SOURCE-DOC-MAP.zh.md](./docs/OPEN-SOURCE-DOC-MAP.zh.md) |
| 扩展开发者协议 | [DEVELOPER-EXTENSION-PROTOCOL.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md) | [DEVELOPER-EXTENSION-PROTOCOL.zh.md](./docs/developer/DEVELOPER-EXTENSION-PROTOCOL.zh.md) |
| 开发者环境搭建 | [dev-setup.md](./docs/developer/dev-setup.md) | [dev-setup.zh.md](./docs/developer/dev-setup.zh.md) |
| 架构索引 | [architecture/README.md](./docs/developer/architecture/README.md) | [architecture/README.zh.md](./docs/developer/architecture/README.zh.md) |
| 数据目录格式 | [memory-format.md](./docs/memory-format.md) | [memory-format.zh.md](./docs/memory-format.zh.md) |
| AI 上下文与检索 | [ai-context-and-retrieval-policy.md](./docs/ai-context-and-retrieval-policy.md) | [ai-context-and-retrieval-policy.zh.md](./docs/ai-context-and-retrieval-policy.zh.md) |
| 隐私与数据处理 | [privacy-and-data.md](./docs/privacy-and-data.md) | [privacy-and-data.zh.md](./docs/privacy-and-data.zh.md) |
| 本地模型配置 | [local-models-windows.md](./docs/local-models-windows.md) | [local-models-windows.zh.md](./docs/local-models-windows.zh.md) |
| 成人模式与安全 | [adult-and-safety-policy.md](./docs/adult-and-safety-policy.md) | [adult-and-safety-policy.zh.md](./docs/adult-and-safety-policy.zh.md) |
| 感知能力 | [perception-layer.md](./docs/perception-layer.md) | [perception-layer.zh.md](./docs/perception-layer.zh.md) |
| 敏感能力 | [sensitive-capabilities.md](./docs/sensitive-capabilities.md) | [sensitive-capabilities.zh.md](./docs/sensitive-capabilities.zh.md) |
| Windows 分发 | [distribution-windows.md](./docs/distribution-windows.md) | [distribution-windows.zh.md](./docs/distribution-windows.zh.md) |
| 索引与规模 | [indexing-and-scale.md](./docs/indexing-and-scale.md) | [indexing-and-scale.zh.md](./docs/indexing-and-scale.zh.md) |
| 安全策略 | [SECURITY.md](./SECURITY.md) | [SECURITY.zh.md](./SECURITY.zh.md) |
| 贡献指南 | [CONTRIBUTING.md](./CONTRIBUTING.md) | [CONTRIBUTING.zh.md](./CONTRIBUTING.zh.md) |
| 行为准则 | [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | [CODE_OF_CONDUCT.zh.md](./CODE_OF_CONDUCT.zh.md) |

---

## 许可证

本项目以 [AGPL-3.0](./LICENSE) 协议开源。

| 使用场景 | 是否允许 |
|---------|---------|
| 个人学习与研究 | ✅ 允许 |
| 开源项目集成（需同样以 AGPL-3.0 开源） | ✅ 允许 |
| 学术研究与论文引用 | ✅ 允许 |
| 闭源商业产品 | ❌ 需商业授权 |
| SaaS 服务（不向用户提供源码） | ❌ 需商业授权 |
| 企业私有化部署（不开源） | ❌ 需商业授权 |
| 闭源产品通过 API 调用（不修改源码） | ⚠️ 灰色地带，建议咨询 |

### 商业授权

如需商业授权，请联系：**jasonliu_lyf_2005@qq.com**

### 贡献者协议

向本项目提交贡献，即表示您同意 [贡献者许可协议（CLA）](./CLA.md)。

版权所有 (C) 2026 Jason Liu (JasonLiu0826)

---

*开源版侧重本地 txt/md 与可审计检索。闭源商业部署或 SaaS 场景见 [LICENSE](./LICENSE) 中的商业授权说明。*
