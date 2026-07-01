# 心系统

> **语言：** 中文 · [English](./02-heart-system.md)

> **层级**：L1 关系 · L2 情绪 · L3 表达状态  
> **代号**：Heart Engine  
> **核心问题**：伴侣与用户的关系现在怎样？情绪如何变化？该怎么「像人」地表达？  
> **设计原则**：所有状态由 FSM + 递推方程驱动，纯函数，零 LLM 调用

---

## 1. 定位

心系统接收 **脑系统** 的 `Event`，维护 **关系 FSM** 与 **四维情绪模型**，生成供嘴系统使用的 `psycheBlock`（心理状态文本块）。

```
Event (来自 L0 Interpreter)
    │
    ▼
┌──────────────────────────────────────────────────┐
│  L1  relationship.ts                             │
│      阶段 FSM · 信任系统 · 裂痕机制 · 气氛模型     │
│      状态: STRANGER → FAMILIAR → INTIMATE         │
│                                                  │
│  L2  emotion.ts                                  │
│      四维情绪: aff(喜爱) sec(安全感)              │
│                aro(唤醒度) dom(支配感)             │
│      递推方程: step() + noise + modulation        │
│                                                  │
│  L3  psyche.ts                                   │
│      psycheBlock 组装 → 心理描写入 prompt         │
│      沉默倾向 · 屏障感知 · 表达强度 hint           │
│                                                  │
│  Emotional Emergence                             │
│      长聊涌现 · 时间感 · 余韵 · 连续脆弱           │
│                                                  │
│  辅助模块                                        │
│      欲望栈 · 节奏引擎 · 重逢 · 镜像 · 用户画像    │
└──────────────────────────────────────────────────┘
    │
    ▼
psycheBlock + ExpressionHint → 嘴系统 (prompt 注入)
```

---

## 2. L1 关系层

**文件**：`src/main/engine/relationship.ts`  
**核心数据类型**：

```typescript
interface L1State {
  stage: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  trust: number                    // 0–100
  rifts: number                    // 裂痕计数
  affection_momentum: number       // 情感动量 [-1, 1]
  atmosphere: 'warm' | 'neutral' | 'cool'
  consecutivePositiveTurns: number // 连续正向轮次计数
  turnsSinceLastRift: number       // 距离上次裂痕的轮数
  sharedEventsCount: number        // 共享事件计数
}
```

### 2.1 阶段 FSM

关系是一个 **三级有限状态机**，可正向演进也可因伤害降级：

```
                    ┌──────────┐
                    │ STRANGER │  (初始状态)
                    └────┬─────┘
                         │ consecutivePositiveTurns ≥ 10
                         ▼
                    ┌──────────┐
                    │ FAMILIAR │
                    └────┬─────┘
                         │ trust ≥ 60 AND sharedEventsCount ≥ 3
                         ▼
                    ┌──────────┐
                    │ INTIMATE │
                    └──────────┘

降级条件:
  INTIMATE → FAMILIAR: rifts ≥ 5  OR trust < 30
  FAMILIAR → STRANGER: rifts ≥ 8  OR trust < 15
```

**演进函数** `evolveStage()`：

```typescript
function evolveStage(s: L1State): RelationshipStage {
  switch (s.stage) {
    case 'STRANGER':
      if (s.consecutivePositiveTurns >= STAGE_WARMUP_TURNS) // 10
        return 'FAMILIAR'
      break
    case 'FAMILIAR':
      if (s.trust >= STAGE_INTIMATE_TRUST &&    // 60
          s.sharedEventsCount >= STAGE_INTIMATE_EVENTS) // 3
        return 'INTIMATE'
      break
    case 'INTIMATE':
      if (s.rifts >= STAGE_DOWNGRADE_RIFTS ||   // 5
          s.trust < STAGE_DOWNGRADE_TRUST)      // 30
        return 'FAMILIAR'
      break
  }
  return s.stage
}
```

### 2.2 信任系统

信任是 **0–100** 的连续值，每轮对话通过 `trustDelta(event)` 计算变化量：

