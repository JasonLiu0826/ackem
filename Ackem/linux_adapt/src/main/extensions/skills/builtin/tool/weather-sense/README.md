# 天气感知（S-01）

- **类型**：Skill / `tool`
- **触发**：`llm_function_call`, `scheduled`（autonomous 30min）
- **状态**：已实装
- **说明**：Open-Meteo 定时拉取；缓存于 `data/weather/latest.json`；对话 context 注入

实装文件：`manifest.ts`、`skill.ts`、`register.ts`、`weatherCache.ts`、`openMeteo.ts`。
