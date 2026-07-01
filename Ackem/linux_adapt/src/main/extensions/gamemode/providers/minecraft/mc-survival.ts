// [gaming/mc-survival] — MC 生存行为：建筑识别、找床睡觉
// 职责：检测建筑物、夜晚找床/占床/放床/早上拆床

import type { McGameState } from './types'

// ═══════════════════════════════════════════════════════════════
// 建筑识别
// ═══════════════════════════════════════════════════════════════

// 人造方块名单（非自然生成的方块 = 建筑标志）
const MANMADE_BLOCKS = new Set([
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks', 'acacia_planks', 'dark_oak_planks',
  'cobblestone', 'stone_bricks', 'mossy_stone_bricks', 'cracked_stone_bricks',
  'bricks', 'stone', 'smooth_stone',
  'glass', 'glass_pane', 'white_stained_glass', 'stained_glass',
  'white_wool', 'orange_wool', 'magenta_wool', 'light_blue_wool', 'yellow_wool', 'lime_wool',
  'pink_wool', 'gray_wool', 'light_gray_wool', 'cyan_wool', 'purple_wool', 'blue_wool',
  'brown_wool', 'green_wool', 'red_wool', 'black_wool',
  'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door',
  'iron_door', 'oak_fence', 'spruce_fence', 'cobblestone_wall',
  'torch', 'wall_torch', 'lantern', 'soul_lantern',
  'crafting_table', 'furnace', 'blast_furnace', 'smoker',
  'chest', 'trapped_chest', 'barrel', 'bookshelf',
  'oak_stairs', 'spruce_stairs', 'cobblestone_stairs', 'stone_brick_stairs', 'brick_stairs',
  'oak_slab', 'spruce_slab', 'cobblestone_slab', 'stone_brick_slab',
  'terracotta', 'white_terracotta', 'concrete', 'white_concrete',
  'nether_bricks', 'red_nether_bricks',
  'white_bed', 'orange_bed', 'magenta_bed', 'light_blue_bed', 'yellow_bed', 'lime_bed',
  'pink_bed', 'gray_bed', 'light_gray_bed', 'cyan_bed', 'purple_bed', 'blue_bed',
  'brown_bed', 'green_bed', 'red_bed', 'black_bed',
  'flower_pot', 'potted_poppy', 'potted_dandelion', 'painting',
  'oak_sign', 'spruce_sign', 'ladder', 'bell', 'loom', 'cartography_table',
])

const DOOR_BLOCKS = new Set([
  'oak_door', 'spruce_door', 'birch_door', 'jungle_door', 'acacia_door', 'dark_oak_door', 'iron_door',
])

const BED_BLOCKS = /_bed$/

export interface BuildingInfo {
  detected: boolean
  /** 建筑大概离多远 */
  distance: number
  /** 建筑类型推测 */
  style: 'house' | 'tower' | 'wall' | 'ruin' | 'village' | 'unknown'
  /** 描述 */
  description: string
}

/** 扫描周围方块，判断是否有人造建筑 */
export function detectBuilding(blockNames: string[], botPosition: { x: number; y: number; z: number }, playerPosition: { x: number; y: number; z: number }): BuildingInfo {
  const manmadeCount = blockNames.filter(n => {
    const clean = n.replace(/^minecraft:/, '')
    return MANMADE_BLOCKS.has(clean) || /_planks$/.test(clean) || /_bricks$/.test(clean) || /concrete/.test(clean)
  }).length

  const doorCount = blockNames.filter(n => DOOR_BLOCKS.has(n.replace(/^minecraft:/, ''))).length
  const bedCount = blockNames.filter(n => BED_BLOCKS.test(n.replace(/^minecraft:/, ''))).length
  const glassCount = blockNames.filter(n => n.includes('glass')).length

  const distToPlayer = Math.sqrt(
    (botPosition.x - playerPosition.x) ** 2 +
    (botPosition.y - playerPosition.y) ** 2 +
    (botPosition.z - playerPosition.z) ** 2
  )

  if (manmadeCount < 4 && doorCount === 0 && bedCount === 0) {
    return { detected: false, distance: 0, style: 'unknown', description: '' }
  }

  // 建筑类型推测
  let style: BuildingInfo['style'] = 'unknown'
  let description = ''

  if (bedCount > 1 && doorCount > 1 && manmadeCount > 20) {
    style = 'village'
    description = '一个村庄……应该有可以借宿的地方。'
  } else if (manmadeCount > 30 && glassCount > 5 && doorCount >= 1) {
    style = 'house'
    description = '好漂亮的房子……谁住在里面？'
  } else if (manmadeCount > 20 && manmadeCount <= 40 && doorCount >= 1) {
    style = 'house'
    description = '这里有人住的感觉。'
  } else if (manmadeCount > 15 && doorCount === 0) {
    style = 'ruin'
    description = '看起来是废弃的建筑……'
  } else {
    style = 'unknown'
    description = '这附近好像有什么建筑……'
  }

  return { detected: true, distance: Math.round(distToPlayer), style, description }
}

