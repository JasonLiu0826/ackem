# 隐私与数据

> **语言：** 中文 · [English](./privacy-and-data.md)

> **产品**：Ackem v1.0.0  
> **原则**：本地优先。你的数据只留在你的机器上，除非你主动配置否则不会离开。

---

## 1. 数据存储位置

所有数据存储在本机。两种存储模式：

| 模式 | 路径 | 默认用于 |
|------|------|----------|
| **便携模式** | `<Ackem.exe>/data/` | 绿色版（zip） |
| **用户目录** | `%LOCALAPPDATA%\Ackem\` | 安装版（NSIS） |

### 各类数据位置

| 类别 | 位置 | 格式 |
|------|------|------|
| 聊天记录 | `data/companion/chat-history-*.json` | JSON |
| 结构化记忆 | `data/memory/facts/facts.v2.json` | JSON |
| 日记 | `data/diary/*.md` | Markdown |
| 伴侣状态 | `data/companion/self.md`, `state.md` | Markdown |
| 用户导入 | `data/imports/` | 原格式 `.txt`/`.md`/`.json` |
| OpenForU 扩展 | `data/openforu/` | 源文件 |
| 应用状态 | `data/ackem.db` | SQLite |
| 日志 | `data/logs/` | 纯文本 |
| API Key 与设置 | Electron userData → `ackem-app-settings.json` | JSON（系统文件权限保护） |
| 模型缓存 | `data/models/` | 二进制 |

---

## 2. API Key 与凭证

- API Key 在安装后的 **设置** 中填写
- 存储在 Electron 的 `userData` 目录（`ackem-app-settings.json`），受操作系统文件权限保护
- Key **不会**包含在安装包中
- 可随时在 **设置 → 模型与 API** 中查看、修改或删除

---

## 3. 网络出站

Ackem 的网络行为最小且透明：

| 方向 | 用途 | 时机 | 可配置 |
|------|------|------|--------|
| LLM API | 发送对话上下文到你配置的 LLM 地址 | 每轮对话 | 是 — 你设置 Base URL |
| 扩展 `network_outbound` | 扩展发起网络请求（如搜索、天气） | 每次扩展使用 | 是 — 逐扩展授权 |
| 更新检查 | 检查新版本（若启用） | 启动时，可配置 | 是 — 可关闭 |
| **遥测 / 分析** | **无** | **从不** | **不适用——未实现** |

默认唯一的出站流量是发往你配置的 LLM 地址。其他都需要用户主动操作或扩展授权。

---

## 4. 遥测

**Ackem 此版本不含遥测功能。** 没有：
- 对话内容上传
- 使用统计收集
- 远程崩溃报告
- 嵌入应用的第三方分析 SDK

日志（`data/logs/`）在本地写入，用于调试，不会自动发送到任何地方。

---

## 5. 删除与卸载

| 操作 | 结果 |
|------|------|
| 运行 `Uninstall Ackem.bat` | 删除应用文件。**不会**删除 `data/` 或设置 |
| 删除 `data/` 文件夹 | 删除所有记忆、聊天记录、日记、导入内容和日志 |
| 清除设置 | 设置 + API Key 需通过 **设置 → 其他** 或手动删除 Electron userData 目录 |

完全清除所有痕迹：
1. 退出 Ackem（包括系统托盘）
2. 删除应用文件夹（便携版）或通过设置卸载（安装版）
3. 如需清除记忆，删除 `data/`
4. 如需清除 API Key，删除 Electron userData

---

## 6. 用户导入内容

- 你导入的文件（`data/imports/`）在处理后会保留原格式
- 你对导入文件的内容和版权自负责任
- 导入的文件仅存本地，不会上传

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [SECURITY.md](./SECURITY.md) | 漏洞报告与支持版本 |
| [memory-format.md](./memory-format.md) | 数据目录结构详解 |
| [distribution-windows.md](./distribution-windows.md) | 安装包所含内容 |
| [ai-context-and-retrieval-policy.md](./ai-context-and-retrieval-policy.md) | 记忆如何进入 LLM |

*隐私与数据 · Ackem v1.0.0 · 2026-06*
