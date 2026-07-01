# 内置 Plugin 目录（占位 + 已接线）

> Plugin =「长什么样、感知什么」— 不直接改核心引擎状态。  
> **最后更新**：2026-06-02 · **W5 ✅ 关单** · 7 内置 Plugin 含 desktop-companion + knowledge

## 已实装（随 `registerBuiltinPlugins` + 基础）

| 路径 | 编号 | 状态 |
|------|------|------|
| `knowledge-presentation/` | — | ✅ **基础能力** |
| `desktop-companion/` | — | ✅ active |
| `theme/theme-toggle/` | P-02 | ✅ active（W5） |
| `tool/tts-voice/` | P-11 | ⚠️ active（W5 Stub · W8 真 TTS） |
| `tool/screenshot/` | P-13 | ❌ deprecated（2026-06-06 已砍，代码保留作底层能力） |
| `skin/screen-effects/` | P-10 | ⚠️ active（W5 Stub · W8 粒子） |
| `skin/live2d-desktop/` | P-01 | ⚠️ active（W5 几何预览 · W8 Cubism） |

## 皮肤 / 视觉 `skin/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `skin/live2d-desktop/` | P-01 | Live2D 桌宠 |
| `skin/desktop-float/` | P-04 | 桌面悬浮陪伴 |
| `skin/speech-bubble/` | P-14 | 对话弹出动画（依赖 P-01） |
| `skin/screen-effects/` | P-10 | 屏幕视觉特效 |

## 主题 `theme/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `theme/theme-toggle/` | P-02 | 亮色/暗色主题 |

## 行为 `behavior/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `behavior/proactive-notify/` | P-05 | 主动通知/碎碎念 |
| `behavior/foreground-detect/` | P-07 | 前台窗口标题感知 |
| `behavior/recycle-bin-meta/` | P-08 | 回收站元数据 |
| `behavior/browser-history/` | P-09 | 浏览器历史调侃 |

## 工具 `tool/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `tool/clipboard-read/` | P-06 | 剪贴板读取 |
| `tool/tts-voice/` | P-11 | TTS |
| `tool/bgm-music/` | P-12 | BGM |
| `tool/screenshot/` | P-13 | 截图（❌ deprecated） |

## 人格 / 内容 `personality/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `personality/personality-pack/` | P-03 | 人格/种子包 |
| `personality/prompt-mod/` | P-15 | 语气模组 |

## 生态 `ecosystem/`

| 路径 | 编号 | 名称 |
|------|------|------|
| `ecosystem/plugin-marketplace/` | P-16 | 插件市场（分发层） |

## 实装步骤

1. 在对应目录实现 `plugin.ts` + `register.ts`
2. 在 `register-placeholders.ts` 取消注释对应 `registerBuiltin*`
3. 在 `coordinator.ts` 的 `boot()` 中调用 `registerBuiltinPlugins(registry)`

重新生成占位骨架：`node scripts/scaffold-extension-placeholders.mjs`（已存在目录会跳过）

**stub.ts 说明（FIX-033）**：见 [`../STUB_FILES.md`](../STUB_FILES.md) — 非运行时，禁止 import。
