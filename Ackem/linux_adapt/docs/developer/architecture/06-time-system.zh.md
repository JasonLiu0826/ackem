# 时间系统 · Time System

> **语言：** 中文 · [English](./06-time-system.md)

> **层级**：L1 时段感知 · L2 情绪调制 · L4 时间锚点检索  
> **代号**：Time Engine  
> **核心问题**：Ackem 如何感知时间的流逝？如何利用时间信号让记忆与情绪更真实？

---

## 1. 定位

时间系统不是一个独立模块，而是横跨引擎编排、记忆检索、情绪调制、主动策略的**时间感知层**。它让 Ackem 具备以下能力：

- **知道现在几点** — 时段、星期、季节、节日识别
- **知道认识了多久** — 时间深度计算（相遇到现在的自然语言表达）
- **记住特殊日子** — 生日、周年、里程碑自动锚定
- **时间影响情绪** — 星期曲线、节日快乐、深夜脆弱
- **时间影响检索** — 同时段的记忆优先、同季节共振、久别重逢高亮
- **时间感慨** — 在特定时刻涌现出对时间的情绪反射（"已经认识这么久了吗"）
- **重逢冲击** — 长时间离线后的关系与情绪动态

```
                   ┌─────────────────────────────────────────────┐
                   │              用户消息                         │
                   └──────────────────┬──────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │               prepareTurnContext               │
              │   预计算 temporalCtx + 用户消息时间信号检测       │
              └───────────────────────┬───────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │              orchestrator.ts                   │
              │                                               │
              │  ┌───────────────────────────────────────┐    │
              │  │ ① 时间上下文构建                       │    │
              │  │    timeOfDay / season / gapHours / ... │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ② 记忆检索时间调制                     │    │
              │  │    retriever: computeTemporalBoost ×6  │    │
              │  │               temporalAnchorHits       │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ③ 情绪时间调制                        │    │
              │  │    星期曲线 / 节日覆盖 / 重逢冲击       │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ④ 特殊日期检测 + 时间感慨涌现           │    │
              │  │    5 源聚合 → TemporalHint             │    │
              │  │    tryTimeReflection × 8 场景           │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ⑤ Psyche 块注入                       │    │
              │  │    系统时钟 / 时间感慨 / 特殊日 / 重逢   │    │
              │  └───────────────────────────────────────┘    │
              └───────────────────────────────────────────────┘
```

---

## 2. 核心模块 — temporalAwareness/ 包

六个文件位于 `src/main/engine/temporalAwareness/`，职责高度内聚、零外部依赖（除 i18n）：

| 文件 | 职责 | 耗时 |
|------|------|------|
| `holidayDetector.ts` | 三种策略节假日检测 | <0.2ms |
| `timeDepthCalculator.ts` | 关系时长→自然语言 | <0.1ms |
| `specialDateDetector.ts` | 5 源特殊日期聚合 | <1ms |
| `temporalMemoryBridge.ts` | 日期→关联记忆 (三级召回) | <1ms |
| `temporalProactiveTrigger.ts` | 编排产出 TemporalHint | <1ms |
| `fastSpecialDateCheck.ts` | 情绪偏移快速路径 | <0.5ms |

### 2.1 holidayDetector.ts — 节假日检测

纯函数，零 I/O。三种非重叠策略：

**策略 1 — 公历固定节日**（MM-DD 直映射）：

```
'01-01': 元旦     '02-14': 情人节    '03-08': 妇女节
'04-01': 愚人节    '05-01': 劳动节    '05-20': 520
'05-21': 521      '06-01': 儿童节    '10-01': 国庆节
'11-11': 光棍节   '12-24': 平安夜    '12-25': 圣诞节
'12-31': 跨年夜
```

**策略 2 — 农历节日预计算（2026–2030）**：

每年 5 个节日预计算到公历：
```
2026: 02-17 春节  02-22 元宵  05-31 端午  08-19 七夕  10-04 中秋
2027: 02-06 春节  02-11 元宵  05-20 端午  08-08 七夕  09-23 中秋
2028: 01-26 春节  01-31 元宵  05-08 端午  07-28 七夕  09-11 中秋
2029: 02-13 春节  02-18 元宵  05-28 端午  08-17 七夕  10-01 中秋
2030: 02-03 春节  02-08 元宵  05-17 端午  08-06 七夕  09-19 中秋
```

