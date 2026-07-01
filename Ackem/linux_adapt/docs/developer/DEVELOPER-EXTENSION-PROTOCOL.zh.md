# Ackem 开发者扩展接口协议（Ecosystem v1）

> **语言：** 中文 · [English](./DEVELOPER-EXTENSION-PROTOCOL.md)

> **版本**：引擎 API `1.0.0`  
> **读者**：Ackem 贡献者、扩展开发者  
> **当前产品策略（2026-06）**：**仅开放 `ackem/`（官方）与 `u/`（本机 OpenForU）**；`community/` 市场管线 **已关闭**，代码保留供日后开放。

---

## 1. 概述

Ackem 扩展采用 **本地优先 + 命名空间分轨** 模型：

| 命名空间 | ID 示例 | 状态 | 说明 |
|----------|---------|------|------|
| `ackem/` | `ackem/web-search@1.0.0` | **开放** | 官方内置，随应用分发 |
| `u/` | `u/my-timer@1.0.0` | **开放** | 用户 Plan 共创，本机私有 |
| `community/` | `community/hello@1.0.0` | **关闭** | 签名市场包；`COMMUNITY_EXTENSIONS_OPEN=false` |

扩展与引擎的 **唯一桥梁** 是 `ExtensionsCoordinator`（`src/main/extensions/coordinator.ts`）。  
扩展 **禁止** 直接 `import` 引擎 `memory/`、`engine/` 内部模块；只能使用 `protocols.ts` 定义的接口。

```
用户消息 / 定时 / 系统事件
        │
        ▼
  Dispatch 调度层
        │
        ├── ackem/*   官方 Skill/Plugin（开放）
        ├── u/*       OpenForU 用户扩展（开放）
        └── community/*  已关闭 — 启动时不扫描、不安装
        │
        ▼
  Skill.execute / Plugin hooks / Surface → ExtensionEvent → 引擎上下文
```

**贡献者路径（当前推荐）**：

1. 本机用 **OpenForU Plan** 部署 `u/` 扩展试验  
2. 满意后整理代码，**PR 到 Ackem 仓库** `skills/builtin/` 或 `plugins/builtin/`  
3. 合并后 id 改为 `ackem/<name>@<version>`，随下一版发行包分发给所有用户  

---

## 2. 贡献者指南（Contributing Extensions）

### 2.1 本地原型（OpenForU · `u/`）

- 聊天中说「帮我做一个 XX Skill/插件」→ Plan 工作区 → 确认部署  
- 落盘：`{dataRoot}/openforu/uskills/` 或 `uplugins/`  
- 协议：[`src/main/extensions/openforu/PROTOCOL.md`](../../src/main/extensions/openforu/PROTOCOL.md)

### 2.2 提交官方（`ackem/`）

| 类型 | 目标目录 | manifest id 示例 |
|------|----------|------------------|
| Skill | `src/main/extensions/skills/builtin/<category>/<name>/` | `ackem/web-search@1.0.0` |
| Plugin | `src/main/extensions/plugins/builtin/<category>/<name>/` | `ackem/knowledge-presentation@1.0.0` |

**PR 检查清单**：

- [ ] `manifest.json` 含完整 `dispatch`（否则不进调度 catalog）  
- [ ] `engineVersion: ">=0.0.0 <1.0.0"`（或与当前发行版对齐）  
- [ ] `engineApiVersion: "^1.0.0"`（建议显式填写）  
- [ ] `implementationStatus: "complete"`（勿标 complete 若仅为 stub）  
- [ ] 在 `register-placeholders.ts` 或对应 `register.ts` 注册  
- [ ] 聚焦测试：`vitest run src/main/extensions/...`  
- [ ] 不打包用户 `data/`、不含密钥  

**id 迁移**：OpenForU 的 `u/my-feature@1.0.0` → 官方 `ackem/my-feature@1.0.0`（scope 与权限集可能需调整）。

