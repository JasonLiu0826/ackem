# Live2D 桌宠（P-01 / P-08）

- **类型**：Plugin / `skin` / `companionSkin`
- **状态**：**Preview**（W5 几何光球 + 桌宠窗 · W8 Cubism 实装）
- **ID**：`ackem/live2d-desktop@0.0.1`

## 当前行为（诚实说明）

| 能力 | 状态 |
|------|------|
| 几何光球（AIVatar）+ 桌宠独立窗 | ✅ Preview |
| Cubism Live2D 模型 / 骨骼 / 口型 | ❌ W8 待实装 |
| 情绪 → 表情/动作联动 | ❌ W8 待实装 |

渲染：`Live2dCompanionSkin` 当前回退 `AIVatar`，非 Cubism 画布。

## W8 实装清单

- Cubism SDK 接入 + 模型资源
- 情绪四维 → 表情/动作映射
- `implementationStatus` 改为 `complete`