**策略 3 — 公历浮动节日**：

通过 `nthSundayOfMonth(year, month, n)` 算法计算：
```
母亲节: 5月第2个星期日 → 1 + 7*(2-1) + ((7 - dayOfWeek) % 7)
父亲节: 6月第3个星期日
```

**分类** `categorizeHoliday()` 产出四种类型：

| 类型 | 节日举例 | 情绪权重 |
|------|----------|----------|
| `traditional` 传统 | 元旦、国庆、春节、元宵、端午、中秋 | 0.9 |
| `western` 西方 | 情人节、圣诞节、平安夜、跨年夜 | 0.7 |
| `social` 社交 | 520、521、光棍节 | 0.7 |
| `family` 家庭 | 母亲节、父亲节、儿童节、妇女节 | 0.7 |

### 2.2 timeDepthCalculator.ts — 时间深度计算

**核心函数**: `computeTimeDepth(firstMetDate, today) → TimeDepthResult`

**算法**: 用 `parseLocalDate()` 手动解析 ISO 字符串避免 UTC 差一错误，取本地午夜时间戳：

```
daysSince = Math.floor((todayMs - firstMs) / 86400000)
diffYears = daysSince / 365.2425
yearsSince = Math.floor(diffYears)
nearestYear = Math.round(diffYears)
isMilestone = nearestYear ∈ {1,2,3,5,10} AND nearestYear >= 1
daysSinceLastAnniversary = daysSince - yearsSince * 365.2425
```

**时间带分类**（11 个区间，从"刚认识"到"走过这么多年"）：

| 条件 | i18n Key | 情绪权重 |
|------|----------|----------|
| 整周年 ±15 天 + nearestYear>=1 | `exactYear`/`exactYears` | `min(0.95, 0.8 + nearestYear×0.05)` |
| daysSince < 30 | `justMet` | 0.3 |
| daysSince < 90 | `overMonth` | 0.4 |
| daysSince < 180 | `halfYear` | 0.5 |
| daysSince < 365 | `overHalfYear` | 0.6 |
| 刚过周年 (lastAnniv≤90 天) | `justOverYear`/`justOverYears` | `min(0.95, 0.75 + years×0.03)` |
| 快到周年 (lastAnniv>275 天) | `almostNextYear` | `min(0.95, 0.78 + years×0.04)` |
| 中间地带 | `overYear`/`overYears` | `min(0.9, 0.7 + years×0.04)` |

**`isAnniversaryWindowActive()`** — 快速路径共享函数，判断是否处于周年 ±15 天窗口。被 `detectSpecialDates` 和 `detectFastSpecialDateType` 共用。

### 2.3 specialDateDetector.ts — 5 源聚合

输入：`today`, `firstMetDate`, `ackemBirthday`, `birthdays[]`, `temporalAnchors[]`

**5 个数据源**：

| 源 | 数据来源 | 判断方式 | 情绪强度 |
|----|----------|----------|----------|
| 0 | Canon `ackemCanon.birthDate = 2026-06-20` | MMDD 相等 | `min(1.0, 0.7 + years×0.05)` |
| 1 | FirstMet 相识日期 | `isAnniversaryWindowActive` ±15天 | `min(0.95, 0.6 + years×0.1)` |
| 2 | FactStore `ageMeta.birthdayMMDD` | MMDD 相等 + subject 去重 | 1.0 |
| 3 | `temporal_anchors` 表 | MMDD 相等 (排除 fuzzy) | 数据库值 |
| 4 | holidayDetector 节假日 | detectHoliday() | 传统 0.9 / 其他 0.7 |

**排序优先级**：先按类型排序（ackem_birthday/first_met/relationship=0，birthday=1，milestone=2，holiday=3，recurring=4），同类型按情绪强度降序。

### 2.4 temporalMemoryBridge.ts — 三级召回

