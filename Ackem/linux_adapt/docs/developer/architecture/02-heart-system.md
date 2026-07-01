# Heart System

> **Language:** English · [中文](./02-heart-system.zh.md)

> **Layers:** L1 relationship · L2 emotion · L3 expression state  
> **Codename:** Heart Engine  
> **Core question:** What is the relationship between companion and user right now? How does emotion change? How should it be expressed in a human-like way?  
> **Design principle:** All state is driven by FSM + recurrence equations — pure functions, zero LLM calls

---

## 1. Role

The Heart System receives `Event` from the **Brain System**, maintains the **relationship FSM** and **four-dimensional emotion model**, and generates the `psycheBlock` (psychological state text block) used by the Mouth System.

```
Event (from L0 Interpreter)
    │
    ▼
┌──────────────────────────────────────────────────┐
│  L1  relationship.ts                             │
│      Stage FSM · trust system · rift mechanism     │
│      · atmosphere model                          │
│      States: STRANGER → FAMILIAR → INTIMATE      │
│                                                  │
│  L2  emotion.ts                                  │
│      4D emotion: aff (affection) sec (security)  │
│                  aro (arousal) dom (dominance)   │
│      Recurrence: step() + noise + modulation     │
│                                                  │
│  L3  psyche.ts                                   │
│      psycheBlock assembly → psychological text   │
│      into prompt                                 │
│      Silence tendency · barrier awareness ·      │
│      expression intensity hints                    │
│                                                  │
│  Emotional Emergence                             │
│      Long-chat emergence · sense of time ·       │
│      afterglow · sustained vulnerability         │
│                                                  │
│  Auxiliary modules                               │
│      Desire stack · rhythm engine · reunion ·    │
│      mirror · user profile                       │
└──────────────────────────────────────────────────┘
    │
    ▼
psycheBlock + ExpressionHint → Mouth System (prompt injection)
```

---

## 2. L1 Relationship Layer

**File:** `src/main/engine/relationship.ts`  
**Core data types:**

```typescript
interface L1State {
  stage: 'STRANGER' | 'FAMILIAR' | 'INTIMATE'
  trust: number                    // 0–100
  rifts: number                    // rift count
  affection_momentum: number       // affection momentum [-1, 1]
  atmosphere: 'warm' | 'neutral' | 'cool'
  consecutivePositiveTurns: number // consecutive positive turn count
  turnsSinceLastRift: number       // turns since last rift
  sharedEventsCount: number        // shared event count
}
```

### 2.1 Stage FSM

Relationship is a **three-level finite state machine** that can advance forward or downgrade from harm:

```
                    ┌──────────┐
                    │ STRANGER │  (initial state)
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

Downgrade conditions:
  INTIMATE → FAMILIAR: rifts ≥ 5  OR trust < 30
  FAMILIAR → STRANGER: rifts ≥ 8  OR trust < 15
```

**Evolution function** `evolveStage()`:

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

### 2.2 Trust System

Trust is a continuous **0–100** value; each turn computes delta via `trustDelta(event)`:

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

Trust updates accumulate per turn and clamp:

```
trust = clamp(prev.trust + trustDelta(event), 0, 100)
```

**Ice-break correction** (`applyIceBreak`): When trust ≤ 15 and the user sends a high-sincerity (≥0.7) apology, grant an extra +3.0 trust and force atmosphere reset to `neutral`.

### 2.3 Rift Mechanism

Rifts are a **cumulative counter of hurtful events**:

```
Trigger: event.type === 'hurtful' AND turnsSinceLastRift >= RIFT_HURTFUL_COOLDOWN (2)
  → rifts += 1, turnsSinceLastRift = 0

Repair: event.type === 'apology' AND rifts > 0
        AND consecutivePositiveTurns >= RIFT_REPAIR_POSITIVE_STREAK (4)
  → rifts -= 1 (minimum 0)
```