```typescript
function trustDelta(event: Event): number {
  switch (event.type) {
    case 'praise':    return TRUST_PRAISE      // +1.5
    case 'apology':   return TRUST_APOLOGY     // +2.0
    case 'vulnerable':return TRUST_VULNERABLE  // +1.0
    case 'tease':     return TRUST_TEASE       // +0.8
    case 'cold':      return TRUST_COLD        // -1.5
    case 'hurtful':   return TRUST_HURTFUL     // -3.0
    case 'casual_chat': return TRUST_CASUAL    // 0
    case 'question':  return TRUST_QUESTION    // 0
    default:          return 0
  }
}
```

信任更新是逐轮累加并钳位：

```
trust = clamp(prev.trust + trustDelta(event), 0, 100)
```

**破冰修正**（`applyIceBreak`）：当信任 ≤ 15 且用户发送高诚意（≥0.7）道歉时，额外奖励 +3.0 信任，并将气氛强制重置为 `neutral`。

### 2.3 裂痕机制

裂痕是 **伤害事件的累积计数器**：

```
触发条件: event.type === 'hurtful' AND turnsSinceLastRift >= RIFT_HURTFUL_COOLDOWN (2)
  → rifts += 1, turnsSinceLastRift = 0

修复条件: event.type === 'apology' AND rifts > 0
           AND consecutivePositiveTurns >= RIFT_REPAIR_POSITIVE_STREAK (4)
  → rifts -= 1 (最低 0)
```

连续正向轮次跟踪：
```
if event.type ∈ {praise, tease, vulnerable, apology}
  → consecutivePositiveTurns += 1
if event.type ∈ {cold, hurtful}
  → consecutivePositiveTurns = 0
```

### 2.4 情感动量与气氛

每轮通过 `signForMomentum()` 判断事件正负方向：

```typescript
function signForMomentum(event: Event): number {
  if (POSITIVE_TYPES.has(event.type)) return 1   // praise/tease/vulnerable/apology
  if (NEGATIVE_TYPES.has(event.type)) return -1  // cold/hurtful
  return 0
}
```

**情感动量** 使用指数移动平均（EMA）更新：

```
affection_momentum = MOMENTUM_ALPHA (0.7) × prev.momentum
                   + (1 - 0.7) × event.intensity × sign
```

气氛标签由动量和破冰修正共同决定：

```
if ice-break forced → atmosphere = 'neutral'
else if momentum > ATMOSPHERE_WARM_THRESHOLD (0.5) → 'warm'
else if momentum < ATMOSPHERE_COOL_THRESHOLD (-0.3) → 'cool'
else → 'neutral'
```

### 2.5 外场气氛

**文件**：`relationship.ts` 的 `updateExternalAtmosphere()`

独立于内部气氛的 EMA 层，α 更高（0.95），响应更慢，用于感知长期趋势：

```
level = clamp(0.95 × prev.level + 0.05 × intensity × sign, -1, 1)
label = level > 0.4 → 'warm' | level < -0.2 → 'cool' | else → 'neutral'
```

### 2.6 调制系数（Modulation）

`computeModulation()` 为 L2 情绪层提供三个调制因子：

```
trustMod  = TRUST_MOD_MIN (0.5) + (trust / 100) × (TRUST_MOD_MAX (1.5) - 0.5)
           trust=0 时 0.5，trust=100 时 1.5

riftMod  = max(RIFT_MOD_MIN (0.3), 1 - rifts × RIFT_MOD_DECAY_PER_RIFT (0.15))
           裂痕越多正向情绪上限越低

stageWeight:
  STRANGER → STAGE_WEIGHT_STRANGER (0.8)
  FAMILIAR → STAGE_WEIGHT_FAMILIAR (1.0)
  INTIMATE → STAGE_WEIGHT_INTIMATE  (1.4)
```

---

## 3. L2 情绪层

**文件**：`src/main/engine/emotion.ts`

### 3.1 四维情绪模型

```typescript
interface Emotion4D {
  aff: number   // Affection 喜爱/好感度  [-100, 100]，初始 5
  sec: number   // Security 安全感      [-100, 100]，初始 10
  aro: number   // Arousal 唤醒度      [-100, 100]，初始 0
  dom: number   // Dominance 支配感    [-100, 100]，初始 -5
}

interface EmotionState extends Emotion4D {
  primaryLabel: string   // 情绪标签（如 'SWEET_ATTACHMENT'）
  isLocked: boolean      // 是否处于高/低锁定区
}
```

