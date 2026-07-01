// [gaming/mc-work] — MC 工作行为引擎 v2
// 职责：资源价值分级、自主判断挖什么/砍什么/捡什么/丢什么、威胁优先级

import type { McGameState } from './types'

// ═══════════════════════════════════════════════════════════════
// 矿石价值分级（S → 必挖, A → 有用, B → 顺手, C → 无视）
// ═══════════════════════════════════════════════════════════════
const ORE_TIERS: Record<string, { tier: 'S' | 'A' | 'B' | 'C'; label: string; priority: number }> = {
  // S 级：传说级——看到必须冲
  diamond_ore: { tier: 'S', label: '钻石', priority: 100 },
  deepslate_diamond_ore: { tier: 'S', label: '钻石', priority: 100 },
  emerald_ore: { tier: 'S', label: '绿宝石', priority: 99 },
  deepslate_emerald_ore: { tier: 'S', label: '绿宝石', priority: 99 },
  ancient_debris: { tier: 'S', label: '远古残骸', priority: 100 },
  // A 级：重要资源——主动挖
  iron_ore: { tier: 'A', label: '铁', priority: 70 },
  deepslate_iron_ore: { tier: 'A', label: '铁', priority: 70 },
  gold_ore: { tier: 'A', label: '金', priority: 65 },
  deepslate_gold_ore: { tier: 'A', label: '金', priority: 65 },
  nether_gold_ore: { tier: 'A', label: '下界金', priority: 60 },
  lapis_ore: { tier: 'A', label: '青金石', priority: 55 },
  deepslate_lapis_ore: { tier: 'A', label: '青金石', priority: 55 },
  nether_quartz_ore: { tier: 'A', label: '下界石英', priority: 50 },
  // B 级：顺手挖——不特意找，但路过就来一下
  coal_ore: { tier: 'B', label: '煤', priority: 30 },
  deepslate_coal_ore: { tier: 'B', label: '煤', priority: 30 },
  redstone_ore: { tier: 'B', label: '红石', priority: 25 },
  deepslate_redstone_ore: { tier: 'B', label: '红石', priority: 25 },
  // C 级：无视——不挖
  copper_ore: { tier: 'C', label: '铜', priority: 0 },
  deepslate_copper_ore: { tier: 'C', label: '铜', priority: 0 },
}

/** 判断方块是否为值得挖的矿石 */
export function isWorthMining(blockName: string): boolean {
  const clean = blockName.replace(/^minecraft:/, '')
  const ore = ORE_TIERS[clean]
  return ore ? ore.tier !== 'C' : false
}

/** 矿石挖掘优先级（数字越大越优先） */
export function orePriority(blockName: string): number {
  const clean = blockName.replace(/^minecraft:/, '')
  const ore = ORE_TIERS[clean]
  return ore ? ore.priority : 0
}

/** 矿石中文标签 */
export function oreLabel(blockName: string): string {
  const clean = blockName.replace(/^minecraft:/, '')
  return ORE_TIERS[clean]?.label ?? '矿石'
}

// ═══════════════════════════════════════════════════════════════
// 原木价值（只砍真树，不碰木板/去皮木/菌柄）
// ═══════════════════════════════════════════════════════════════
const LOG_PRIORITY: Record<string, number> = {
  oak_log: 50, spruce_log: 50, birch_log: 50, jungle_log: 50,
  acacia_log: 50, dark_oak_log: 50, mangrove_log: 50,
  cherry_log: 50, pale_oak_log: 50,
  oak_wood: 40, spruce_wood: 40, birch_wood: 40, jungle_wood: 40,
  acacia_wood: 40, dark_oak_wood: 40,
  crimson_stem: 45, warped_stem: 45,
  // 有蘑菇方块的树——也砍
  mushroom_stem: 30, brown_mushroom_block: 20, red_mushroom_block: 20,
}

