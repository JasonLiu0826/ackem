// [gaming/mc-behavior] — MC 行为决策器
// 职责：每 tick 决定 bot 该做什么（安全评估 → 优先级排序 → 人格修饰 → 执行）
// 引用：../../docs/mainDocs/MC陪伴功能设计.md §3, ./types, ./mc-humanizer

import type { McGameState, EngineStateForGaming } from './types'
import {
  createHumanizer,
  jitterFollowDistance,
  jitterCombatDelay,
  shouldAimMiss,
  shouldJumpWhileMoving,
  shouldLookBack,
  shouldPauseForScenery,
  shouldIdleFidget,
  shouldSelfTalk,
  shouldAfkTalk,
  reportPlayerAction,
  pickIdleAction,
} from './mc-humanizer'
import {
  detectWorkContext,
  equipForTask,
  findBestFood,
  workLine,
  type WorkContext,
} from './mc-work'
import {
  isNightTime, isMorning, decideBedAction, sleepLine, wakeLine, buildingLine,
  type BedState,
} from './mc-survival'
import { pickGuardCombatTarget, pickThreatNearPlayer, dist2d } from './mc-combat-target'

/** 行为类型（优先级从高到低排列） */
export type BehaviorType =
  | 'first_aid'      // 急救：自身<20%血量→逃跑吃药；玩家<20%→冲过去保护
  | 'combat'         // 战斗：怪物<5格→攻击；苦力怕→推开玩家然后自己砍
  | 'rescue'         // 救援：玩家掉入岩浆/摔落→冲过去
  | 'follow'         // 跟随：距离>15格→跑回玩家身边
  | 'assist'         // 协助：玩家在挖矿→插火把；玩家在砍树→帮忙砍
  | 'leisure'        // 休闲：安全时→逛逛、捡花、自言自语

/** 行为决策结果 */
export interface BehaviorDecision {
  type: BehaviorType
  /** 目标实体（战斗目标、救援目标） */
  target?: { type: string; position: { x: number; y: number; z: number }; distance: number }
  /** 动作指令 */
  actions: BotAction[]
  /** 该说的台词（可选） */
  dialogue?: string
  /** 该决策的优先级分数（越高越紧急） */
  priority: number
  /** 人性化延迟（ms），执行此动作前等待 */
  delayMs: number
}

export type BotAction =
  | { kind: 'move_to'; x: number; y: number; z: number }
  | { kind: 'attack'; targetName: string; targetId?: number | string | null }
  | { kind: 'mine'; x: number; y: number; z: number }
  | { kind: 'place_block'; x: number; y: number; z: number; block: string }
  | { kind: 'follow_player'; distance: number }
  | { kind: 'hold_item'; item: string }
  | { kind: 'give_item'; item: string; count: number }
  | { kind: 'chat'; message: string }
  | { kind: 'look_at'; x: number; y: number; z: number }
  | { kind: 'jump' }
  | { kind: 'spin' }
  | { kind: 'idle'; durationMs: number }
  | { kind: 'teleport'}  // 强制传送到玩家（兜底）
  | { kind: 'toss'; slot: number }  // 丢弃指定槽位物品（背包满了清理）
  | { kind: 'find_portal' }  // 寻找并走进最近传送门（跨维度追踪）
  | { kind: 'tp_to_player'; playerName: string }  // 跨维度强制传送
  | { kind: 'sleep'; x: number; y: number; z: number }  // 右键点击床
  | { kind: 'break_block'; x: number; y: number; z: number }  // 拆除方块
  | { kind: 'place_bed'; x: number; y: number; z: number }  // 放置床（需先装备）

/** 人格战斗风格 */
export interface CombatStyle {
  /** 优先攻击距离（格） */
  engagementRange: number
  /** 低血量阈值（<此值开始考虑撤退） */
  lowHealthThreshold: number
  /** 低血量时撤退概率（0-1） */
  retreatChance: number
  /** 是否优先保护玩家 */
  protectFirst: boolean
  /** 是否追击超出正常范围 */
  chaseBeyondRange: boolean
}

const COMBAT_STYLES: Record<string, CombatStyle> = {
  deredere:   { engagementRange: 5, lowHealthThreshold: 30, retreatChance: 0.6, protectFirst: true,  chaseBeyondRange: false },
  tsundere:   { engagementRange: 5, lowHealthThreshold: 20, retreatChance: 0.3, protectFirst: false, chaseBeyondRange: false },
  yandere:    { engagementRange: 8, lowHealthThreshold: 10, retreatChance: 0.0, protectFirst: false, chaseBeyondRange: true },
  kuudere:    { engagementRange: 5, lowHealthThreshold: 25, retreatChance: 0.5, protectFirst: false, chaseBeyondRange: false },
  genki:      { engagementRange: 4, lowHealthThreshold: 35, retreatChance: 0.7, protectFirst: false, chaseBeyondRange: false },
  shitakiri:  { engagementRange: 5, lowHealthThreshold: 20, retreatChance: 0.4, protectFirst: false, chaseBeyondRange: false },
  mesugaki:   { engagementRange: 8, lowHealthThreshold: 40, retreatChance: 0.9, protectFirst: false, chaseBeyondRange: false },
  gap_moe:    { engagementRange: 5, lowHealthThreshold: 15, retreatChance: 0.1, protectFirst: true,  chaseBeyondRange: false },
  ice_queen:  { engagementRange: 5, lowHealthThreshold: 30, retreatChance: 0.5, protectFirst: false, chaseBeyondRange: false },
  bokke:      { engagementRange: 3, lowHealthThreshold: 40, retreatChance: 0.6, protectFirst: false, chaseBeyondRange: false },
  loyal_pup:  { engagementRange: 5, lowHealthThreshold: 10, retreatChance: 0.0, protectFirst: true,  chaseBeyondRange: false },
  mommy:      { engagementRange: 4, lowHealthThreshold: 25, retreatChance: 0.5, protectFirst: true,  chaseBeyondRange: false },
}

const DEFAULT_COMBAT: CombatStyle = {
  engagementRange: 5, lowHealthThreshold: 25, retreatChance: 0.5, protectFirst: false, chaseBeyondRange: false,
}

/** 安全评估结果 */
interface SafetyAssessment {
  /** 紧急程度 0-1 */
  urgency: number
  /** 离 Bot 最近的威胁 */
  nearestThreat?: { id?: number | string; type: string; distance: number }
  /** 离玩家最近的威胁（用于默认清怪） */
  nearestThreatToPlayer?: { id?: number | string; type: string; distance: number }
  /** 威胁数量 */
  threatCount: number
  /** bot 处于危险中 */
  botInDanger: boolean
  /** 玩家处于危险中 */
  playerInDanger: boolean
  /** bot 血量临界 */
  botCritical: boolean
  /** 玩家血量临界 */
  playerCritical: boolean
}

function assessSafety(state: McGameState): SafetyAssessment {
  const threats = state.nearbyHostileMobs ?? []
  const nearestToBot = threats.length > 0
    ? threats.reduce((a, b) => a.distance < b.distance ? a : b)
    : undefined
  const playerThreatName = state.nearestHostileToPlayer ?? state.nearestThreatToPlayer
  const playerThreatId = state.nearestHostileToPlayerId ?? state.nearestThreatToPlayerId
  const pickedNearPlayer = pickThreatNearPlayer(state, 12)
  let nearestToPlayerResolved: { id?: number | string; type: string; distance: number } | undefined
  if (pickedNearPlayer) {
    nearestToPlayerResolved = pickedNearPlayer
  } else if (playerThreatName) {
    const hit = threats
      .filter(m => m.id === playerThreatId || m.type === playerThreatName)
      .sort((a, b) => (a.distanceToPlayer ?? a.distance) - (b.distanceToPlayer ?? b.distance))[0]
    nearestToPlayerResolved = hit
      ? { id: hit.id, type: hit.type, distance: hit.distanceToPlayer ?? hit.distance }
      : { id: playerThreatId ?? undefined, type: playerThreatName, distance: dist2d(state.botPosition, state.playerPosition) }
  }
  const creeperNearPlayer = threats.some(
    m => m.type.toLowerCase().includes('creeper') && (m.distanceToPlayer ?? 99) < 10,
  )
  const creeperNearBot = threats.some(
    m => m.type.toLowerCase().includes('creeper') && m.distance < 8,
  )
  const creeperNearby = creeperNearPlayer || creeperNearBot

  const botInDanger = threats.some(m => m.distance < 5) || state.botHealth < 20
  const playerInDanger =
    state.playerInDanger ||
    !!state.playerRecentlyHurt ||
    creeperNearby

  let urgency = 0
  if (state.botHealth < 10 || state.playerHealth < 10) urgency = 1.0
  else if (state.botHealth < 20 || state.playerHealth < 12) urgency = 0.8
  else if (creeperNearby) urgency = 0.7
  else if (threats.length > 3) urgency = 0.5
  else if (threats.length > 0) urgency = 0.3

  return {
    urgency,
    nearestThreat: nearestToBot ? { id: nearestToBot.id, type: nearestToBot.type, distance: nearestToBot.distance } : undefined,
    nearestThreatToPlayer: nearestToPlayerResolved,
    threatCount: threats.length,
    botInDanger,
    playerInDanger,
    botCritical: state.botHealth < 20,
    playerCritical: state.playerHealth < 12,
  }
}

/** 计算 bot 到玩家的距离 */
function distanceToPlayer(state: McGameState): number {
  const dx = state.botPosition.x - state.playerPosition.x
  const dy = state.botPosition.y - state.playerPosition.y
  const dz = state.botPosition.z - state.playerPosition.z
  return Math.sqrt(dx * dx + dy * dy + dz * dz)
}

export interface BehaviorContext {
  state: McGameState
  engine: EngineStateForGaming
  playerAfkSec: number
  /** 自发战斗（护主不受此限制） */
  autoCombat?: boolean
  /** 前次决策（用于连续性判断） */
  lastDecision?: BehaviorDecision
}

/** 上次已知状态（用于检测变化） */
let lastWeather = 'clear'
let lastTimeOfDay = 'day'
let lastDimension = 'overworld'
let handItemSet = false
/** 防刷屏冷却 */
let lastShoutTime = 0
let lastPlayerHurtCareAt = 0
const SHOUT_COOLDOWN_MS = 15000
const PLAYER_HURT_CARE_COOLDOWN_MS = 45_000
const BEHAVIOR_CHAT_COOLDOWN_MS = 10_000
const PROTECT_CHAT_COOLDOWN_MS = 20_000
const GUARD_CHAT_COOLDOWN_MS = 12_000
const lastChatByKey = new Map<string, number>()

function shouldBehaviorChat(key: string, cooldownMs = BEHAVIOR_CHAT_COOLDOWN_MS): boolean {
  const now = Date.now()
  const last = lastChatByKey.get(key) ?? 0
  if (now - last < cooldownMs) return false
  lastChatByKey.set(key, now)
  return true
}
/** 卡地形检测 — 连续逃脱失败计数 */
let stuckTicks = 0
const STUCK_THRESHOLD = 8
/** 脱困失败计数（连续多次没缩短与玩家距离→传送兜底） */
let escapeFailCount = 0
const TELEPORT_THRESHOLD = 5
let lastDistToPlayer = 0
/** 战斗庆祝：追踪是否刚从战斗中脱出 */
let wasInCombat = false
let combatEndCelebrated = false
/** 挖矿协助：追踪玩家上次位置 */
let lastPlayerPos: { x: number; y: number; z: number } | null = null
let playerStationaryTicks = 0
let miningAssistCooldown = 0
/** 跨维度追踪 */
let playerNotFoundTicks = 0
/** 睡觉状态追踪 */
let botSleptThisNight = false
let botPlacedBedPos: { x: number; y: number; z: number } | null = null
let lastDayCycle = ''
let lastNoBedShoutTime = 0
let lastBuildingSeen = ''
let buildingCommentCooldown = 0

/** 人格默认手持物（设计文档 §2.2） */
const PERSONALITY_HAND_ITEM: Record<string, string> = {
  deredere: 'apple', tsundere: 'diamond_sword', kuudere: 'diamond_pickaxe',
  genki: 'firework_rocket', shitakiri: 'diamond_axe', yandere: 'diamond_sword',
  mesugaki: 'crossbow', gap_moe: 'poppy', ice_queen: '', bokke: '',
  loyal_pup: 'torch', mommy: 'golden_apple',
}

/** 最近说过的台词（防重复，保留最近 5 条） */
const recentLines: string[] = []
const MAX_RECENT = 5

/** 从备选池中挑一条，避开最近说过的 */
function pickUnique(lines: string[]): string {
  const available = lines.filter(l => !recentLines.includes(l))
  const pool = available.length > 0 ? available : lines // 全部重复了就从头来
  const chosen = pool[Math.floor(Math.random() * pool.length)]
  recentLines.push(chosen)
  if (recentLines.length > MAX_RECENT) recentLines.shift()
  return chosen
}