| 级别 | 适用类型 | 返回 |
|------|----------|------|
| L1 高 | ackem_birthday, first_met, birthday, relationship | seedFacts 前 5 + 完整叙事 |
| L2 中 | holiday, recurring_memory | 全部 seedFacts + 叙事 |
| L3 低 | milestone | 全部 seedFacts + 叙事 |

**`buildTemporalSeedTierBBlock(signal, factStore) → string`**：

当 `temporalHint.priority !== 'low'` 时，查询 `factStore.getById(id)` 获取活跃事实，格式化为 `【今日关联记忆】\n· {subject}：{summary}` 注入 tierBBlock。

### 2.5 temporalProactiveTrigger.ts — 信号产出

**`produceTemporalSignal(specialDates) → TemporalProactiveSignal`**

排序优先级（HINT_SORT_ORDER）：
```
ackem_birthday:0 → first_met:1 → relationship:2 → birthday:3 → milestone:4 → holiday:5 → recurring:6
```

**优先级映射**：`ackem_birthday/first_met/birthday/relationship → 'high'`, `milestone → 'normal'`, 其他 → `'low'`

**过期策略**：`ackem_birthday/birthday: 30 天`, `first_met/milestone/relationship: 60 天`, `holiday: 7 天`, `recurring: 14 天`

合并后的 `TemporalHint` 包含：日期标签、叙事文本、优先级、过期时间。

### 2.6 fastSpecialDateCheck.ts — 情绪偏移快速路径

专供 orchestrator mood bias 使用的轻量路径，不查 `temporal_anchors` 数据库。

仅检查：Ackem 生日 MMDD → `isAnniversaryWindowActive` → FactStore birthdayMMDD 扫描 → 节假日检测 → 返回 `FastSpecialDateType | null`

节假日细分：`holiday_spring`（春节）、`holiday_valentine`（情人节/七夕/520/521）、`holiday`（通用）。

---

## 3. 时间上下文调制器

**文件**：`src/main/memory/temporalContextModulator.ts`

### 3.1 TemporalContext 类型

```typescript
TemporalContext {
  timeOfDay: 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night' | 'late_night'
  isWeekend: boolean
  month: number           // 1-12
  season: 'winter' | 'spring' | 'summer' | 'autumn'
  hour: number            // 0-23
  weekday: number         // 0(Sun)-6(Sat)
  gapHours: number        // 距上次聊天小时数
  localDate: string       // "2026-06-28"
}
```

季节由 `monthToSeason()` 映射：12–2 月冬、3–5 月春、6–8 月夏、9–11 月秋。

### 3.2 computeTemporalBoost — 六维检索加权

对每条待排序的记忆事实，计算时间感知加权系数：

| 因子 | 条件 | 乘数 |
|------|------|------|
| **T1 昼夜节律** | 事实 hour 与当前 hour 相差 ≤2 | morning 1.2 / forenoon 1.1 / afternoon 1.0 / evening 1.2 / night 1.3 / late_night 1.4 |
| **T2 星期匹配** | 周末对周末 或 平日对平日 | 周末 1.2 / 平日 1.1 |
| **T3 季节共振** | 同季节 | 1.2，否则 0.9 |
| **T4 深夜加权** | late_night + 1-5 点 | 1.4，VULNERABILITIES/MOOD 额外 ×1.3 |
| **T5 重逢感知** | gapHours>72 + OUR_BOND/VULNERABILITIES | 1.5 |
| **T6 距离感知** | daysSinceCreation <1/3/7 天 | 1.5/1.3/1.1 |

所有因子**乘积累积**（而非取平均），初始 1.0，最终可能达到 1.0 × 1.2 × 1.2 × 1.4 × 1.5 × 1.5 ≈ **4.5 倍**（极端情况）。

### 3.3 星期情绪曲线

模拟人类一周的情绪周期。产出 `{ affDelta, secDelta }` 范围 -0.06 ~ +0.06，直接加到 L2 情绪的 aff 和 sec 上：