const IGNORE_WOOD = new Set([
  'oak_planks', 'spruce_planks', 'birch_planks', 'jungle_planks',
  'acacia_planks', 'dark_oak_planks', 'mangrove_planks', 'cherry_planks',
  'stripped_oak_log', 'stripped_spruce_log', 'stripped_birch_log',
  'stripped_oak_wood', 'stripped_spruce_wood',
  'crimson_planks', 'warped_planks',
  'oak_fence', 'spruce_fence', 'oak_stairs', 'spruce_stairs',
])

export function isWorthChopping(blockName: string): boolean {
  const clean = blockName.replace(/^minecraft:/, '')
  if (IGNORE_WOOD.has(clean)) return false
  return clean in LOG_PRIORITY || clean.includes('_log') || clean.includes('_stem')
}

export function chopPriority(blockName: string): number {
  const clean = blockName.replace(/^minecraft:/, '')
  if (LOG_PRIORITY[clean]) return LOG_PRIORITY[clean]
  if (clean.includes('_log')) return 30
  if (clean.includes('_stem')) return 30
  return 0
}

// ═══════════════════════════════════════════════════════════════
// 敌对生物权威名单（单一来源，全模块共用）
// ═══════════════════════════════════════════════════════════════
const HOSTILE_MOBS = new Set([
  // 主世界 — 亡灵
  'zombie', 'husk', 'drowned', 'zombie_villager',
  'skeleton', 'stray', 'bogged', 'wither_skeleton',
  // 主世界 — 节肢
  'spider', 'cave_spider',
  // 主世界 — 爆炸
  'creeper',
  // 主世界 — 魔法
  'witch', 'evoker', 'illusioner',
  // 主世界 — 灾厄
  'pillager', 'vindicator', 'ravager', 'vex',
  // 主世界 — 其他
  'enderman', 'slime', 'phantom', 'silverfish', 'endermite',
  'guardian', 'elder_guardian', 'warden',
  // 下界
  'blaze', 'ghast', 'piglin', 'piglin_brute', 'zombified_piglin',
  'hoglin', 'zoglin', 'magma_cube',
  // 末地
  'shulker', 'ender_dragon',
  // Boss
  'wither',
  // 1.21+
  'breeze',
])

export function isHostileMob(entityName: string): boolean {
  const clean = entityName.replace(/^minecraft:/, '').toLowerCase()
  for (const mob of HOSTILE_MOBS) {
    if (clean.includes(mob)) return true
  }
  return false
}

// ═══════════════════════════════════════════════════════════════
// 怪物威胁优先级（数字越大越危险）
// ═══════════════════════════════════════════════════════════════
const MOB_THREAT: Record<string, number> = {
  creeper: 100, warden: 99, wither: 98, ender_dragon: 97,
  breeze: 85, blaze: 85, ghast: 80, piglin_brute: 75, hoglin: 70,
  skeleton: 65, stray: 65, bogged: 65, wither_skeleton: 75,
  spider: 55, cave_spider: 60,
  zombie: 45, husk: 45, drowned: 48, zombie_villager: 40, zombified_piglin: 50,
  enderman: 50, guardian: 60, elder_guardian: 70,
  witch: 55, evoker: 65, illusioner: 65, vindicator: 60, pillager: 50,
  phantom: 40, slime: 30, magma_cube: 35,
  silverfish: 10, shulker: 20, endermite: 10,
  vex: 70, ravager: 80, zoglin: 70, piglin: 40,
}

export function mobThreatLevel(mobType: string): number {
  const clean = mobType.replace(/^minecraft:/, '').toLowerCase()
  for (const [key, val] of Object.entries(MOB_THREAT)) {
    if (clean.includes(key)) return val
  }
  return 25
}

