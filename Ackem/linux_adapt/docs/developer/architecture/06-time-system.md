# Time System

> **Language:** English · [中文](./06-time-system.zh.md)

> **Layers:** L1 time-of-day awareness · L2 emotion modulation · L4 temporal anchor retrieval  
> **Codename:** Time Engine  
> **Core question:** How does Ackem perceive the passage of time? How do temporal signals make memory and emotion feel more real?

---

## 1. Positioning

The time system is not a standalone module. It is a **temporal awareness layer** spanning engine orchestration, memory retrieval, emotion modulation, and proactive strategy. It gives Ackem the ability to:

- **Know what time it is** — time-of-day, weekday, season, holiday recognition
- **Know how long you've known each other** — time-depth calculation (natural-language expression from first meeting to now)
- **Remember special days** — birthdays, anniversaries, milestones auto-anchored
- **Let time affect emotion** — weekday curves, holiday joy, late-night vulnerability
- **Let time affect retrieval** — same-time-of-day memory priority, same-season resonance, reunion highlights after long absence
- **Temporal reflection** — emotional reflections on time at specific moments ("Has it really been this long?")
- **Reunion impact** — relationship and emotion dynamics after long offline periods

```
                   ┌─────────────────────────────────────────────┐
                   │              User message                      │
                   └──────────────────┬──────────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │               prepareTurnContext               │
              │   Precompute temporalCtx + user message time     │
              │   signal detection                               │
              └───────────────────────┬───────────────────────┘
                                      │
              ┌───────────────────────┴───────────────────────┐
              │              orchestrator.ts                   │
              │                                               │
              │  ┌───────────────────────────────────────┐    │
              │  │ ① Temporal context construction        │    │
              │  │    timeOfDay / season / gapHours / ... │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ② Memory retrieval temporal modulation │    │
              │  │    retriever: computeTemporalBoost ×6  │    │
              │  │               temporalAnchorHits       │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ③ Emotion temporal modulation          │    │
              │  │    weekday curve / holiday override /  │    │
              │  │    reunion impact                      │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ④ Special date detection + temporal    │    │
              │  │    reflection emergence                │    │
              │  │    5-source aggregation → TemporalHint │    │
              │  │    tryTimeReflection × 8 scenarios     │    │
              │  └────────────────┬──────────────────────┘    │
              │                   │                           │
              │  ┌────────────────┴──────────────────────┐    │
              │  │ ⑤ Psyche block injection               │    │
              │  │    system clock / temporal reflection /│    │
              │  │    special day / reunion               │    │
              │  └───────────────────────────────────────┘    │
              └───────────────────────────────────────────────┘
```

---

## 2. Core Modules — temporalAwareness/ Package

Six files live under `src/main/engine/temporalAwareness/`, highly cohesive with zero external dependencies (except i18n):

| File | Responsibility | Latency |
|------|----------------|---------|
| `holidayDetector.ts` | Three-strategy holiday detection | <0.2ms |
| `timeDepthCalculator.ts` | Relationship duration → natural language | <0.1ms |
| `specialDateDetector.ts` | 5-source special date aggregation | <1ms |
| `temporalMemoryBridge.ts` | Date → associated memories (3-tier recall) | <1ms |
| `temporalProactiveTrigger.ts` | Orchestrator produces TemporalHint | <1ms |
| `fastSpecialDateCheck.ts` | Emotion bias fast path | <0.5ms |

### 2.1 holidayDetector.ts — Holiday Detection

Pure function, zero I/O. Three non-overlapping strategies:

**Strategy 1 — Fixed Gregorian holidays** (MM-DD direct mapping):

```
'01-01': New Year's Day     '02-14': Valentine's Day    '03-08': Women's Day
'04-01': April Fools' Day    '05-01': Labor Day          '05-20': 520
'05-21': 521                 '06-01': Children's Day     '10-01': National Day
'11-11': Singles' Day        '12-24': Christmas Eve      '12-25': Christmas
'12-31': New Year's Eve
```

**Strategy 2 — Lunar holidays precomputed (2026–2030)**:

Five holidays per year precomputed to Gregorian dates:
```
2026: 02-17 Spring Festival  02-22 Lantern Festival  05-31 Dragon Boat  08-19 Qixi  10-04 Mid-Autumn
2027: 02-06 Spring Festival  02-11 Lantern Festival  05-20 Dragon Boat  08-08 Qixi  09-23 Mid-Autumn
2028: 01-26 Spring Festival  01-31 Lantern Festival  05-08 Dragon Boat  07-28 Qixi  09-11 Mid-Autumn
2029: 02-13 Spring Festival  02-18 Lantern Festival  05-28 Dragon Boat  08-17 Qixi  10-01 Mid-Autumn
2030: 02-03 Spring Festival  02-08 Lantern Festival  05-17 Dragon Boat  08-06 Qixi  09-19 Mid-Autumn
```

**Strategy 3 — Floating Gregorian holidays**:

Computed via `nthSundayOfMonth(year, month, n)` algorithm:
```
Mother's Day: 2nd Sunday of May → 1 + 7*(2-1) + ((7 - dayOfWeek) % 7)
Father's Day: 3rd Sunday of June
```

**Classification** `categorizeHoliday()` produces four types:

| Type | Examples | Emotion weight |
|------|----------|----------------|
| `traditional` | New Year's Day, National Day, Spring Festival, Lantern Festival, Dragon Boat, Mid-Autumn | 0.9 |
| `western` | Valentine's Day, Christmas, Christmas Eve, New Year's Eve | 0.7 |
| `social` | 520, 521, Singles' Day | 0.7 |
| `family` | Mother's Day, Father's Day, Children's Day, Women's Day | 0.7 |

### 2.2 timeDepthCalculator.ts — Time Depth Calculation

**Core function**: `computeTimeDepth(firstMetDate, today) → TimeDepthResult`

**Algorithm**: Uses `parseLocalDate()` to manually parse ISO strings and avoid UTC off-by-one errors; takes local midnight timestamps:

```
daysSince = Math.floor((todayMs - firstMs) / 86400000)
diffYears = daysSince / 365.2425
yearsSince = Math.floor(diffYears)
nearestYear = Math.round(diffYears)
isMilestone = nearestYear ∈ {1,2,3,5,10} AND nearestYear >= 1
daysSinceLastAnniversary = daysSince - yearsSince * 365.2425
```

**Time bands** (11 intervals, from "just met" to "all these years together"):

| Condition | i18n Key | Emotion weight |
|-----------|----------|----------------|
| Exact anniversary ±15 days + nearestYear>=1 | `exactYear`/`exactYears` | `min(0.95, 0.8 + nearestYear×0.05)` |
| daysSince < 30 | `justMet` | 0.3 |
| daysSince < 90 | `overMonth` | 0.4 |
| daysSince < 180 | `halfYear` | 0.5 |
| daysSince < 365 | `overHalfYear` | 0.6 |
| Just past anniversary (lastAnniv≤90 days) | `justOverYear`/`justOverYears` | `min(0.95, 0.75 + years×0.03)` |
| Approaching anniversary (lastAnniv>275 days) | `almostNextYear` | `min(0.95, 0.78 + years×0.04)` |
| Middle ground | `overYear`/`overYears` | `min(0.9, 0.7 + years×0.04)` |

**`isAnniversaryWindowActive()`** — shared fast-path function that checks whether the current date falls within the ±15-day anniversary window. Used by both `detectSpecialDates` and `detectFastSpecialDateType`.

### 2.3 specialDateDetector.ts — 5-Source Aggregation

Input: `today`, `firstMetDate`, `ackemBirthday`, `birthdays[]`, `temporalAnchors[]`

**5 data sources**:

| Source | Data origin | Detection method | Emotion intensity |
|--------|-------------|------------------|-------------------|
| 0 | Canon `ackemCanon.birthDate = 2026-06-20` | MMDD match | `min(1.0, 0.7 + years×0.05)` |
| 1 | FirstMet first-meeting date | `isAnniversaryWindowActive` ±15 days | `min(0.95, 0.6 + years×0.1)` |
| 2 | FactStore `ageMeta.birthdayMMDD` | MMDD match + subject dedup | 1.0 |
| 3 | `temporal_anchors` table | MMDD match (excluding fuzzy) | DB value |
| 4 | holidayDetector holidays | detectHoliday() | traditional 0.9 / other 0.7 |