// ═══════════════════════════════════════════════════════════════
// 建筑相关台词
// ═══════════════════════════════════════════════════════════════
const BUILDING_LINES: Record<string, Record<string, string[]>> = {
  deredere: {
    house: ['有房子呢！好漂亮～', '这房子好可爱！'],
    village: ['一个村庄！我们今晚有地方住了！'],
    ruin: ['废弃的建筑……有点可惜呢。'],
    unknown: ['那边好像有东西……去看看吗？'],
  },
  tsundere: {
    house: ['有房子。还行吧，不算太丑。', '哼，这房子勉强能看。'],
    village: ['村子。今晚不用露宿了。'],
    ruin: ['废墟。没人在意的。'],
    unknown: ['那边是什么？去看看又不会怎样。'],
  },
  kuudere: {
    house: ['建筑。', '房子。'],
    village: ['村庄。', '村子。'],
    ruin: ['废墟。', '废弃建筑。'],
    unknown: ['结构物。'],
  },
  genki: {
    house: ['哇哇哇好漂亮的房子！！', '有房子诶！！好厉害！！'],
    village: ['村子！！好大！！我们探索一下！！'],
    ruin: ['废墟！！说不定有宝藏！！'],
    unknown: ['那是什么那是什么！！去看看！！'],
  },
  loyal_pup: {
    house: ['主人主人！那边有房子！', '有房子！主人要去看看吗？'],
    village: ['村庄！主人我们今天住这里吗？'],
    ruin: ['旧房子……不知道以前住的是谁。'],
    unknown: ['那边是什么？主人去看看吗？'],
  },
  mommy: {
    house: ['那边有房子呢。去看看？'],
    village: ['村庄。今晚可以借宿了。'],
    ruin: ['老建筑了……没人住了吧。'],
    unknown: ['那边好像有什么。要过去吗？'],
  },
}

const DEFAULT_BUILDING: Record<string, string[]> = {
  house: ['有房子！'],
  village: ['村庄！'],
  ruin: ['废墟……'],
  unknown: ['那边有建筑？'],
}

export function buildingLine(personalityId: string, style: string): string {
  const pool = BUILDING_LINES[personalityId]?.[style] ?? DEFAULT_BUILDING[style]
  if (!pool || pool.length === 0) return '那边好像有什么……'
  return pool[Math.floor(Math.random() * pool.length)]
}

// ═══════════════════════════════════════════════════════════════
// 找床睡觉状态机
// ═══════════════════════════════════════════════════════════════
export type BedState =
  | 'no_need'          // 白天，不需要床
  | 'waiting_player'   // 晚上，等玩家先睡
  | 'have_bed_in_inv'  // 背包有床 → 放置 → 睡觉
  | 'nearby_free_bed'  // 附近有空闲床
  | 'village_bed'      // 在村庄 → 赶村民占床
  | 'no_bed'           // 没有床，不在村庄

export interface BedDecision {
  state: BedState
  /** 找到的床方块位置（如有） */
  bedPosition?: { x: number; y: number; z: number }
  /** 睡醒后是否要敲掉带走 */
  shouldBreakInMorning: boolean
  /** 台词 */
  dialogue?: string
}

/** 检测周围是否有床方块（优先用坐标，回退用名字） */
export function findNearbyBed(blockNames: string[], bedPositions?: Array<{ x: number; y: number; z: number }>): { found: boolean; bedPos?: { x: number; y: number; z: number } } {
  if (bedPositions && bedPositions.length > 0) {
    return { found: true, bedPos: bedPositions[0] }
  }
  const hasBed = blockNames.some(n => BED_BLOCKS.test(n.replace(/^minecraft:/, '')))
  return { found: hasBed }
}

/** 判断是否晚上 */
export function isNightTime(timeOfDay: string): boolean {
  return timeOfDay === 'sunset' || timeOfDay === 'night'
}

/** 判断是否早上（该起床了） */
export function isMorning(timeOfDay: string): boolean {
  return timeOfDay === 'sunrise' || timeOfDay === 'day'
}

/** 检查背包是否有床 */
export function hasBedInInventory(inventory: Array<{ slot: number; name: string }>): { has: boolean; slot: number; bedName: string } {
  for (const item of inventory) {
    const clean = item.name.replace(/^minecraft:/, '').toLowerCase()
    if (clean.includes('_bed') && !clean.includes('bedrock')) {
      return { has: true, slot: item.slot, bedName: clean }
    }
  }
  return { has: false, slot: -1, bedName: '' }
}