// ═══════════════════════════════════════════════════════════════
// 物品价值系统（捡什么 / 丢什么）
// ═══════════════════════════════════════════════════════════════
const ITEM_PRIORITY: Record<string, number> = {
  // 传说级——死也不扔
  diamond: 100, diamond_block: 100, netherite_ingot: 100, netherite_scrap: 100,
  ancient_debris: 100, elytra: 100, nether_star: 100, totem_of_undying: 100,
  enchanted_golden_apple: 100, heart_of_the_sea: 95, trident: 95,
  // 高价值
  emerald: 90, emerald_block: 90,
  gold_ingot: 80, gold_block: 80, golden_apple: 85,
  iron_ingot: 75, iron_block: 75,
  diamond_sword: 90, diamond_pickaxe: 90, diamond_axe: 90, diamond_shovel: 85,
  diamond_helmet: 85, diamond_chestplate: 85, diamond_leggings: 85, diamond_boots: 85,
  netherite_sword: 95, netherite_pickaxe: 95, netherite_axe: 95,
  netherite_helmet: 90, netherite_chestplate: 90,
  enchanting_table: 85, anvil: 75, name_tag: 70,
  ender_pearl: 75, ender_eye: 80, blaze_rod: 75,
  obsidian: 65, crying_obsidian: 60, lodestone: 80,
  // 中价值
  iron_sword: 60, iron_pickaxe: 60, iron_axe: 60,
  iron_helmet: 55, iron_chestplate: 55,
  bow: 60, crossbow: 60, arrow: 45, shield: 55,
  saddle: 50, lead: 45, slime_ball: 45, slime_block: 50,
  lapis_lazuli: 40, redstone: 35, glowstone_dust: 30, quartz: 30,
  coal: 25, flint: 20,
  // 食物
  cooked_beef: 50, cooked_porkchop: 50, steak: 50, golden_carrot: 55,
  cooked_chicken: 40, cooked_mutton: 40, cooked_rabbit: 40,
  bread: 35, baked_potato: 30, apple: 20, carrot: 20,
  // 建筑材料
  oak_log: 30, spruce_log: 30, birch_log: 30,
  cobblestone: 10, stone: 10, deepslate: 10, andesite: 5, diorite: 5, granite: 5,
  // 垃圾
  dirt: 1, sand: 1, gravel: 1, red_sand: 1,
  rotten_flesh: 1, bone: 2, string: 3, spider_eye: 2,
  wheat_seeds: 2, beetroot_seeds: 2, stick: 2, feather: 2,
  kelp: 1, bamboo: 1, cactus: 1, sugar_cane: 1,
  tuff: 1, netherrack: 1, pumpkin: 5, melon: 5,
  poison_potato: 0, poisonous_potato: 0,
}

const PICKUP_WORTHY: Record<string, number> = {
  // 值得弯腰捡的东西（优先级）
  diamond: 100, emerald: 95, ancient_debris: 100, netherite_scrap: 100,
  gold_ingot: 80, iron_ingot: 75,
  raw_iron: 70, raw_gold: 70, raw_copper: 15,
  ender_pearl: 75, blaze_rod: 75, ghast_tear: 80, nether_wart: 65,
  slime_ball: 45, gunpowder: 50, bones: 35, string: 30,
  arrow: 40, coal: 30, redstone: 35, lapis_lazuli: 40,
  diamond_sword: 90, diamond_pickaxe: 90, diamond_helmet: 85,
  iron_sword: 60, iron_pickaxe: 60,
  golden_apple: 85, enchanted_golden_apple: 100,
  cooked_beef: 50, cooked_porkchop: 50, bread: 35,
  saddle: 50, name_tag: 70, lead: 45,
  totem_of_undying: 100, elytra: 100, trident: 95,
}

export function isWorthPickup(itemName: string): boolean {
  const clean = itemName.replace(/^minecraft:/, '').toLowerCase()
  if (PICKUP_WORTHY[clean]) return PICKUP_WORTHY[clean] >= 15
  // 未知物品默认捡（可能是任务物品/模组物品）
  if (!(clean in ITEM_PRIORITY)) return true
  return ITEM_PRIORITY[clean] >= 25
}

