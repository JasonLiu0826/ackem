// [gaming/mc-humanizer] — Minecraft 行为人性化抖动
// 职责：让 bot 玩得像人而不是完美机器人
// 引用：../../docs/mainDocs/MC陪伴功能设计.md §2

/** 抖动参数（可按人格覆盖） */
export interface HumanizerParams {
  /** 跟随目标距离（格），实际 2-6 浮动 */
  followDistance: number
  /** 战斗反应延迟（秒），实际 +0.1-0.5 随机 */
  combatReactionDelaySec: number
  /** 攻击间隔额外偏移（ms），实际 +0-200ms */
  attackIntervalJitterMs: number
  /** 瞄准失误率（0-1），实际 0.05-0.15 */
  aimErrorRate: number
  /** 移动随机跳跃概率（0-1） */
  jumpWhileMovingRate: number
  /** 回头确认间隔（秒），10-30 秒随机一次 */
  lookBackIntervalSec: number
  /** 景色停留概率（路过花/建筑时 0-1） */
  sceneryPauseRate: number
  /** 空闲小动作概率（每 tick 0-1） */
  idleFidgetRate: number
  /** 自言自语间隔（秒），30-60 秒一句 */
  selfTalkIntervalSec: number
  /** AFK 主动搭话延迟（秒），>120 秒无操作后 */
  afkTalkDelaySec: number
}

export const DEFAULT_HUMANIZER: HumanizerParams = {
  followDistance: 3,
  combatReactionDelaySec: 0.2,
  attackIntervalJitterMs: 100,
  aimErrorRate: 0.1,
  jumpWhileMovingRate: 0.15,
  lookBackIntervalSec: 20,
  sceneryPauseRate: 0.05,
  idleFidgetRate: 0.08,
  selfTalkIntervalSec: 45,
  afkTalkDelaySec: 120,
}

/** 人格专属的人性化参数覆盖 */
export const PERSONALITY_HUMANIZER: Record<string, Partial<HumanizerParams>> = {
  // 温柔 — 紧跟你，反应温和
  deredere: { followDistance: 2, combatReactionDelaySec: 0.3, aimErrorRate: 0.12 },
  // 傲娇 — 跟得紧但不承认，假装不在意
  tsundere: { followDistance: 3, combatReactionDelaySec: 0.15, jumpWhileMovingRate: 0.05 },
  // 病娇 — 死跟你，反应极快，几乎不失误
  yandere: { followDistance: 1, combatReactionDelaySec: 0.05, aimErrorRate: 0.02, jumpWhileMovingRate: 0 },
  // 三无 — 精准高效，几乎不跳
  kuudere: { combatReactionDelaySec: 0.1, aimErrorRate: 0.03, jumpWhileMovingRate: 0.02, idleFidgetRate: 0.01, selfTalkIntervalSec: 180 },
  // 元气 — 蹦蹦跳跳，反应夸张
  genki: { jumpWhileMovingRate: 0.5, idleFidgetRate: 0.2, selfTalkIntervalSec: 20, sceneryPauseRate: 0.15 },
  // 毒舌 — 攻击精准，但移动懒散
  shitakiri: { combatReactionDelaySec: 0.1, aimErrorRate: 0.04, jumpWhileMovingRate: 0.03 },
  // 雌小鬼 — 远程放冷箭，近身就跑
  mesugaki: { followDistance: 5, combatReactionDelaySec: 0.1, idleFidgetRate: 0.15 },
  // 反差 — 平时慢悠悠，战斗瞬间切换
  gap_moe: { followDistance: 3, combatReactionDelaySec: 0.05, jumpWhileMovingRate: 0.05 },
  // 冷艳 — 保持距离，很少废话
  ice_queen: { followDistance: 5, selfTalkIntervalSec: 300, idleFidgetRate: 0.01, jumpWhileMovingRate: 0.01 },
  // 天然呆 — 完全随机，经常迷路
  bokke: { followDistance: 4, combatReactionDelaySec: 0.5, aimErrorRate: 0.2, sceneryPauseRate: 0.2, idleFidgetRate: 0.15 },
  // 忠犬 — 永远在你前面挡着
  loyal_pup: { followDistance: 1, combatReactionDelaySec: 0.05, lookBackIntervalSec: 8, jumpWhileMovingRate: 0.3 },
  // 妈妈 — 时刻准备加血
  mommy: { followDistance: 2, combatReactionDelaySec: 0.15, lookBackIntervalSec: 10, selfTalkIntervalSec: 30 },
}

