# 内置 Skill 目录（占位 + 已接线）

> Skill =「什么时候做什么事」— 通过触发条件 / LLM function call 激活。  
> **最后更新**：2026-06-02 · **W5 ✅ 关单** · **887 passed** · 21 Skill · 7 Plugin active

## 已实装（随 `registerBuiltinSkills` 启动）

| 路径 | 编号 | 状态 | 基础能力 |
|------|------|------|----------|
| `tool/web-search/` | S-15 | ✅ active | ✅ |
| `tool/plan-document/` | S-16 | ✅ active | ✅ |
| `tool/markdown-table/` | S-17 | ✅ active | ✅ |
| `keyword/emergency-companion/` | S-07 | ✅ active | ✅ |
| `tool/weather-sense/` | S-01 | ✅ active | ✅ |
| `diary-auto/` | S-00a | ✅ autonomous 23:30 | ✅ |
| `scheduled/sedentary-reminder/` | S-04 | ✅ active（默认） | — |
| `scheduled/drink-water-reminder/` | S-06 | ✅ active（默认） | — |
| `scheduled/late-night-reminder/` | S-05 | ✅ active（默认） | — |
| `system_event/focus-mode-sync/` | S-02 | ✅ active（默认） | — |
| `offline-thought/` | S-00b | ✅ active（默认） | — |
| `engine_event/mood-diary-detail/` | S-03 | ✅ active（默认） | — |
| `keyword/birthday-detect/` | S-13 | ✅ active（默认） | — |
| `tool/light-schedule/` | S-12 | ✅ active（默认） | — |
| `tool/fun-profile/` | S-09 | ✅ active（默认） | — |
| `tool/dream-generator/` | S-11 | ✅ active（默认） | — |
| `tool/file-ops/` | S-file | ✅ active（默认） | — |
| `scheduled/ambient-recall/` | S-20 | ✅ active（默认） | — |
| `engine_event/procedural-memory/` | S-17 | ✅ active（默认） | — |
| `engine_event/growth-unlock/` | S-10 | ✅ active（默认） | — |
| `system_event/media-co-watch/` | S-08 | ⚠️ active（Preview · SMTC 按需读标题） | — |

## 已接线或半接线（根目录）

| 路径 | 编号 | 状态 |
|------|------|------|
| `offline-thought/` | S-00b | ✅ SkillRegistry + `index.ts` onExit |

## 定时 `scheduled/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `scheduled/sedentary-reminder/` | S-04 | 久坐提醒 |
| `scheduled/late-night-reminder/` | S-05 | 深夜提醒 ✅ |
| `scheduled/drink-water-reminder/` | S-06 | 喝水提醒 ✅ |
| `scheduled/ambient-recall/` | S-20 | 回忆触发 |

## 系统事件 `system_event/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `system_event/focus-mode-sync/` | S-02 | 专注模式联动 |
| `system_event/media-co-watch/` | S-08 | 共同观影/听歌 |
| `system_event/pet-interaction/` | S-18 | 桌宠交互（依赖 P-01） |

## 引擎事件 `engine_event/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `engine_event/mood-diary-detail/` | S-03 | 心情日记详规 |
| `engine_event/growth-unlock/` | S-10 | 成长与解锁 |
| `engine_event/procedural-memory/` | S-17 | 程序性记忆 |
| `engine_event/shared-experience/` | S-19 | 共同经历 |

## 关键词 / 规则 `keyword/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `keyword/emergency-companion/` | S-07 | 应急陪伴 |
| `keyword/birthday-detect/` | S-13 | 生日检测 |

## LLM 工具 `tool/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `tool/weather-sense/` | S-01 | 天气感知 |
| `tool/fun-profile/` | S-09 | 趣味档案 |
| `tool/dream-generator/` | S-11 | 梦境生成 |
| `tool/light-schedule/` | S-12 | 轻量日程 |
| `tool/web-search/` | S-15 | 网页搜索 |
| `tool/plan-document/` | S-16 | 计划书（Markdown 纸面卡） |
| `tool/markdown-table/` | S-17 | Markdown 表格交付 |
| `tool/file-ops/` | — | 文件操作（规划中） |

## 手动 `manual/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `manual/backup-migrate/` | S-14 | 备份与迁移 |

## 实装步骤

1. 实现 `skill.ts`（`SkillHandler`）
2. 在 `register-placeholders.ts` 取消注释 `registry.register(handler)`
3. 在 `coordinator.ts` 的 `boot()` 中调用 `registerBuiltinSkills(registry)`