export function itemPriority(itemName: string): number {
  const clean = itemName.replace(/^minecraft:/, '').toLowerCase()
  if (ITEM_PRIORITY[clean] !== undefined) return ITEM_PRIORITY[clean]
  if (clean.includes('diamond')) return 85
  if (clean.includes('netherite')) return 90
  if (clean.includes('emerald')) return 80
  if (clean.includes('gold') || clean.includes('golden')) return 60
  if (clean.includes('iron')) return 50
  if (clean.includes('_sword') || clean.includes('_pickaxe') || clean.includes('_axe')) return 45
  if (clean.includes('_helmet') || clean.includes('_chestplate')) return 40
  if (clean.includes('cooked') || clean === 'steak' || clean === 'bread') return 35
  if (clean.includes('_ore')) return ORE_TIERS[clean]?.priority ?? 20
  if (clean.includes('_log')) return 30
  return 10
}

// ═══════════════════════════════════════════════════════════════
// 工具定义
// ═══════════════════════════════════════════════════════════════
type ToolCategory = 'sword' | 'pickaxe' | 'axe' | 'shovel' | 'hoe' | 'food' | 'torch' | 'none'

export function suggestTool(task: 'combat' | 'mine' | 'chop' | 'dig' | 'farm' | 'build'): string[] {
  switch (task) {
    case 'combat': return ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'iron_axe', 'diamond_axe', 'netherite_axe']
    case 'mine': return ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']
    case 'chop': return ['netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'wooden_axe']
    case 'dig': return ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel', 'wooden_shovel']
    case 'farm': return ['netherite_hoe', 'diamond_hoe', 'iron_hoe', 'stone_hoe', 'wooden_hoe']
    case 'build': return []
  }
}

// ═══════════════════════════════════════════════════════════════
// 工作上下文检测
// ═══════════════════════════════════════════════════════════════
export type WorkTask = 'none' | 'combat' | 'mine_ore' | 'chop_tree' | 'farm_crop'

export interface WorkTarget {
  task: WorkTask
  /** 最佳目标的方块名 */
  blockName: string
  /** 中文标签（钻石/铁/橡木…） */
  label: string
  /** 优先级数值 */
  priority: number
}

export interface WorkContext {
  task: WorkTask
  targets: WorkTarget[]
  bestTarget: WorkTarget | null
  toolNeeded: ToolCategory
  availableTool: string | null
  /** 有备用工具（同类型多把） */
  hasBackupTool: boolean
  /** 资源耗尽：工具爆了且无备用 / 种子用光 */
  resourceExhausted: boolean
  /** 耗尽原因（用于反馈） */
  exhaustionReason: string
  /** 需要的资源但背包里没有 */
  missingResource: string | null
  inventoryFullness: number
  suggestedDiscardSlot: number | null
  topThreatType: string | null
}

