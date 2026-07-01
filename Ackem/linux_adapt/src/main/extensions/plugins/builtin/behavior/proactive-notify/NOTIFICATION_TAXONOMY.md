# 通知分类体系（Notification Taxonomy）

> **面向**：Ackem Agent（自主开发时查阅）
> **版本**：2026-06-08
> **关联**：P-11 主动通知中枢
> **用途**：Agent 在设计与"通知"有关的功能时，根据本规则自主判断层级和标签

---

## 使用方式

当 Agent 设计的新功能/扩展需要"主动跟用户说话"时：

1. 阅读下方决策树，确定**时序层级**（T0-T4）
2. 确定**语义标签**（care / health / signal / milestone / schedule / system）
3. 在 manifest 的 `dispatch` 中声明 `notification.tier` 和 `notification.tag`
4. P-11 中枢自动套用该层级的默认策略，无需手动配置冷却/优先级/通道

---

## 两轴模型

通知行为由两个独立维度决定：

| 轴 | 回答什么 | 决定什么 |
|---|---------|---------|
| **时序层级**（Temporal Tier） | 这条通知多紧急？ | 冷却、通道、深夜行为、DND、预算 |
| **语义标签**（Semantic Tag） | 这条通知是关于什么的？ | 内容分类、用户筛选、模板池选择 |

**层级决定行为，标签描述内容。两者独立，互不影响。**

---

## 决策树：确定时序层级

```
这条通知需要用户怎么样？
  │
  ├─ 必须现在就知道（安全/危机/情绪崩溃）？
  │   └─→ T0 即刻（Immediate）
  │
  ├─ 到了特定时间必须发（用户设定/系统约定）？
  │   └─→ T1 时机（Timely）
  │
  ├─ 用户应该知道但不急（身体提醒/重要变化）？
  │   └─→ T2 信号（Signal）
  │
  ├─ 她想跟用户说话（闲聊/回忆/关心）？
  │   └─→ T3 社交（Social）
  │
  └─ 后台做完了，用户回来再看？
      └─→ T4 后台（Background）
```

---

## 时序层级规则表

| 层级 | 名称 | 定义 | 默认冷却 | 深夜 | DND | 预算 | 默认通道 |
|------|------|------|---------|------|-----|------|---------|
| T0 | 即刻 | 安全红线，必须立刻到达 | 0 | 不抑制 | 不穿透 | 不计入 | 全部 |
| T1 | 时机 | 到了时间必须发 | 按时间 | 不抑制 | 不穿透 | 不计入 | 通知+聊天 |
| T2 | 信号 | 重要但非紧急 | 5-15min | 降频 | 受影响 | 计入 | 通知+聊天 |
| T3 | 社交 | 她想跟你说话 | 15-30min | 抑制 | 受影响 | 计入 | 聊天+推送 |
| T4 | 后台 | 做完了你回来再看 | — | — | — | — | 队列 |

**时间窗口规则**：

```
活跃时段（08:00-23:00）：所有层级正常发送
非活跃时段（23:00-08:00）：T0/T1 正常，T2 降频，T3 抑制
深夜（00:00-06:00）：T0/T1 正常（T1 文案变温柔），T2/T3 抑制
```

**动态层级提升**：同一条通知的层级可以根据上下文动态提升：

| 场景 | 静态层级 | 动态层级 | 原因 |
|------|---------|---------|------|
| 久坐提醒（正常） | T2 | T2 | 正常发 |
| 久坐提醒（坐了 3 小时） | T2 | T1 | 严重了，提升 |
| 碎碎念（正常） | T3 | T3 | 正常发 |
| 碎碎念（用户离开 2 天） | T3 | T2 | 好久没来了，提升 |
| 生日祝福 | T2 | T1 | 一年一次，提升 |

---

## 语义标签规则表

| 标签 | 含义 | 典型内容 |
|------|------|---------|
| `care` | 关系维护 | 碎碎念、回忆、离线思绪、重逢问候 |
| `health` | 身体健康 | 久坐、喝水、用眼、运动、睡眠 |
| `signal` | 外部信号 | 天气、音乐、场景、生日、节日 |
| `milestone` | 成长节点 | 信任里程碑、解锁成就 |
| `schedule` | 时间约定 | 用户日程、系统定时 |
| `system` | 应用状态 | 备份、更新、错误 |

标签是扁平的、可扩展的。Agent 可以自定义标签（如 `health:eye`），但层级由 P-11 根据决策树自动判定。

---

## 现有功能映射表

Agent 在设计新功能时，参考此表确定自己的层级和标签：

| 来源 | 层级 | 标签 | 说明 |
|------|------|------|------|
| 应急陪伴 | T0 | care | 安全红线 |
| 久坐提醒 | T2 | health | 身体提醒 |
| 喝水提醒 | T2 | health | 身体提醒 |
| 深夜提醒 | T1 | schedule | 系统约定 23:00 |
| 日程提醒 | T1 | schedule | 用户设定 |
| 天气感知 | T3 | signal | 外部信息注入 |
| 共同观影/听歌 | T3 | signal | 外部信息注入 |
| 专注退出 | T2 | signal | 场景变化需注意 |
| 生日检测 | T1 | milestone | 一年一次，时机级 |
| 成长里程碑 | T2 | milestone | 信任度变化 |
| 碎碎念 | T3 | care | 她想说话 |
| 回忆触发 | T3 | care | 她想说话 |
| 离线思绪 | T3 | care | 她想说话 |
| 重逢问候 | T3 | care | 她想说话 |
| 日记完成 | T4 | care | 后台完成 |
| 梦境生成 | T4 | care | 后台完成 |
| 趣味档案 | T4 | care | 后台完成 |
| 记忆整理 | T4 | — | 默默完成，不展示 |
| 屏幕特效 | T3 | signal | 视觉反馈 |
| 系统通知 | T2 | system | 应用状态 |