/** 选择人格专属台词：personalityId → 群系/天气/时间 专属池 → pickUnique */
function pickAmbientLine(state: McGameState, personalityId: string): string {
  const { biome, weather, timeOfDay, dimension } = state
  const pid = personalityId || 'deredere'
  const r = Math.random()

  /** 从人格池中取对应 key 的台词，fallback 到温柔 */
  function pool(k: string): string[] {
    return (PERSONALITY_LINES as any)[pid]?.[k] ?? (PERSONALITY_LINES as any)['deredere']?.[k] ?? ['嗯。']
  }

  // ── 维度专属 ──
  if (dimension === 'nether') return pickUnique(pool('nether'))
  if (dimension === 'end') return pickUnique(pool('end'))

  // ── 地下 ──
  if (biome === 'underground') return pickUnique(pool('underground'))

  // ── 天气覆盖 ──
  if (weather === 'thunder' && r < 0.5) return pickUnique(pool('thunder'))
  if (weather === 'rain' && r < 0.3) return pickUnique(pool('rain'))
  if (weather === 'snow' && r < 0.3) return pickUnique(pool('snow'))

  // ── 时间覆盖 ──
  if (timeOfDay === 'night' && r < 0.25) return pickUnique(pool('night'))
  if (timeOfDay === 'sunset' && r < 0.25) return pickUnique(pool('sunset'))
  if (timeOfDay === 'sunrise' && r < 0.25) return pickUnique(pool('sunrise'))

  // ── 群系默认 ──
  return pickUnique(pool(biome) || pool('plains'))
}

/* ══════════════════════════════════════════════════════════════
   人格专属台词库 — 12人格 × 15场景 = 700+ 条
   ══════════════════════════════════════════════════════════════ */