export function detectWorkContext(
  state: McGameState,
  inventorySlots: Array<{ slot: number; name: string }>,
  totalSlots: number
): WorkContext {
  const ctx: WorkContext = {
    task: 'none',
    targets: [],
    bestTarget: null,
    toolNeeded: 'none',
    availableTool: null,
    hasBackupTool: false,
    resourceExhausted: false,
    exhaustionReason: '',
    missingResource: null,
    inventoryFullness: Math.min(1, inventorySlots.length / totalSlots),
    suggestedDiscardSlot: null,
    topThreatType: null,
  }

  const toolNames = new Set(inventorySlots.map(s => s.name.replace(/^minecraft:/, '').toLowerCase()))

  // 分析周围方块：分类 + 排序
  const names: string[] = (state as any).nearbyBlockNames ?? []
  const targets: WorkTarget[] = []

  for (const name of names) {
    const clean = name.replace(/^minecraft:/, '')

    // 矿石
    const oreInfo = ORE_TIERS[clean]
    if (oreInfo && oreInfo.tier !== 'C') {
      targets.push({ task: 'mine_ore', blockName: clean, label: oreInfo.label, priority: oreInfo.priority })
      continue
    }

    // 原木
    if (isWorthChopping(clean)) {
      const p = chopPriority(clean)
      if (p > 0) {
        targets.push({ task: 'chop_tree', blockName: clean, label: '原木', priority: p })
        continue
      }
    }

    // 成熟作物
    if (clean.includes('wheat') && clean.includes('age_7')) {
      targets.push({ task: 'farm_crop', blockName: clean, label: '小麦', priority: 20 })
    } else if ((clean.includes('carrots') || clean.includes('potatoes') || clean.includes('beetroots')) && clean.includes('age_')) {
      targets.push({ task: 'farm_crop', blockName: clean, label: '作物', priority: 15 })
    }
  }

  targets.sort((a, b) => b.priority - a.priority)
  ctx.targets = targets
  ctx.bestTarget = targets[0] ?? null

  if (ctx.bestTarget) {
    ctx.task = ctx.bestTarget.task
    switch (ctx.task) {
      case 'mine_ore': ctx.toolNeeded = 'pickaxe'; break
      case 'chop_tree': ctx.toolNeeded = 'axe'; break
      case 'farm_crop': ctx.toolNeeded = 'hoe'; break
    }

    // 工具匹配：找最佳工具 + 检查备用
    const toolList = suggestTool(
      ctx.task === 'mine_ore' ? 'mine' : ctx.task === 'chop_tree' ? 'chop' : 'farm'
    )
    const matchedTools = toolList.filter(t => toolNames.has(t))
    ctx.availableTool = matchedTools[0] ?? null
    ctx.hasBackupTool = matchedTools.length > 1

    // 资源耗尽检测
    if (ctx.task === 'mine_ore' || ctx.task === 'chop_tree') {
      if (!ctx.availableTool) {
        ctx.resourceExhausted = true
        ctx.missingResource = ctx.task === 'mine_ore' ? '镐子' : '斧头'
        ctx.exhaustionReason = ctx.task === 'mine_ore'
          ? '镐子没了……没法挖矿了。'
          : '斧头没了……没法砍树了。'
      }
    }
    if (ctx.task === 'farm_crop') {
      // 检查有没有种子
      const seedNames = ['wheat_seeds', 'beetroot_seeds', 'carrot', 'potato', 'melon_seeds', 'pumpkin_seeds']
      const hasSeeds = seedNames.some(s => toolNames.has(s))
      if (!ctx.availableTool && !hasSeeds) {
        ctx.resourceExhausted = true
        ctx.missingResource = '种子和锄头'
        ctx.exhaustionReason = '没有种子也没有锄头……没法种地。'
      } else if (!hasSeeds && ctx.availableTool) {
        ctx.resourceExhausted = true
        ctx.missingResource = '种子'
        ctx.exhaustionReason = '种子用完了。'
      }
    }
  }

  // 威胁排序
  const threats = state.nearbyHostileMobs ?? []
  if (threats.length > 0) {
    threats.sort((a, b) => mobThreatLevel(b.type) - mobThreatLevel(a.type))
    ctx.topThreatType = threats[0].type
  }

  // 背包管理
  if (ctx.inventoryFullness > 0.8) {
    let worstSlot = -1
    let worstPriority = 999
    for (const s of inventorySlots) {
      const p = itemPriority(s.name)
      if (p < worstPriority) {
        worstPriority = p
        worstSlot = s.slot
      }
    }
    if (worstSlot >= 0 && worstPriority <= 5) {
      ctx.suggestedDiscardSlot = worstSlot
    }
  }

  return ctx
}

// ═══════════════════════════════════════════════════════════════
// 工具/操作辅助
// ═══════════════════════════════════════════════════════════════
export interface EquipmentAction {
  kind: 'hold_item'
  item: string
}

export function equipForTask(
  task: 'combat' | 'mine' | 'chop' | 'dig' | 'farm',
  inventorySlots: Array<{ slot: number; name: string }>
): EquipmentAction | null {
  const candidates = suggestTool(task)
  for (const candidate of candidates) {
    const match = inventorySlots.find(s => s.name.replace(/^minecraft:/, '').toLowerCase() === candidate)
    if (match) return { kind: 'hold_item', item: match.name.replace(/^minecraft:/, '') }
  }
  return null
}