Consecutive positive turn tracking:
```
if event.type ∈ {praise, tease, vulnerable, apology}
  → consecutivePositiveTurns += 1
if event.type ∈ {cold, hurtful}
  → consecutivePositiveTurns = 0
```

### 2.4 Affection Momentum and Atmosphere

Each turn, `signForMomentum()` determines event polarity:

```typescript
function signForMomentum(event: Event): number {
  if (POSITIVE_TYPES.has(event.type)) return 1   // praise/tease/vulnerable/apology
  if (NEGATIVE_TYPES.has(event.type)) return -1  // cold/hurtful
  return 0
}
```

**Affection momentum** updates via exponential moving average (EMA):

```
affection_momentum = MOMENTUM_ALPHA (0.7) × prev.momentum
                   + (1 - 0.7) × event.intensity × sign
```

Atmosphere label is determined jointly by momentum and ice-break correction:

```
if ice-break forced → atmosphere = 'neutral'
else if momentum > ATMOSPHERE_WARM_THRESHOLD (0.5) → 'warm'
else if momentum < ATMOSPHERE_COOL_THRESHOLD (-0.3) → 'cool'
else → 'neutral'
```

### 2.5 External Atmosphere

**File:** `updateExternalAtmosphere()` in `relationship.ts`

An EMA layer independent of internal atmosphere, with higher α (0.95) and slower response, for sensing long-term trends:

```
level = clamp(0.95 × prev.level + 0.05 × intensity × sign, -1, 1)
label = level > 0.4 → 'warm' | level < -0.2 → 'cool' | else → 'neutral'
```

### 2.6 Modulation Coefficients

`computeModulation()` provides three modulation factors for the L2 emotion layer:

```
trustMod  = TRUST_MOD_MIN (0.5) + (trust / 100) × (TRUST_MOD_MAX (1.5) - 0.5)
           0.5 at trust=0, 1.5 at trust=100

riftMod  = max(RIFT_MOD_MIN (0.3), 1 - rifts × RIFT_MOD_DECAY_PER_RIFT (0.15))
           more rifts → lower ceiling on positive emotion

stageWeight:
  STRANGER → STAGE_WEIGHT_STRANGER (0.8)
  FAMILIAR → STAGE_WEIGHT_FAMILIAR (1.0)
  INTIMATE → STAGE_WEIGHT_INTIMATE  (1.4)
```

---

## 3. L2 Emotion Layer

**File:** `src/main/engine/emotion.ts`

### 3.1 Four-Dimensional Emotion Model

```typescript
interface Emotion4D {
  aff: number   // Affection  [-100, 100], initial 5
  sec: number   // Security   [-100, 100], initial 10
  aro: number   // Arousal    [-100, 100], initial 0
  dom: number   // Dominance  [-100, 100], initial -5
}

interface EmotionState extends Emotion4D {
  primaryLabel: string   // emotion label (e.g. 'SWEET_ATTACHMENT')
  isLocked: boolean      // whether in high/low lock zone
}
```

### 3.2 BASE_STIMULUS — Event Base Impact Table

Each event type defines base impact on all four dimensions (`BASE_STIMULUS`):

| Event type | aff | sec | aro | dom |
|------------|-----|-----|-----|-----|
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

### 3.3 Recurrence Equation — `emotionStep()`

Runs once per conversation turn, in 10 steps:

**Step 1: Raw impact**

```
deltaRaw.aff = S.aff × trustMod × stageWeight × event.intensity × event.sincerity
deltaRaw.sec = S.sec × trustMod × event.intensity × event.sincerity
deltaRaw.aro = S.aro × stageWeight × event.intensity
deltaRaw.dom = S.dom × stageWeight × event.intensity
```

**Step 2: Capacity scaling (Cap Scale)**

```
capScale(absVal) = max(0.1, 1 - |current value| / EMOTION_CAP_DENOM (120))

deltaCap = deltaRaw × capScale(current value)
```

Higher absolute dimension values reduce marginal gain from same-direction impacts, preventing overflow.

