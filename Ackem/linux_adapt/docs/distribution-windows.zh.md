# Windows 分发说明

> **语言：** 中文 · [English](./distribution-windows.md)

> **产品版本**：Ackem **v1.0.0**  
> **绿色版路径**：`dist/release/Ackem-1.0.0-win-x64/`

---

## 安装包里有什么、没有什么

### 包含

| 内容 | 说明 |
|------|------|
| `Ackem.exe` | Electron 主程序 |
| `resources/app.asar` | 编译后应用代码 |
| `resources/models/` | Embedding 模型（若随包分发） |
| `voice-service/` | 语音服务运行时（可选启用） |
| `docs/` | 开发者文档副本 |

### 绝不包含

| 内容 | 说明 |
|------|------|
| 用户 `data/` | 记忆、聊天、导入、OpenForU |
| API Key | 首次运行后在设置中填写 |
| `.env` / 开发密钥 | 构建已排除 |

---

## 使用步骤（绿色版）

1. 从 GitHub **Releases** 下载 `Ackem-v1.0.0-win-x64.zip`
2. **完整解压** 到 SSD 目录（勿在 zip 内直接运行）
3. 双击 `Ackem.exe` 或 `启动 Ackem.bat`
4. 首次启动 10–30 秒（embedding 初始化）
5. **设置** 中配置 Base URL、API Key、模型 ID
6. 数据保存在 `./data/`（便携模式）

详见同目录 `START.txt`。

---

## 数据目录

| 模式 | 路径 |
|------|------|
| 便携 | `.\data\` |
| 用户目录 | `%LOCALAPPDATA%\Ackem\` |

结构见 [memory-format.zh.md](./memory-format.zh.md)。

---

## 常见问题

### 杀软误报

NSIS 安装包可能被 Windows Defender 误报。解决方案：
- 改用绿色版（推荐）
- 向杀软提交误报申诉
- 临时添加到杀软排除列表

### 缺少 VC++ 运行库

如果启动时提示缺少 DLL，安装 [VC++ Redistributable](https://aka.ms/vcredist)。

### 绿色版 vs 安装版

| | 绿色版 | NSIS 安装版 |
|---|--------|-------------|
| 安装步骤 | 解压即用 | 需运行安装向导 |
| 便携 | ✅ 默认 | 可选 |
| 开始菜单快捷方式 | 无 | ✅ 自动创建 |
| 卸载程序 | 删除文件夹 | 控制面板卸载 |
| 杀软误报 | 低 | 较高 |

---

## 卸载

- 便携版：删除文件夹；或运行 `Uninstall Ackem.bat`
- 卸载 **不会** 上传你的数据；删除 `data/` 才会清除本地记忆

---

## 源码 vs 发行包

| | 源码仓库 | 绿色版 |
|---|----------|--------|
| 路径 | `Ackem-v0.0.0/`（GitHub） | `dist/release/Ackem-1.0.0-win-x64/` |
| 内容 | `src/` TypeScript | `app.asar` 编译产物 |
| 需要 Node | 是（开发） | 否（用户） |

路径总览：[CODEBASE-PATHS.md](./CODEBASE-PATHS.md)

*Windows 分发说明 · Ackem v1.0.0 · 2026-06*