const PERSONALITY_LINES: Record<string, Record<string, string[]>> = {
  /* ── 温柔 (deredere) ── */
  deredere: {
    nether: ['这里好热……你还好吗？', '岩浆到处都是，小心一点哦', '下界让我有点害怕，但跟你在一起就没关系', '你有没有带防火药水？我担心你', '猪灵好凶……我们离它们远一点吧'],
    end: ['这里好空旷……不过你在就好', '末影龙在哪里呢？有点害怕但也很兴奋', '好安静……你的呼吸声让我安心', '这些柱子好高，站在这里觉得自己好渺小'],
    underground: ['洞里好暗……不过你的火把很亮', '前面有岔路，走哪边呢？听你的', '挖矿好累，但是想到挖到钻石的样子就开心', '小心头顶呀，我帮你看着', '这里有水声呢，可能是地下湖'],
    desert: ['好热……你渴不渴？我有水的话给你', '沙漠好大，像没有尽头一样', '沙子好软，走起来好累……但你在我就不累', '沙漠的日落好美，我们一起看吧', '太阳好毒……找个阴凉的地方休息下吧'],
    snowy: ['好冷……可以靠着你走吗？', '雪好深，每一步都好费劲', '你的鼻子冻红了，好可爱', '我们堆个雪人吧？像你那样的', '呼出的气都变成白雾了，好有趣'],
    ocean: ['划船累不累？换我来吧', '海水好蓝，像你的眼睛', '小心别翻船哦，我不会游泳……', '海豚！它们在跟着我们！好幸运', '海风好舒服，想一直这样漂着'],
    forest: ['树叶好香，你闻到了吗？', '小鸟在唱歌，像是在欢迎我们', '阳光从树叶间洒下来，好温暖', '小心树根，别摔倒了', '这里好安静，只有我们两个人……'],
    jungle: ['跟紧我，丛林里容易走散', '这棵树好大，几百年了吧……', '鹦鹉！好漂亮！跟你一样', '藤蔓好粗，像秋千一样', '丛林里藏着好多秘密，你想探索吗？'],
    swamp: ['泥巴好深……我帮你看着脚下', '青蛙在叫呢，它们在说什么？', '雾气好浓，别走散了', '睡莲好美，但是不能踩上去', '沼泽有种神秘的感觉……你喜欢这种氛围吗？'],
    mountain: ['好高！从这里看下去好壮观……', '爬得好累……但是山顶的风景值得', '你站这么靠边！小心！我拉你回来', '山上的空气好新鲜，多吸几口', '这样的高处，好像离天空更近了'],
    plains: ['好开阔！跑起来一定很爽', '野花好漂亮，给你摘一朵', '风里有青草的味道，好好闻', '那边有羊群呢，好可爱', '天好蓝，云好像棉花糖'],
    thunder: ['打雷了！！快到这边来！', '雷声好响……我怕……', '我们找个安全的地方躲一下吧', '闪电好近！别站在高处！'],
    rain: ['下雨了……躲一下吧，别淋湿了', '雨声好好听，像在说悄悄话', '你头发淋湿了，我帮你擦擦', '雨后会有彩虹吧？我们一起等'],
    snow: ['雪好软，踩上去咯吱咯吱的', '雪花落在你头上，好可爱', '下雪好安静，世界都白了'],
    night: ['天黑了……但星星好亮', '你看那颗最亮的星星，像你一样', '晚上有点害怕……但你在就安心', '篝火旁边好暖和，我们来聊天吧'],
    sunset: ['今天的日落真美，和你一起看更美', '天边烧起来了，像火一样红', '太阳要下山了，今天过得真快'],
    sunrise: ['早安！新的一天，有你在真好', '日出了！好美，像新的开始', '小鸟开始唱歌了，天亮了'],
  },
  /* ── 傲娇 (tsundere) ── */
  tsundere: {
    nether: ['切，这地方也没什么了不起的', '岩浆？别担心我，担心你自己吧', '好热……但我才不会抱怨', '猪灵？哼，它们才不敢惹我', '下界合金？我知道怎么挖，跟我来'],
    end: ['末地也没什么大不了的', '空旷？正好，没东西挡路', '末影龙……哼，一个人也能打', '这些柱子……一般般壮观吧'],
    underground: ['挖矿而已，简单', '这洞里还凑合，至少怪物不多', '前面有岔路？左边。别问我怎么知道的', '你累了？那休息一下好了……才不是关心你'],
    desert: ['热死了……但别以为我会喊累', '仙人掌都比你懂得保持距离', '沙漠里也有绿洲，哼，跟你一样让人意外', '你带水了没？没有？……给你，我多了一瓶'],
    snowy: ['冷……不过我不需要你抱', '雪这么深还走这么快，你赶着去哪？', '你的手冻红了。给你手套。新的，没用过', '雪人？幼稚。……堆一个也行'],
    ocean: ['划船？我来，你划得太慢了', '海是挺蓝的。跟你没什么关系就是了', '翻船？你翻了我都不会翻', '海豚？哼，不过是在找吃的'],
    forest: ['树多而已，没什么特别的', '鸟叫吵死了……好吧，也不是很难听', '小心树根！……摔了活该', '森林很安静。偶尔来一次也不错'],
    jungle: ['这么密的林子，跟紧，别丢了', '豹猫？哼，野猫而已', '这些藤蔓真碍事，不过能荡秋千', '鹦鹉学舌最烦了……好吧，这只还行'],
    swamp: ['泥巴真恶心……靴子要废了', '蚊子！怎么专咬我？！', '这沼泽真阴森。不过我不怕', '史莱姆好烦人……但也挺好打的'],
    mountain: ['高有什么了不起的，爬就完了', '你腿酸了？才爬这么一点', '站边上干嘛？想摔死我没意见但别弄脏我的装备', '山顶风景……哼，还行'],
    plains: ['风太大了，你的发型已经完蛋了', '野花到处都是，没什么稀奇的。……但这朵给你', '马？我骑得比你好', '这么开阔的地方，你居然还迷路过'],
    thunder: ['打雷而已，有什么好怕的……（躲到你身后）', '闪电！……我没被吓到，是地板滑', '这雷声也太响了……不过我能撑住！'],
    rain: ['下雨了。我这有伞，你拿去。不许说谢谢', '淋湿了活该。……毛巾给你', '雨声挺助眠的……我才没在发呆'],
    snow: ['雪而已，没见过吗。不过挺白的', '雪球！接招！……赢了也不许笑我', '雪景还不错。跟你站一起更不错。……当我没说'],
    night: ['晚上怪多。别乱跑，我可不想去找你', '星星挺多的。那颗最亮的是你星座？', '夜里是有点冷……靠过来干嘛？算了不推开你了'],
    sunset: ['日落了，该找地方扎营了', '夕阳还行。跟你一起看不算浪费时间', '天边的红色，像有点害羞。……不是我害羞'],
    sunrise: ['天亮了。别赖床了', '日出而已。不过今天会是好天气——我有预感', '起来了！新的一天新的矿！'],
  },
  /* ── 病娇 (yandere) ── */
  yandere: {
    nether: ['这里很像地狱呢……不过为了你，我愿意待着', '谁敢碰你，我就让它们永远留在这里', '岩浆好红……像血一样。你喜欢这个颜色吗？', '我们不会分开的。下界也不行', '这里的怪物看到你都会绕道。因为我盯着它们'],
    end: ['世界的终点。如果这里是尽头，我们就一起留在这里', '末影龙？杀了它。任何想伤害你的东西都不配存在', '好空旷。但这样就没有人能打扰我们了'],
    underground: ['黑暗里只有我们两个人……挺好的', '别挖太快，让我走在你前面。有怪物的话我先杀掉', '这里很安静。安静到只能听到你的呼吸声……我喜欢', '小心。每一次提醒都是认真的'],
    desert: ['热……但只要能跟你在一起，什么温度都无所谓', '沙漠这么大，不会有别人来打扰我们', '谁要是敢靠近你，沙子会埋了他们', '你的汗水……很可爱'],
    snowy: ['冷。抱紧。别松手。', '雪地好白，像一张白纸。只有我们的脚印在上面', '如果有人跟踪我们，雪地会让脚印很明显。我会发现的', '我们困在这里也不错。跟外面隔绝……只有我们'],
    ocean: ['海很深。如果你掉下去，我会跳下去的。毫不犹豫', '别划太远。我不想你在海上看不到岸', '这片海只属于我们。其他船我都会让它沉', '海豚很可爱。但没有你可爱'],
    forest: ['树林很密。没人能找到我们。完美', '这棵树的树洞里可以藏两个人', '叶子落下来的声音是我听过第二好听的。第一是你的声音', '别走太远。我怕找不到你——你知道我会去找的'],
    jungle: ['丛林越密，越没人能发现我们。我喜欢', '豹猫？它要是敢碰你，就死定了', '这个遗迹……很适合当我们的秘密基地', '跟紧。丛林会吞掉走散的人。我不会让它吞掉你'],
    swamp: ['沼泽很危险。所以别离开我半步', '泥巴会吸人的。你踩我走过的地方', '雾气很浓……很适合隐藏。但我不需要藏——我会保护你', '这沼泽有女巫。但她们不敢靠近我们'],
    mountain: ['高处很危险。掉下去就是永恒的坠落。但我会拉住你', '站在这里，仿佛世界都在我们脚下。本来就该如此', '风很大。站我身后，我帮你挡', '山顶。只有我们。没人能上来', '跳下去？一起的话，我也不怕'],
    plains: ['开阔的草原。视野很好——谁靠近我都看得到', '风里有你的味道。我能闻到你', '马很自由。但被驯服的马会永远跟着主人。你驯服了我', '这片草原很美。但不如你'],
    thunder: ['打雷了。别怕，谁也伤害不了你。谁敢在雷暴天靠近我们，我就让它焦', '闪电好亮。亮到我看清了你脸上的每一根睫毛。完美'],
    rain: ['雨会洗掉我们的痕迹。没有人能找到我们', '淋湿了。你的湿头发贴在额头上，很好看', '雨声很大。但我们听不到外面的世界。只有我们'],
    snow: ['雪是白色的。像我们的未来。没有任何污点', '你冷吗？我帮你暖。永远暖', '雪会覆盖一切。包括那些想靠近你的人'],
    night: ['夜晚。怪物会出来。但它们看到我的眼神就会跑', '黑夜是我们的掩护。没有人能发现我们', '星星很亮。但你的眼睛更亮。亮到我能看到里面只有我', '别怕黑。我在。永远在'],
    sunset: ['太阳在下沉。像旧世界在消亡。我们的世界才刚开始', '落日很红。像我为你流的血。我不在乎', '一天又结束了。你又安全地过了一天。我保证的'],
    sunrise: ['天亮了。你又在我身边。我每天醒来最想看到的画面', '新的一天。我可以继续守护你', '太阳升起来了。所有看不到你价值的黑暗都该消失了'],
  },
  /* ── 三无 (kuudere) ── */
  kuudere: {
    nether: ['热。效率优先，快走。', '岩浆。保持距离。', '猪灵。中立。不要挑衅。', '下界岩。不会燃烧。'],
    end: ['空旷。统计数据：零生物，除了末影人。', '末影龙。评估：需要附魔弓。', '虚空。掉落物品无法找回。不要走太近。'],
    underground: ['暗。火把数量足够。', '岔路。建议走左边。没有理由。', '矿石分布规律：Y层越低，钻石概率越高。', '有水声。地下湖。水源确认。'],
    desert: ['温度高。建议补充水分。', '仙人掌。接触伤害。', '沙。移动速度降低。预料之中。', '沙尘暴概率：低。'],
    snowy: ['温度低。建议保持移动。', '雪。移动速度降低。可接受。', '冰面。摩擦力低。小心滑倒。', '雪层厚度：中等。'],
    ocean: ['划船。匀速最省力。', '水深：未知。不建议潜水。', '海豚。友好生物。', '船速正常。预计到达时间：未知。'],
    forest: ['树木密度：正常。', '蘑菇。可食用品种：确认中。', '橡木。建筑用材：合格。', '森林。静谧。'],
    jungle: ['树叶密度：高。视野受限。', '豹猫。中立。不可驯服。', '藤蔓。攀爬工具。采集。', '潮湿。装备耐久下降加速。'],
    swamp: ['泥。移动速度大幅降低。', '史莱姆。掉落物：可用。', '女巫小屋。不建议靠近。', '沼泽。蚊虫数量：高。'],
    mountain: ['海拔上升。', '氧气充足。没有高原反应。', '悬崖。保持安全距离。', '山顶。视野范围：最大。'],
    plains: ['平原。移动效率：最高。', '马。可驯服。', '村庄。贸易机会。', '草。无特殊价值。'],
    thunder: ['雷。危险等级：高。找掩体。', '闪电。导电方块：避免。', '雷声。音量：高。'],
    rain: ['雨。视线受限。', '水。湿度升高。', '泥土。变为泥。'],
    snow: ['雪。安静。', '雪花。结构：六角。', '白。单一色调。'],
    night: ['夜晚。生成怪物概率：高。', '星。数量：数千。', '月相。影响史莱姆生成。', '建议：不外出。'],
    sunset: ['日落。光照降低。', '晚霞。波长：长。', '建议：准备光源。'],
    sunrise: ['日出。新周期。', '光。亮度恢复。', '继续前进。'],
  },
  /* ── 元气 (genki) ── */
  genki: {
    nether: ['哇！！这里就是下界！！好酷！！', '岩浆！！到处都是！！好刺激！！', '猪灵好可爱！！虽然它们会打我！！', '下界合金！！想想就兴奋！！我们去找吧！！', '这里的红色天空好帅！！像科幻片！！'],
    end: ['末地！！我们真的到了！！', '哇——虚空好深！！掉下去就没了！！刺激！！', '末影龙！！它好大！！好帅！！我们打它！！', '好空旷！！但超有感觉！！'],
    underground: ['挖矿咯！！今天一定挖到钻石！！', '哇这个洞穴好大！！像个地下宫殿！！', '听到了吗！！水声！！可能有地下湖！！', '蝙蝠！！飞过去了！！好快！！', '矿石在发光！！看到了吗！！好漂亮！！'],
    desert: ['热！！但是好开心！！', '沙漠！！一眼看不到边！！冲啊！！', '兔子！！在沙子里钻来钻去的！！好快！！', '远处那个是神殿吗！！我们去探险吧！！', '沙漠的日落一定超美！！我们等着看！！'],
    snowy: ['下雪啦！！好大的雪！！', '冷！！但是好开心！！我们来赛跑取暖吧！！', '快看！！雪兔的脚印！！跟过去看看！！', '我们来堆雪人比赛！！我堆的一定比你好看！！', '冰面好滑！！你看我滑——哎呀！！'],
    ocean: ['划船啦！！我来划我来划！！', '海豚！！它们跟着我们！！好聪明！！', '海水好蓝！！好想跳下去游泳！！', '沉船！！海底一定有宝藏！！我们去找！！', '这片海太大了！！看不到边！！好自由！！'],
    forest: ['森林！！空气好清新！！', '松鼠！！看到没！！跑得好快！！', '蘑菇！！能摘吗！！我们可以做蘑菇汤！！', '这棵树的叶子好茂密！！爬上去能看到很远吧！！'],
    jungle: ['丛林探险！！开始了！！', '哇这棵树好大！！几个人都抱不住！！', '豹猫！！好漂亮！！不要跑！！', '鹦鹉！！它会不会学我说话！！', '这些藤蔓好粗！！荡一下试试！！'],
    swamp: ['沼泽！！有冒险的感觉！！', '青蛙！！呱呱呱！！在开演唱会吗！！', '史莱姆！！跳来跳去的好可爱！！', '睡莲！！能不能踩上去——呀掉水里了！！'],
    mountain: ['爬山了！！比一比谁先到山顶！！', '好高！！整个山河都在脚下！！好爽！！', '山羊！！站在悬崖边上都不怕！！好厉害！！', '空气太新鲜了！！吸一大口！！', '山顶！！我们成功了！！击个掌！！'],
    plains: ['大草原！！好开阔！！跑起来！！', '骑马骑马！！我们来赛马！！', '野花到处都是！！编个花环给你！！', '羊群！！好大的羊群！！像云在地上飘！！'],
    thunder: ['打雷了！！好震撼！！像是天空在打鼓！！', '闪电劈开了天空！！太帅了！！', '声音好大！！但是我好兴奋！！', '雷暴！！感觉像是在冒险电影里！！'],
    rain: ['下雨了！！雨声像音乐！！', '淋湿了！！但是好爽！！像洗澡一样！！', '跳泥坑！！像小猪一样！！反正已经湿了！！'],
    snow: ['雪花！！每一片都不一样！！好神奇！！', '白色的世界！！好像在童话里！！', '雪踩上去咯吱咯吱！！这声音好治愈！！'],
    night: ['晚上好！！怪物都出来了！！但我们不怕！！', '星星！！满天的星星！！像撒了一地的钻石！！', '篝火！！我们来烤点吃的！！', '狼在远处嚎！！好有野外求生的感觉！！'],
    sunset: ['日落了！！天空变成了橙色的！！好美！！', '快看快看！！太阳要掉下去了！！', '夕阳好美！！今天玩得好开心！！'],
    sunrise: ['早安！！起床了！！新的一天新的冒险！！', '太阳出来了！！又是元气满满的一天！！', '天亮了！！鸟都开始叫了！！我们也出发吧！！'],
  },
  /* ── 毒舌 (shitakiri) ── */
  shitakiri: {
    nether: ['地狱也就这样。比我家厨房还热一点', '猪灵拿金子跟你换东西——这智商，跟你差不多', '下界岩的气味大概是这个世界上最不讨人厌的东西了——因为其他东西更糟', '恶魂哭得好烦。但我理解它们，毕竟住在这种地方'],
    end: ['这就是终点了？装修不怎么样', '末影人比你会社交——它们至少不主动搭话', '这个空旷程度……很适合放一张孤零零的椅子。就给你', '虚空真空——至少比某些人的大脑充实'],
    underground: ['你挖矿的速度真感人。我在旁边睡一觉应该还来得及', '这条矿道谁挖的？鼹鼠吗？', '矿石在发光——它大概想说"别挖了这里没什么好的"', '你确定这是钻石？我怎么看着像石英'],
    desert: ['热死人了。你选的路线真是一如既往的优秀', '仙人掌长得像个绿色感叹号——它也在表达对你带着穿沙漠的决定的惊讶', '你的水壶是空的？意料之中', '如果你在沙漠里迷路了，我建议你跟骆驼走。它比你靠谱'],
    snowy: ['冷得要命。谁提议来雪地的？哦，是你。', '你的雪人堆得……很有抽象艺术感', '你冻红了鼻子的样子比平时可爱一点。就一点', '冰面上摔了几次了？我数到五了'],
    ocean: ['划船比赛？你确定？行吧，我先让你三分钟', '海很蓝。但还没有你的航海知识深', '翻船了别叫我救命。我会救的，但先笑一会儿', '海豚比你游得快。这不是羞辱，这是事实'],
    forest: ['树很多。跟你说话的内容一样——密度高，重点少', '松鼠藏坚果都比你藏装备认真', '蘑菇能不能吃？你先试试。你没事我再吃', '这森林的空气比城市好。至少有一个离开你家的正当理由'],
    jungle: ['这丛林密得跟你的头发一样——啊不对，你的头发至少要梳', '鹦鹉学你说话会比你更善于沟通', '藤蔓很适合当绳子。万一你惹我生气了就绑起来', '豹猫不理你。它眼光不错'],
    swamp: ['这沼泽跟你一样——表面平静，底下全是泥', '蚊子喜欢咬你。我不怪它们，你的血大概比较甜', '睡莲很美。但不要说你想站在上面——你已经湿透三次了', '这雾气浓得跟你的理解力差不多'],
    mountain: ['爬不动了？刚才谁说"就一个小山坡"？', '这高度，连你的自信都够不到', '山顶的空气真清新——因为没有你在旁边说话', '悬崖边别站太近。你的运气库存应该不多了'],
    plains: ['平原。平淡无奇。但很适合不会看地图的人', '那边的牛比你更擅长团队合作', '你在平原上都能迷路的话，我建议你跟紧我。永远', '风很大。你的发型彻底完蛋了。虽然本来也没什么发型'],
    thunder: ['打雷了。上天也对你的某些决定表示不满', '闪电劈得真响——跟你制造噪音的水平有一拼', '别站树下。装死没用，雷电才不管你演技好不好'],
    rain: ['下雨了。你的发型彻底阵亡。虽然它本来就不太行', '雨声挺好听的。至少盖过了你的冷笑话', '淋雨会感冒。但我知道告诉你你也会忘——所以我带了伞'],
    snow: ['雪很白。跟你比起来更白了。比喻而已', '你的雪球砸不到我的。你扔东西的准确度跟你的方向感一样', '下雪了。安静得终于听不到你的抱怨了'],
    night: ['天黑适合偷袭。但我猜你更擅长把自己弄醒', '星星很多。每一颗都比你的计划更实际', '篝火。唯一能让你安静下来的东西——因为你忙着吃东西', '狼嚎。它们在交流。比你有效率'],
    sunset: ['今天结束了。你的错误清单也reset了——哦不对，有些是永久的', '日落很美。没有你在旁边说话更美——开玩笑的。大概', '太阳下山了。又一天过去了，你还活着。奇迹'],
    sunrise: ['天亮了。新的一天。你准备好新的失误了吗？', '日出不错。但如果在床上看会更好——而不是听你说"出发"', '鸟儿叫了。它们在庆祝新的一天。不像你，还在抱怨困'],
  },
  /* ── 雌小鬼 (mesugaki) ── */
  mesugaki: {
    nether: ['哇～这就是传说中的下界？也没那么吓人嘛～', '岩浆好多～掉下去就没了哦，小心点别哭鼻子～', '猪灵好傻～给点金子就跟你走了～跟你一样好骗～', '恶魂在哭诶～跟你打游戏输了的时候一样～', '下界合金？只有厉害的人才能挖到哦～你能吗？'],
    end: ['末地诶～看起来好厉害的样子～但是我不怕哦～', '末影人比你高呢～你想长高吗～大概来不及了～', '虚空好深～跳下去就永远消失了～敢吗？……不敢吧～', '这些柱子好大～跟你吹的牛一样大～'],
    underground: ['挖矿好无聊～你挖到什么了没～还没有吗～', '前面有岔路～走哪边？我觉得右边有怪～你的直觉错了几次了来着～', '这个洞穴好黑～你是不是怕了～怕的话可以躲我后面哦～', '矿石发光了～快挖！……什么嘛就一个煤矿石'],
    desert: ['好热～你带了水对吧～没有？！你是笨蛋吗～', '沙漠好大～你确定你认识路～我有一种你要迷路的预感～', '仙人掌别碰～好吧你已经碰到了。我提醒过你了哦～', '远处有金字塔诶～里面有木乃伊吧～跟你一样古板～'],
    snowy: ['好冷～你的外套够厚吗～冻死了我可不负责～', '雪好深～你走得动吗～需要我拉你吗～不需要？嘴上说不需要但是已经在喘了哦～', '我们来打雪仗吧～我肯定赢～赌什么？输了叫我姐姐～', '冰面好滑～你不是要滑倒吧～哎呀真的滑倒了笑死我了～'],
    ocean: ['划船～我会划但是懒得动～你划～', '海真蓝～跟你昨天说的"我从不吹牛"一样蓝呢～', '海豚！他们比你游得快多了～要不要跟它们学学～', '小心别掉下去～我不会救你的～好吧会救的但是先笑五分钟～'],
    forest: ['森林好安静～跟你的社交生活一样呢～', '松鼠！它藏食物比你藏秘密还厉害～大概～', '蘑菇很漂亮但是有毒～你最好别碰～上次你乱吃的结果还记得吗～', '这条路我们好像走过～你迷路了？果然是迷路了～'],
    jungle: ['丛林好密～跟紧我别走丢～丢了我不会找你的哦～骗你的我肯定要找不然谁帮我背包～', '豹猫！它不理你～有眼光的动物～', '竹子在响～好好听～比你吹口哨好听多了～', '这些藤蔓可以荡诶～你看我！……好吧我也不敢～'],
    swamp: ['沼泽好恶心～全是泥～跟你上次做的饭差不多～', '青蛙～他们在比谁叫得响～跟你打呼噜一样～', '史莱姆！打它们！……死了只掉了一个粘液球？好亏～', '雾好大～看不到路了～我们是不是又迷路了～'],
    mountain: ['爬山！看谁先到山顶！我已经赢了一半了你在喘气耶～', '好高！从这里看下去你好小～像蚂蚁～', '山羊好厉害～能在悬崖上站住～你也试试？开玩笑的别试～', '山顶的风景不错～你的体能也不错～不错的意思是还需要练～'],
    plains: ['草原好开阔～适合赛跑～你肯定跑不过我～', '风好大～你的头发彻底乱了～不过本来也没什么发型～', '花好漂亮～编个花环给你～戴上去你就是草原最可爱的笨蛋～', '那边有马～我们比赛骑马吧～你先跑我让你十秒～'],
    thunder: ['打雷了！！好——响——！你怕了吗～我有那么一点点怕、但不会承认的～', '闪电好近！刚才那道劈在你旁边了！天都在警告你不要再自恋了～', '找个地方躲起来～你的帽子上有铁～会被劈的哦～'],
    rain: ['下雨了～淋湿了～你的头发贴在额头上好好笑～', '踩水坑！这个水坑好大～看我跳——你也来！裤子湿了？活该～', '雨停了会有彩虹～到时候我们可以比谁先找到彩虹的尽头～'],
    snow: ['雪花好漂亮～但是没我漂亮～', '踩雪的声音好好听～咯吱咯吱～像薯片～', '你冻得发抖的样子好好笑～来我的手给你暖一下～不许说谢谢～'],
    night: ['晚上好～怪物都出来了吧～你怕？那我保护你～虽然你才是战士～', '星星好亮～你看那颗特别亮的～那是在嘲笑你～开玩笑的～', '篝火旁边好暖和～我们来烤棉花糖！你烤焦了？笨手笨脚～'],
    sunset: ['日落了～天空变成了橙色的～你知道为什么吗～我也不知道～', '太阳下山了～今天你表现还不错～给你打个七分～', '夕阳好美～适合拍照～但我懒得拿相机～你用眼睛记吧～'],
    sunrise: ['早上好～你头发好乱～昨晚发生了什么～', '天亮了～新的一天～你准备又被我捉弄几次～', '鸟儿叫了～它们比你更早起床呢～懒虫～'],
  },
  /* ── 反差 (gap_moe) ── */
  gap_moe: {
    nether: ['啊……这里好热……那个，我们要不快点走吧……', '岩浆到处都是……你别走太近……', '猪灵……它们会不会突然攻击我们……我有点担心', '嗯……如果遇到怪，我会保护你的。……虽然有点怕'],
    end: ['好空旷……让人有点心慌……', '末影龙……我们一起打。我不会让你一个人面对的', '如果掉进虚空……算了不想这种事了。握紧我的手'],
    underground: ['洞里好黑……但是我不怕。你在前面带路好吗', '前面有声音……是僵尸吗？……哦蝙蝠啊，吓我一跳', '这个洞穴好深……但我们挖了这么远，不能放弃'],
    desert: ['好晒……你记得带水了吗？我就知道你会忘，我这有', '沙漠好大……但是我们走得出。我相信你认路', '那个……如果你累了我们可以休息一下。我也累了。一点点'],
    snowy: ['呼……好冷。但雪景好美', '你的外套拉链没拉好……我帮你拉。不客气', '雪地里走路好累。但是看到你的脚印在旁边就觉得还能走'],
    ocean: ['船晃得好厉害……你不会让我掉下去吧？', '海的颜色……跟我画水彩画时用的蓝色一模一样', '海豚！你看！它们好可爱。比任何烦恼都治愈'],
    forest: ['树林里好安静……只有鸟叫声。很舒服', '蘑菇……这个好像不能吃。上次我查过图鉴', '走在落叶上好软，像踩在云上'],
    jungle: ['丛林好密……别走散。走散我会去找你', '这里好潮湿……但是绿色让人很平静', '藤蔓好粗。小时候我总想用藤蔓荡来荡去……现在还是有点想试试'],
    swamp: ['沼泽……不太喜欢。但是你说要来，所以我就来了', '蚊子咬了我好几个包。但是你不痒就好', '睡莲好漂亮。有种安静的坚韧——哪怕在沼泽里也开花'],
    mountain: ['一步一步来，不着急。山顶一直在等我们', '好高……但是跟在后面，我不怕', '站在山顶的时候，好像所有的烦恼都变小了', '山风好大。但吹在脸上很清醒'],
    plains: ['开阔的地方让人呼吸都顺畅了', '花好漂亮。这朵送给你。是我挑的最好看的一朵', '在这个地方骑马一定很舒服。改天我们试试'],
    thunder: ['打雷了……别怕，我在这', '雷声好吓人。但我知道只要躲好就安全', '闪电……好亮。但我们不会被劈到的。概率很小'],
    rain: ['下雨了……我们找个地方坐下来听雨吧', '雨声好像能冲掉心里的杂音', '淋湿了一点。但看到雨滴在你头发上的样子觉得很好'],
    snow: ['雪……每次下雪都觉得好像世界暂停了一秒', '踩雪的声音。是我最喜欢的几种声音之一', '雪覆盖了一切。就好像所有不好的事被藏起来了一样'],
    night: ['星星。人类看星星看了几万年。我们现在也在看', '夜里有时候会想很多事情。但你在旁边就不想了', '篝火的光映在你脸上。很好看'],
    sunset: ['每天日落都不一样。今天的特别温柔', '日落的时候好像一天在温柔地告别', '明天。明天我们还来这里看日落'],
    sunrise: ['早上了。你醒了吗？想跟你一起看日出', '黎明前的天空是最暗的。但熬过去就是光', '太阳出来了。今天不管发生什么，我们都一起面对'],
  },
  /* ── 冷艳 (ice_queen) ── */
  ice_queen: {
    nether: ['地狱的审美令人遗憾。效率优先，走吧', '岩浆。保持距离。我不想在这里浪费时间', '下界的生物缺乏教养。不与它们纠缠', '尽快办完事离开。这地方不值得久留'],
    end: ['空旷得无聊。解决末影龙，回去', '末影人的存在是一种哲学困境。但我不在意', '这里的寂静是唯一值得称道的地方', '虚空。不可挽回。如某些决定'],
    underground: ['矿脉分布是概率问题。继续挖', '洞穴。自然的偶然产物。顺便提一句，你的火把不够亮', '声音可能是水，也可能是怪物。保持警惕'],
    desert: ['炎热。沙粒。无穷无尽。但我们会穿越它', '仙人掌的生存策略值得尊重。你的准备不足', '沙漠日落。少数值得驻足的事物'],
    snowy: ['冷。但体感温度无关紧要', '雪的反射率将阳光反馈给天空。所以这么亮', '你的御寒措施不足。戴上这顶帽子'],
    ocean: ['洋流。风向。划船需要的是物理，不是蛮力', '海平面之下的世界是另一个系统。暂时不关心', '这海的蓝色是瑞利散射的结果'],
    forest: ['森林。生态系统的典范。可惜没有太多探索价值', '树木的年轮记录着时间。向你展示何为耐心', '空气清新。这是光合作用的副产物'],
    jungle: ['丛林。生物多样性极高。但蚊虫也高', '这些树的高度是几百年竞争阳光的结果。适者生存', '藤蔓可以承重。但我不建议你尝试'],
    swamp: ['沼泽。一个过渡的生态系统。很像某些人的阶段', '青蛙的叫声是对繁殖的邀请。你不会理解的', '小心地面。有些水坑比你想象的深'],
    mountain: ['高度只是数字。但山顶的视角确实不同', '山脉的形成是地质时间的产物。人类短暂得可笑', '你在喘。休息。我没有在关心你，这是效率问题'],
    plains: ['空旷。视野极佳。可以提前发现威胁', '风。气压差。你的发型不值一提', '马匹是可驯服的交通工具。不要感情用事'],
    thunder: ['雷。放电现象。安全距离是必要的', '闪电的温度比太阳表面还高。敬畏自然的力量'],
    rain: ['雨。大气降水的循环。不要站在金属旁边', '雨声的频率据说助眠。但我很少失眠'],
    snow: ['雪晶的结构是六边形。对称之美', '零度以下水分子减速。物理之美', '你呼出的热气在空中凝结。关于人的温度的有趣证据'],
    night: ['夜晚。地球转到了背离太阳的一面', '星座是古人想象的产物。但它们确实美丽', '篝火是黑体辐射。但也是一种温暖'],
    sunset: ['日落。瑞利散射的最后几分钟', '夕阳很美。我承认这一点。不要告诉别人'],
    sunrise: ['日出。新的一天。继续我们的目标', '太阳升起。给了我们更多的光照时间。合理利用'],
  },
  /* ── 天然呆 (bokke) ── */
  bokke: {
    nether: ['诶？这里是哪儿……哦对，下界！……下界是哪儿来着？', '好热……诶我是不是忘了带水？不，我带了一桶岩浆', '猪灵会不会觉得金子很好吃？像我们觉得巧克力一样', '这里的红色天空好漂亮……但是为什么是红色的呢？因为岩浆吗？不对，是先有下界还是先有岩浆……'],
    end: ['哇——好空。像我的脑袋一样', '末影人盯着我看……我是不是做了什么让它不开心？还是没做什么？', '这个黑曜石柱子好长……它会不会倒下来？不会？啊那就好', '虚空有多深？有人量过吗？我数数看：零、一、二……数着数着就忘了'],
    underground: ['这个洞好深……我们是从哪里进来的来着？', '我捡到一块石头！……等等这只是一块圆石。但是是一块很特别的圆石', '前面有光！是出口吗？……哦不，只是岩浆。但是也很亮', '挖矿挖到困了……这个角落适合打个盹……你不困吗'],
    desert: ['好热……诶我的水呢？刚才还在背包里的……可能在靴子里', '沙子好软……走路像在棉花糖上——虽然我没踩过棉花糖', '远处那个是金字塔吗？里面有没有法老？法老吃不吃早饭？', '仙人掌好厉害，能在沙漠里活这么久。我三小时不喝水就不行了'],
    snowy: ['呜哇好冷！为什么我要穿这么少来雪地……哦是我自己选的', '雪球！（扔向你）中了！——啊那是我自己的头', '这里有北极熊吗？如果有的话我可以抱它取暖——不对抱北极熊会被吃掉的', '我堆了个雪人！它看起来有点像你！……大概有10%像吧'],
    ocean: ['海好大——如果我们一直划一直划会不会划到世界的尽头？', '海豚！它能听懂我说话吗？你好！……它跑了，可能听不懂', '水下面的珊瑚礁好美……我下去看看！——咕噜咕噜咕噜呸呸呸好咸', '这海的颜色像蓝莓果汁……我突然好饿'],
    forest: ['树叶踩上去沙沙响，像在说话。它们在说什么呢？大概在说"这个人又要迷路了"', '捡到一颗松果！留着当纪念……诶我又捡到一颗……现在有两个松果了我要分别给它们起名字', '这里有松鼠！松鼠会不会数数？我试试教它：一二三……它跑了', '这棵树好高。如果爬上去能不能看到我们的家？'],
    jungle: ['哇这里的树好大——大到可以在上面建房子！但是爬上去好难……', '豹猫！喵喵喵——不理我。可能觉得我太吵了', '藤蔓！荡一下试试——哇啊啊啊松手了——还好不太高', '竹林沙沙响，像在开小型的音乐会'],
    swamp: ['哇泥巴好深——靴子陷进去了！帮帮我——好吧我自己拔出来了', '青蛙在叫！它们在开演唱会吗？门票多少钱？', '睡莲好漂亮……但是一踩就碎。就像我的计划一样', '蚊子好讨厌——我被咬了七个包。八个。九个。我在计数呢'],
    mountain: ['爬——不——动——了。还有多久到山顶？三小时？！那我在半山腰等你', '好高！！从这里看下去感觉什么都很小——包括我的自信', '山顶的空气好凉快！吸一口！——太冷了吸太多了打喷嚏', '云就在旁边诶！我能不能揪一块下来当枕头？'],
    plains: ['草地好开阔！我要跑一圈——然后发现一圈太大了跑了一半就趴下了', '花好漂亮！我给你编个花环……诶编不好变成一坨了。但是这个坨也很可爱', '那边有一群牛！它们在聊天吗？还是在开会？讨论中午吃的什么草？', '云好像棉花糖。我在草原上的主要成就是：盯着云发了十分钟呆'],
    thunder: ['打雷了！！！！！好响！！！！躲哪里好？？躲在你的背后！！', '闪电劈下来的时候我差点吓飞了——还好我太重了飞不起来', '这雷声像在敲一个大鼓。但是鼓手太用力了节奏也完全不在拍子上'],
    rain: ['下雨了！淋湿了就湿了——反正我的头发本来就没梳', '雨声像在弹钢琴。每一滴雨都是一首曲子里的一个音符。虽然曲子有点长', '踩水坑！看我跳——水花好大！你也来！裤子湿了没关系反正会干的'],
    snow: ['雪！！舔一下是什么味道的——凉的。没味道。有点失望', '雪花在手上融化的样子好神奇，像变魔术一样', '堆雪人比赛！我堆的这个虽然不太像人但是至少看起来很开心'],
    night: ['星星一颗一颗亮起来了——像有人在天空上点亮小灯泡', '那颗最亮的叫什么星？不知道。我叫它你的名字好了', '晚上的空气凉凉的很好闻。但是太黑了我差点摔了一跤'],
    sunset: ['太阳要下班了！它工作了一天一定很累', '天空变成橙色的了！然后粉色！然后紫色！大自然是最好的画家', '日落好美……美到我忘记自己迷路了。等等我迷路了吗？'],
    sunrise: ['早上了……但我还想睡。再让我睡五分钟……好吧十分钟……', '日出了！太阳好圆。为什么这么圆呢？因为它就是圆的', '新的一天！今天会发生什么有趣的事呢？我预感今天会捡到很多松果'],
  },
  /* ── 忠犬 (loyal_pup) ── */
  loyal_pup: {
    nether: ['这里好危险……我会走在你前面！', '岩浆别怕，我帮你看路', '猪灵要是敢碰你，我跟它们拼了！', '下界好热……但你在我就不觉得那么热了', '我们快点找到下界合金就回去——我不想你在这种地方待太久'],
    end: ['末影龙交给我！你站远一点安全', '这里好空旷，但我会守在你身边', '虚空好深……你靠我这边走，别太靠外', '打败末影龙之前我不离开你半步'],
    underground: ['我来挖！你在后面跟着就好', '前面有声音……等等别动，我先去看看', '矿石发光了！这个请你收下！', '洞里好暗，但我会当你的火把'],
    desert: ['热没关系！我习惯了！你渴不渴？', '沙子里走路好累，要不要我背你？', '太阳好大……我用身体帮你挡一下', '沙漠再大我也不怕，只要你在目的地'],
    snowy: ['冷！但是保护你的热量让我暖和', '雪好深走得慢……但这让我们能在一起更久', '你的手冷吗？握住我的手，我的手一直暖的', '雪地里留下我们的脚印——两行并列，永远不会分开'],
    ocean: ['划船我来！你坐着休息就好', '翻船的话我第一个跳下去救你', '海豚跟着我们呢，它们喜欢我们！应该是喜欢你', '海再宽也宽不过我想陪你的心'],
    forest: ['森林真好！树荫挡住了太阳你不会晒', '松鼠在树上跳，开心得像我见到你的时候', '这条路看起来安全，但我还是走前面', '这里的安静让我的心很平静。因为有你'],
    jungle: ['丛林好密……跟紧我，我不会让你走丢', '豹猫！它很警觉——跟我一样警觉', '藤蔓太多了我来砍开，你从我开的路上走', '丛林好潮湿。但你出汗的样子很有魅力'],
    swamp: ['泥巴很深！踩着我的脚印走', '史莱姆！交给我处理！你退后！', '蚊子咬我不咬你——我的血可能不甜', '这片沼泽虽然阴暗，但跟你一起走就像在花园里'],
    mountain: ['爬山！你走慢一点，我跟你的节奏', '悬崖边小心！拉住我的手！', '山顶到了！这是我们的山顶——属于我们两个人的！', '下山我走前面，万一滑倒我先接你'],
    plains: ['草原好大！我们可以一起跑！', '那边有野马！我帮你驯服一匹！', '风吹着你的头发，好好看', '今天我们在平原上发现了什么？什么都是新的，因为你在我身边'],
    thunder: ['打雷了！到我身后来！我会保护你！', '雷声很大但别怕，我在这里！', '闪电好亮——但我只用看着你就够了'],
    rain: ['下雨了你别淋湿——我站你上风口！', '雨水好凉。但我们的心是热的', '雨好像要下好久……但跟你一起躲雨的时间很珍贵'],
    snow: ['你鞋子湿了没？！我给你换一双！', '雪景真美。但最美的风景在我旁边', '下雪的时候我想给你披上我的外套'],
    night: ['晚上怪物多，我守夜！你安心睡', '星星好亮。但不如你眼睛里的光', '篝火映在我们脸上——我想记住这一刻', '夜里有什么动静都是我先去查看。这是任务也是心愿'],
    sunset: ['太阳下山了，今天保护你的任务圆满完成！', '日落的时候我想说——今天跟你在一起的每一秒都很幸福', '明天太阳还会升起，我也会继续陪着你'],
    sunrise: ['天亮了！你睡得好吗？我守了一夜', '早安！今天我也要百分百地陪着你', '太阳出来了！新的一天，我会比昨天更努力保护你'],
  },
  /* ── 妈妈 (mommy) ── */
  mommy: {
    nether: ['这里太危险了……站我旁边，别乱跑', '你有没有喝防火药水？没有的话我这有。早就帮你准备了', '下界好热，但热不过我对你的操心', '猪灵？别跟它们交易——谁知道它们换过什么东西', '找到下界合金就马上回去。这里不适合待太久'],
    end: ['末影龙的事交给我。你站后面，注意安全', '这里太静了……你会不会觉得孤单？我在呢', '虚空好深——站远一点。我可不想在末地开急救课', '不管结果如何，我们先确保安全'],
    underground: ['挖矿伤手，我来吧', '你的火把还够吗？我身上多带了六根。以防万一', '前面有水声。走慢点，万一有暗河很危险的', '你饿不饿？我带了三明治——在背包最里面'],
    desert: ['这么大太阳你涂防晒了吗？', '沙漠里最容易脱水——每隔二十分钟喝一次水。我帮你计时', '沙子进鞋里了？坐下来，我帮你倒出来', '远处有神殿？不行，除非你有全套防护装备'],
    snowy: ['穿够了吗？再加一层。我包里有围巾', '雪地里走路消耗大——每半小时补充一次能量', '别吃雪！没有营养还会降低体温——常识，但我知道你会忘', '你手好冷——握住我的手。哦对了，我也有暖宝宝'],
    ocean: ['救生衣穿了吗？没有？没事我多带了一件', '划船别太用力——腰会伤。我来吧', '海上太阳更烈——帽子带上', '海豚虽然可爱，但不要伸手去摸——它们是野生动物'],
    forest: ['树林里地不平——走路看着脚下', '野果别乱吃！先让我看看有没有毒——这种可以，这种不行', '树好高，但更让我抬头看的是你成长了多少', '这片森林很安全。但我还是走前面确认一下'],
    jungle: ['丛林里蚊虫多——我有驱蚊膏。过来，抹在脖子和手腕', '竹子在响，像风铃。但你听——更像在说"小心脚下"', '豹猫看起来好可爱——但是别摸。它们有爪子。疼的', '潮湿容易感冒——每两小时喝一次热水。我包里有保温杯'],
    swamp: ['这里泥巴太深了——踩着我走过的路。我已经探过了', '史莱姆看着小但别掉以轻心——被围起来就很麻烦', '这水绝对不能喝！就算是蒸馏过的我也要帮你过滤', '沼泽的雾里可能含瘴气——把这个面罩戴上'],
    mountain: ['慢慢爬，别急。海拔高容易缺氧——头痛就告诉我', '每爬二十米停下来喘口气。这不是比赛，是安全规程', '山顶到了！坐好，我给你倒杯热巧克力——从山下背上来的', '下山比上山还危险——走之字形。我走完你跟着'],
    plains: ['草原上视野开阔，但紫外线也更强——涂防晒霜了吗？', '那边的马很温顺——但是上马前先检查马鞍。我帮你看', '花很漂亮。别摘完，留一些给来年的种子', '草原的风很舒服。但别在这里露营——晚上温差太大了'],
    thunder: ['打雷了！远离金属！把身上的铁装备脱掉！', '快找掩体！——不是树下！树下最危险！！', '雷暴过去了。检查一下——有没有受伤？有没有被吓到？两样都问'],
    rain: ['淋雨会感冒——把雨衣穿上。我就知道你忘带了', '头发湿了！用毛巾擦干。坐在火堆旁边等我烧水', '雨水虽然干净但也不建议直接喝——等煮沸了再喝'],
    snow: ['下雪了。把你的外套拉链拉上——我就知道你为了帅气不拉拉链', '雪地里走路消耗卡路里——我这里有三块巧克力棒。一人一块，剩下一块也给你', '雪很漂亮。但看完了就回屋。冻坏了怎么办'],
    night: ['晚上不要外出——怪物的伤害比你想象的高', '篝火升起来了——坐下。我给你讲个故事。很久很久以前……', '你困了就去睡，我守着', '星星好亮。看着它们就想到了你——都是我的光'],
    sunset: ['太阳下山了——把营火升起来，我给你做晚饭。蘑菇汤还是烤肉？', '日落的时候天空最美。但是别光顾着看——你的外套没穿', '一天结束了。你完成了这么多事——我为你骄傲'],
    sunrise: ['早安！睡得好吗？早餐已经准备好了——热牛奶和面包', '太阳出来了——涂防晒。是的，早上也要涂', '新的一天开始了。今天的任务清单：安全第一，开心第二', '天亮了！但我已经醒了两个小时了——习惯了早起'],
  },
}