export function findBestFood(inventorySlots: Array<{ slot: number; name: string }>): EquipmentAction | null {
  const foodPatterns = [
    'golden_apple', 'cooked_beef', 'cooked_porkchop', 'golden_carrot',
    'bread', 'steak', 'cooked_chicken', 'cooked_mutton', 'cooked_rabbit',
    'baked_potato', 'apple', 'carrot', 'melon_slice', 'sweet_berries'
  ]
  for (const food of foodPatterns) {
    const match = inventorySlots.find(s => s.name.replace(/^minecraft:/, '').toLowerCase() === food)
    if (match) return { kind: 'hold_item', item: match.name.replace(/^minecraft:/, '') }
  }
  return null
}

// ═══════════════════════════════════════════════════════════════
// 工作台词
// ═══════════════════════════════════════════════════════════════
const WORK_LINES: Record<string, Record<string, string[]>> = {
  deredere: {
    mine_ore: ['我来帮忙挖！', '有矿石！我来！', '等等我帮你挖～'],
    chop_tree: ['砍树交给我！', '我来砍树，你休息一下～'],
    farm_crop: ['庄稼熟了！我来收～', '这些可以收了！'],
    trash: ['背包太满，我扔点石头…', '这些不重要的东西我帮你丢了'],
    tool_broke: ['啊……镐子坏了。还有备用的吗？', '工具坏了……'],    seed_out: ['种子用完了呢……', '没有种子了……'],
  },
  tsundere: {
    mine_ore: ['有矿石。让开我来挖——不是想帮你，只是我手痒。', '矿石？正好，试试镐子。'],
    chop_tree: ['树我来砍。你砍太慢了。', '砍树这种事我来就行——不用谢。'],
    farm_crop: ['庄稼熟了。这都不收？我来。'],
    trash: ['背包满了还捡垃圾？我帮你扔了。'],
    tool_broke: ['切……工具坏了。你有备用的吗？', '工具爆了。不是我故意的。'], seed_out: ['种子没了。你也不带多点。', '没种子了。'],
  },
  kuudere: {
    mine_ore: ['矿。我来。', '有矿。开挖。'],
    chop_tree: ['树。我来砍。'],
    farm_crop: ['作物。收了。'],
    trash: ['满了。丢了。'],
    tool_broke: ['工具损坏。', '工具没了。'], seed_out: ['种子耗尽。', '无种子。'],
  },
  genki: {
    mine_ore: ['哇有矿！！我来挖我来挖！！', '矿石矿石！！冲冲冲！！'],
    chop_tree: ['砍树啦！！看我一斧子！！', '木材木材！！'],
    farm_crop: ['成熟啦！！收菜收菜！！'],
    trash: ['背包爆了！！扔垃圾时间！！'],
    tool_broke: ['啊——工具爆了！！有备用的吗！！', '坏了坏了！！谁有备用的！！'], seed_out: ['种子没啦！！谁有种子的！！', '没种子了啊啊啊！！'],
  },
  loyal_pup: {
    mine_ore: ['主人主人！我来挖！', '有矿！我帮你挖！'],
    chop_tree: ['砍树交给我！主人休息！'],
    farm_crop: ['庄稼熟了主人！我来收！'],
    trash: ['背包满了！我丢掉没用的东西！'],
    tool_broke: ['主人……工具坏了。对不起。', '我的工具坏了……'], seed_out: ['主人，种子没有了……', '种子用完了……'],
  },
  mommy: {
    mine_ore: ['有矿石呢。我来挖，你看着就好。', '挖矿太累了，让我来吧。'],
    chop_tree: ['砍树这种事让我来。你休息。'],
    farm_crop: ['庄稼熟了。交给我就好。'],
    trash: ['背包快满了。我帮你整理一下。'],
    tool_broke: ['工具坏掉了呢。没关系，有备用的就好。', '这个工具寿命到了。'], seed_out: ['种子没有了。下次多带一些哦。', '种子用光了。'],
  },
  yandere: {
    mine_ore: ['有矿？我来挖。你不准碰。', '矿是我的。你的也是我的。'],
    chop_tree: ['树我来砍。你站旁边。'],
    farm_crop: ['庄稼熟了。收了就是我们的。'],
    trash: ['垃圾。丢掉了。'],
    tool_broke: ['工具坏了……不过无所谓，我还有办法。', '坏了。反正也用够了。'], seed_out: ['种子没了。不过没关系。', '没有种子了……反正你也不会种。'],
  },
  shitakiri: {
    mine_ore: ['矿啊。比你靠谱多了——至少钻石不会放我鸽子。', '终于有点值得挖的东西了。'],
    chop_tree: ['树我来砍。你那效率简直是对斧子的侮辱。'],
    farm_crop: ['庄稼熟了。你连这都没注意到？'],
    trash: ['垃圾扔了。这也需要我动手？'],
    tool_broke: ['工具废了。意料之中。', '工具坏了。你最好是带了备用的。'], seed_out: ['种子没了。谁让你不多带点。', '种子用完了。精准预判。'],
  },
  mesugaki: {
    mine_ore: ['有矿诶！！你觉得你挖得比我快吗？来比呀～', '矿！！我先看到的！！'],
    chop_tree: ['砍树我来～你砍得动吗～'],
    farm_crop: ['庄稼熟了～快点收不然我全吃掉了～'],
    trash: ['背包满啦～先扔你的还是先扔我的～'],
    tool_broke: ['啊——我的工具！！肯定是你的霉运传给我了！！', '工具炸了！！你得赔我一个！！'], seed_out: ['种子没啦～你要负责去找～', '种子呢种子呢！你是不是偷吃了！'],
  },
  gap_moe: {
    mine_ore: ['（小声）有矿石……我来帮忙。', '矿……我试试看。'],
    chop_tree: ['（抬头看树）好高……但我会努力的。'],
    farm_crop: ['庄稼熟了……我去收。'],
    trash: ['（低头整理背包）这些不要了……'],
    tool_broke: ['（愣住）坏了……怎么办……', '工具……对不起，我太用力了。'], seed_out: ['种子没有了……是我用太多了吗？', '种子用光了……（不安）'],
  },
  ice_queen: {
    mine_ore: ['矿石。效率优先。', '矿。我来。'],
    chop_tree: ['树。我来处理。'],
    farm_crop: ['作物成熟。收割。'],
    trash: ['空间不足。清理。'],
    tool_broke: ['工具损坏。意料之内。', '工具报废。继续。'], seed_out: ['种子为零。', '种子耗尽。'],
  },
  bokke: {
    mine_ore: ['诶这闪闪的是什么？矿石？', '哇地下有东西！是什么矿来着？'],
    chop_tree: ['树好高啊……我来砍？还是你来？'],
    farm_crop: ['庄稼什么时候熟的？！我都没注意！'],
    trash: ['背包好重……这些能扔吗？'],
    tool_broke: ['诶诶诶？！工具怎么不在了？！', '我工具呢？刚刚还在手里的呀！'], seed_out: ['啊咧咧？种子呢？', '种子不见了……是不是掉路上了？'],
  },
}

const DEFAULT_WORK: Record<string, string[]> = {
  mine_ore: ['我来挖！', '有矿！'],
  chop_tree: ['我来砍！'],
  farm_crop: ['庄稼可以收了！'],
  trash: ['背包满了，我扔一些。'],
  tool_broke: ['工具坏了……', '工具没了……'],
  seed_out: ['种子用完了。', '没种子了。'],
}

export function workLine(personalityId: string, key: string): string {
  const pool = WORK_LINES[personalityId]?.[key] ?? DEFAULT_WORK[key]
  if (!pool || pool.length === 0) return '…'
  return pool[Math.floor(Math.random() * pool.length)]
}