**Sort priority**: by type first (ackem_birthday/first_met/relationship=0, birthday=1, milestone=2, holiday=3, recurring=4), then by emotion intensity descending within the same type.

### 2.4 temporalMemoryBridge.ts — Three-Tier Recall

| Tier | Applicable types | Returns |
|------|------------------|---------|
| L1 high | ackem_birthday, first_met, birthday, relationship | top 5 seedFacts + full narrative |
| L2 medium | holiday, recurring_memory | all seedFacts + narrative |
| L3 low | milestone | all seedFacts + narrative |

**`buildTemporalSeedTierBBlock(signal, factStore) → string`**:

When `temporalHint.priority !== 'low'`, queries `factStore.getById(id)` for active facts and formats them as `【Today-related memories】\n· {subject}: {summary}` injected into tierBBlock.

### 2.5 temporalProactiveTrigger.ts — Signal Production

**`produceTemporalSignal(specialDates) → TemporalProactiveSignal`**

Sort priority (HINT_SORT_ORDER):
```
ackem_birthday:0 → first_met:1 → relationship:2 → birthday:3 → milestone:4 → holiday:5 → recurring:6
```

**Priority mapping**: `ackem_birthday/first_met/birthday/relationship → 'high'`, `milestone → 'normal'`, others → `'low'`

**Expiry policy**: `ackem_birthday/birthday: 30 days`, `first_met/milestone/relationship: 60 days`, `holiday: 7 days`, `recurring: 14 days`

The merged `TemporalHint` includes: date label, narrative text, priority, expiry time.

### 2.6 fastSpecialDateCheck.ts — Emotion Bias Fast Path

Lightweight path dedicated to orchestrator mood bias; does not query the `temporal_anchors` database.

Checks only: Ackem birthday MMDD → `isAnniversaryWindowActive` → FactStore birthdayMMDD scan → holiday detection → returns `FastSpecialDateType | null`