let lastLookBackTime = 0
let lastSelfTalkTime = 0
let lastPlayerActionTime = Date.now()

/** 伪随机数 (0-1)，用时间戳种子避免完全确定性 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453
  return x - Math.floor(x)
}

/** 获取当前 tick 的随机种子 */
function tickSeed(): number {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000)
}

export function createHumanizer(personalityId?: string): HumanizerParams {
  const base = { ...DEFAULT_HUMANIZER }
  const overrides = personalityId ? PERSONALITY_HUMANIZER[personalityId] : undefined
  return overrides ? { ...base, ...overrides } : base
}

/** 跟随距离抖动：目标 ± 浮动，返回实际距离 */
export function jitterFollowDistance(params: HumanizerParams): number {
  const d = params.followDistance
  const jitter = (seededRandom(tickSeed()) - 0.5) * 4 // -2~+2
  return Math.max(1, Math.round(d + jitter))
}

/** 战斗反应延迟：目标 + 随机偏移 */
export function jitterCombatDelay(params: HumanizerParams): number {
  const base = params.combatReactionDelaySec
  const jitter = seededRandom(tickSeed()) * 0.4 // 0~0.4s
  return base + jitter
}

/** 攻击间隔偏移：目标 + 随机 ms */
export function jitterAttackInterval(params: HumanizerParams): number {
  const jitter = seededRandom(tickSeed()) * params.attackIntervalJitterMs * 2
  return params.attackIntervalJitterMs + jitter
}

/** 瞄准是否失误 */
export function shouldAimMiss(params: HumanizerParams): boolean {
  return seededRandom(tickSeed()) < params.aimErrorRate
}

/** 移动时是否跳一下 */
export function shouldJumpWhileMoving(params: HumanizerParams): boolean {
  return seededRandom(tickSeed()) < params.jumpWhileMovingRate
}

/** 是否该回头看看玩家了 */
export function shouldLookBack(params: HumanizerParams): boolean {
  const now = Date.now()
  if (now - lastLookBackTime > params.lookBackIntervalSec * 1000) {
    lastLookBackTime = now + seededRandom(tickSeed()) * 10_000
    return true
  }
  return false
}

/** 重置回头计时器 */
export function resetLookBack(): void {
  lastLookBackTime = Date.now()
}

/** 路过景色时是否停留 */
export function shouldPauseForScenery(params: HumanizerParams): boolean {
  return seededRandom(tickSeed()) < params.sceneryPauseRate
}

/** 空闲时是否做小动作（转圈/跳/换手持物） */
export function shouldIdleFidget(params: HumanizerParams): boolean {
  return seededRandom(tickSeed()) < params.idleFidgetRate
}

/** 是否该自言自语了（8s~60s 随机间隔，人格影响频率） */
let nextSelfTalkTime = 0
export function shouldSelfTalk(params: HumanizerParams): boolean {
  const now = Date.now()
  if (now > nextSelfTalkTime) {
    // 根据人格的 selfTalkInterval 调整范围：Interval越小=话越多
    const base = params.selfTalkIntervalSec
    const min = Math.max(5, base * 0.18)   // 话多:45*0.18≈8s, 话少:300*0.18≈54s
    const max = Math.min(120, base * 1.3)  // 话多:45*1.3≈58s, 话少:300*1.3≈120s(capped)
    nextSelfTalkTime = now + (min + Math.random() * (max - min)) * 1000
    return true
  }
  return false
}

/** 是否该主动搭话了（AFK 检测） */
export function shouldAfkTalk(params: HumanizerParams): boolean {
  const now = Date.now()
  const elapsed = (now - lastPlayerActionTime) / 1000
  return elapsed > params.afkTalkDelaySec
}

/** 报告玩家有操作 */
export function reportPlayerAction(): void {
  lastPlayerActionTime = Date.now()
}

/** 闲置时的小动作类型 */
export function pickIdleAction(): 'spin' | 'jump' | 'swap_item' | 'look_around' {
  const r = seededRandom(tickSeed())
  if (r < 0.3) return 'spin'
  if (r < 0.55) return 'jump'
  if (r < 0.8) return 'swap_item'
  return 'look_around'
}

/** 执行小动作的持续时间（ms） */
export function idleActionDuration(): number {
  return 300 + seededRandom(tickSeed()) * 1200
}
