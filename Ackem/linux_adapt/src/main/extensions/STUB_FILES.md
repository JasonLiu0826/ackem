# extensions 目录下的 `stub.ts` 说明（FIX-033）

> **结论：`stub.ts` 不是运行时入口。** 新开发者请勿在 `register-placeholders.ts` 或 `coordinator.boot()` 中 import 它们。

## 是什么

`plugins/builtin/**/stub.ts` 与 `skills/builtin/**/stub.ts` 共 **35** 个文件，由 `scripts/scaffold-extension-placeholders.mjs` 生成，用途：

| 用途 | 说明 |
|------|------|
| **Catalog 占位** | 与 `manifest.json` / `manifest.ts` 一起描述「规划中」扩展的 ID、权限、描述 |
| **Schema 兼容** | `manifest.json` 的 `"main": "stub.ts"` 满足 manifest schema；**Ackem 启动不会加载此文件** |
| **导出 manifest 常量** | 重新导出 `MANIFEST`、`PLUGIN_ID` / `SKILL_ID`，便于脚本或文档引用 |

每个 stub 必须：

- 首行含 marker：`@ackem-extension-stub-not-runtime`
- 导出 `export const PLACEHOLDER = true as const`

## 不是什么

- ❌ 不是 Plugin 的 `bootstrap.ts` / `register.ts`
- ❌ 不是 Skill 的 `skill.ts` / `register.ts`
- ❌ 不会被 `registerBuiltinPlugins` / `registerBuiltinSkills` 自动 import
- ❌ 不能当作 OpenForU 包入口

## 已实装扩展为何还保留 stub？

部分 W5/W6 已接线项（如 `theme-toggle`、`tts-voice`、`foreground-detect`）仍保留 scaffold 时的 `stub.ts`，仅因历史 `manifest.json` 的 `main` 字段。**运行时以 `register.ts` / `bootstrap.ts` / `skill.ts` 为准**，stub 可忽略。

| 状态 | 扩展中心 | 运行时入口 |
|------|----------|------------|
| 规划中（catalog placeholder） | 「规划中」灰显 | 无；`register-catalog.ts` 仅登记 manifest |
| 已下线（deprecated catalog） | 「已下线」灰显 | 无；`register-deprecated-catalog.ts` |
| Stub / Preview 实装 | Stub · 已启用 等 | `register.ts` + `bootstrap.ts` |
| 完整实装 | 已启用 | `register.ts` + `skill.ts` 等 |

## 实装新扩展时的正确步骤

**Plugin**

1. 实现 `register.ts`（`registry.registerBuiltin`）及必要时 `bootstrap.ts`
2. 在 `plugins/builtin/register-placeholders.ts` 增加 `registerBuiltin*` 调用
3. 可选：将 `manifest.json` 的 `main` 改为 `bootstrap.ts`；**不要**删除 stub 除非同步改 manifest 与测试

**Skill**

1. 实现 `skill.ts`（`SkillHandler`）与 `register.ts`
2. 在 `skills/builtin/register-placeholders.ts` 注册

**禁止**：在任意 `register*.ts` 中 `import ... from './stub'`。

## 校验

- 单测：`src/main/extensions/stubFiles.test.ts`（stub 数量、marker、PLACEHOLDER、运行时无 import）
- 同步 marker：`node scripts/sync-stub-headers.mjs`（幂等，已存在则跳过）

## 相关文件

- `placeholderManifest.ts` — catalog「规划中」manifest 归一化
- `register-catalog.ts` / `register-deprecated-catalog.ts` — 无运行时 catalog 登记
- `plugins/builtin/CATALOG.md` / `skills/builtin/CATALOG.md` — 目录索引
