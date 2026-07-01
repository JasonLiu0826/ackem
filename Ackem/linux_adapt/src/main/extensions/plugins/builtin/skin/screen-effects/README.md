# 屏幕特效（P-10 / P-06）

- **类型**：Plugin / `skin`
- **状态**：**Stub**（W5 pulse 广播 · W8 粒子实装）
- **ID**：`ackem/screen-effects@0.0.1`

## 当前行为（诚实说明）

| 能力 | 状态 |
|------|------|
| `ui:screenFx` pulse 广播 | ✅ Stub |
| 红心 / 樱花 / 星星等粒子 | ❌ W8 待实装 |
| 情绪 aff → 特效类型联动 | ❌ W8 待实装 |

IPC：`ext:screenFx:pulse` → `{ ok, effect: 'pulse', implementationStatus: 'stub' }`

## W8 实装清单

- 渲染端粒子层 + 白名单 effect 类型
- ExtensionPolicy 情绪 → 粒子映射
- `implementationStatus` 改为 `complete`