| 星期 | 时段 | affDelta | secDelta |
|------|------|----------|----------|
| 周五 | ≥18h | +0.06 | +0.02 |
| 周五 | 14-18h | +0.04 | 0 |
| 周五 | 10-14h | +0.02 | 0 |
| 周六 | 全天 | +0.03 | 0 |
| 周日 | ≥18h | **-0.06** | **-0.03** |
| 周日 | 14-18h | -0.03 | 0 |
| 周日 | <14h | +0.01 | 0 |
| 周一 | <12h | **-0.06** | **-0.02** |
| 周一 | 12-18h | -0.03 | 0 |
| 周二至周四 | 全天 | 0 | 0 |

### 3.4 特殊日期情绪覆盖

当 `fastSpecialDateType` 非空时，**覆盖**星期曲线（绝对值远大于星期微调）：

| 类型 | affDelta | secDelta | 含义 |
|------|----------|----------|------|
| `ackem_birthday` | **+3.0** | +1.5 | 她自己的生日——比谁都开心 |
| `birthday` | **+3.0** | +1.0 | 庆祝感，温暖 |
| `first_met_anniversary` | +2.0 | +0.5 | 温暖怀旧 |
| `relationship` | +2.0 | +0.5 | 关系锚点 |
| `holiday_spring` | +1.5 | +0.3 | 春节喜庆 |
| `holiday_valentine` | +1.0 | -0.5 | 温馨带期待 |
| `holiday` | +0.5 | 0 | 一般节日 |
| `milestone` | +1.0 | +0.2 | 里程碑感慨 |

---

## 4. 用户消息时间信号检测

**文件**：`src/main/memory/temporalSignalExtractor.ts`

### 4.1 预定义锚点句子（27 条）

**时间方向**（19）：去年这个时候、上周的今天、一个月前、三个月前、半年前、上周、上个月、去年、前年、明天、后天、下周、下个月、明年、最近、前几天、前阵子、那天、那时候

**周期性事件**（11）：生日、纪念日、过年、中秋、新年、年底、年初、开学、毕业、入职

**增量时间**（4）：上次、好久不见、很久没、又过了一年

**频次**（5）：每天、每周、每月、每年、经常

### 4.2 detectTemporalSignal 算法

```
1. 输入 msgEmbedding × 27 条预计算句子 embedding
2. 计算 cosineSimilarity(msgEmbedding, sentenceEmbedding)
3. 取最佳分数，若 < threshold(0.6) → null
4. 分类类型：
   - 含"时候/的前/前阵子/那天/那时候/好久" → fuzzy
   - 含周期性关键词 → recurring
   - 含精确关键词 → exact
   - 兜底 → fuzzy
```

### 4.3 生命周期

`buildTemporalEmbeddings(provider)` 在**启动时**预计算所有 27 条句子的 embedding 并缓存。每轮对话使用已缓存的 embedding，**不重复计算**。在 orchestrator 和 prepareTurnContext 中同时使用。

---

## 5. 时间锚点持久化

**文件**：`src/main/memory/temporalAnchorPolicy.ts`

### 5.1 锚点类型

```
fuzzy < recurring < milestone < relationship
```

**`detectAnchorType(fact, userMsg)`** 判定逻辑：
1. 若 `subcategory === 'OUR_BOND'` 且 `selfRelevance >= 4.5` 且 `intensity >= 0.7` → `relationship`
2. 若 `selfRelevance >= 4.0` 或 `intensity >= 0.8` → `milestone`
3. 若文本含 `RECURRING_SIGNALS`（生日、纪念日、每年、周年、过年、中秋等 14 个关键词）→ `recurring`
4. 兜底 → `fuzzy`

### 5.2 写入门控 shouldWriteTemporalAnchor

条件（满足任一即可写入）：
- `weight >= 2 AND intensity > 0.5`（强门槛，任意类型）
- `recurring` 类型 AND `weight >= 1 AND intensity >= 0.35`
- `relationship` 类型 AND `intensity >= 0.4`
- `milestone` 类型 AND `weight >= 1 AND intensity >= 0.45`
- fuzzy **永不**自动写入（防止噪音）

### 5.3 writeTemporalAnchor