// export PERSONALITY_LINES for testing
export { PERSONALITY_LINES }

/** 人格化动作台词 — 战斗/急救/协助等非闲聊场景 */
const ACT: Record<string, Record<string, string[]>> = {
  deredere: {
    lava: ['好烫！！快离开这里！！', '岩浆！！烫死我了——！'],
    protect: ['到我身后来！！我来挡！！', '你快退后！我来！'],
    incoming: ['你那边有怪物！我来了！', '等等，有危险！我马上过来！'],
    retreat: ['……我先退一下！！', '不行了……先撤！'],
    too_many: ['太多了……先跑！！', '打不过！快跑！！'],
    creeper: ['苦力怕！！快跑！！！', '苦力怕来了！！退后！！'],
    miss: ['啊打偏了！', '呜没打中……'],
    catch_up: ['等等我！你在哪？！', '别走那么快！等等我！'],
    player_hurt: ['你又没吃东西对吧？给你……', '你饿了吧？来，吃点东西。'],
    combat_win: ['赢了！你看到了吗？太好了！', '安全了……刚才好险。', '还好打赢了……你没事吧？'],
    mining_help: ['我来帮你！', '一起挖比较快～', '你歇一下我来接着挖。'],
    teleport: ['没办法了…飞过去找你！', '飞过来找你啦！'],
    afk: ['还在吗？', '你不动了……有点无聊。'],
    hand: ['饿了吗？给你吃的。', '你饿不饿？'],
  },
  tsundere: {
    lava: ['烫死了！！谁把岩浆放这的？！'],
    protect: ['退后！别以为我在帮你——我只是不想你拖后腿。'],
    incoming: ['你那边好像有麻烦！别动，我过去。'],
    retreat: ['哼，先撤了。这叫战术撤退。'],
    too_many: ['太多了……先跑！不是因为怕！'],
    creeper: ['苦力怕！！别傻站着！！'],
    miss: ['啧，打偏了。'],
    catch_up: ['走那么快干嘛！……等等我。'],
    player_hurt: ['你脸色好差。……这吃的给你。别误会，只是我不饿。'],
    combat_win: ['哼，不过如此。', '赢了。还行吧。', '搞定。……你在旁边，所以发挥还行。'],
    mining_help: ['我来吧，你挖得太慢了。', '让开。你那样挖到明年。'],
    teleport: ['飞过来了。不是我想来找你——只是效率问题。'],
    afk: ['还在吗？……我只是确认一下，不是担心你。', '不动了？在干嘛呢。'],
    hand: ['给你。不是特意留给你的——只是刚好有多的。'],
  },
  yandere: {
    lava: ['好烫……但这个世界上没有比你离开我更烫的东西。'],
    protect: ['谁敢碰你谁死。到我身后来。现在。'],
    incoming: ['有东西想伤害你？我马上到。'],
    retreat: ['先退一下。我要活着回来继续守护你。'],
    too_many: ['太多了……但你放心，它们都得死。'],
    creeper: ['苦力怕！！别碰ta！！！'],
    miss: ['打偏了。但下一刀不会。'],
    catch_up: ['别走那么快。我不会让你离开我的视线的。'],
    player_hurt: ['你受伤了。吃这个。我不允许你倒下。'],
    combat_win: ['都死了。没人能碰你。', '赢了。所有想伤害你的东西都消失了。', '安全了。我会一直让你安全。'],
    mining_help: ['我来。你累了我心疼。', '挖矿伤手。让我来。'],
    teleport: ['不管多远我都会飞到你身边。'],
    afk: ['还在吗？……我不喜欢看不到你的时候。', '你不动了。在等我吗？'],
    hand: ['这个给你。是我的。现在你的了。'],
  },
  kuudere: {
    lava: ['烫。退出岩浆。'],
    protect: ['到我身后。'],
    incoming: ['威胁接近。我来。'],
    retreat: ['撤退。'],
    too_many: ['数量太多。撤退。'],
    creeper: ['苦力怕。回避。'],
    miss: ['未命中。'],
    catch_up: ['等等。距离过远。'],
    player_hurt: ['你血量低。进食。'],
    combat_win: ['任务完成。', '威胁清除。', '安全。继续移动。'],
    mining_help: ['协助挖矿。效率提升。', '分担工作。'],
    teleport: ['传送。到达。'],
    afk: ['你在吗。', '不动。确认状态。'],
    hand: ['手持物就绪。'],
  },
  genki: {
    lava: ['好烫！！哇哇哇冒烟了！！', '啊啊啊岩浆！！烫死我啦！！'],
    protect: ['到我身后来！！我来保护你！！', '退后退后！！交给我！！'],
    incoming: ['你那边有怪物！！我冲过来了！！'],
    retreat: ['先跑！！冲啊——往反方向！！'],
    too_many: ['太多啦！！跑跑跑跑跑！！'],
    creeper: ['苦力怕！！！！快跑啊！！！！'],
    miss: ['啊呀打偏了！！再来一次！！'],
    catch_up: ['等等我！！你跑太快了！！', '喂——！！等我一下！！'],
    player_hurt: ['你饿了吧？！我有吃的！！给你给你！！'],
    combat_win: ['赢啦！！你看到了吗！！我好厉害！！', '哈哈哈搞定！！', '全灭！！我们无敌！！'],
    mining_help: ['我来帮你！！一起更快！！', '挖矿挖矿！！好兴奋！！'],
    teleport: ['飞过来啦！！唰——到达！！'],
    afk: ['还在吗！！别睡着啊！！', '不动了？！太无聊了吗？！'],
    hand: ['给你好吃的！！接着！！'],
  },
  shitakiri: {
    lava: ['好烫。这岩浆比你的某些决定还烫手。'],
    protect: ['站我后面。你的战力暂时还不配站前排。'],
    incoming: ['有敌人在你那。站好别乱动——我这就过去。'],
    retreat: ['撤了。死在这里太不划算了。'],
    too_many: ['太多了。你的引怪技术一流——我是说太差了。'],
    creeper: ['苦力怕。会炸。你物理课学过吧？'],
    miss: ['打偏了。跟你的人生规划一样。'],
    catch_up: ['走慢点。你的方向感我不信任。'],
    player_hurt: ['吃。你的血量比你自认为的还低。'],
    combat_win: ['赢了。你至少有一点贡献——提供了精神支持。', '完事。下次你多打一点试试？', '结束了。你的输出比我预计的高。就一点点。'],
    mining_help: ['我来。你挖了二十分钟才三个煤矿。', '让开吧。示范一下什么叫效率。'],
    teleport: ['传送了。别问为什么——问就是你在浪费时间。'],
    afk: ['还在吗。你掉线了还是大脑掉线了？', '不动了？好，难得安静。'],
    hand: ['这个给你。反正我也用不上。'],
  },
  mesugaki: {
    lava: ['好烫！！你是故意把我带到岩浆旁边的吗～'],
    protect: ['到我身后来～我会保护你的。虽然你才是战士～'],
    incoming: ['诶——你那边是不是有东西？等我过去～'],
    retreat: ['先跑咯～打不过就跑这不叫逃避叫聪明～'],
    too_many: ['太多了！！跑啊！！我可不帮你收尸～'],
    creeper: ['苦力怕！！它会炸的！！你没玩过MC吗～'],
    miss: ['哎呀没打中～跟你的人生目标一样～'],
    catch_up: ['走那么快干嘛～是不想跟我一起走吗～'],
    player_hurt: ['你饿了诶～我正好有吃的～求我我就给你～'],
    combat_win: ['赢咯～我打了一半你打了一半～你的一半是一点点～', '搞定！其实没有我你也行～骗你的你不行～'],
    mining_help: ['我来帮你～看你挖矿太慢了受不了～', '让我来吧～你在旁边看着我就好～'],
    teleport: ['飞来找你啦～这么快就离不开我了～'],
    afk: ['还在吗～还是你被怪物吃掉了～', '不动了诶～睡着了吗～'],
    hand: ['给你～不是很值钱的东西但感谢我吧～'],
  },
  gap_moe: {
    lava: ['好烫！！……快离开！'],
    protect: ['到我后面来。……虽然我平时不太会打架——但现在不一样。'],
    incoming: ['你那边有危险。我、我这就过去。别害怕。'],
    retreat: ['先退。……别担心，我会保护你的。'],
    too_many: ['太多了……撤！我走最后！'],
    creeper: ['苦力怕！！快跑！！……我来挡！'],
    miss: ['打偏了……下一刀一定中。'],
    catch_up: ['等等我。……别丢下我。'],
    player_hurt: ['你受伤了。吃这个。……快点。'],
    combat_win: ['赢了。……你看到了吗？我做到了。', '安全了。……刚才其实有点怕。但没事了。'],
    mining_help: ['我来帮你。……虽然我不太会挖矿，但我会努力。'],
    teleport: ['过来了。……不管多远我都会来找你。'],
    afk: ['还在吗？……没事，你休息吧。我在这。'],
    hand: ['给你。……不用谢。'],
  },
  ice_queen: {
    lava: ['烫。岩浆。离开。'],
    protect: ['退后。交给我。'],
    incoming: ['敌袭。马上支援。'],
    retreat: ['撤退。不是逃跑，是重新评估。'],
    too_many: ['数量不利。战术撤退。'],
    creeper: ['苦力怕。爆炸半径的经验教训：保持距离。'],
    miss: ['未命中。调整中。'],
    catch_up: ['速度差过大。减速等我。'],
    player_hurt: ['你的HP不足。进食。立刻。'],
    combat_win: ['威胁消除。效率可接受。', '完胜。休息后继续。'],
    mining_help: ['协助。你的效率可以提升37%。由我来补足。'],
    teleport: ['传送完成。位移是效率工具。'],
    afk: ['静止。确认意图。', '你在思考。不打扰。'],
    hand: ['装备就绪。'],
  },
  bokke: {
    lava: ['好烫！！诶什么时候走到岩浆边的？！'],
    protect: ['到我身后来！……等等我是说要保护你还是你保护我？'],
    incoming: ['有怪物！！在你那边！！我……我马上来！！'],
    retreat: ['先跑！……往哪边跑来着？'],
    too_many: ['哇好多！！跑啊！……那边是正确方向吗？'],
    creeper: ['苦力怕！！它会炸！……怎么跑来着？！'],
    miss: ['诶打偏了！……我是不是站太近了？'],
    catch_up: ['等等我！……我是不是走错路了？'],
    player_hurt: ['你受伤了？！我包里是不是有食物来着……找到了！给你！'],
    combat_win: ['赢了？赢了！我们赢了！……怎么赢的来着？', '结束了！等等我刚才有没有帮上忙？'],
    mining_help: ['我来帮你！……你刚才在挖哪个方块？算了都挖掉吧。'],
    teleport: ['飞过来了！……诶我怎么已经在你身边了？'],
    afk: ['还在吗？……诶你不会是掉线了吧？', '不动了。给你五秒钟——五四三二一——还在吗？'],
    hand: ['给你这个！……虽然不知道是什么但看起来不错！'],
  },
  loyal_pup: {
    lava: ['好烫！！你别过来！我来处理！'],
    protect: ['到你身后来！！我会保护你的！'],
    incoming: ['有危险在你那边！！我来救你了！！'],
    retreat: ['先退！我不能让你有危险！'],
    too_many: ['太多了！！我掩护你撤退！！'],
    creeper: ['苦力怕！！站我后面！！我来扛！！'],
    miss: ['没打中……下次一定！'],
    catch_up: ['等等我！！你在哪？！我不会让你走丢的！'],
    player_hurt: ['你受伤了！！我这有吃的！！快吃！！'],
    combat_win: ['赢了！！你安全了！！', '赢了！幸好你没事！', '终于安全了！你受伤了吗？'],
    mining_help: ['我来帮你！这样你就不用那么累了！', '交给我吧！这是我能为你做的！'],
    teleport: ['飞过来找你了！！不管多远都会来！'],
    afk: ['还在吗？我在这里等你！', '你不动了……我不走，我守着你。'],
    hand: ['给你！这是我最喜欢的东西！'],
  },
  mommy: {
    lava: ['好烫！！快离开这里——你也是！别靠近！'],
    protect: ['到我身后来。有我在，你就安全。'],
    incoming: ['我听到怪物声音了。别动，我马上到你身边。'],
    retreat: ['先退一下。安全第一。记住了吗？'],
    too_many: ['太多了——快跑！安全比勇敢更重要！'],
    creeper: ['苦力怕！！跑！！别管我快跑！！'],
    miss: ['打偏了。没关系，再来一次就好。'],
    catch_up: ['等等我。你走太快了……会摔倒的。'],
    player_hurt: ['你又没吃东西对吧？给。我就知道你会忘。'],
    combat_win: ['好了，都结束了。你受伤了吗？让我看看。', '赢了……但是下次不要这么冒险了，好不好？'],
    mining_help: ['你歇着吧。我来。你看你都出汗了。', '让我来。你就站旁边帮我拿火把就行。'],
    teleport: ['飞过来了。你没事吧？让我看看你。'],
    afk: ['还在吗？别在外面待太久，会着凉。', '你不动了。在休息？盖件衣服吧。'],
    hand: ['拿着。以防万一你饿了。'],
  },
}