### 3.2 BASE_STIMULUS — 事件基础冲击量表

每种事件类型定义对四维的基础冲击量（`BASE_STIMULUS`）：

| 事件类型 | aff | sec | aro | dom |
|----------|-----|-----|-----|-----|
| praise | +7.0 | +4.5 | +5.0 | -2.0 |
| tease | +4.5 | +2.0 | +7.0 | +2.0 |
| casual_chat | +0.8 | +0.5 | +1.5 | 0 |
| cold | -5.0 | -6.5 | -1.5 | -2.0 |
| hurtful | -10.0 | -11.0 | +7.5 | +5.5 |
| apology | +4.5 | +6.5 | -2.0 | -3.5 |
| vulnerable | +10.0 | -2.0 | -1.0 | -5.0 |
| question | +0.8 | +0.8 | +2.0 | 0 |
| adult_flirt | +3.5 | +2.0 | +5.0 | +1.0 |
| adult_dominant | +2.5 | +0.5 | +6.0 | +5.0 |
| adult_submissive | +4.5 | +3.0 | +3.0 | -5.0 |
| adult_explicit | +5.5 | +1.0 | +7.5 | +2.0 |

### 3.3 递推方程 — `emotionStep()`

每轮对话执行一次，共 7 步：

**Step 1：原始冲击**

```
deltaRaw.aff = S.aff × trustMod × stageWeight × event.intensity × event.sincerity
deltaRaw.sec = S.sec × trustMod × event.intensity × event.sincerity
deltaRaw.aro = S.aro × stageWeight × event.intensity
deltaRaw.dom = S.dom × stageWeight × event.intensity
```

**Step 2：容量压制（Cap Scale）**

```
capScale(absVal) = max(0.1, 1 - |当前值| / EMOTION_CAP_DENOM (120))

deltaCap = deltaRaw × capScale(当前值)
```

维度绝对值越高，同方向新冲击的边际增益越低，防止溢出。

**Step 3：单轮钳位**

```
deltaClamped = clamp(deltaCap, -SINGLE_TURN_CLAMP (10), +10)
```

**Step 4：裂痕对正向情绪的衰减**

```
if deltaClamped.aff > 0: delta.aff ×= riftMod
if deltaClamped.sec > 0: delta.sec ×= riftMod
```

**Step 5：锁定区修正（Lock Zone）**

```
当前值 > LOCK_AFF_HIGH (70)  且 delta.aff < 0 → delta.aff ×= LOCK_AFF_HIGH_REDUCE_NEG (0.6)
当前值 < LOCK_AFF_LOW (-50)  且 delta.aff > 0 → delta.aff ×= LOCK_AFF_LOW_REDUCE_POS (0.5)
当前值 < LOCK_SEC_LOW (-60)  且 delta.sec > 0 → delta.sec ×= LOCK_SEC_LOW_REDUCE_POS (0.5)
```

高喜爱区负面情绪被压制，低谷区正面情绪被压制极低安全感区正面情绪被压制。

**Step 6：气氛漂移**

```
气氛 'warm': aff ×= 1.15, sec ×= 1.1
气氛 'cool': aff ×= 0.7,  sec ×= 0.8
```

**Step 7：D/s 情感反转（成人内容）**

当事件标记为 `isAdultContent` 且人格敏感度 ≤ 15 或带 `provoke-submit` 标签时，调用 `applyDsReversal()`：

```
用户发出支配性内容 (adultSubtype='dominant'):
  sec = |delta.sec| × 0.6    // 被支配 = 安全
  dom = -|delta.dom| × 0.8   // 支配感降低
  aff = delta.aff × 0.8      // 好感温和提升

雌小鬼 (provoke-submit) 额外:
  aro ×= 1.3                 // 被惩罚时的兴奋
  sec = |delta.sec| × 1.0    // 被管教 = 更安全
  aff ×= 0.5                 // 嘴硬，好感不升太快

用户发出臣服性内容 (adultSubtype='submissive'):
  dom = |delta.dom| × 0.7    // 掌控确认
  aff ×= 1.2                 // 好感提升
  sec = |delta.sec| × 0.5

露骨/浪漫内容:
  aff ×= 1.15
  sec = |delta.sec| × 0.7
```

