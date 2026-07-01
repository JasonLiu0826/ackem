# Ackem 开源文档地图

> **语言：** 中文 · [English](./OPEN-SOURCE-DOC-MAP.md)

> **产品版本**：Ackem **v1.0.0**  
> **源码仓库**：[JasonLiu0826/Ackem](https://github.com/JasonLiu0826/Ackem)  
> **绿色版**：便携版根目录（exe 所在文件夹）  
> **路径说明**：[CODEBASE-PATHS.md](./CODEBASE-PATHS.md) · **协议索引**：[maintainer/开源文档索引.md](./maintainer/开源文档索引.md)

> **用途**：维护者写文档前的「总目录」——每份文档 **写给谁**、**写什么**、**写多少**、**现在有没有**。  
> **原则**：GitHub 公开层要 **少而准**；内部设计稿不整库外泄，只 **抽取** 成对外版。

---

## 图例

| 标记 | 含义 |
|------|------|
| ✅ | 已有，可直接用或小幅修订 |
| 🟡 | 有部分内容，需合并/改名/对外裁剪 |
| ❌ | 尚未编写，开源前建议补齐 |
| 🔒 | 保留在仓库但标 `internal/`，或不随 Release 宣传 |
| P0 / P1 / P2 | 优先级：P0=公开仓库第一天；P1=公开后一周内；P2=生态成熟期 |

---

## 一、文档分层（先看懂结构）

```
┌─────────────────────────────────────────────────────────────┐
│  L0  仓库根（GitHub 第一眼）                                  │
│      README · LICENSE · SECURITY · CONTRIBUTING · NOTICE    │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  L1  用户 / 合规（会用、敢用、合法用）                         │
│      分发 · 数据格式 · 隐私 · 敏感能力 · 18+ · 本地模型       │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  L2  开发者 / 贡献者（改代码、提 PR、写扩展）                   │
│      开发环境 · 架构概览 · 扩展协议 · OpenForU · 测试          │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│  L3  内部设计库（🔒 可选公开，默认不当「入门文档」）             │
│      docs/development · docs/architecture · 计划书 · 复盘     │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、L0 仓库根（GitHub 门面）

### 1. `README.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 所有访客：用户、贡献者、媒体 |
| **目标** | 30 秒内知道 Ackem 是什么；5 分钟内跑起来 |
| **必写章节** | ① 一句话定位 ② **Release 下载** ③ **5 步上手** ④ **隐私表** ⑤ 开发者折叠区 ⑥ 文档索引 ⑦ LICENSE / SECURITY / CONTRIBUTING ⑧ 代码库路径 |
| **现有** | 仓库根 [README.md](../README.md)，v1.0.0 |

---

### 2. `LICENSE` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 法务、企业集成方、Fork 者 |
| **必写** | AGPL-3.0 **全文**或标准引用 + Copyright 行 + 「网络服务/SaaS 套壳需遵守 AGPL 或商授」一句 |
| **还要做** | 依赖 SPDX 审计后确认无冲突依赖；与 `NOTICE` 一致 |
| **现有** | `Ackem/LICENSE`（意图说明已有，发布前做法务终稿） |

---

### 3. `SECURITY.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 安全研究员、企业 IT |
| **必写章节** | ① 支持版本表 ② **私密漏洞报告邮箱**（勿公开 Issue） ③ 响应 SLA（如 7 日内确认） ④ **发行包不含什么**（data/、.env、密钥） ⑤ 用户本机数据责任边界 |
| **现有** | `Ackem/SECURITY.md` |

---

### 4. `CONTRIBUTING.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 想提 PR 的开发者 |
| **必写章节** | ① **欢迎贡献什么**（Bug、文档、官方扩展 `ackem/`、i18n） ② **不接收什么**（未讨论的超大重构、含密钥的 PR） ③ 环境（Win10/11、Node 20+、`npm ci`） ④ 分支 / PR 流程（fork → 分支 → 测过再提） ⑤ **测试命令表**（`npm test`、`typecheck`、`test:renderer`） ⑥ **扩展贡献路径**：OpenForU `u/` 本机试 → PR 到 `skills/builtin` 或 `plugins/builtin`，id 改 `ackem/`（链到 `docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md`） ⑦ **community/ 市场已关闭** 一句 ⑧ Code of Conduct 链接 ⑨ 许可证：贡献即 AGPL |
| **篇幅** | 2～4 页，可抄 GitHub 模板再改 |
| **依赖** | `DEVELOPER-EXTENSION-PROTOCOL.md`、dev-setup |

---

### 5. `CODE_OF_CONDUCT.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | Issue / Discussion / PR 参与者 |
| **现有** | Contributor Covenant 2.1 标准模板，含举报邮箱 `jasonliu_lyf_2005@qq.com` |
| **篇幅** | 1 页 |

---

### 6. `NOTICE.md` 或 `THIRD_PARTY_LICENSES.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 法务、打包审查、企业客户 |
| **必写章节** | ① Ackem 自身版权与许可证 ② **npm 生产依赖** 摘要（可脚本生成） ③ **特殊捆绑物**：`voice-service/`（GPT-SoVITS runtime）、`resources/models/` embedding、`onnxruntime-node`、`better-sqlite3` 等 ④ **资产许可**：Live2D、贴纸、字体（若有） ⑤ 如何再生成本文件（`npm run …` 或手工步骤） |
| **注意** | Electron 应用缺 NOTICE 是常见开源卡点 |

---

### 7. `CHANGELOG.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 用户、打包维护者 |
| **必写章节** | 按版本倒序：`Added` / `Changed` / `Fixed` / `Security`；链到 GitHub Release |
| **规则** | 只写 **用户可见** 变更；内部 refactor 可不写 |
| **可复用** | Release note、内部 `优化变更记录` 裁剪 |

---

## 三、L1 用户与合规（`docs/` 对外子集）

### 8. `docs/distribution-windows.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | Windows 用户、技术支持 |
| **必写章节** | ① 绿色版 vs Setup ② **安装包含/不含清单** ③ 便携 `data/` vs `%LOCALAPPDATA%` ④ 备份拷贝哪些目录 ⑤ 卸载是否删数据 ⑥ 常见错误（缺 VC++、杀软误报、端口） |
| **现有** | `docs/distribution-windows.md` |

---

### 9. `docs/memory-format.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 高级用户、贡献者、审计者 |
| **必写章节** | ① **`data/` 目录树**（与 `src/main/layout.ts` 一致） ② **权威 vs 派生**：`ackem.db`、md/txt、`memory/facts/`、`_derived/` 可删重建 ③ **各目录用途表**（imports / memory / diary / companion / openforu / logs / models） ④ **AI 写入白名单**（哪些路径引擎可写、哪些只读） ⑤ **frontmatter 约定**（companion `self.md` 等） ⑥ 备份与迁移步骤 ⑦ 与 SQLite 关系（用户零部署 SQL 的表述） |
| **代码依据** | `layout.ts`、`data/README.md`、记忆导入管线 |
| **被引用** | `data/README.md` 已指向此文，**必须先写** |

---

### 10. `docs/ai-context-and-retrieval-policy.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 关心「记忆怎么进模型」的用户与开发者 |
| **现有** | 涵盖：设计原则、Tier A/B/Canon 分层、读路径（6 方法）、写路径（3 阶段）、预算控制、降级、隐私 |
| **篇幅** | 159 行，内容完整 |

---

### 11. `docs/privacy-and-data.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 所有用户 |
| **现有** | 涵盖：存储模式、各类数据位置、API Key 说明、网络出站表、遥测声明、删除步骤。101 行，内容完整 |

---

### 12. `docs/local-models-windows.md` + `local-models-windows.zh.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 不用云端 API 的用户 |
| **现有** | 涵盖：LLM vs Embedding 模型说明、Ollama/LM Studio/ooba/vLLM 配置、防火墙、性能预期。中英双版已对齐 |

---

### 13. `docs/indexing-and-scale.md` — P2 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 记忆很多的长期用户 |
| **现有** | 涵盖：`_derived/` 说明、重建索引、规模预期、版本兼容性 |

---

### 14. `docs/perception-layer.md` + `perception-layer.zh.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 关心权限的用户 |
| **现有** | 涵盖：8 项感知能力状态表格、设计原则、相关文档链接。中英双版已对齐 |

---

### 15. `docs/sensitive-capabilities.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 法务、高级用户 |
| **现有** | 涵盖：10 项敏感能力清单表、详说明细（STT/微信/前台/扩展网络）、留存汇总、未实装能力预留 |

---

### 16. `docs/adult-and-safety-policy.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 用户、平台审核、贡献者 |
| **现有** | 涵盖：成人模式开关、4 级内容分类、6 项安全机制详情、privacy_level 三层过滤、硬禁区、模型侧政策说明、未成年人声明 |

---

## 四、L2 开发者与贡献者（`docs/developer/`）

### 17. `docs/developer/dev-setup.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 从源码跑 Ackem 的开发者 |
| **现有** | 涵盖：前置要求、快速开始、LLM 配置、可用脚本、目录结构、Embedding 模型、常见问题、包管理说明 |

---

### 18. 系统架构套件 `docs/developer/architecture/` — P0 · ✅

> **七系统 + 数据层 + IPC 接口** — 共 10 篇，供其他开发者接手代码时阅读。

| 文件 | 系统 | 状态 |
|------|------|------|
| [README.md](./developer/architecture/README.md) | **索引** — 七系统总览、L0–L4 对照、阅读顺序 | ✅ |
| [00-overall-system.md](./developer/architecture/00-overall-system.md) | **整体** — Electron、IPC、对话全链路、目录地图 | ✅ |
| [01-brain-system.md](./developer/architecture/01-brain-system.md) | **脑** — L0 解释器 + L4 九路扩散检索 + 遗忘衰减 | ✅ |
| [02-heart-system.md](./developer/architecture/02-heart-system.md) | **心** — L1 关系 FSM + L2 四维情绪 + L3 心理块 | ✅ |
| [03-mouth-system.md](./developer/architecture/03-mouth-system.md) | **嘴** — Prompt 七层组装 + LLM 双 Provider | ✅ |
| [04-neural-system.md](./developer/architecture/04-neural-system.md) | **神经** — ONNX Embedding + Provider 链 | ✅ |
| [05-extension-system.md](./developer/architecture/05-extension-system.md) | **扩展** — Coordinator/Dispatch/Skill/Plugin/OpenForU | ✅ |
| [06-time-system.md](./developer/architecture/06-time-system.md) | **时间** — 假期/时段/特殊日/重逢冲击/时间感慨/作息 | ✅ |
| [07-data-layer.md](./developer/architecture/07-data-layer.md) | **数据层** — 18 表 SQLite Schema V1-V10 + Repository 模式 | ✅ |
| [08-ipc-api.md](./developer/architecture/08-ipc-api.md) | **IPC 接口** — ~100+ window.ackem.* API + ~30 推送事件 | ✅ |

**维护规则**：

- 改架构代码时 **同步改对应一篇**（至少更新「关键文件」表）  
- 更细的历史设计稿在 `../docs/architecture/*6_12.md`（🔒 维护者参考，不替代本套件）

---

### 18b. `docs/developer/architecture-overview.md` — 取消 · 合并入 §18

| 项 | 内容 |
|----|------|
| **说明** | 原「单页 150 行总览」需求已由 `architecture/00-overall-system.md` + README 索引满足 |

---

### 19. `docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 扩展作者、PR 审查者 |
| **已有** | 命名空间、`ackem/`/`u/`、双版本字段、Dispatch、贡献 PR 路径、**community/ 已关闭** |
| **开源前核对** | 与代码开关 `COMMUNITY_EXTENSIONS_OPEN=false` 一致 |

---

### 20. `src/main/extensions/openforu/PROTOCOL.md` — P0 · ✅

| 项 | 内容 |
|----|------|
| **读者** | Plan 用户、OpenForU 贡献者 |
| **已有** | uskill/uplugin、dispatch、Surface、权限 |
| **CONTRIBUTING 应链** | 到此文 + DEVELOPER-EXTENSION-PROTOCOL |

---

### 21. `docs/developer/testing.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | PR 作者 |
| **现有** | 涵盖：快速命令表、分层测试策略、编写测试示例、最佳实践、CI 集成、E2E 说明 |

---

### 22. `docs/developer/release-checklist.md` — P1 · ✅

| 项 | 内容 |
|----|------|
| **读者** | 维护者发 Release |
| **现有** | 涵盖：发布前检查（代码/安全/冒烟）、构建命令、产物检查、GitHub Release 流程、版本号规则 |

---

## 五、L3 内部设计库（🔒 默认不当入门文档）

| 目录/文件 | 处理方式 |
|-----------|----------|
| `docs/development/`（进度、复盘、波次） | 🔒 保留；对外只链 **一篇** L1 进度摘要或 GitHub Projects |
| `docs/architecture/`（七引擎分册） | 🔒 维护者用；对外只链 `architecture-overview.md` |
| `docs/plan/`、`docs/social/` | 🔒 不宣传；涉未实装能力 |
| `docs/开源版产品计划_5_28更新.md` | 🟡 维护者 master plan；可摘 §1–§3 进 README，全文不必当用户 doc |
| `docs/tests/*实机*` | 🟡 维护者 QA；CONTRIBUTING 链一条即可 |

**可选整理**：建 `docs/internal/README.md` 写一句「以下供维护者查阅，非用户文档」。

---

## 六、`.github/`（与 markdown 同等重要）

| 文件 | 优先级 | 状态 |
|------|--------|------|
| `ISSUE_TEMPLATE/bug_report.md` | P1 | ✅ |
| `ISSUE_TEMPLATE/feature_request.md` | P2 | ✅ |
| `PULL_REQUEST_TEMPLATE.md` | P1 | ✅ |
| `workflows/ci.yml` | P1 | ✅ |
| `FUNDING.yml` / `SUPPORT.md` | P2 | ⏳ 可选

---

## 七、写作顺序（已全部完成）

所有文档已于 **v1.0.0** 全部完成。后续维护仅需 Release 时更新 `CHANGELOG.md`，代码变更涉及架构时同步更新对应架构文档。

---

## 八、单页模板（复制即用）

写任意 L1/L2 文档时，建议统一结构：

```markdown
# 标题

> 读者：… · 状态：草稿/已定 · 对齐代码：路径或版本

## 1. 这篇解决什么问题
（2～3 句）

## 2. 快速结论 / 决策表
（表格：场景 → 行为）

## 3. 详细说明
（分节，每节只讲一件事）

## 4. 与代码/设置对应
（文件路径、设置项名称）

## 5. 常见问题

## 6. 相关文档
（链到本地图其他条目）
```

---

## 九、当前总览表（一眼看清缺口）

| # | 路径 | P | 状态 |
|---|------|---|------|
| 1 | `README.md` | P0 | ✅ |
| 2 | `LICENSE` | P0 | ✅ |
| 3 | `SECURITY.md` | P0 | ✅ |
| 4 | `CONTRIBUTING.md` | P0 | ✅ |
| 5 | `CODE_OF_CONDUCT.md` | P1 | ✅ |
| 6 | `NOTICE.md` | P0 | ✅ |
| 7 | `CHANGELOG.md` | P1 | ✅ |
| 8 | `docs/distribution-windows.md` | P0 | ✅ |
| 9 | `docs/memory-format.md` | P0 | ✅ |
| 10 | `docs/ai-context-and-retrieval-policy.md` | P0 | ✅ |
| 11 | `docs/privacy-and-data.md` | P1 | ✅ |
| 12 | `docs/local-models-windows.md` | P1 | ✅ |
| 13 | `docs/indexing-and-scale.md` | P2 | ✅ |
| 14 | `docs/perception-layer.md` | P1 | ✅ |
| 15 | `docs/sensitive-capabilities.md` | P1 | ✅ |
| 16 | `docs/adult-and-safety-policy.md` | P1 | ✅ |
| 17 | `docs/developer/dev-setup.md` | P0 | ✅ |
| **18** | **`docs/developer/architecture/`（10 篇套件）** | **P0** | **✅** |
| 19 | `docs/developer/DEVELOPER-EXTENSION-PROTOCOL.md` | P0 | ✅ |
| 20 | `docs/CODEBASE-PATHS.md` | P0 | ✅ |
| 21 | `docs/developer/testing.md` | P1 | ✅ |
| 22 | `docs/developer/release-checklist.md` | P1 | ✅ |
| 23 | `docs/openforu-PROTOCOL.md` | P0 | ✅ |

**所有文档已全部完成。** 开源前最后检查：同步 `npm run sync:release-doc`，确认 GitHub Release 产物完整性。

---

## 十、维护

- 每发一版 Release：更新 `CHANGELOG.md` + 核对本表「状态」列  
- 代码变更涉及 `data/` 布局或权限：先改 `memory-format` / `perception-layer`，再改代码  
- 扩展策略变更：同步 `DEVELOPER-EXTENSION-PROTOCOL.md`  

---

*Ackem 开源文档地图 · v1.0.0 · 2026-06*