```sql
INSERT OR IGNORE INTO temporal_anchors
(id, anchor_date, anchor_type, linked_fact_ids, emotional_valence,
 emotional_intensity, domain, summary, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

触发点：`ingest.ts`, `factLanding.ts`, `commitImportJob.ts`

### 5.4 检索时锚点解析（retriever.ts）

**策略 A — 主动周期性锚点**：查询 `temporal_anchors` 中 `type='recurring'` 且 MM-DD 在 ±7 天窗口内、`(last_triggered_at IS NULL OR last_triggered_at < month_ago)`。按 `emotional_intensity DESC LIMIT 3`。

**策略 B — 宽泛锚点检索**：
1. **Periodic**: 同为 recurring，窗口 ±30 天，LIMIT 5
2. **Fuzzy**: `type='fuzzy'` 且 `anchor_date >= 三个月前`，LIMIT 3

两种策略均解析 `linked_fact_ids` JSON 数组，去重后混入 `temporalAnchorHits[]` → `factsForEcho[]`。

时间加权（`computeTemporalBoost`）在排序时与触发词匹配权重、recency 等因子**乘积累积**。

---

## 6. 重逢冲击

**文件**：`src/main/engine/reunion.ts`

### 6.1 六级冲击模型

| Tier | 条件 | secDelta | aroDelta | domDelta | trustDelta | 阶段降级 |
|------|------|----------|----------|----------|------------|----------|
| quick_return | <12h | +2 | +1 | 0 | 0 | 否 |
| short_absence | 12-48h | -5 | +3 | -2 | -2 | 否 |
| day_apart | 2-7天 | -12 | +6 | -4 | -5 | 否 |
| week_apart | 7-30天 | -20 | +8 | -6 | -10 | 否 |
| long_lost | 30-90天 | -25 | +3 | -8 | -15 | **是** |
| stranger_again | ≥90天 | -30 | +1 | -10 | -20 | **是** |

**阶段降级路径**：`INTIMATE → FAMILIAR → STRANGER`（一次降一级）

### 6.2 重逢情感助推

`computeReunionBoost(lastActiveIso, nowIso) → { affBoost, secBoost } | null`

阈值：`REUNION_OFFLINE_MINUTES = 30` 分钟

```
factor = Math.min(minutes / REUNION_OFFLINE_CAP_MINUTES, 1) * 0.5 + 0.5
affBoost = 2.0 * factor
secBoost = 1.5 * factor
```

### 6.3 重逢日记

`buildReunionDiaryPrompt(input)` 生成 200-400 字重逢日记 prompt，包含：
- 29 个性格预设 × 6 个重逢 tier 的预写台词
- 当前情绪/关系/氛围参数
- 分离前记忆摘要
- 离线思绪
- 叙事指导（从茫然到确认到情绪释放）

---

## 7. 时间感慨涌现

**文件**：`src/main/engine/emotionalEmergence.ts`（tryTimeReflection 部分）

### 7.1 模糊时长标签

```
<30 天   → feltDuration.short     "没多久"
<90 天   → feltDuration.medium    "一阵子"
<180 天  → feltDuration.half      "也有一阵子"
<365 天  → feltDuration.long      "这么久"
≥365 天  → feltDuration.veryLong  "一起走了很长的路"
```

### 7.2 八种时间感慨场景

每种场景包含：触发条件、强度公式、情绪风味（flavor）、相位管理：

| # | 风味 | 核心条件 | 强度公式 |
|---|------|----------|----------|
| 1 | `quiet_awe` | late_night + QUIET_FOND + ≥5 连续有意义对话 | `(aff+100)/200 + 0.2`, clamped [0.3,0.9] |
| 2 | `nostalgic` | SWEET_ATTACHMENT + >90天 + warm 气氛 | `(aff+100)/200 + trust/200`, clamped [0.4,0.95] |
| 3 | `bittersweet` | HURT_GRIEVANCE + INTIMATE + 最近 5 轮 aff 均值 >50 | `|aff|/100`, clamped [0.3,0.7] |
| 4 | `grateful` | INTIMATE + aff 从 <20 回升到 >50 最近 5 轮 | 固定 **0.7** |
| 5 | `wonder` | TSUNDERE + INTIMATE + >180天 | 固定 **0.55** |
| 6 | `warm_familiarity` | QUIET_FOND/SWEET_ATTACHMENT + >14天 + 深聊 | `(aff+100)/250 + days/500`, [0.25,0.7] |
| 7 | `tender_hold` | ≥3 连续脆弱 + FAMILIAR/INTIMATE + >14天 + aff>8 | `(aff+\|aro\|)/120 + vuln/10`, [0.3,0.75] |
| 8 | `tender_hold`(响应式) | 响应模式 + ≥1 脆弱 + >14天 | `(aff+\|aro\|)/140 + vuln/12`, [0.28,0.72] |

### 7.3 双锁冷却

同类型时间感慨受双重冷却约束：
- `SAME_TYPE_COOLDOWN_TURNS = 50` 轮
- `SAME_TYPE_COOLDOWN_HOURS = 72` 小时

**任一满足即可绕过**（长对话不必等满 72 小时）。响应式模式下冷却降至 1 轮。

### 7.4 情绪强度门槛

时间感慨在 `evaluateEmergence()` 中判断，需先通过 4 层护盾：
1. **情绪强度门槛**：`emotionalIntensity = aff×0.6 + sec×0.2 + |aro|×0.2`，`depthBonus` 补足（连续脆弱+4、连续有意义+2、近 6 轮有意义≥4+2），总和需 ≥ 20
2. **陌生人护盾**：STRANGER 阶段无涌现
3. **愤怒护盾**：ANGRY_ATTACK 压制一切涌现
4. **冷却护盾**：类型间 10 轮冷却（响应式路径绕过）

---

## 8. 编排器集成点

`src/main/engine/orchestrator.ts` 中时间感知分布在 11 个集成点：

| # | 位置（行号大致） | 功能 |
|---|-----------------|------|
| 1 | 289-298 | 构建 `temporalCtx` 传入 retriever |
| 2 | 333 | `detectTemporalSignal(qEmb, temporalEmbeddings)` |
| 3 | 523-541 | `detectFastSpecialDateType` → mood bias |
| 4 | 278-281, 513-519 | 重逢助推 + 重逢冲击 |
| 5 | 840-854 | 完整特殊日期检测（5 源） |
| 6 | 902-906 | `buildMandatoryCanonSpecialDateBlock`（绕过话题仲裁） |
| 7 | 1057 | `formatTimeContextBlock` 始终注入 psycheBlock |
| 8 | 1058-1060 | `userAsksLocalClock()` 检测 |
| 9 | 1180-1253 | 话题仲裁中 temporal hint 作为候选 |
| 10 | 1490-1493 | `buildTemporalSeedTierBBlock` 注入 tierBBlock |
| 11 | 773-831 | `tryTimeReflection` 涌现判决 |

### Canon 强制块

`buildMandatoryCanonSpecialDateBlock()` 产出两种绕过话题仲裁的强制标记：
- `【今日 · Ackem 生日】` — 当今天是 06-20
- `【相识纪念 · X周年】` — 当 ±15 天周年窗口

### 时间上下文块

`formatTimeContextBlock()` 始终注入 psycheBlock，包含：
- 系统时钟（本地日期和时间）
- 当前时刻问候语
- 环境氛围提示
- 话题建议

---

## 9. 策略层集成

### injectionPolicy.ts — 时间注入槽位仲裁

| 场景 | temporal 槽 | emergence 槽 |
|------|-------------|-------------|
| 可仲裁（非静默） | `proactive` | `proactive` |
| 用户发起 + 高优先级特殊日 | `responsive` | 视情况 |
| 用户发起 + 消息含时间信号 | `responsive` | 视情况 |
| whisper + 高优先级特殊日 | `proactive` | `none` |
| silent + 响应式涌现 | `none` | `responsive` |

### topicSelector.ts — 话题权重

- 特殊日期话题权重：0.85（高优先级）或 0.65（普通）
- `late_night + vulnerable` 过滤器：仅允许 emergence、special_date 或含"关系/陪伴"的话题
- 当 `specialDates.length > 0` 时，`special_date` source 权重 ×1.3

---

## 10. 桌面伴侣时间上下文

**文件**：`desktop-companion.ts` 的 `formatTimeContextBlock()`

六个时段各有不同的问候语、氛围提示、话题建议：

| 时段 | 小时 | 氛围 | 典型问候 |
|------|------|------|----------|
| `morning` | 5-8 | 清晨宁静慵懒 | "早" |
| `forenoon` | 8-11 | 精力充沛 | "上午好" |
| `afternoon` | 11-14 | 午间慵懒温暖 | "中午了，记得吃点东西" |
| `afternoon` | 14-18 | 容易犯困 | "下午好" |
| `evening` | 18-22 | 放松温柔亲密 | 周末识别 |
| `night` | 22-2 | 私密安静 | "夜深了..." |
| `late_night` | 2-5 | 凌晨世界沉睡 | "这么晚了还没睡..." |

---

## 11. i18n 键汇总

| 域 | 键数 | 用途 |
|----|------|------|
| `holiday.{name}` | 22 | 节日名称翻译 |
| `timeDepth.*` | 11 | 时间带标签 |
| `specialDate.*` | 9 | 特殊日期标题 + 叙事 |
| `emergence.*` | 8 | 时间感慨风味 + 后缀 |
| `feltDuration.*` | 5 | 模糊时长标签 |

---

## 12. 文件清单

| # | 路径 | 角色 |
|---|------|------|
| 1 | `engine/temporalAwareness/holidayDetector.ts` | 节假日检测 |
| 2 | `engine/temporalAwareness/timeDepthCalculator.ts` | 时间深度计算 |
| 3 | `engine/temporalAwareness/specialDateDetector.ts` | 特殊日聚合 |
| 4 | `engine/temporalAwareness/temporalMemoryBridge.ts` | 日期→记忆桥接 |
| 5 | `engine/temporalAwareness/temporalProactiveTrigger.ts` | 信号产出 |
| 6 | `engine/temporalAwareness/fastSpecialDateCheck.ts` | 快速情绪偏移 |
| 7 | `memory/temporalContextModulator.ts` | 时间检索加权 + 情绪调制 |
| 8 | `memory/temporalSignalExtractor.ts` | 用户消息时间信号 |
| 9 | `memory/temporalAnchorPolicy.ts` | 时间锚点写入策略 |
| 10 | `memory/retriever.ts` | 时间锚点检索（~200 行） |
| 11 | `engine/strategy/injectionPolicy.ts` | 时间注入槽仲裁 |
| 12 | `engine/strategy/topicSelector.ts` | 话题时间加权 |
| 13 | `engine/emotionalEmergence.ts` | 时间感慨涌现 |
| 14 | `engine/reunion.ts` | 重逢冲击 |
| 15 | `engine/rhythmEngine.ts` | 时段节奏影响 |
| 16 | `engine/orchestrator.ts` | 主集成点（~11 处） |
| 17 | `engine/prepareTurnContext.ts` | 时间上下文预计算 |
| 18 | `canon/ackemCanon.ts` | 强制特殊日块 |
| 19 | `context/localTime.ts` | 本地时间工具 |
| 20 | `context/runtimeContext.ts` | 运行时时间上下文 |
| 21 | `extensions/plugins/builtin/desktop-companion/desktop-companion.ts` | 时段上下文 |
| 22 | `i18n/zh.ts`, `i18n/en.ts` | 时间相关翻译 |

---

## 13. 相关文档

| 文档 | 内容 |
|------|------|
| [01-brain-system.md](./01-brain-system.md) | L4 记忆检索中时间锚点集成 |
| [02-heart-system.md](./02-heart-system.md) | 情绪涌现中时间感慨、重逢冲击 |
| [03-mouth-system.md](./03-mouth-system.md) | 时间上下文块注入 |
| [05-extension-system.md](./05-extension-system.md) | 桌面伴侣时段上下文 |
| [00-overall-system.md](./00-overall-system.md) | 全对话链路 |

*时间系统 · Ackem v1.0.0 · 2026-06*
