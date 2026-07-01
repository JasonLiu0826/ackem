// [gaming/types] — MC 游戏模式类型定义
// 引用：../../docs/mainDocs/MC事件脚本全目录.md

/** 游戏事件类型 */
export type McEventType = string // mc:diamond_found, mc:creeper_nearby, ...

/** 情绪分组（影响变体选择） */
export type EmotionGroup = 'CALM' | 'AROUSED' | 'NEGATIVE'

/** 一条脚本反应 */
export interface ScriptReaction {
  /** 变体文本数组（至少 8 条） */
  variants: string[]
  /** 彩蛋文本数组（至少 3 条） */
  easterEggs: string[]
}

/** 单个事件 × 单人格 × 多情绪组的反应集 */
export interface PersonalityReactions {
  CALM: ScriptReaction
  AROUSED: ScriptReaction
  NEGATIVE: ScriptReaction
}

/** 完整模板库 */
export type TemplateLibrary = Record<McEventType, Record<string, PersonalityReactions>>

/** 选择结果 */
export interface ReactionResult {
  text: string
  isEasterEgg: boolean
  emotionGroup: EmotionGroup
}

/** MC 日志解析结果 */
export interface McGameEvent {
  type: McEventType
  /** 原始日志行 */
  raw: string
  /** 解析出的负载数据 */
  payload?: {
    mobType?: string
    oreType?: string
    biomeName?: string
    dimensionName?: string
    deathCause?: string
    playerName?: string
    itemName?: string
    structureName?: string
    achievementName?: string
    weatherType?: string
    timeOfDay?: string
    chatMessage?: string
    coordinates?: { x: number; y: number; z: number }
  }
  timestamp: string
}

/** MC 游戏状态（供行为决策器使用） */
export interface McGameState {
  playerHealth: number
  playerHunger: number
  botHealth: number
  botHunger: number
  playerPosition: { x: number; y: number; z: number }
  botPosition: { x: number; y: number; z: number }
  dimension: 'overworld' | 'nether' | 'end'
  nearbyHostileMobs: Array<{
    id?: number | string
    type: string
    distance: number
    distanceToPlayer?: number
    position?: { x: number; y: number; z: number }
  }>
  nearbyItems: Array<{ type: string; distance: number }>
  timeOfDay: 'day' | 'sunset' | 'night' | 'sunrise'
  weather: 'clear' | 'rain' | 'thunder' | 'snow'
  isPlayerSneaking: boolean
  isPlayerSprinting: boolean
  isPlayerLookingAtBot: boolean
  /** bot 脚下方块是否是水 */
  botInWater: boolean
  /** bot 脚下方块是否是岩浆 */
  botInLava: boolean
  /** 推测的群系类型（基于附近方块推断） */
  biome: 'plains' | 'forest' | 'desert' | 'snowy' | 'ocean' | 'swamp' | 'jungle' | 'mountain' | 'underground' | 'nether' | 'end' | 'unknown'
  /** 是否在地下（Y < 55 且上方有方块） */
  isUnderground: boolean
  /** 玩家可能在另一维度（本维度找不到玩家实体） */
  playerNotFound: boolean
  /** Bot 周围 8 格方块名列表（供工作检测） */
  nearbyBlockNames: string[]
  /** Bot 背包物品 */
  botInventory: Array<{ slot: number; name: string }>
  /** 🆕 附近有人造建筑 */
  buildingDetected: boolean
  buildingStyle: string
  buildingDescription: string
  /** 🆕 玩家是否在睡觉 */
  playerSleeping: boolean
  /** 🆕 附近床的坐标（供找床睡觉） */
  nearbyBeds: Array<{ x: number; y: number; z: number }>
  /** 玩家身边有敌对生物（水平距离 < 5 格） */
  playerInDanger: boolean
  /** 离玩家最近的敌对生物名 */
  nearestThreatToPlayer: string | null
  /** 离玩家最近的敌对生物实体 ID */
  nearestThreatToPlayerId?: number | string | null
  /** 离玩家 12 格内最近的敌对生物名（默认清怪用） */
  nearestHostileToPlayer?: string | null
  /** 离玩家 12 格内最近的敌对生物实体 ID */
  nearestHostileToPlayerId?: number | string | null
  /** 玩家挥刀准星目标（TTL，非「身边最近实体」） */
  playerAttacking: string | null
  /** 玩家挥刀准星目标实体 ID */
  playerAttackingId?: number | string | null
  /** 最近伤害玩家的敌对生物（TTL） */
  playerHurtByHostile?: string | null
  /** 最近伤害玩家的敌对生物实体 ID */
  playerHurtByHostileId?: number | string | null
  /** 玩家 3 秒内受过伤 */
  playerRecentlyHurt?: boolean
}

/** 引擎状态输入（供脚本引擎按情绪分组） */
export interface EngineStateForGaming {
  aff: number
  sec: number
  aro: number
  trust: number
  stage: string
  personalityId: string
}