**Step 8：衰减与累加**

```typescript
decay = EMOTION_DECAY (0.03) × decayMultiplier

next.aff = prev.aff × (1 - decay) + delta.aff
next.sec = prev.sec × (1 - decay) + delta.sec
next.aro = prev.aro × (1 - decay) + delta.aro
next.dom = prev.dom × (1 - decay) + delta.dom
```

每轮向基线回归 3%。

**Step 9：确定性噪声**

仅在 `|当前值| > NOISE_THRESHOLD_ABS (80)` 的极端区间添加噪声，避免临界状态的机械行为：

```
noise = (unitNoise01(sessionId, turnIndex, salt) - 0.5) × 2 × NOISE_MAX (0.5)
```

使用 FNV-1a 哈希生成确定性伪随机，同一 session 同一轮的同一维度输出一致。

**Step 10：钳位**

```
clamp(next, -100, 100)
```

### 3.4 情绪标签映射 — `mapEmotionLabel()`

将四维数值映射为可读情绪标签，判断顺序为从最具体到最通用，互不遮蔽：

```
ANGRY_ATTACK:      aff < -18, sec < -25, aro > 40, dom > 30
FEARFUL_OBEDIENT:  aff ∈ [8, 55], sec < -55, aro > 45, dom < -45
TSUNDERE:          aff ∈ [15, 75], sec ∈ [-10, 45], aro ∈ [15, 75], dom > 18
HURT_GRIEVANCE:    aff ∈ [15, 55], sec ∈ [-55, -12], aro ∈ [15, 55], dom < -18
SWEET_ATTACHMENT:  aff > 25, sec > 10, aro ∈ (20, 70], dom ∈ [-25, 25]
QUIET_FOND:        aff > 20, aro < 25, dom ∈ [-25, 25]
SHY_HEARTBEAT:     aff ∈ (15, 65], sec ∈ [-25, 35], aro ∈ [15, 75], dom < 0
COLD_DETACHED:     aff < -3, sec ∈ [-35, 25], aro < -3, dom ∈ [-5, 35]
CALM_RATIONAL:     以上都不匹配
```

### 3.5 记忆回响叠加 — `applyMemoryEcho()`

记忆检索命中高情绪事件时，对当前情绪产生叠加：

```
emotion ⊕ echo = clamp(emotion + echo, -100, 100)
```

`MemoryEcho` 由检索到的 `MemoryFact.emotionalContext` 计算：aff 取原事件 valence 加权，sec 取正向/负向分量，aro 由情绪强度映射，dom 由信任/气氛映射。

---

## 4. L3 表达层 — psycheBlock

**文件**：`src/main/engine/psyche.ts`

### 4.1 情绪转表达参数 — `emoToExpression()`

将情绪标签映射为 `ExpressionParams`：

```typescript
interface ExpressionParams {
  mode: 'NORMAL' | 'SILENT_CANDIDATE'    // 是否倾向沉默
  proximity: 'CLOSE' | 'NEUTRAL' | 'COOL' | 'DEFENSIVE'
  tone: string                            // 语气 hint
  length: 'SHORT' | 'MEDIUM' | 'LONG'    // 篇幅建议
}
```

| 情绪标签 | proximity | tone | length |
|----------|-----------|------|--------|
| SWEET_ATTACHMENT | CLOSE | warm_intimate | MEDIUM |
| SHY_HEARTBEAT | CLOSE | shy_hesitant | SHORT |
| TSUNDERE | NEUTRAL | tsundere | SHORT |
| HURT_GRIEVANCE | COOL | plaintive | MEDIUM |
| ANGRY_ATTACK | DEFENSIVE | sharp | SHORT |
| COLD_DETACHED | DEFENSIVE | flat | SHORT |
| FEARFUL_OBEDIENT | DEFENSIVE | trembling | SHORT |
| QUIET_FOND | CLOSE | gentle_quiet | SHORT |
| CALM_RATIONAL | NEUTRAL | calm | SHORT |

