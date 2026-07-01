# 发布检查清单 · Release Checklist

> **语言：** 中文 · [English](./release-checklist.md)

> **读者**：维护者  
> **适用**：Ackem v1.0.0 及后续版本发布  
> **源码仓库**：[JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)

---

## 1. 发布流程概览

```
开发者分支 → main 合并 → 构建 → 冒烟 → 发布 GitHub Release
```

---

## 2. 发布前检查

### 2.1 代码检查

- [ ] `main` 分支包含所有目标 PR
- [ ] CHANGELOG.md 已更新（版本号、日期、变更条目）
- [ ] `package.json` version 已更新
- [ ] `electron-builder.yml` `extraMetadata.version` 与 package.json 一致
- [ ] TypeScript 类型检查通过：`npm run typecheck`
- [ ] 所有测试通过：`npm test`
- [ ] 文档同步：`npm run sync:release-doc`

### 2.2 安全与隐私检查

- [ ] 不含 `.env`、`.env.*`、`data/`、`*.log` 文件
- [ ] `electron-builder.yml` `files` 配置正确排除隐私数据
- [ ] `resources/` 不含未授权素材
- [ ] `voice-service/` 不含大体积未使用模型

### 2.3 实机冒烟（干净机器）

- [ ] 绿色版解压后首次启动正常（~10-30s）
- [ ] LLM 配置后可收发消息
- [ ] 记忆检索可用
- [ ] 扩展列表加载正常
- [ ] 设置页面可读写
- [ ] 系统托盘可操作

---

## 3. 构建命令

```bash
# 1. 构建主程序
npm run build

# 2. 打包绿色版（推荐 —— 默认发布格式）
npm run dist:green
# 输出：dist/release/Ackem-{version}-win-x64/

# 3. 可选：NSIS 安装包
npm run dist:setup
# 输出：dist/release/Ackem-{version}-Setup-x64.exe
```

### 构建说明

| 选项 | 绿色版 (zip) | 安装包 (NSIS) |
|------|-------------|---------------|
| 便携 `data/` | ✅ 默认 | 可选 |
| 首次启动速度 | 快（无需安装） | 中等 |
| 杀软误报风险 | 低 | 较高 |
| 推荐场景 | GitHub Release 默认 | Windows 商店/企业分发 |

---

## 4. 发布产物检查

绿色版目录结构应包含：

```
Ackem-{version}-win-x64/
├── Ackem.exe
├── 启动 Ackem.bat
├── Uninstall Ackem.bat
├── resources/
│   ├── app.asar        ← 主程序
│   └── models/         ← Embedding 模型（预先打包）
├── voice-service/      ← 语音运行时
├── docs/               ← 文档副本
├── d3/                 ← 运行时依赖
├── ...                 ← 其他 Node.js 依赖
└── chrome_100_percent.pak, locales/, etc.  ← Electron 运行时
```

**不应包含**：

```
❌ data/                  ← 用户数据（首次运行时创建）
❌ .env / .env.*          ← 环境变量
❌ src/                   ← TypeScript 源码
❌ node_modules/          ← 开发依赖
```

---

## 5. GitHub Release

### 5.1 创建 Release

1. 在 GitHub 创建 Tag：`v{version}`（如 `v1.0.0`）
2. 上传绿色版 zip：`Ackem-{version}-win-x64.zip`
3. 可选上传安装包：`Ackem-{version}-Setup-x64.exe`
4. 编写 Release Notes（从 CHANGELOG.md 摘录）

### 5.2 Release Notes 模板

```markdown
## Ackem v{version}

{简短介绍}

### 下载

| 包 | 说明 |
|----|------|
| Ackem-{version}-win-x64.zip | 绿色版（推荐），解压即用 |
| Ackem-{version}-Setup-x64.exe | NSIS 安装包 |

### 变更

**Added**
- {新功能}

**Changed**
- {改进}

**Fixed**
- {Bug 修复}

**Known Issues**
- {已知问题}

### 资源

- LLM Embedding 模型首次启动自动解压
- 语音服务需单独下载（若需要）
```

### 5.3 发布后

- [ ] 确认 Release 页面可访问
- [ ] 确认 zip 可下载
- [ ] 在干净 Windows 机器上验证绿色版
- [ ] 通知用户（如适用）

---

## 6. 版本号规则

遵循 `major.minor.patch`：

| 变动 | 示例 |
|------|------|
| 不兼容 API/架构变更 | v2.0.0 |
| 新功能，向后兼容 | v1.1.0 |
| Bug 修复 | v1.0.1 |
| 文档/构建变更 | 无需版本号变更 |

---

## 7. 相关文档

| 文档 | 内容 |
|------|------|
| [dev-setup.md](./dev-setup.md) | 构建环境 |
| [testing.md](./testing.md) | 测试指南 |
| [docs/distribution-windows.md](../distribution-windows.md) | 分发说明 |
| [CONTRIBUTING.md](../../CONTRIBUTING.md) | 贡献指南 |

*Release Checklist · Ackem v1.0.0 · 2026-06*