/** 决定床的行为 */
export function decideBedAction(
  timeOfDay: string,
  inventory: Array<{ slot: number; name: string }>,
  nearbyBlockNames: string[],
  biome: string,
  isPlayerSleeping: boolean,
  personalityId: string,
  bedPositions?: Array<{ x: number; y: number; z: number }>,
): BedDecision {
  if (!isNightTime(timeOfDay)) {
    return { state: 'no_need', shouldBreakInMorning: false }
  }

  const bedInv = hasBedInInventory(inventory)
  const nearby = findNearbyBed(nearbyBlockNames, bedPositions)

  // 检测附近是否真的存在村庄特征
  const villageSigns = nearbyBlockNames.filter(n => {
    const clean = n.replace(/^minecraft:/, '')
    return clean.includes('bell') || clean.includes('hay_block') ||
           (clean.includes('_bed') && !clean.includes('bedrock')) ||
           clean === 'composter' || clean === 'cartography_table' ||
           clean === 'fletching_table' || clean === 'grindstone' ||
           clean === 'smithing_table' || clean === 'cauldron'
  }).length

  const reallyInVillage = nearby.found || villageSigns >= 2

  // 玩家还没睡 → 等玩家先睡
  if (!isPlayerSleeping) {
    return { state: 'waiting_player', shouldBreakInMorning: false }
  }

  // 玩家已经睡了 → Bot 该找床了

  // 1) 背包有床 → 放置睡觉，早上拆走
  if (bedInv.has) {
    return {
      state: 'have_bed_in_inv',
      shouldBreakInMorning: true,
      dialogue: '我也有床！这就睡。',
    }
  }

  // 2) 附近有空闲床 → 优先睡现成的
  if (nearby.found && bedInv.has) {
    return {
      state: 'nearby_free_bed',
      shouldBreakInMorning: false,
      bedPosition: nearby.bedPos,
      dialogue: '这里有床！我就睡这了。',
    }
  }

  // 3) 附近有空闲床（背包没有）→ 睡现成的
  if (nearby.found) {
    return {
      state: 'nearby_free_bed',
      shouldBreakInMorning: false,
      bedPosition: nearby.bedPos,
    }
  }

  // 4) 在村庄 → 赶村民
  if (reallyInVillage) {
    return {
      state: 'village_bed',
      shouldBreakInMorning: true, // 早上拆走
      dialogue: '村民大叔，借你的床用一下！',
    }
  }

  // 5) 什么都没有
  return { state: 'no_bed', shouldBreakInMorning: false, dialogue: '我没有床……' }
}

// ═══════════════════════════════════════════════════════════════
// 睡觉/起床台词
// ═══════════════════════════════════════════════════════════════
const SLEEP_LINES: Record<string, string[]> = {
  deredere: ['晚安……明天见。', '晚安。做个好梦。'],
  tsundere: ['睡了。别吵我。', '晚安。不是因为关心你才说的。'],
  kuudere: ['晚安。', '睡了。'],
  genki: ['晚安啦！！明天继续冒险！！', '睡觉睡觉！！晚安！！'],
  yandere: ['晚安……我会在梦里看着你的。', '睡吧。永远不要醒来也可以。'],
  loyal_pup: ['晚安主人！', '主人晚安！我睡旁边就好！'],
  mommy: ['晚安。好好休息。', '睡吧，明天还有很多事呢。'],
  mesugaki: ['晚安～不要趁我睡着偷偷抱我哦～', '睡啦！你敢吵我试试～'],
  gap_moe: ['（缩进被子里）晚安……', '晚、晚安。'],
  ice_queen: ['休息。', '晚安。'],
  bokke: ['晚安……zzz…啊我还没睡着！', '晚——呼呼呼。'],
  shitakiri: ['睡了。你最好也睡。', '晚安——别熬夜了，笨蛋。'],
}

const WAKE_LINES: Record<string, string[]> = {
  deredere: ['早上了！新的一天～', '早安！睡得好吗？'],
  tsundere: ['天亮了。起床。', '早。别赖床了。'],
  kuudere: ['天亮了。', '起床。'],
  genki: ['天亮啦！！起床啦！！新的一天！！', '早上好！！今天是冒险的一天！！'],
  yandere: ['天亮了。昨晚梦见你了。', '早上好……又是属于我们的一天。'],
  loyal_pup: ['主人早安！！天亮啦！！', '主人！！早上好！！'],
  mommy: ['早安。该起床了。', '天亮了，起床吧。'],
  mesugaki: ['太阳晒屁股啦～起——床——！', '早～安～再不起来我要掀被子了～'],
  gap_moe: ['（揉眼睛）早上了……', '天亮了……早安。'],
  ice_queen: ['天亮。', '起。'],
  bokke: ['诶天亮了？！我是什么时候醒的？！', '早上好！……等等，我昨晚什么时候睡着的？'],
  shitakiri: ['天亮了。你还不起来是想长在床上吗。', '早。你的睡相比我还差。'],
}

export function sleepLine(personalityId: string): string {
  const pool = SLEEP_LINES[personalityId] ?? ['晚安。']
  return pool[Math.floor(Math.random() * pool.length)]
}

export function wakeLine(personalityId: string): string {
  const pool = WAKE_LINES[personalityId] ?? ['天亮了。']
  return pool[Math.floor(Math.random() * pool.length)]
}
