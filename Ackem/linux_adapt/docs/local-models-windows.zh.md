# 本地模型配置

> **语言：** 中文 · [English](./local-models-windows.md)

> **产品**：Ackem v1.0.0  
> **适用**：想使用本地 LLM 推理而非云端 API 的用户

---

## 1. 概述

Ackem 使用 **两种模型**：

| 模型 | 用途 | 运行位置 | 用户可配置？ |
|------|------|----------|-------------|
| **LLM** | 对话、记忆提取、日记生成 | 你配置的地址（云端或本地） | 是 — **设置 → 模型与 API** |
| **Embedding** | 语义搜索、意图分类 | **本机 ONNX**（捆绑或下载） | 否 — 自动；见下方说明 |

**LLM** 是 BYOK（自带密钥/模型）。Ackem 不捆绑任何 LLM。

**Embedding 模型**（bge-small 中/英）随应用捆绑或在首次启动时自动下载，通过 ONNX Runtime 在本机运行。

---

## 2. 本地 LLM 后端

### Ollama

1. 从 [ollama.com](https://ollama.com) 下载安装
2. 拉取模型：`ollama pull qwen2.5:7b`（或任何 OpenAI 兼容模型）
3. 确保 Ollama 在运行（系统托盘图标）
4. 在 Ackem **设置 → 模型与 API**：

| 字段 | 值 |
|------|-----|
| Base URL | `http://localhost:11434/v1` |
| API Key | 留空（如需占位符可填任意内容） |
| Model ID | `qwen2.5:7b`（或你拉取的模型名） |

### LM Studio

1. 从 [lmstudio.ai](https://lmstudio.ai) 下载安装
2. 在 LM Studio 中加载模型
3. 启动本地推理服务器（点击"Start Server"）
4. 在 Ackem **设置 → 模型与 API**：

| 字段 | 值 |
|------|-----|
| Base URL | `http://localhost:1234/v1` |
| API Key | 留空 |
| Model ID | LM Studio 中显示的模型名 |

### 其他 OpenAI 兼容后端

任何提供 OpenAI 兼容 `/v1/chat/completions` 接口的服务器均可：

| 后端 | 典型 Base URL | 说明 |
|------|---------------|------|
| Ollama | `http://localhost:11434/v1` | 免费，模型支持广泛 |
| LM Studio | `http://localhost:1234/v1` | 图形界面，方便浏览模型 |
| Text Generation WebUI | `http://localhost:5000/v1` | 需 `--api` 参数 |
| vLLM | `http://localhost:8000/v1` | 生产级，推荐 GPU |
| LocalAI | `http://localhost:8080/v1` | Docker 或原生 |

---

## 3. 防火墙说明

- 所有本地推理服务器默认监听 `localhost`（127.0.0.1）——无需配置防火墙
- 如果使用局域网内其他机器，将 `localhost` 替换为对应 IP 并确保端口可达
- Ackem 永远不会将你的数据发送到配置的 Base URL 之外

---

## 4. Embedding 模型（自动）

Ackem 捆绑了 **bge-small** embedding 模型（中英文变体），用于本地语义搜索：

- 通过 **ONNX Runtime**（`onnxruntime-node`）运行
- 首次启动时解压到 `data/models/`
- 约 30MB 下载，约 100MB 解压
- 如果 ONNX Runtime 不可用或模型加载失败，Ackem **优雅降级** 到 TF-IDF 关键词检索——聊天不受影响

可在 **设置 → 系统** 查看 embedding 状态："降级"指示器表示向量搜索不可用。

---

## 5. 性能预期

| 硬件 | LLM（7B Q4） | Embedding |
|------|-------------|-----------|
| GPU 6GB+ 显存 | 20–40 tok/s | 即时 |
| GPU 4GB 显存 | 10–20 tok/s | 即时 |
| 仅 CPU（现代） | 2–5 tok/s | 10–50ms/次 |
| 仅 CPU（较旧） | 1–3 tok/s | 50–200ms/次 |

Embedding 推理即使在 CPU 上也很快速（bge-small 仅约 30MB）。

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [ai-context-and-retrieval-policy.zh.md](./ai-context-and-retrieval-policy.zh.md) | Embedding 在检索中的作用 |
| [architecture/04-neural-system.md](./developer/architecture/04-neural-system.md) | 神经系统架构 |
| [memory-format.zh.md](./memory-format.zh.md) | 模型缓存位置（`data/models/`） |

*本地模型配置 · Ackem v1.0.0 · 2026-06*