**Step 3: Single-turn clamp**

```
deltaClamped = clamp(deltaCap, -SINGLE_TURN_CLAMP (10), +10)
```

**Step 4: Rift attenuation on positive emotion**

```
if deltaClamped.aff > 0: delta.aff ×= riftMod
if deltaClamped.sec > 0: delta.sec ×= riftMod
```

**Step 5: Lock zone correction**

```
current > LOCK_AFF_HIGH (70)  and delta.aff < 0 → delta.aff ×= LOCK_AFF_HIGH_REDUCE_NEG (0.6)
current < LOCK_AFF_LOW (-50)  and delta.aff > 0 → delta.aff ×= LOCK_AFF_LOW_REDUCE_POS (0.5)
current < LOCK_SEC_LOW (-60)  and delta.sec > 0 → delta.sec ×= LOCK_SEC_LOW_REDUCE_POS (0.5)
```

High-affection zone suppresses negative emotion; low-affection and very-low-security zones suppress positive emotion.

**Step 6: Atmosphere drift**

```
atmosphere 'warm': aff ×= 1.15, sec ×= 1.1
atmosphere 'cool': aff ×= 0.7,  sec ×= 0.8
```

**Step 7: D/s emotional reversal (adult content)**

When event is marked `isAdultContent` and personality sensitivity ≤ 15 or carries `provoke-submit` tag, call `applyDsReversal()`:

```
User sends dominant content (adultSubtype='dominant'):
  sec = |delta.sec| × 0.6    // being dominated = security
  dom = -|delta.dom| × 0.8   // dominance decreases
  aff = delta.aff × 0.8      // mild affection increase

Mesugaki (provoke-submit) extra:
  aro ×= 1.3                 // excitement when punished
  sec = |delta.sec| × 1.0    // being disciplined = safer
  aff ×= 0.5                 // tsundere — affection rises slowly

User sends submissive content (adultSubtype='submissive'):
  dom = |delta.dom| × 0.7    // control confirmed
  aff ×= 1.2                 // affection increase
  sec = |delta.sec| × 0.5

Explicit/romantic content:
  aff ×= 1.15
  sec = |delta.sec| × 0.7
```

**Step 8: Decay and accumulation**

```typescript
decay = EMOTION_DECAY (0.03) × decayMultiplier

next.aff = prev.aff × (1 - decay) + delta.aff
next.sec = prev.sec × (1 - decay) + delta.sec
next.aro = prev.aro × (1 - decay) + delta.aro
next.dom = prev.dom × (1 - decay) + delta.dom
```

3% regression toward baseline each turn.

**Step 9: Deterministic noise**

Noise is added only in extreme zones where `|current value| > NOISE_THRESHOLD_ABS (80)`, avoiding mechanical behavior at critical states:

```
noise = (unitNoise01(sessionId, turnIndex, salt) - 0.5) × 2 × NOISE_MAX (0.5)
```

FNV-1a hash produces deterministic pseudo-random — same session, same turn, same dimension yields consistent output.

**Step 10: Clamp**

```
clamp(next, -100, 100)
```

### 3.4 Emotion Label Mapping — `mapEmotionLabel()`

Maps four-dimensional values to readable emotion labels; evaluation order is most specific to most general, non-overlapping:

```
ANGRY_ATTACK:      aff < -18, sec < -25, aro > 40, dom > 30
FEARFUL_OBEDIENT:  aff ∈ [8, 55], sec < -55, aro > 45, dom < -45
TSUNDERE:          aff ∈ [15, 75], sec ∈ [-10, 45], aro ∈ [15, 75], dom > 18
HURT_GRIEVANCE:    aff ∈ [15, 55], sec ∈ [-55, -12], aro ∈ [15, 55], dom < -18
SWEET_ATTACHMENT:  aff > 25, sec > 10, aro ∈ (20, 70], dom ∈ [-25, 25]
QUIET_FOND:        aff > 20, aro < 25, dom ∈ [-25, 25]
SHY_HEARTBEAT:     aff ∈ (15, 65], sec ∈ [-25, 35], aro ∈ [15, 75], dom < 0
COLD_DETACHED:     aff < -3, sec ∈ [-35, 25], aro < -3, dom ∈ [-5, 35]
CALM_RATIONAL:     none of the above match
```