### 4.2 沉默检测 — `calcSilence()`

使用 sigmoid 函数计算沉默概率：

```
aroExcess    = max(0, |aro| - ARO_EXCESS_BASELINE (50))
baseScore    = intensity × 0.3 + rifts × 0.2 + aroExcess × 0.02

stageModifier:
  STRANGER → 1.3    // 陌生人更容易沉默
  FAMILIAR → 1.0
  INTIMATE → 0.7    // 亲密关系沉默倾向更低

adultModifier = adultMode ? 0.5 : 1.0  // 成人模式沉默概率减半

weightedScore = baseScore × stageModifier × adultModifier

probability = sigmoid(12 × (weightedScore - SILENCE_THRESHOLD (0.7)))
            = 1 / (1 + exp(-12 × (weightedScore - 0.7)))

silent = unitNoise01(sessionId, turnIndex, `silence_${eventType}`) < probability
```

### 4.3 屏障感知 — `computeBarrierAwareness()`

计算用户对伴侣的防备/距离感，输出 0–1 的 `level` 和自然语言 `hint`：

```
level = (aff / 100) × 0.30
      + (trust / 100) × 0.15
      + stageFactor × 0.30          // INTIMATE=1.0, FAMILIAR=0.4, STRANGER=0
      + min(sharedEventsCount / 12, 1) × 0.25

clamp(level, 0, 1)
```

hint 按级别分 5 档（<0.2 / <0.4 / <0.6 / <0.8 / ≥0.8），每档根据人格标签（傲娇、三无、温柔）产生差异化表达。

### 4.4 psycheBlock 组装 — `buildPsycheBlock()`

将 L1/L2/L3 状态编译成注入 system prompt 的自然语言块：

```
parts = [
  "【心理状态 · 仅作演绎参考】",
  "你此刻的情绪基调接近：{labelZh}。",
  "你与对话者的气氛：{warm/cool/平稳}。",
  "态度倾向：{tone}。",
  "回复长度：{short/medium/long}。",
  (proximity === 'DEFENSIVE') ? "你现在心理上想保持一点距离。" : "",
  (silent) ? "本轮你可以话很少，或用极短句回应。" : "",
  barrierHint,
  (emergence) ? timeReflectionHint : ""
].filter(Boolean).join('\n')
```

---

## 5. 情绪涌现 — Emotional Emergence

**文件**：`src/main/engine/emotionalEmergence.ts`

### 5.1 设计原理

普通情绪模型是 **马尔可夫性** 的（每轮只依赖上一轮），但长时间交流会产生超越单轮递推的高维表达状态。涌现模块在不回写 L2、不调用 LLM 的前提下，检测这些模式。

### 5.2 事件追踪（模块级状态）

```typescript
let recentEventTypes: string[] = []           // 最近 10 轮事件类型窗口
let consecutiveMeaningfulCount = 0            // 连续有意义轮次
let consecutiveVulnerableCount = 0            // 连续脆弱倾诉

// 有意义事件 = 'vulnerable' | 'praise' | 'apology'
// 脆弱中断条件 = 'hurtful' | 'cold' | 'extreme_redline'
```

### 5.3 主判决 — `evaluateEmergence()`

护盾检查（按顺序）：
1. **陌生人护盾**：`stage === 'STRANGER'` → 无涌现
2. **愤怒护盾**：`primaryLabel === 'ANGRY_ATTACK'` → 无涌现
3. **类型间冷却**：距上次涌现不足 `EMERGENCE_COOLDOWN_TURNS (10)` 轮 → 跳过（响应式路径可绕过）
4. **情绪强度阈值**：

```
emotionalIntensity = aff × 0.6 + sec × 0.2 + |aro| × 0.2

depthBonus:
  consecutiveVulnerableTurns ≥ 3  → +4
  consecutiveMeaningfulTurns ≥ 3  → +2
  countMeaningfulInRecent ≥ 4     → +2

if emotionalIntensity + depthBonus < EMERGENCE_INTENSITY_THRESHOLD (20) → 无涌现
```

通过护盾后尝试 `tryTimeReflection()`。