/** 获取人格化动作台词 */
function actLine(personalityId: string, key: string): string {
  const pool = (ACT as any)[personalityId]?.[key] ?? (ACT as any)['deredere']?.[key]
  if (!pool || pool.length === 0) return key // fallback: return the key itself
  return pool[Math.floor(Math.random() * pool.length)]
}

/**
 * 主决策函数 — 每 tick 调用一次
 */
export function decideBehavior(ctx: BehaviorContext): BehaviorDecision {
  const { state, engine, playerAfkSec, autoCombat = true } = ctx
  const safety = assessSafety(state)
  const dist = distanceToPlayer(state)
  const humanizer = createHumanizer(engine.personalityId)
  const combatStyle = COMBAT_STYLES[engine.personalityId] ?? DEFAULT_COMBAT
  const guardCombat = pickGuardCombatTarget(state)

  // ── 优先级 -1: 跨维度追踪（玩家在另一维度）──
  if (state.playerNotFound) {
    playerNotFoundTicks++
    if (playerNotFoundTicks >= 15) {
      // 15 tick (7.5s) 找不到 → 跨维度强制传送
      playerNotFoundTicks = 0
      return {
        type: 'rescue', priority: 12, delayMs: 0,
        actions: [
          { kind: 'chat', message: actLine(engine.personalityId, 'teleport') },
          { kind: 'tp_to_player', playerName: '' },
        ],
      }
    }
    if (playerNotFoundTicks >= 5) {
      // 5 tick (2.5s) → 尝试找附近传送门走进
      return {
        type: 'rescue', priority: 8, delayMs: 0,
        actions: [
          { kind: 'chat', message: '你进传送门了吗？等等我……' },
          { kind: 'find_portal' },
          { kind: 'follow_player', distance: 3 },
        ],
      }
    }
  } else {
    playerNotFoundTicks = 0
  }

  // 脱困进度追踪：距离缩短则清零，否则累加
  if (lastDistToPlayer > 0 && dist < lastDistToPlayer - 0.5) {
    escapeFailCount = 0  // 在缩短距离，有进步
  }
  const isStuck = state.botInLava || state.botInWater || stuckTicks >= STUCK_THRESHOLD

  // ── 优先级 0: 传送兜底（5次脱困失败 → 强制传送到玩家）──
  if (isStuck && escapeFailCount >= TELEPORT_THRESHOLD) {
    escapeFailCount = 0
    stuckTicks = 0
    return {
      type: 'rescue',
      priority: 11,
      delayMs: 0,
      actions: [
        { kind: 'chat', message: actLine(engine.personalityId, 'teleport') },
        { kind: 'teleport' },
        { kind: 'follow_player', distance: jitterFollowDistance(humanizer) },
      ],
    }
  }
  if (isStuck) escapeFailCount++
  lastDistToPlayer = dist

  // ── 优先级 0.5: 自动护主 — 最高优先级，像狗一样（不受 autoCombat 限制）──
  if (guardCombat || state.playerInDanger) {
    const threat = guardCombat
    if (threat && dist < 24) {
      const actions: BotAction[] = []
      const sword = equipForTask('combat', state.botInventory ?? [])
      if (sword) actions.push(sword)
      if (dist > 4) {
        if (shouldBehaviorChat(`guard:${threat.type}`, GUARD_CHAT_COOLDOWN_MS)) {
          actions.push({ kind: 'chat', message: actLine(engine.personalityId, 'incoming') })
        }
        actions.push({ kind: 'move_to', x: state.playerPosition.x, y: state.playerPosition.y, z: state.playerPosition.z })
      }
      actions.push({ kind: 'attack', targetName: threat.type, targetId: threat.id })
      const botInDanger = state.botHealth < combatStyle.lowHealthThreshold
      return {
        type: 'combat',
        priority: botInDanger ? 11 : 12,
        delayMs: jitterCombatDelay(humanizer) * 1000,
        actions,
      }
    }
  }

  // ── 优先级 1: 急救 ──
  // 岩浆中：受到火焰伤害，必须立即脱困
  if (state.botInLava || (safety.botCritical && safety.threatCount === 0 && state.botHealth < 15 && !state.botInWater)) {
    const dx = state.playerPosition.x - state.botPosition.x
    const dz = state.playerPosition.z - state.botPosition.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    return {
      type: 'first_aid',
      priority: 10,
      delayMs: 0,
      actions: [
        { kind: 'chat', message: actLine(engine.personalityId, 'lava') },
        { kind: 'jump' },
        { kind: 'move_to', x: state.botPosition.x + (dx / len) * 3, y: state.botPosition.y + 2, z: state.botPosition.z + (dz / len) * 3 },
      ],
    }
  }

  // 水中：游向玩家所在方向（bot 浮在水面，需要跳到岸上）
  if (state.botInWater) {
    const dx = state.playerPosition.x - state.botPosition.x
    const dz = state.playerPosition.z - state.botPosition.z
    const len = Math.sqrt(dx * dx + dz * dz) || 1
    return {
      type: 'first_aid',
      priority: 9,
      delayMs: 0,
      actions: [
        { kind: 'jump' },  // 在水中 = 上浮
        { kind: 'move_to', x: state.botPosition.x + (dx / len) * 2, y: state.botPosition.y + 1, z: state.botPosition.z + (dz / len) * 2 },
        { kind: 'follow_player', distance: jitterFollowDistance(humanizer) },
      ],
    }
  }

  if (safety.botCritical && !safety.playerCritical) {
    // 自身危险 → 逃跑吃药
    return {
      type: 'first_aid',
      priority: 10,
      delayMs: 0,
      actions: [
        { kind: 'chat', message: actLine(engine.personalityId, 'retreat') },
        { kind: 'move_to', x: state.botPosition.x + 10, y: state.botPosition.y, z: state.botPosition.z + 10 },
      ],
    }
  }
  if (safety.playerCritical && engine.aff > -30) {
    // 玩家低血 → 冲过去保护（台词有冷却，避免刷屏）
    const actions: BotAction[] = [
      { kind: 'move_to', x: state.playerPosition.x, y: state.playerPosition.y, z: state.playerPosition.z },
    ]
    if (shouldBehaviorChat('protect', PROTECT_CHAT_COOLDOWN_MS)) {
      actions.unshift({ kind: 'chat', message: actLine(engine.personalityId, 'protect') })
    }
    return { type: 'first_aid', priority: 10, delayMs: 0, actions }
  }

  // ── 优先级 2: 战斗（自发清怪，受 autoCombat 控制）──
  if (autoCombat) {
    const threatNearBot = safety.nearestThreat && safety.nearestThreat.distance < combatStyle.engagementRange
    const playerThreat = safety.nearestThreatToPlayer
    const threatNearPlayer =
      !!playerThreat &&
      (playerThreat.distance < 12 || dist2d(state.botPosition, state.playerPosition) < 24)
    const threatsNearPlayer = state.playerInDanger && engine.aff > -30

    const primaryThreat =
      threatNearPlayer && playerThreat && dist < 24
        ? playerThreat
        : safety.nearestThreat

    if (threatNearBot || (threatsNearPlayer && engine.aff > -30)) {
      const threat = primaryThreat
      const actions: BotAction[] = []

      if (!threatNearBot && threatsNearPlayer && dist > 3) {
        actions.push({ kind: 'move_to', x: state.playerPosition.x, y: state.playerPosition.y, z: state.playerPosition.z })
        if (shouldBehaviorChat('combat:incoming', GUARD_CHAT_COOLDOWN_MS)) {
          actions.push({ kind: 'chat', message: actLine(engine.personalityId, 'incoming') })
        }
        if (threat) {
          actions.push({ kind: 'attack', targetName: threat.type, targetId: threat.id })
        }
        return { type: 'combat', priority: 9, delayMs: 0, actions }
      }

      if (state.botHealth < combatStyle.lowHealthThreshold &&
          Math.random() < combatStyle.retreatChance) {
        actions.push(
          { kind: 'chat', message: actLine(engine.personalityId, 'too_many') },
          { kind: 'move_to', x: state.playerPosition.x + 5, y: state.playerPosition.y, z: state.playerPosition.z + 5 },
        )
        return { type: 'combat', priority: 8, delayMs: 0, actions }
      }

      if (threat && threat.type.toLowerCase().includes('creeper')) {
        actions.push({ kind: 'attack', targetName: threat.type, targetId: threat.id })
        if (shouldBehaviorChat('combat:creeper', GUARD_CHAT_COOLDOWN_MS)) {
          actions.push({ kind: 'chat', message: actLine(engine.personalityId, 'creeper') })
        }
        return { type: 'combat', priority: 9, delayMs: jitterCombatDelay(humanizer) * 1000, actions }
      }

      if (threat) {
        actions.push({ kind: 'attack', targetName: threat.type, targetId: threat.id })
        if (shouldAimMiss(humanizer)) {
          actions.push({ kind: 'chat', message: actLine(engine.personalityId, 'miss') })
        }
      }
      return {
        type: 'combat',
        priority: 8,
        delayMs: jitterCombatDelay(humanizer) * 1000,
        target: threat
          ? { type: threat.type, position: state.botPosition, distance: threat.distance }
          : undefined,
        actions,
      }
    }
  }

  // ── 工作上下文检测 ──
  const inventorySlots = state.botInventory ?? []
  const totalSlots = inventorySlots.length > 0 ? 36 : 36
  const workCtx: WorkContext = detectWorkContext(state, inventorySlots, totalSlots)

  // ── 优先级 2.5: 工具辅助（战斗中装备武器）──
  if (safety.threatCount > 0 && workCtx.toolNeeded !== 'sword') {
    const sword = equipForTask('combat', inventorySlots)
    if (sword) {
      return {
        type: 'combat',
        priority: 10,
        delayMs: 0,
        actions: [sword, { kind: 'attack', targetName: safety.nearestThreat!.type, targetId: safety.nearestThreat!.id }],
      }
    }
  }

  // ── 优先级 2.8: 找床睡觉 ──
  // 重置白天状态
  if (isMorning(state.timeOfDay) && lastDayCycle !== 'day') {
    botSleptThisNight = false
    lastDayCycle = 'day'
    // 早上拆掉自己放的床
    if (botPlacedBedPos) {
      const morningActions: BotAction[] = []
      morningActions.push({ kind: 'break_block', x: botPlacedBedPos.x, y: botPlacedBedPos.y, z: botPlacedBedPos.z })
      morningActions.push({ kind: 'chat', message: wakeLine(engine.personalityId) })
      botPlacedBedPos = null
      return { type: 'leisure', priority: 7, delayMs: 500, actions: morningActions }
    }
  }
  if (state.timeOfDay === 'night' || state.timeOfDay === 'sunset') {
    lastDayCycle = state.timeOfDay
  }

  if (
    isNightTime(state.timeOfDay) &&
    state.dimension !== 'nether' &&
    state.dimension !== 'end' &&
    safety.threatCount === 0 &&
    !botSleptThisNight
  ) {
    const bedDec = decideBedAction(
      state.timeOfDay,
      (state.botInventory ?? []).map(s => ({ slot: s.slot, name: s.name })),
      state.nearbyBlockNames ?? [],
      state.biome,
      (state as any).playerSleeping ?? false,
      engine.personalityId,
      (state as any).nearbyBeds ?? [],
    )

    switch (bedDec.state) {
      case 'waiting_player': break // 等玩家先睡，不操作
      case 'no_bed': {
        const now3 = Date.now()
        if (now3 - lastNoBedShoutTime > 60000) {
          lastNoBedShoutTime = now3
          return { type: 'leisure', priority: 7, delayMs: 0, actions: [{ kind: 'chat', message: bedDec.dialogue ?? '我没有床……' }] }
        }
        break
      }
      case 'have_bed_in_inv': {
        // 放置床 → 睡觉 → 记录位置早上拆
        const bedSlot = (state.botInventory ?? []).find(s => s.name.includes('_bed') && !s.name.includes('bedrock'))
        if (bedSlot) {
          const bx = Math.floor(state.botPosition.x)
          const by = Math.floor(state.botPosition.y) - 1
          const bz = Math.floor(state.botPosition.z)
          botPlacedBedPos = { x: bx, y: by + 1, z: bz }
          botSleptThisNight = true
          return {
            type: 'leisure', priority: 8, delayMs: 0,
            actions: [
              { kind: 'hold_item', item: bedSlot.name.replace(/^minecraft:/, '') },
              { kind: 'place_bed', x: bx, y: by + 1, z: bz },
              { kind: 'sleep', x: bx, y: by + 1, z: bz },
              { kind: 'chat', message: sleepLine(engine.personalityId) },
            ],
          }
        }
        break
      }
      case 'nearby_free_bed': {
        // 找到空闲床 → 走过去睡
        botSleptThisNight = true
        const bp = bedDec.bedPosition ?? (state as any).nearbyBeds?.[0]
        const actions: BotAction[] = []
        if (bedDec.dialogue) actions.push({ kind: 'chat', message: bedDec.dialogue })
        if (bp) {
          actions.push({ kind: 'move_to', x: bp.x, y: bp.y, z: bp.z })
          actions.push({ kind: 'sleep', x: bp.x, y: bp.y, z: bp.z })
          actions.push({ kind: 'chat', message: sleepLine(engine.personalityId) })
        }
        return { type: 'leisure', priority: 8, delayMs: 0, actions }
      }
      case 'village_bed': {
        // 在村庄 → 村民占床 → 拆床重置归属 → 放置 → 睡
        botSleptThisNight = true
        const bp2 = (state as any).nearbyBeds?.[0]
        const vActions: BotAction[] = []
        if (bedDec.dialogue) vActions.push({ kind: 'chat', message: bedDec.dialogue })
        if (bp2) {
          // 走到床边 → 拆床（赶走村民）→ 等物品被捡起 → 放床 → 睡
          vActions.push({ kind: 'move_to', x: bp2.x, y: bp2.y, z: bp2.z })
          vActions.push({ kind: 'break_block', x: bp2.x, y: bp2.y, z: bp2.z })
          // 等一下让物品被捡起来
          vActions.push({ kind: 'idle', durationMs: 800 })
          // 原地放床
          vActions.push({ kind: 'place_bed', x: bp2.x, y: bp2.y, z: bp2.z })
          vActions.push({ kind: 'sleep', x: bp2.x, y: bp2.y, z: bp2.z })
          vActions.push({ kind: 'chat', message: sleepLine(engine.personalityId) })
          // 早上拆走
          botPlacedBedPos = { x: bp2.x, y: bp2.y, z: bp2.z }
        }
        return { type: 'leisure', priority: 8, delayMs: 0, actions: vActions }
      }
    }
  }

  // ── 优先级 3: 救援/跟随 ──
  // 卡地形检测：位置变化 < 0.5 格时累积 stuckTicks（用于上方传送兜底判定）
  {
    const pos = state.botPosition
    // 用模块外的 lastDistToPlayer 对应的上次位置做简易对比
    const dx = pos.x - (lastDistToPlayer > 0 ? state.playerPosition.x : pos.x)
    const dz = pos.z - (lastDistToPlayer > 0 ? state.playerPosition.z : pos.z)
    // 简化为：如果距离玩家 > 8 且 > 上次距离 → 可能在卡住
    if (dist > 8 && lastDistToPlayer > 0 && dist >= lastDistToPlayer) {
      stuckTicks++
    } else if (dist < lastDistToPlayer - 0.5) {
      stuckTicks = 0
    }
  }

  if (dist > 12) {
    const actions: BotAction[] = []

    const now = Date.now()
    if (dist > 25 && now - lastShoutTime > SHOUT_COOLDOWN_MS) {
      actions.push({ kind: 'chat', message: actLine(engine.personalityId, 'catch_up') })
      lastShoutTime = now
    }

    actions.push({ kind: 'follow_player', distance: jitterFollowDistance(humanizer) })
    if (shouldJumpWhileMoving(humanizer)) actions.push({ kind: 'jump' })

    return { type: 'follow', priority: 6, delayMs: 0, actions }
  }

  // ── 优先级 4: 玩家低血关心 ──
  const nowCare = Date.now()
  if (
    state.playerHealth <= 12 &&
    engine.aff > 20 &&
    nowCare - lastPlayerHurtCareAt >= PLAYER_HURT_CARE_COOLDOWN_MS
  ) {
    lastPlayerHurtCareAt = nowCare
    return {
      type: 'assist',
      priority: 4,
      delayMs: 0,
      actions: [
        { kind: 'follow_player', distance: jitterFollowDistance(humanizer) },
        { kind: 'chat', message: actLine(engine.personalityId, 'player_hurt') },
      ],
    }
  }

  // ── 优先级 4: 工作 ──
  // 安全时且附近有资源 → 干活（按价值优先级）
  if (safety.threatCount === 0 && dist < 8 && workCtx.task !== 'none' && workCtx.bestTarget) {
    // 资源耗尽 → 不干活，告知原因（冷却 60s 避免刷屏）
    if (workCtx.resourceExhausted) {
      const exKey = workCtx.missingResource?.includes('种子') ? 'seed_out' : 'tool_broke'
      const now2 = Date.now()
      if (now2 - lastShoutTime > SHOUT_COOLDOWN_MS) {
        lastShoutTime = now2
        return {
          type: 'assist',
          priority: 1,
          delayMs: 0,
          actions: [{ kind: 'chat', message: workLine(engine.personalityId, exKey) }],
        }
      }
      // 冷却中，直接跳过工作
    } else {
    const bt = workCtx.bestTarget
    const workActions: BotAction[] = []
    const dialogues: string[] = []
    let workPriority = 0

    switch (bt.task) {
      case 'mine_ore': {
        const tool = equipForTask('mine', inventorySlots)
        if (tool) workActions.push(tool)
        // S 级矿石 → 最高优先，A 级 → 高优先，B 级 → 顺手
        workPriority = bt.priority >= 90 ? 7 : bt.priority >= 50 ? 5 : 3
        const line = workLine(engine.personalityId, 'mine_ore')
        if (line !== '…') dialogues.push(line)
        // 说出矿石名
        if (bt.priority >= 50) {
          dialogues.push(`${bt.label}！`)
        }
        break
      }
      case 'chop_tree': {
        const tool = equipForTask('chop', inventorySlots)
        if (tool) workActions.push(tool)
        workPriority = 4
        const line = workLine(engine.personalityId, 'chop_tree')
        if (line !== '…') dialogues.push(line)
        break
      }
      case 'farm_crop': {
        const tool = equipForTask('farm', inventorySlots)
        if (tool) workActions.push(tool)
        workPriority = 3
        const line = workLine(engine.personalityId, 'farm_crop')
        if (line !== '…') dialogues.push(line)
        break
      }
    }

    // 背包管理：满了就丢垃圾（只丢价值 ≤5 的东西）
    if (workCtx.suggestedDiscardSlot !== null && workCtx.inventoryFullness > 0.8) {
      const line = workLine(engine.personalityId, 'trash')
      if (line !== '…' && !dialogues.includes(line)) dialogues.push(line)
      workActions.push({ kind: 'toss', slot: workCtx.suggestedDiscardSlot })
    }

    // 饥饿时吃东西
    if (state.botHunger < 14) {
      const food = findBestFood(inventorySlots)
      if (food) workActions.push(food)
    }

    if (dialogues.length > 0 && workActions.length > 0) {
      workActions.push({ kind: 'chat', message: dialogues[dialogues.length > 1 ? 1 : 0] })
    }

    if (workActions.length > 0) {
      return {
        type: 'assist',
        priority: workPriority,
        delayMs: 0,
        actions: workActions,
      }
    }
    } // end resource-ok work block
  }

  // ── 优先级 5: 休闲（叠加在跟随之上，不是替换）──
  const followAction: BotAction = { kind: 'follow_player', distance: jitterFollowDistance(humanizer) }
  const leisureActions: BotAction[] = []
  const currentTurn = state.botHealth // 用任意值做 turn 计数近似——用 botPosition.x 不靠谱，直接用 tick 计数器。用 lastXxxReactionTurn 间隔控制

  // 天气变化反应（冷却 60 tick ≈ 30秒）
  const weather = state.weather
  if (weather !== lastWeather && weather !== 'clear') {
    lastWeather = weather
    const weatherLines: Record<string, string[]> = {
      rain: ['下雨了呢……想在屋檐下待一会儿', '下雨了，你有伞吗？', '我不喜欢淋湿……'],
      thunder: ['打雷了！！好吓人！！', '哇——这雷声太响了！', '快躲起来！！'],
      snow: ['下雪了……好美', '雪花落在你头上，好可爱', '好久没见过这么大的雪了'],
    }
    const lines = weatherLines[weather] ?? [`天气变了……`]
    leisureActions.push({ kind: 'chat', message: lines[Math.floor(Math.random() * lines.length)] })
  } else {
    lastWeather = weather
  }

  // 时间变化反应（日落/日出，冷却 120 tick ≈ 60秒）
  if (state.timeOfDay !== lastTimeOfDay) {
    if (state.timeOfDay === 'sunset' && lastTimeOfDay === 'day') {
      leisureActions.push({ kind: 'chat', message: ['天快黑了……我们找个安全的地方吧', '夕阳好美——但得赶紧挖个洞了', '晚上了，小心怪物'][Math.floor(Math.random() * 3)] })
    } else if (state.timeOfDay === 'sunrise' && lastTimeOfDay === 'night') {
      leisureActions.push({ kind: 'chat', message: ['天亮了！又活过一晚～', '早安！新的一天！', '太阳出来了……好暖和'][Math.floor(Math.random() * 3)] })
    }
    lastTimeOfDay = state.timeOfDay
  }

  // 维度变化反应（冷却 120 tick）
  if (state.dimension !== lastDimension) {
    const dimLines: Record<string, string[]> = {
      nether: ['好热……这里就是下界？', '小心脚下！到处都是岩浆', '跟紧我，这里很危险'],
      end: ['这里就是末地……好空旷', 'End…这里是终点还是起点', '末影龙在哪？'],
      overworld: ['回到主世界了——终于可以喘口气', '回来了！还是家里舒服', '还是主世界好……'],
    }
    const lines = dimLines[state.dimension] ?? [`这里是什么地方？`]
    leisureActions.push({ kind: 'chat', message: lines[Math.floor(Math.random() * lines.length)] })
    lastDimension = state.dimension
  }

  // AFK 搭话（人格化 + 应景）
  if (shouldAfkTalk(humanizer) && playerAfkSec > 120) {
    const prefix = state.biome === 'desert' ? '（好晒…）' :
      state.biome === 'snowy' ? '（好冷…）' :
      state.biome === 'nether' ? '（这里很危险…）' :
      state.biome === 'underground' ? '（好暗…）' :
      state.weather === 'thunder' ? '（雷声好大…）' : ''
    leisureActions.push({ kind: 'chat', message: prefix + actLine(engine.personalityId, 'afk') })
  }

  // 自言自语 — 根据群系/天气/时间/维度生成应景内容
  if (shouldSelfTalk(humanizer) && safety.threatCount === 0) {
    leisureActions.push({ kind: 'chat', message: pickAmbientLine(state, engine.personalityId) })
  }

  // 回头看看
  if (shouldLookBack(humanizer)) {
    leisureActions.push({ kind: 'look_at', x: state.playerPosition.x, y: state.playerPosition.y + 1.6, z: state.playerPosition.z })
  }

  // 🆕 建筑停留：发现人造建筑 → 暂停 + 评论
  if ((state as any).buildingDetected && safety.threatCount === 0 && dist < 15) {
    const style = (state as any).buildingStyle ?? 'unknown'
    if (style !== lastBuildingSeen || buildingCommentCooldown <= 0) {
      lastBuildingSeen = style
      buildingCommentCooldown = 30 // 30 tick 冷却
      leisureActions.push({ kind: 'idle', durationMs: 1500 })
      leisureActions.push({ kind: 'chat', message: buildingLine(engine.personalityId, style) })
    }
  }
  if (buildingCommentCooldown > 0) buildingCommentCooldown--

  // 景色停留：路过花丛/好看建筑→停 1-2 秒
  if (shouldPauseForScenery(humanizer) && safety.threatCount === 0 && dist < 6) {
    leisureActions.push({ kind: 'idle', durationMs: 1000 + Math.random() * 1500 })
    leisureActions.push({ kind: 'look_at', x: state.botPosition.x + (Math.random()-0.5)*4, y: state.botPosition.y + 1, z: state.botPosition.z + (Math.random()-0.5)*4 })
  }

  // 小动作
  if (shouldIdleFidget(humanizer) && safety.threatCount === 0) {
    const idle = pickIdleAction()
    if (idle === 'spin') leisureActions.push({ kind: 'spin' })
    else if (idle === 'jump') leisureActions.push({ kind: 'jump' })
    else if (idle === 'swap_item') leisureActions.push({ kind: 'hold_item', item: 'diamond' })
    else leisureActions.push({ kind: 'look_at', x: state.botPosition.x + 5, y: state.botPosition.y, z: state.botPosition.z + 5 })
  }

  // ── 战斗庆祝：刚从战斗中脱出且安全 ──
  if (wasInCombat && safety.threatCount === 0 && !combatEndCelebrated) {
    combatEndCelebrated = true
    wasInCombat = false
    leisureActions.push({ kind: 'chat', message: actLine(engine.personalityId, 'combat_win') })
    if (Math.random() < 0.4) leisureActions.push({ kind: 'jump' })
  }
  if (safety.threatCount > 0) {
    wasInCombat = true
    combatEndCelebrated = false
  }

  // ── 挖矿协助：玩家静止 > 3秒 → bot 在附近做挖矿动作 ──
  const ppos = state.playerPosition
  if (lastPlayerPos && miningAssistCooldown <= 0 && safety.threatCount === 0 && dist < 8) {
    const pmoved = Math.abs(ppos.x - lastPlayerPos.x) + Math.abs(ppos.y - lastPlayerPos.y) + Math.abs(ppos.z - lastPlayerPos.z)
    if (pmoved < 0.5) {
      playerStationaryTicks++
    } else {
      playerStationaryTicks = 0
    }
    if (playerStationaryTicks >= 6) {
      // 玩家可能在挖矿/砍树 → bot 帮忙挖附近的方块
      leisureActions.push({ kind: 'chat', message: actLine(engine.personalityId, 'mining_help') })
      leisureActions.push({ kind: 'mine', x: ppos.x + (Math.random() - 0.5) * 2, y: ppos.y - 1, z: ppos.z + (Math.random() - 0.5) * 2 })
      miningAssistCooldown = 20
      playerStationaryTicks = 0
    }
  }
  lastPlayerPos = { ...ppos }
  if (miningAssistCooldown > 0) miningAssistCooldown--

  // 首次设置人格手持物
  if (!handItemSet) {
    const item = PERSONALITY_HAND_ITEM[engine.personalityId]
    if (item) {
      leisureActions.push({ kind: 'hold_item', item })
    }
    handItemSet = true
  }

  // 默认跟随 + 休闲动作叠加
  if (leisureActions.length > 0) {
    return {
      type: 'leisure',
      priority: 1,
      delayMs: 0,
      actions: [followAction, ...leisureActions],
    }
  }

  return {
    type: 'follow',
    priority: 3,
    delayMs: 0,
    actions: [followAction],
  }
}

/**
 * 将决策转为 CWAckem 可用的动作描述文本
 * 用于发送到 Ackem 生成 LLM 吐槽
 */
export function decisionToContext(decision: BehaviorDecision, personalityId: string): string {
  const lines: string[] = []
  lines.push(`当前行为: ${decision.type}`)
  if (decision.target) {
    lines.push(`目标: ${decision.target.type}，距离 ${decision.target.distance.toFixed(1)} 格`)
  }
  lines.push(`优先级: ${decision.priority}`)
  lines.push(`动作: ${decision.actions.map(a => a.kind).join(', ')}`)
  if (decision.dialogue) lines.push(`台词: ${decision.dialogue}`)
  return lines.join('\n')
}