### 3.5 Memory Echo Overlay — `applyMemoryEcho()`

When memory retrieval hits high-emotion events, overlay onto current emotion:

```
emotion ⊕ echo = clamp(emotion + echo, -100, 100)
```

`MemoryEcho` is computed from retrieved `MemoryFact.emotionalContext`: aff weighted by original event valence, sec from positive/negative components, aro mapped from emotional intensity, dom from trust/atmosphere.

---

## 4. L3 Expression Layer — psycheBlock

**File:** `src/main/engine/psyche.ts`

### 4.1 Emotion to Expression Parameters — `emoToExpression()`

Maps emotion labels to `ExpressionParams`:

```typescript
interface ExpressionParams {
  mode: 'NORMAL' | 'SILENT_CANDIDATE'    // silence tendency
  proximity: 'CLOSE' | 'NEUTRAL' | 'COOL' | 'DEFENSIVE'
  tone: string                            // tone hint
  length: 'SHORT' | 'MEDIUM' | 'LONG'    // length suggestion
}
```

| Emotion label | proximity | tone | length |
|---------------|-----------|------|--------|
| SWEET_ATTACHMENT | CLOSE | warm_intimate | MEDIUM |
| SHY_HEARTBEAT | CLOSE | shy_hesitant | SHORT |
| TSUNDERE | NEUTRAL | tsundere | SHORT |
| HURT_GRIEVANCE | COOL | plaintive | MEDIUM |
| ANGRY_ATTACK | DEFENSIVE | sharp | SHORT |
| COLD_DETACHED | DEFENSIVE | flat | SHORT |
| FEARFUL_OBEDIENT | DEFENSIVE | trembling | SHORT |
| QUIET_FOND | CLOSE | gentle_quiet | SHORT |
| CALM_RATIONAL | NEUTRAL | calm | SHORT |

### 4.2 Silence Detection — `calcSilence()`

Computes silence probability using a sigmoid function:

```
aroExcess    = max(0, |aro| - ARO_EXCESS_BASELINE (50))
baseScore    = intensity × 0.3 + rifts × 0.2 + aroExcess × 0.02

stageModifier:
  STRANGER → 1.3    // strangers more likely to go silent
  FAMILIAR → 1.0
  INTIMATE → 0.7    // intimate relationships less likely to go silent

adultModifier = adultMode ? 0.5 : 1.0  // adult mode halves silence probability

weightedScore = baseScore × stageModifier × adultModifier

probability = sigmoid(12 × (weightedScore - SILENCE_THRESHOLD (0.7)))
            = 1 / (1 + exp(-12 × (weightedScore - 0.7)))

silent = unitNoise01(sessionId, turnIndex, `silence_${eventType}`) < probability
```

### 4.3 Barrier Awareness — `computeBarrierAwareness()`

Computes the user's guard/distance toward the companion; outputs a 0–1 `level` and natural-language `hint`:

```
level = (aff / 100) × 0.30
      + (trust / 100) × 0.15
      + stageFactor × 0.30          // INTIMATE=1.0, FAMILIAR=0.4, STRANGER=0
      + min(sharedEventsCount / 12, 1) × 0.25

clamp(level, 0, 1)
```

Hints are split into 5 tiers (<0.2 / <0.4 / <0.6 / <0.8 / ≥0.8); each tier produces differentiated expression based on personality tags (tsundere, kuudere, gentle).

### 4.4 psycheBlock Assembly — `buildPsycheBlock()`

Compiles L1/L2/L3 state into a natural-language block injected into the system prompt:

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

## 5. Emotional Emergence

