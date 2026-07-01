# Renderer UI 关键路径测试（FIX-034）

Ackem 渲染进程默认用 **Vitest + 纯函数单测** 覆盖 Chat / Settings 关键路径，不引入 Playwright（Electron 窗口 E2E 成本高，见任务表 P3 FIX-034）。

## 覆盖范围

| 路径 | 模块 | 测试文件 |
|------|------|----------|
| Chat 发送门禁 | `lib/chatSend.ts` | `lib/chatSend.test.ts` |
| Chat 乐观 UI / buildContext 入参 | `lib/chatSend.ts` | `lib/chatSend.test.ts` |
| Settings 保存 normalize | `lib/settingsForm.ts` | `lib/settingsForm.test.ts` |
| Settings patch 合并 | `lib/settingsForm.ts` | `lib/settingsForm.test.ts` |
| 扩展中心状态文案 | `components/extensionTypes.ts` | `components/extensionTypes.test.ts` |

`ChatPage.tsx` / `SettingsPage.tsx` 通过 import 上述模块保持行为与单测一致。

## 运行

```bash
npm test -- src/renderer/src/lib/chatSend.test.ts src/renderer/src/lib/settingsForm.test.ts
```

或全量：`npm test`（含 `src/renderer/**/*.test.ts`）。

## 后续（非本 FIX 范围）

- Electron 窗口级 E2E 可另开 FIX，需 `@playwright/test` + 打包 preview。
- 组件 DOM 测试需 `@testing-library/react` + `jsdom` 环境。