### 2.3 仓库与许可

- 仓库：<https://github.com/JasonLiu0826/Ackem>  
- 维护者：Jason（JasonLiu0826）· 商业授权：jasonliu_lyf_2005@qq.com  
- 官方扩展默认 **AGPL-3.0**（与项目一致）  
- 安全问题见根目录 `SECURITY.md`  

---

## 3. 扩展 ID 规范

```
{scope}/{name}@{semver}
```

- **scope**：当前产品启用 `ackem` · `u`；`community` 保留于协议，**运行时关闭**  
- **name**：`[a-z0-9_-]+`  
- 解析 API：`src/main/extensions/ecosystem/extensionId.ts`

---

## 4. 双版本字段

| 字段 | 含义 | 示例 | 必填 |
|------|------|------|------|
| `engineVersion` | Ackem **应用** semver range | `>=0.0.0 <1.0.0` | 全部 |
| `engineApiVersion` | **扩展接口协议** semver range | `^1.0.0` | 建议全部填写 |

宿主常量（`ecosystem/constants.ts`）：

- `ACKEM_APP_VERSION` = `0.0.0`  
- `ACKEM_ENGINE_API_VERSION` = `1.0.0`  

校验：`ecosystem/manifestValidate.ts`

---

## 5. 引擎接口（扩展 ↔ 引擎）

定义于 `src/main/extensions/protocols.ts`：

- **EngineSnapshot** — 只读引擎状态  
- **ExtensionEvent** — 扩展回传（含 `contextInjection`）  
- **ExtensionLifecycleHooks** — Plugin 生命周期  
- **DispatchConfig** — 进入聊天调度的必要条件  

---

## 6. `community/` 说明（已关闭，协议保留）

> **开关**：`src/shared/communityExtensionFeature.ts` → `COMMUNITY_EXTENSIONS_OPEN = false`

关闭时的行为：

- `coordinator.boot()` **不**调用 `community.boot()`  
- `installCommunityPackage()` 返回「社区扩展市场暂未开放…」  
- 已落盘的 `data/extensions/community/` **不会被加载**  

保留的实现（供日后开放，单测仍覆盖）：

| 模块 | 路径 |
|------|------|
| 签名 / 包格式 | `ecosystem/signature.ts` · `packageFormat.ts` |
| 安装 | `ecosystem/install.ts` |
| 加载器 | `ecosystem/communityLoader.ts` |
| 信任库 | `data/extensions/trust/publishers.json` |

**请勿**在当前版本面向用户宣传 community 市场或 `.ackem-ext` 安装；贡献请走 §2 PR 路径。

---

## 7. OpenForU（`u/`）速查

| 项目 | 说明 |
|------|------|
| 路径 | `{dataRoot}/openforu/uskills/` · `uplugins/` |
| uskill | 配置 + context 注入（v1 非任意 TS 执行） |
| uplugin | 沙箱 + 权限审批 + 可选 Surface |
| 文档 | [`openforu/PROTOCOL.md`](../../src/main/extensions/openforu/PROTOCOL.md) |

---

## 8. 测试

```bash
# 生态协议（含 community 关闭态单测）
npm test -- src/main/extensions/ecosystem/

# 扩展调度
npm test -- src/main/extensions/dispatch/
```

---

## 9. 参考路径

| 功能 | 源文件 |
|------|--------|
| 协调器 | `src/main/extensions/coordinator.ts` |
| community 开关 | `src/shared/communityExtensionFeature.ts` |
| 协议类型 | `src/main/extensions/protocols.ts` |
| OpenForU | `src/main/extensions/openforu/` |
| 官方 Skill 例题 | `src/main/extensions/skills/builtin/tool/web-search/` |
| 官方 Plugin 例题 | `src/main/extensions/plugins/builtin/knowledge-presentation/` |

---

*Ackem Ecosystem Protocol v1.0.0 · 贡献者优先 PR 至 ackem/ · 2026-06*