**File:** `src/main/engine/emotionalEmergence.ts`

### 5.1 Design Principles

Ordinary emotion models are **Markovian** (each turn depends only on the previous turn), but long conversations produce high-dimensional expression states beyond single-turn recurrence. The emergence module detects these patterns without writing back to L2 or calling an LLM.

### 5.2 Event Tracking (Module-Level State)

```typescript
let recentEventTypes: string[] = []           // recent 10-turn event type window
let consecutiveMeaningfulCount = 0            // consecutive meaningful turns
let consecutiveVulnerableCount = 0            // consecutive vulnerable confiding

// Meaningful events = 'vulnerable' | 'praise' | 'apology'
// Vulnerability interrupt = 'hurtful' | 'cold' | 'extreme_redline'
```

### 5.3 Main Verdict — `evaluateEmergence()`

Shield checks (in order):
1. **Stranger shield:** `stage === 'STRANGER'` → no emergence
2. **Anger shield:** `primaryLabel === 'ANGRY_ATTACK'` → no emergence
3. **Inter-type cooldown:** fewer than `EMERGENCE_COOLDOWN_TURNS (10)` turns since last emergence → skip (responsive path can bypass)
4. **Emotional intensity threshold:**

```
emotionalIntensity = aff × 0.6 + sec × 0.2 + |aro| × 0.2

depthBonus:
  consecutiveVulnerableTurns ≥ 3  → +4
  consecutiveMeaningfulTurns ≥ 3  → +2
  countMeaningfulInRecent ≥ 4     → +2

if emotionalIntensity + depthBonus < EMERGENCE_INTENSITY_THRESHOLD (20) → no emergence
```

After passing shields, attempt `tryTimeReflection()`.

### 5.4 Time Reflection — `tryTimeReflection()`

`daysSinceMet ≥ 7` is the minimum threshold for time reflection. Multiple scenarios compete; first match wins:

| Scenario | Condition | flavor | Intensity calculation |
|----------|-----------|--------|----------------------|
| Quiet fondness at late night | time=late_night, label=QUIET_FOND, deep chat ≥5 turns | quiet_awe | (aff+100)/200 + 0.2 |
| Sweet nostalgia | label=SWEET_ATTACHMENT, days>90, atmo=warm | nostalgic | (aff+100)/200 + trust/200 |
| Bittersweet grievance | label=HURT_GRIEVANCE, stage=INTIMATE, avg aff last 5 turns >50 | bittersweet | \|aff\|/100 |
| Grateful recovery | stage=INTIMATE, aff last 5 turns rose from <20 to >50 | grateful | 0.7 |
| Tsundere wonder | label=TSUNDERE, stage=INTIMATE, days>180 | wonder | 0.55 |
| Tender hold | vulnerable≥3 turns, aff>8, multiple labels | tender_hold | (aff+\|aro\|)/120 + vuln/10 |
| Warm familiarity | QUIET_FOND/SWEET_ATTACHMENT, days>14, deep chat≥3 turns | warm_familiarity | (aff+100)/250 + days/500 |

**Dual-lock cooldown:** Same emergence type requires `turnsSince ≥ 50` **or** `hoursSince ≥ 72` before re-trigger (responsive path reduces turn lock to 1).

### 5.5 Responsive Emergence — `tryResponsiveEmergence()`

Lowers threshold when user is vulnerable or in deep chat (exempts inter-type 10-turn cooldown):

```
threshold = EMERGENCE_INTENSITY_THRESHOLD (20) - 6 = 14

// Shares same-type turn cooldown with main verdict (RESPONSIVE_EMERGENCE_COOLDOWN_TURNS = 1)
```

### 5.6 Phase Advancement — `advanceEmergencePhase()`

Emergence state lifecycle:

```
rising (≤3 turns) → sustained (3-10 turns) → fading (≤5 turns) → dissolved
                                            ↘ broken (interrupted)
```