### 5.4 时间感慨 — `tryTimeReflection()`

`daysSinceMet ≥ 7` 是时间感慨的最低门槛。多个场景竞争触发，取第一个匹配：

| 场景 | 条件 | flavor | 强度计算 |
|------|------|--------|----------|
| 深夜安静的喜欢 | time=late_night, label=QUIET_FOND, 连续深聊≥5轮 | quiet_awe | (aff+100)/200 + 0.2 |
| 甜蜜怀旧 | label=SWEET_ATTACHMENT, days>90, atmo=warm | nostalgic | (aff+100)/200 + trust/200 |
| 苦涩委屈 | label=HURT_GRIEVANCE, stage=INTIMATE, 近5轮aff平均>50 | bittersweet | \|aff\|/100 |
| 感激回升 | stage=INTIMATE, 近5轮aff从<20回升至>50 | grateful | 0.7 |
| 傲娇惊奇 | label=TSUNDERE, stage=INTIMATE, days>180 | wonder | 0.55 |
| 温柔守护 | vulnerable≥3轮, aff>8, 多个标签 | tender_hold | (aff+\|aro\|)/120 + vuln/10 |
| 温暖熟悉 | QUIET_FOND/SWEET_ATTACHMENT, days>14, 深聊≥3轮 | warm_familiarity | (aff+100)/250 + days/500 |

**双锁冷却**：同类型涌现需满足 `turnsSince ≥ 50` **或** `hoursSince ≥ 72` 才可再次触发（响应式路径轮次锁降至 1）。

### 5.5 响应式涌现 — `tryResponsiveEmergence()`

用户脆弱/深聊时降低门槛（免除类型间 10 轮冷却）：

```
threshold = EMERGENCE_INTENSITY_THRESHOLD (20) - 6 = 14

// 与主判决共享同类轮次冷却（RESPONSIVE_EMERGENCE_COOLDOWN_TURNS = 1）
```

### 5.6 阶段推进 — `advanceEmergencePhase()`

涌现状态生命周期：

```
rising (≤3轮) → sustained (3-10轮) → fading (≤5轮) → dissolved
                                    ↘ broken (中断)
```

`applyUserResponseToEmergence()` 处理用户反馈：
- `hurtful/cold` → phase = `broken`, intensity = 0
- 情感链延续（vulnerable/apology/praise）→ sustained 刷新
- 浅层 praise → 加速淡出
- 中性事件 → sustained 计时微刷新

`checkEmergenceInterrupt()` 检测语境切换：
- `hurtful/cold/extreme_redline` → `break`
- 连续情感轮次后出现 `question/casual_chat` → `fade`

### 5.7 模糊体感时间

`humanizeFeltDuration()` 将天数转换为自然语言标签：

```
days < 30   → 'feltDuration.short'
days < 90   → 'feltDuration.medium'
days < 180  → 'feltDuration.half'
days < 365  → 'feltDuration.long'
days ≥ 365  → 'feltDuration.veryLong'
```

具体文案由 i18n 系统根据语言提供。

---

## 6. 辅助模块

### 6.1 欲望栈 — Desire Stack

**文件**：`src/main/engine/desire.ts`

5 槽位系统，模拟伴侣的内在动机：

**欲望生成概率**（每轮每个事件触发一次）：

```
newDesire chance = trigger.chance × stageBonus × intensityBonus
stageBonus:    INTIMATE=1.5, FAMILIAR=1.2, STRANGER=1.0
intensityBonus: 0.5 + event.intensity × 0.5
```

| 事件类型 | 基础概率 | 可能欲望类别 |
|----------|----------|-------------|
| vulnerable | 0.20 | concern, share |
| question | 0.12 | curiosity, suggest |
| praise | 0.10 | share, tease |
| tease | 0.15 | tease, curiosity |
| casual_chat | 0.06 | curiosity, share, suggest |
| apology | 0.08 | concern |
| cold | 0.12 | concern, curiosity |
| hurtful | 0.03 | concern |

**欲望更新流程**：

