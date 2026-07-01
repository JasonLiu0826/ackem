# 安全策略 · Security Policy

---

## 支持的版本

| 版本 | 支持状态 |
|------|----------|
| v1.0.0 | ✅ |
| v1.0-rc | ✅ |
| 更早版本 | ❌ |

## 报告漏洞

**请勿** 针对敏感安全问题公开提交 Issue。

请发送邮件至 **jasonliu_lyf_2005@qq.com**（项目维护者），包含：
- 问题描述与影响范围
- 复现步骤
- 受影响版本/构建（Release tag 或 commit）

我们承诺在 **7 日内** 确认收到。

## 官方发行版内容

官方 **绿色版** 和 **安装包** 包含：
- 编译后的应用程序（`resources/app.asar`）
- 运行所需的依赖
- `resources/` 下的可选静态文件（模型、语音服务）

**不包含**：
- 你的 `data/` 目录（记忆、聊天记录、导入内容、OpenForU 工作区）
- API Key 或模型凭证
- 开发 `.env` 文件
- 任何维护者的机器状态

凭证在安装后通过 **设置** 界面填写，存储在本机。

## 本机数据

| 数据 | 典型位置 |
|------|----------|
| 记忆/导入（便携模式） | `Ackem.exe` 旁 → `data/` |
| 记忆（用户目录模式） | `%LOCALAPPDATA%\Ackem\` |
| 应用设置与 API Key | Electron userData → `ackem-app-settings.json` |

卸载应用 **不会** 将数据上传到任何地方。

## 代码库位置

| 角色 | 路径 |
|------|------|
| GitHub 源码 | 仓库根（`Ackem-v0.0.0/`） |
| Windows 绿色版 | `dist/release/Ackem-1.0.0-win-x64/` |

详见 [CODEBASE-PATHS.zh.md](./docs/CODEBASE-PATHS.zh.md)。

*Ackem v1.0.0 · 安全策略*