`applyUserResponseToEmergence()` handles user feedback:
- `hurtful/cold` → phase = `broken`, intensity = 0
- Emotional chain continues (vulnerable/apology/praise) → refresh sustained
- Shallow praise → accelerate fade
- Neutral event → slight sustained timer refresh

`checkEmergenceInterrupt()` detects context switch:
- `hurtful/cold/extreme_redline` → `break`
- `question/casual_chat` after consecutive emotional turns → `fade`

### 5.7 Fuzzy Felt Duration

`humanizeFeltDuration()` converts days to natural-language labels:

```
days < 30   → 'feltDuration.short'
days < 90   → 'feltDuration.medium'
days < 180  → 'feltDuration.half'
days < 365  → 'feltDuration.long'
days ≥ 365  → 'feltDuration.veryLong'
```

Specific copy is provided by the i18n system based on language.

---

## 6. Auxiliary Modules

### 6.1 Desire Stack

**File:** `src/main/engine/desire.ts`

5-slot system simulating the companion's inner motivations:

**Desire generation probability** (once per event per turn):

```
newDesire chance = trigger.chance × stageBonus × intensityBonus
stageBonus:    INTIMATE=1.5, FAMILIAR=1.2, STRANGER=1.0
intensityBonus: 0.5 + event.intensity × 0.5
```

| Event type | Base probability | Possible desire categories |
|------------|------------------|---------------------------|
| vulnerable | 0.20 | concern, share |
| question | 0.12 | curiosity, suggest |
| praise | 0.10 | share, tease |
| tease | 0.15 | tease, curiosity |
| casual_chat | 0.06 | curiosity, share, suggest |
| apology | 0.08 | concern |
| cold | 0.12 | concern, curiosity |
| hurtful | 0.03 | concern |

**Desire update flow:**

```
updateDesireStack():
  1. Decay existing desire urgency (subtract DESIRE_DECAY_PER_TURN (0.3))
  2. Settle: urgency ≤ 0 OR idle ≥ 8 turns OR expressed > 2 turns → settled
  3. Possibly generate new desire → write to empty slot / evict lowest urgency slot
  4. urgency ≥ DESIRE_EXPRESS_THRESHOLD (7) → mark expressed
  5. Return hints array for psycheBlock injection
```

**Desire–knowledge matching:** `desireTopicMatchesKnowledge()` uses substring matching + embedding cosine similarity (threshold 0.70) to judge whether a desire topic relates to the current knowledge organization topic; related desires auto-settle.

### 6.2 Rhythm Engine

**File:** `src/main/engine/rhythmEngine.ts`

Decides whether this turn's reply is chatter (multiple short messages) or monologue (single long message).

```typescript
type RhythmMode = 'chatter' | 'monologue' | 'default'

interface RhythmDecision {
  mode: RhythmMode
  count: number           // message count
  separator: string       // separator '[SPLIT]'
  maxCharsPerMsg: number  // max chars per message
  instruction: string     // instruction injected into psycheBlock
}
```

**Decision tree** (priority high to low):

```
1. intensity < 0.3 AND |aro| < 20
   → default (2 messages, 100 chars each)

2. Same mode ≥ 3 consecutive turns
   → force switch (prevent repetition)

3. timeOfDay === 'late_night' AND aro < 0
   → monologue (late night favors long form)

4. Personality traits:
   - CHATTER personality set (genki, deredere, tsundere, mesugaki, etc. — 16 types)
     + aro > 0, aff > 3 → chatter
   - MONOLOGUE personality set (kuudere, ice_queen, iceberg, etc. — 8 types)
     → monologue

5. aro > 3 AND aff > 8 → chatter

6. aro < -10 OR sincerity > 0.7 → monologue

7. None of the above → default
```

### 6.3 Reunion System

**File:** `src/main/engine/reunion.ts`

When the user returns after being offline, `computeReunionShock(gapHours)` computes shock level:

| Level | Duration | secDelta | aroDelta | domDelta | trustDelta | Stage downgrade |
|-------|----------|----------|----------|----------|------------|-----------------|
| quick_return | <12h | +2 | +1 | 0 | 0 | No |
| short_absence | 12-48h | -5 | +3 | -2 | -2 | No |
| day_apart | 2-7d | -12 | +6 | -4 | -5 | No |
| week_apart | 7-30d | -20 | +8 | -6 | -10 | No |
| long_lost | 30-90d | -25 | +3 | -8 | -15 | Yes |
| stranger_again | ≥90d | -30 | +1 | -10 | -20 | Yes |

`applyReunionShock()` applies shock to engine state:

```
sec = clamp(emotion.sec + secDelta, -100, 100)
aro = clamp(emotion.aro + aroDelta, -100, 100)
dom = clamp(emotion.dom + domDelta, -100, 100)
trust = clamp(relationship.trust + trustDelta, 0, 100)
stage: downgrade if needed INTIMATE→FAMILIAR, FAMILIAR→STRANGER
```

`buildReunionDiaryPrompt()` generates reunion diary LLM prompt from personality presets, including:
- Personality-tagged reunion opening lines (29 personalities × 6 shock levels of preset dialogue)
- Current relationship stage, atmosphere, emotional tone
- Pre-separation memory summary and offline thoughts

### 6.4 Mirror System

**File:** `src/main/engine/mirror.ts`

Detects self-perception contradictions when companion self.md is updated:

```
extractAssertions(text):
  Sentences starting with "我", "ta", "我们" per line
  → Estimate emotional valence (-1 ~ 1):
     pos: 喜欢/开心/重要/珍惜/温柔... +0.4 per word
     neg: 讨厌/难过/不好/失败/没用... -0.5 per word

detectContradictions(oldText, newText):
  1. Exact match: same topic in old/new assertions with valence reversal (|diff| ≥ 0.6)
  2. Embedding fallback: semantically similar topics (>0.70) with valence reversal
```

---

## 7. State Persistence

**File:** `src/main/engine/state-persistence.ts`

`FullState` structure:

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

- Dual-write after each turn: SQLite (`companionState` table) + JSON (`companion/state.json`)
- On startup, prefer SQLite restore, fall back to JSON (backward compatible)
- Extensions access read-only via `EngineSnapshot`

---

## 8. Full Parameter Index

All numeric parameters are centralized in `src/main/engine/ackemParams.ts`:

| Parameter | Default | Layer |
|-----------|---------|-------|
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

## 9. Modification Guide

| If you want to… | Start with |
|-----------------|------------|
| Change trust values / stage thresholds | `ackemParams.ts` TRUST_* / STAGE_* constants |
| Change emotion recurrence algorithm | `emotion.ts` → `emotionStep()` |
| Change base impact table | `emotion.ts` → `BASE_STIMULUS` |
| Change emotion label mapping | `emotion.ts` → `mapEmotionLabel()` |
| Change silence decision curve | `psyche.ts` → `calcSilence()` + related params |
| Change emergence verdict | `emotionalEmergence.ts` → `tryTimeReflection()` |
| Change personality preset copy | `personalityPresets.ts` + `prompt/personality.ts` |
| Change desire stack rules | `desire.ts` → `updateDesireStack()` |
| Change reunion shock curve | `reunion.ts` → `computeReunionShock()` |

**All numeric parameters are centralized in `ackemParams.ts`** — do not hardcode in modules.

---

## 10. Related Documentation

| Document | Content |
|----------|---------|
| [01-brain-system.md](./01-brain-system.md) | Event source and memory retrieval |
| [03-mouth-system.md](./03-mouth-system.md) | How psycheBlock is injected into LLM |
| [00-overall-system.md](./00-overall-system.md) | Full conversation pipeline |
| [ai-context-and-retrieval-policy.md](../../ai-context-and-retrieval-policy.md) | Memory and context policy |

*Heart System · Ackem v1.0.0 · 2026-06*