```
updateDesireStack():
  1. 衰减存量欲望 urgency (减 DESIRE_DECAY_PER_TURN (0.3))
  2. 沉淀：urgency ≤ 0 或闲置 ≥ 8 轮或 expressed 超 2 轮 → settled
  3. 可能生成新欲望 → 写入空槽 / 驱逐最低 urgency 槽
  4. urgency ≥ DESIRE_EXPRESS_THRESHOLD (7) → 标记 expressed
  5. 返回 hints 数组供注入 psycheBlock
```

**欲望-知识匹配**：`desireTopicMatchesKnowledge()` 用子串匹配 + Embedding 余弦相似度（阈值 0.70）判断欲望话题是否与当前知识整理主题相关，相关时自动沉淀欲望。

### 6.2 节奏引擎 — Rhythm Engine

**文件**：`src/main/engine/rhythmEngine.ts`

决定本轮回复是碎碎念（多条短句）还是长篇（单条长句）。

```typescript
type RhythmMode = 'chatter' | 'monologue' | 'default'

interface RhythmDecision {
  mode: RhythmMode
  count: number           // 消息条数
  separator: string       // 分隔符 '[SPLIT]'
  maxCharsPerMsg: number  // 每条最大字符数
  instruction: string     // 注入 psycheBlock 的指令
}
```

**判决树**（优先级从高到低）：

```
1. intensity < 0.3 AND |aro| < 20
   → default (2条, 100字/条)

2. 连续同模式 ≥ 3 轮
   → 强制切换（防止重复）

3. timeOfDay === 'late_night' AND aro < 0
   → monologue (深夜偏向长篇)

4. 人格特征:
   - CHATTER 人格集 (genki, deredere, tsundere, mesugaki 等 16 种)
     + aro > 0, aff > 3 → chatter
   - MONOLOGUE 人格集 (kuudere, ice_queen, iceberg 等 8 种)
     → monologue

5. aro > 3 AND aff > 8 → chatter

6. aro < -10 OR sincerity > 0.7 → monologue

7. 以上都不匹配 → default
```

### 6.3 重逢系统 — Reunion

**文件**：`src/main/engine/reunion.ts`

用户离线后回归时，`computeReunionShock(gapHours)` 计算冲击等级：

| 等级 | 时长 | secDelta | aroDelta | domDelta | trustDelta | 阶段降级 |
|------|------|----------|----------|----------|-----------|---------|
| quick_return | <12h | +2 | +1 | 0 | 0 | 否 |
| short_absence | 12-48h | -5 | +3 | -2 | -2 | 否 |
| day_apart | 2-7d | -12 | +6 | -4 | -5 | 否 |
| week_apart | 7-30d | -20 | +8 | -6 | -10 | 否 |
| long_lost | 30-90d | -25 | +3 | -8 | -15 | 是 |
| stranger_again | ≥90d | -30 | +1 | -10 | -20 | 是 |

`applyReunionShock()` 将冲击应用到引擎状态：

```
sec = clamp(emotion.sec + secDelta, -100, 100)
aro = clamp(emotion.aro + aroDelta, -100, 100)
dom = clamp(emotion.dom + domDelta, -100, 100)
trust = clamp(relationship.trust + trustDelta, 0, 100)
stage: 如需降级则 INTIMATE→FAMILIAR, FAMILIAR→STRANGER
```

`buildReunionDiaryPrompt()` 根据人格预设生成重逢日记的 LLM prompt，包含：
- 人格标签化的重逢第一句话（29 种人格 × 6 种冲击等级的预置对话）
- 当前关系阶段、气氛、情绪基调
- 分离前的记忆摘要和离线思绪

### 6.4 镜像系统 — Mirror

**文件**：`src/main/engine/mirror.ts`

检测伴侣 self.md 更新时自我认知的矛盾：

```
extractAssertions(text):
  每行以"我""ta""我们"开头的句子
  → 估算情绪 valence (-1 ~ 1):
     pos: 喜欢/开心/重要/珍惜/温柔... 每词 +0.4
     neg: 讨厌/难过/不好/失败/没用... 每词 -0.5

detectContradictions(oldText, newText):
  1. 精确匹配新旧断言中相同 topic 的 valence 反转 (|差| ≥ 0.6)
  2. Embedding 兜底：语义相似 topic (>0.70) 的 valence 反转
```