Holiday subtypes: `holiday_spring` (Spring Festival), `holiday_valentine` (Valentine's Day/Qixi/520/521), `holiday` (generic).

---

## 3. Temporal Context Modulator

**File**: `src/main/memory/temporalContextModulator.ts`

### 3.1 TemporalContext Type

```typescript
TemporalContext {
  timeOfDay: 'morning' | 'forenoon' | 'afternoon' | 'evening' | 'night' | 'late_night'
  isWeekend: boolean
  month: number           // 1-12
  season: 'winter' | 'spring' | 'summer' | 'autumn'
  hour: number            // 0-23
  weekday: number         // 0(Sun)-6(Sat)
  gapHours: number        // hours since last chat
  localDate: string       // "2026-06-28"
}
```

Season is mapped by `monthToSeason()`: Dec–Feb winter, Mar–May spring, Jun–Aug summer, Sep–Nov autumn.

### 3.2 computeTemporalBoost — Six-Dimensional Retrieval Weighting

For each memory fact to be ranked, computes a temporal awareness weight coefficient:

| Factor | Condition | Multiplier |
|--------|-----------|------------|
| **T1 Circadian rhythm** | Fact hour within ±2 of current hour | morning 1.2 / forenoon 1.1 / afternoon 1.0 / evening 1.2 / night 1.3 / late_night 1.4 |
| **T2 Weekday match** | Weekend-to-weekend or weekday-to-weekday | weekend 1.2 / weekday 1.1 |
| **T3 Season resonance** | Same season | 1.2, else 0.9 |
| **T4 Late-night weight** | late_night + 1–5 AM | 1.4; VULNERABILITIES/MOOD extra ×1.3 |
| **T5 Reunion awareness** | gapHours>72 + OUR_BOND/VULNERABILITIES | 1.5 |
| **T6 Recency awareness** | daysSinceCreation <1/3/7 days | 1.5/1.3/1.1 |

All factors **multiply cumulatively** (not averaged), starting at 1.0; in extreme cases can reach 1.0 × 1.2 × 1.2 × 1.4 × 1.5 × 1.5 ≈ **4.5×**.

### 3.3 Weekday Emotion Curve

Simulates a human weekly emotional cycle. Produces `{ affDelta, secDelta }` in range -0.06 ~ +0.06, added directly to L2 emotion aff and sec:

| Weekday | Time slot | affDelta | secDelta |
|---------|-----------|----------|----------|
| Friday | ≥18h | +0.06 | +0.02 |
| Friday | 14-18h | +0.04 | 0 |
| Friday | 10-14h | +0.02 | 0 |
| Saturday | all day | +0.03 | 0 |
| Sunday | ≥18h | **-0.06** | **-0.03** |
| Sunday | 14-18h | -0.03 | 0 |
| Sunday | <14h | +0.01 | 0 |
| Monday | <12h | **-0.06** | **-0.02** |
| Monday | 12-18h | -0.03 | 0 |
| Tue–Thu | all day | 0 | 0 |

### 3.4 Special Date Emotion Override

When `fastSpecialDateType` is non-null, **overrides** the weekday curve (absolute values far exceed weekday micro-adjustments):

| Type | affDelta | secDelta | Meaning |
|------|----------|----------|---------|
| `ackem_birthday` | **+3.0** | +1.5 | Her own birthday — happier than anyone |
| `birthday` | **+3.0** | +1.0 | Celebratory, warm |
| `first_met_anniversary` | +2.0 | +0.5 | Warm nostalgia |
| `relationship` | +2.0 | +0.5 | Relationship anchor |
| `holiday_spring` | +1.5 | +0.3 | Spring Festival joy |
| `holiday_valentine` | +1.0 | -0.5 | Warm with anticipation |
| `holiday` | +0.5 | 0 | Generic holiday |
| `milestone` | +1.0 | +0.2 | Milestone reflection |

---

## 4. User Message Temporal Signal Detection

**File**: `src/main/memory/temporalSignalExtractor.ts`

### 4.1 Predefined Anchor Sentences (27 total)

**Temporal direction** (19): last year around this time, same day last week, a month ago, three months ago, half a year ago, last week, last month, last year, the year before last, tomorrow, day after tomorrow, next week, next month, next year, recently, a few days ago, a while ago, that day, back then

**Recurring events** (11): birthday, anniversary, Chinese New Year, Mid-Autumn Festival, New Year, year-end, start of year, school starts, graduation, starting a job

**Incremental time** (4): last time, long time no see, haven't seen you in ages, another year has passed

**Frequency** (5): every day, every week, every month, every year, often

### 4.2 detectTemporalSignal Algorithm

```
1. Input msgEmbedding × 27 precomputed sentence embeddings
2. Compute cosineSimilarity(msgEmbedding, sentenceEmbedding)
3. Take best score; if < threshold(0.6) → null
4. Classify type:
   - contains "时候/的前/前阵子/那天/那时候/好久" → fuzzy
   - contains recurring keywords → recurring
   - contains exact keywords → exact
   - fallback → fuzzy
```

### 4.3 Lifecycle

`buildTemporalEmbeddings(provider)` precomputes embeddings for all 27 sentences at **startup** and caches them. Each conversation turn uses cached embeddings — **no recomputation**. Used in both orchestrator and prepareTurnContext.

---

## 5. Temporal Anchor Persistence

**File**: `src/main/memory/temporalAnchorPolicy.ts`

### 5.1 Anchor Types

```
fuzzy < recurring < milestone < relationship
```

**`detectAnchorType(fact, userMsg)`** decision logic:
1. If `subcategory === 'OUR_BOND'` AND `selfRelevance >= 4.5` AND `intensity >= 0.7` → `relationship`
2. If `selfRelevance >= 4.0` OR `intensity >= 0.8` → `milestone`
3. If text contains `RECURRING_SIGNALS` (birthday, anniversary, every year, anniversary, Chinese New Year, Mid-Autumn, etc. — 14 keywords) → `recurring`
4. Fallback → `fuzzy`

### 5.2 Write Gate shouldWriteTemporalAnchor

Conditions (any one satisfied to write):
- `weight >= 2 AND intensity > 0.5` (strong threshold, any type)
- `recurring` type AND `weight >= 1 AND intensity >= 0.35`
- `relationship` type AND `intensity >= 0.4`
- `milestone` type AND `weight >= 1 AND intensity >= 0.45`
- fuzzy **never** auto-written (prevents noise)

### 5.3 writeTemporalAnchor

```sql
INSERT OR IGNORE INTO temporal_anchors
(id, anchor_date, anchor_type, linked_fact_ids, emotional_valence,
 emotional_intensity, domain, summary, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
```

Trigger points: `ingest.ts`, `factLanding.ts`, `commitImportJob.ts`

### 5.4 Anchor Resolution at Retrieval (retriever.ts)

**Strategy A — Active recurring anchors**: Query `temporal_anchors` where `type='recurring'` AND MM-DD within ±7-day window AND `(last_triggered_at IS NULL OR last_triggered_at < month_ago)`. Order by `emotional_intensity DESC LIMIT 3`.

**Strategy B — Broad anchor retrieval**:
1. **Periodic**: also recurring, ±30-day window, LIMIT 5
2. **Fuzzy**: `type='fuzzy'` AND `anchor_date >= three months ago`, LIMIT 3

Both strategies parse `linked_fact_ids` JSON arrays, deduplicate, and merge into `temporalAnchorHits[]` → `factsForEcho[]`.

Temporal weighting (`computeTemporalBoost`) multiplies cumulatively with trigger-word match weight, recency, and other factors at ranking time.

---

## 6. Reunion Impact

**File**: `src/main/engine/reunion.ts`

### 6.1 Six-Tier Impact Model

| Tier | Condition | secDelta | aroDelta | domDelta | trustDelta | Stage downgrade |
|------|-----------|----------|----------|----------|------------|-----------------|
| quick_return | <12h | +2 | +1 | 0 | 0 | No |
| short_absence | 12-48h | -5 | +3 | -2 | -2 | No |
| day_apart | 2-7 days | -12 | +6 | -4 | -5 | No |
| week_apart | 7-30 days | -20 | +8 | -6 | -10 | No |
| long_lost | 30-90 days | -25 | +3 | -8 | -15 | **Yes** |
| stranger_again | ≥90 days | -30 | +1 | -10 | -20 | **Yes** |

**Stage downgrade path**: `INTIMATE → FAMILIAR → STRANGER` (one level at a time)

### 6.2 Reunion Emotion Boost

`computeReunionBoost(lastActiveIso, nowIso) → { affBoost, secBoost } | null`

Threshold: `REUNION_OFFLINE_MINUTES = 30` minutes

```
factor = Math.min(minutes / REUNION_OFFLINE_CAP_MINUTES, 1) * 0.5 + 0.5
affBoost = 2.0 * factor
secBoost = 1.5 * factor
```

### 6.3 Reunion Diary

`buildReunionDiaryPrompt(input)` generates a 200–400 character reunion diary prompt including:
- Pre-written lines for 29 personality presets × 6 reunion tiers
- Current emotion/relationship/atmosphere parameters
- Pre-separation memory summary
- Offline thoughts
- Narrative guidance (from confusion to confirmation to emotional release)

---

## 7. Temporal Reflection Emergence

**File**: `src/main/engine/emotionalEmergence.ts` (tryTimeReflection section)

### 7.1 Fuzzy Duration Labels

```
<30 days   → feltDuration.short     "not long"
<90 days   → feltDuration.medium    "a while"
<180 days  → feltDuration.half       "quite a while"
<365 days  → feltDuration.long        "so long"
≥365 days  → feltDuration.veryLong    "we've come a long way together"
```

### 7.2 Eight Temporal Reflection Scenarios

Each scenario includes: trigger conditions, intensity formula, emotion flavor, phase management:

| # | Flavor | Core condition | Intensity formula |
|---|--------|----------------|-------------------|
| 1 | `quiet_awe` | late_night + QUIET_FOND + ≥5 consecutive meaningful turns | `(aff+100)/200 + 0.2`, clamped [0.3,0.9] |
| 2 | `nostalgic` | SWEET_ATTACHMENT + >90 days + warm atmosphere | `(aff+100)/200 + trust/200`, clamped [0.4,0.95] |
| 3 | `bittersweet` | HURT_GRIEVANCE + INTIMATE + last 5 turns aff avg >50 | `\|aff\|/100`, clamped [0.3,0.7] |
| 4 | `grateful` | INTIMATE + aff recovered from <20 to >50 in last 5 turns | fixed **0.7** |
| 5 | `wonder` | TSUNDERE + INTIMATE + >180 days | fixed **0.55** |
| 6 | `warm_familiarity` | QUIET_FOND/SWEET_ATTACHMENT + >14 days + deep chat | `(aff+100)/250 + days/500`, [0.25,0.7] |
| 7 | `tender_hold` | ≥3 consecutive vulnerable + FAMILIAR/INTIMATE + >14 days + aff>8 | `(aff+\|aro\|)/120 + vuln/10`, [0.3,0.75] |
| 8 | `tender_hold` (responsive) | responsive mode + ≥1 vulnerable + >14 days | `(aff+\|aro\|)/140 + vuln/12`, [0.28,0.72] |

### 7.3 Dual-Lock Cooldown

Same-type temporal reflections are constrained by dual cooldown:
- `SAME_TYPE_COOLDOWN_TURNS = 50` turns
- `SAME_TYPE_COOLDOWN_HOURS = 72` hours

**Either satisfied bypasses the other** (long conversations need not wait full 72 hours). In responsive mode, cooldown drops to 1 turn.

### 7.4 Emotion Intensity Threshold

Temporal reflections are evaluated in `evaluateEmergence()` and must pass 4 shield layers first:
1. **Emotion intensity threshold**: `emotionalIntensity = aff×0.6 + sec×0.2 + |aro|×0.2`, `depthBonus` supplements (consecutive vulnerable +4, consecutive meaningful +2, ≥4 meaningful in last 6 turns +2); total must be ≥ 20
2. **Stranger shield**: no emergence at STRANGER stage
3. **Anger shield**: ANGRY_ATTACK suppresses all emergence
4. **Cooldown shield**: 10-turn inter-type cooldown (responsive path bypasses)

---

## 8. Orchestrator Integration Points

Temporal awareness in `src/main/engine/orchestrator.ts` is distributed across 11 integration points:

| # | Location (approx. line) | Function |
|---|-------------------------|----------|
| 1 | 289-298 | Build `temporalCtx` passed to retriever |
| 2 | 333 | `detectTemporalSignal(qEmb, temporalEmbeddings)` |
| 3 | 523-541 | `detectFastSpecialDateType` → mood bias |
| 4 | 278-281, 513-519 | Reunion boost + reunion impact |
| 5 | 840-854 | Full special date detection (5 sources) |
| 6 | 902-906 | `buildMandatoryCanonSpecialDateBlock` (bypasses topic arbitration) |
| 7 | 1057 | `formatTimeContextBlock` always injected into psycheBlock |
| 8 | 1058-1060 | `userAsksLocalClock()` detection |
| 9 | 1180-1253 | Temporal hint as candidate in topic arbitration |
| 10 | 1490-1493 | `buildTemporalSeedTierBBlock` injected into tierBBlock |
| 11 | 773-831 | `tryTimeReflection` emergence verdict |

### Canon Mandatory Block

`buildMandatoryCanonSpecialDateBlock()` produces two mandatory markers that bypass topic arbitration:
- `【Today · Ackem's Birthday】` — when today is 06-20
- `【First Meeting Anniversary · X years】` — when within ±15-day anniversary window

### Time Context Block

`formatTimeContextBlock()` is always injected into psycheBlock, containing:
- System clock (local date and time)
- Current-moment greeting
- Ambient atmosphere hints
- Topic suggestions

---

## 9. Policy Layer Integration

### injectionPolicy.ts — Temporal Injection Slot Arbitration

| Scenario | temporal slot | emergence slot |
|----------|---------------|----------------|
| Arbitrable (non-silent) | `proactive` | `proactive` |
| User-initiated + high-priority special day | `responsive` | as appropriate |
| User-initiated + message contains temporal signal | `responsive` | as appropriate |
| whisper + high-priority special day | `proactive` | `none` |
| silent + responsive emergence | `none` | `responsive` |

### topicSelector.ts — Topic Weighting

- Special date topic weight: 0.85 (high priority) or 0.65 (normal)
- `late_night + vulnerable` filter: only allows emergence, special_date, or topics containing "relationship/companionship"
- When `specialDates.length > 0`, `special_date` source weight ×1.3

---

## 10. Desktop Companion Time Context

**File**: `desktop-companion.ts` `formatTimeContextBlock()`

Six time slots each have distinct greetings, atmosphere hints, and topic suggestions:

| Slot | Hours | Atmosphere | Typical greeting |
|------|-------|------------|------------------|
| `morning` | 5-8 | Quiet, lazy dawn | "Morning" |
| `forenoon` | 8-11 | Energetic | "Good morning" |
| `afternoon` | 11-14 | Lazy, warm midday | "It's noon — remember to eat something" |
| `afternoon` | 14-18 | Sleepy | "Good afternoon" |
| `evening` | 18-22 | Relaxed, gentle, intimate | weekend recognition |
| `night` | 22-2 | Private, quiet | "It's late..." |
| `late_night` | 2-5 | The world asleep at dawn | "Still awake this late..." |

---

## 11. i18n Key Summary

| Domain | Key count | Purpose |
|--------|-----------|---------|
| `holiday.{name}` | 22 | Holiday name translations |
| `timeDepth.*` | 11 | Time band labels |
| `specialDate.*` | 9 | Special date titles + narratives |
| `emergence.*` | 8 | Temporal reflection flavors + suffixes |
| `feltDuration.*` | 5 | Fuzzy duration labels |

---

## 12. File Inventory

| # | Path | Role |
|---|------|------|
| 1 | `engine/temporalAwareness/holidayDetector.ts` | Holiday detection |
| 2 | `engine/temporalAwareness/timeDepthCalculator.ts` | Time depth calculation |
| 3 | `engine/temporalAwareness/specialDateDetector.ts` | Special date aggregation |
| 4 | `engine/temporalAwareness/temporalMemoryBridge.ts` | Date → memory bridge |
| 5 | `engine/temporalAwareness/temporalProactiveTrigger.ts` | Signal production |
| 6 | `engine/temporalAwareness/fastSpecialDateCheck.ts` | Fast emotion bias |
| 7 | `memory/temporalContextModulator.ts` | Temporal retrieval weighting + emotion modulation |
| 8 | `memory/temporalSignalExtractor.ts` | User message temporal signals |
| 9 | `memory/temporalAnchorPolicy.ts` | Temporal anchor write policy |
| 10 | `memory/retriever.ts` | Temporal anchor retrieval (~200 lines) |
| 11 | `engine/strategy/injectionPolicy.ts` | Temporal injection slot arbitration |
| 12 | `engine/strategy/topicSelector.ts` | Topic temporal weighting |
| 13 | `engine/emotionalEmergence.ts` | Temporal reflection emergence |
| 14 | `engine/reunion.ts` | Reunion impact |
| 15 | `engine/rhythmEngine.ts` | Time-slot rhythm influence |
| 16 | `engine/orchestrator.ts` | Main integration point (~11 locations) |
| 17 | `engine/prepareTurnContext.ts` | Temporal context precomputation |
| 18 | `canon/ackemCanon.ts` | Mandatory special day block |
| 19 | `context/localTime.ts` | Local time utilities |
| 20 | `context/runtimeContext.ts` | Runtime temporal context |
| 21 | `extensions/plugins/builtin/desktop-companion/desktop-companion.ts` | Time-slot context |
| 22 | `i18n/zh.ts`, `i18n/en.ts` | Time-related translations |

---

## 13. Related Documentation

| Document | Content |
|----------|---------|
| [01-brain-system.md](./01-brain-system.md) | Temporal anchor integration in L4 memory retrieval |
| [02-heart-system.md](./02-heart-system.md) | Temporal reflection and reunion impact in emotion emergence |
| [03-mouth-system.md](./03-mouth-system.md) | Time context block injection |
| [05-extension-system.md](./05-extension-system.md) | Desktop companion time-slot context |
| [00-overall-system.md](./00-overall-system.md) | Full conversation pipeline |

*Time System · Ackem v1.0.0 · 2026-06*