---

## 接口协议

### 生产者注册接口

```typescript
interface NotificationProducer {
  // ── 必填 ──
  sourceId: string           // 唯一标识，格式：scope/name@version
  sourceType: 'plugin' | 'skill' | 'uplugin' | 'uskills'
  tier: TemporalTier         // 时序层级：T0 | T1 | T2 | T3 | T4
  tag: SemanticTag           // 语义标签
  generateMessage: (ctx: NotificationContext) => Promise<string | NotificationResult | null>

  // ── 可选 ──
  tags?: string[]            // 二级标签（如 ['health:eye']）
  tierOverride?: (ctx: NotificationContext) => TemporalTier | null  // 动态层级
  cooldownMs?: number        // 覆盖层级默认冷却（需填 cooldownReason）
  cooldownReason?: string    // 覆盖理由
  defaultChannels?: NotificationChannel[]  // 覆盖默认通道（只能是子集）
  shouldTrigger?: (ctx: NotificationContext) => Promise<boolean>
}
```

### 上下文接口

```typescript
interface NotificationContext {
  snapshot: EngineSnapshot     // 引擎状态快照（情绪、关系、人格）
  runtime: RuntimeContext      // 运行时上下文（活动、场景）
  timeContext: TimeContext     // 时间信息（时段、是否周末、小时）
  idleMinutes: number          // 用户空闲分钟数
  lastActiveAt: string         // 上次活跃时间 ISO
}
```

### 返回值接口

```typescript
interface NotificationResult {
  text: string                              // 通知文案
  tierOverride?: TemporalTier               // 动态层级覆盖
  emotionHint?: {                           // 情绪提示
    affDelta?: number
    secDelta?: number
  }
}
```

### 注册方式

```typescript
// 在 register.ts 中
export async function registerMyExtension(hub: ProactiveHub): Promise<void> {
  hub.register({
    sourceId: 'ackem/my-skill@1.0.0',
    sourceType: 'skill',
    tier: T2,
    tag: 'health',
    tags: ['health:drink-water'],
    generateMessage: async (ctx) => {
      if (ctx.timeContext.hour >= 0 && ctx.timeContext.hour < 6) return null
      return '该喝水啦'
    }
  })
}
```

---

## 约束规则

### 层级约束

| 约束 | 规则 | 违反后果 |
|------|------|---------|
| T0 权限 | 只有 `emotion:emergency` 类扩展可声明 T0 | uplugin 不可使用 T0 |
| 层级不可自行提升 | 生产者声明的 tier 只能等于或低于实际紧急度 | P-11 可动态提升，生产者不可 |
| 动态提升需理由 | `tierOverride` 返回 T0/T1 时必须在返回值中说明原因 | 无理由的提升被忽略 |

### 通道约束

| 约束 | 规则 |
|------|------|
| 不可自行增加通道 | `defaultChannels` 只能是层级默认通道的子集 |
| 不可自行提权 | `tier` 只能声明为 T2/T3/T4，T0/T1 由系统控制 |

### 冷却约束

| 约束 | 规则 |
|------|------|
| 覆盖必须说明理由 | 覆盖 `cooldownMs` 时必须提供 `cooldownReason` |
| 冷却不可低于层级默认 | T2 冷却不可低于 5min，T3 不可低于 15min |

---

## Embedding 增强（可选）

通知中枢支持 Embedding 增强，生产者可以启用：

```typescript
hub.register({
  sourceId: 'ackem/my-skill@1.0.0',
  tier: T3,
  tag: 'care',
  // 提供模板池 → 启用 Embedding 模板匹配
  templatePool: [
    { text: '才没有在意你去哪了呢', conditions: '傲娇人格。用户离开15-30分钟' },
    { text: '你今天心情好像不错嘛', conditions: '用户情绪积极。下午时段' },
    // ...
  ],
  // 启用语义去重（默认 true）
  semanticDedup: true,
  generateMessage: async (ctx) => { /* ... */ }
})
```

**不提供 templatePool 也能正常工作**——走随机模板或 LLM 生成。Embedding 是渐进增强，不是依赖。

---

## Agent 开发检查清单

```
□ 1. 确定时序层级（使用决策树）
□ 2. 确定语义标签
□ 3. 检查是否需要覆盖默认值（通常不需要）
□ 4. 如果覆盖，写明理由
□ 5. 在 manifest.ts 的 dispatch 中声明 notification.tier + notification.tag
□ 6. 在 register.ts 中注册到 ProactiveHub
□ 7. 实现 generateMessage() 返回通知内容
□ 8. 实现 shouldTrigger()（可选，额外条件）
□ 9. 如果需要动态层级，实现 tierOverride()
□ 10. 添加测试
□ 11. 更新本文件的"现有功能映射表"
```

---

*2026-06-08 · 通知分类体系 · Agent 自主开发参考*