---

## 7. 状态持久化

**文件**：`src/main/engine/state-persistence.ts`

`FullState` 的结构：

```typescript
interface FullState {
  version: string
  relationship: L1State
  emotion: EmotionState
  counters: { totalTurns, sharedEventsCount, consecutiveMeaningfulTurns, ... }
  lastActive: string
  externalAtmosphere: ExternalAtmosphere
  personalityBaseline: PersonalityBaseline
  personality: PersonalityPreset
  userProfile: UserProfile
  desireStack: DesireStack
  adultState: 'NORMAL' | 'ACTIVE' | 'NEGATIVE_LOCK'
  adultIntensityBudget: number
  emergencePersistence: { active: EmergenceState | null; history: EmergenceState[] }
  originExposure: OriginExposure
}
```

- 每轮对话后双写：SQLite（`companionState` 表）+ JSON（`companion/state.json`）
- 启动时首选从 SQLite 恢复，回退到 JSON（向下兼容）
- 扩展通过 `EngineSnapshot` 只读访问

---

## 8. 全部参数索引

所有数值参数集中在 `src/main/engine/ackemParams.ts`：

| 参数 | 默认值 | 所属 |
|------|--------|------|
| EMOTION_DECAY | 0.03 | L2 |
| SINGLE_TURN_CLAMP | 10 | L2 |
| EMOTION_CAP_DENOM | 120 | L2 |
| LOCK_AFF_HIGH / LOW | 70 / -50 | L2 |
| LOCK_SEC_LOW | -60 | L2 |
| NOISE_MAX | 0.5 | L2 |
| TRUST_PRAISE / APOLOGY / ... | 1.5 / 2.0 / ... | L1 |
| RIFT_HURTFUL_COOLDOWN | 2 | L1 |
| RIFT_REPAIR_POSITIVE_STREAK | 4 | L1 |
| MOMENTUM_ALPHA | 0.7 | L1 |
| ATMOSPHERE_WARM / COOL | 0.5 / -0.3 | L1 |
| STAGE_WEIGHT_STR / FAM / INT | 0.8 / 1.0 / 1.4 | L1 |
| SILENCE_THRESHOLD | 0.7 | L3 |
| SILENCE_SIGMOID_STEEPNESS | 12 | L3 |
| EMERGENCE_INTENSITY_THRESHOLD | 20 | Emergence |
| EMERGENCE_COOLDOWN_TURNS | 10 | Emergence |
| DESIRE_MAX_SLOTS | 5 | Desire |
| DESIRE_EXPRESS_THRESHOLD | 7 | Desire |
| REUNION_OFFLINE_MINUTES | 30 | Reunion |

---

## 9. 修改指南

| 你想… | 先看 |
|--------|------|
| 改信任值/阶段阈值 | `ackemParams.ts` 中 TRUST_* / STAGE_* 常量 |
| 改情绪递推算法 | `emotion.ts` 的 `emotionStep()` |
| 改基础冲击量表 | `emotion.ts` 的 `BASE_STIMULUS` |
| 改情绪标签映射 | `emotion.ts` 的 `mapEmotionLabel()` |
| 改沉默判定曲线 | `psyche.ts` 的 `calcSilence()` + 相关参数 |
| 改涌现判决 | `emotionalEmergence.ts` 的 `tryTimeReflection()` |
| 改人格预设文案 | `personalityPresets.ts` + `prompt/personality.ts` |
| 改欲望栈规则 | `desire.ts` 的 `updateDesireStack()` |
| 改重逢冲击曲线 | `reunion.ts` 的 `computeReunionShock()` |

**所有数值参数集中在 `ackemParams.ts`**，不要在模块内硬编码。

---

## 10. 相关文档

| 文档 | 内容 |
|------|------|
| [01-brain-system.md](./01-brain-system.md) | Event 来源与记忆检索 |
| [03-mouth-system.md](./03-mouth-system.md) | psycheBlock 如何注入 LLM |
| [00-overall-system.md](./00-overall-system.md) | 全对话链路 |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | 记忆与上下文策略 |

*心系统 · Ackem v1.0.0 · 2026-06*
