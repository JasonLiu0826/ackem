// [gaming/mc-bot] 鈥?Minecraft Bot 鏍稿績妯″潡
// 鑱岃矗锛歁ineflayer 鐢熷懡鍛ㄦ湡绠＄悊 + 琛屼负寰幆 + Ackem WS 閫氫俊
// 寮曠敤锛?/types, ./mc-behavior, ./mc-humanizer, ./mc-ws-server, ./script-engine

import type { Bot } from 'mineflayer'
import type { McGameState, EngineStateForGaming, McGameEvent } from './types'
import { decideBehavior, type BehaviorDecision } from './mc-behavior'
import { selectReaction } from './script-engine'
import { reportPlayerAction } from './mc-humanizer'
import { markSlotAsGifted, cleanupGiftedSlots,
  fullInventoryLine, findDiscardableSlot, giftReaction, recordGiftReceived,
  getGiftStats, recordDeath, getDeathCount, deathReaction, lostItemsLine } from './mc-inventory'
import { isWorthPickup, oreLabel, isHostileMob } from './mc-work'
import { detectBuilding } from './mc-survival'
import {
  createPlayerCombatTrack,
  nearestHostileToPoint,
  entityInPlayerCrosshair,
  entityName,
  entityId,
  updateOnPlayerSwing,
  updateOnPlayerHurt,
  tickHealthRegen,
  isSwingTargetValid,
  isHurtByHostileValid,
  isPlayerRecentlyHurt,
  resolvePlayerHealth,
  resolvePlayerHunger,
  type PlayerCombatTrack,
} from './mc-combat-target'
import {
  buildDebugSnapshot,
  filterActionsForCombatLock,
  type McBotDebugSnapshot,
} from './mc-bot-state'
import { createLogger } from '../../../../logger'

const log = createLogger('mc-bot')

type BotCallbacks = {
  onStateChange?: (state: McGameState) => void
  onDecision?: (decision: BehaviorDecision) => void
  onEvent?: (event: McGameEvent, reaction: string | null) => void
  onChatMessage?: (username: string, message: string) => void
  onError?: (error: string) => void
}

export interface BotConfig {
  host: string
  port: number
  username: string
  password?: string
  /** Ackem WebSocket 鍦板潃 */
  AckemWsUrl: string
  /** 琛屼负鍐崇瓥 tick 闂撮殧锛坢s锛?*/
  tickIntervalMs: number
  /** 鏄惁鍚敤鑷姩鎴樻枟 */
  autoCombat: boolean
  /** 鏄惁鍚敤鑷姩璺熼殢 */
  autoFollow: boolean
  /** 鏄惁鍚敤鑷姩鎸栫熆 */
  autoMine: boolean
}

const DEFAULT_CONFIG: Partial<BotConfig> = {
  port: 25565,
  AckemWsUrl: 'ws://localhost:19532',
  tickIntervalMs: 500,
  autoCombat: true,
  autoFollow: true,
  autoMine: false,
}

let bot: Bot | null = null
let config: BotConfig | null = null
let callbacks: BotCallbacks = {}
let tickTimer: ReturnType<typeof setInterval> | null = null
let ws: import('ws').WebSocket | null = null
let engineState: EngineStateForGaming | null = null
let gameState: McGameState | null = null
let playerAfkSec = 0
let isRunning = false
/** 鐜╁鍚嶅瓧锛堣法缁村害浼犻€佹椂鐢級 */
let storedPlayerName = ''
let mcData: any = null
let playerCombat: PlayerCombatTrack = createPlayerCombatTrack()
let lastPlayerHealthEventAt = 0
let lastMobHurtPlayerEventAt = 0
const PLAYER_HURT_EVENT_COOLDOWN_MS = 12_000
const MOB_HURT_PLAYER_EVENT_COOLDOWN_MS = 8000
const ATTACK_REACH = 3.1
const ATTACK_CHASE_RANGE = 24
const ATTACK_LOOP_MS = 12_000
const ATTACK_COOLDOWN_MS = 650
let tickInProgress = false
let lastPathRecoveryAt = 0
const PATH_RECOVERY_COOLDOWN_MS = 5000
let activeAttackTarget: number | string | null = null
let activeAttackName: string | null = null
let activeAttackUntil = 0
let lastDecision: import('./mc-behavior').BehaviorDecision | null = null
let lastDebugSnapshot: McBotDebugSnapshot | null = null
let lastDebugPushAt = 0
const DEBUG_PUSH_INTERVAL_MS = 400
let activeFollowEntityId: number | string | null = null
let activeFollowRange = 0
let activeFollowSetAt = 0
const FOLLOW_GOAL_REFRESH_MS = 5000
const STUCK_CHECK_INTERVAL_MS = 1000
const STUCK_POSITION_EPSILON = 0.35
const STUCK_TRIGGER_MS = 3000
const STUCK_TELEPORT_DISTANCE = 10
type StuckWatch = {
  lastPos: { x: number; y: number; z: number } | null
  lastMovedAt: number
  lastCheckAt: number
  lastRecoveryAt: number
  reason: string
}
const stuckWatch: StuckWatch = {
  lastPos: null,
  lastMovedAt: Date.now(),
  lastCheckAt: 0,
  lastRecoveryAt: 0,
  reason: 'init',
}

function getPathStatus(b: Bot): string {
  const pf = (b as any).pathfinder
  if (!pf) return 'no_pathfinder'
  const goal = pf.goal ?? pf.getGoal?.()
  if (!goal) return 'no_goal'
  if (pf.isMoving?.()) return 'moving'
  if (pf.isStuck?.()) return 'stuck'
  return 'has_goal'
}

function getStuckForMs(now = Date.now()): number {
  return Math.max(0, now - stuckWatch.lastMovedAt)
}

function pushDebugSnapshot(gs: McGameState, decision: import('./mc-behavior').BehaviorDecision | null): void {
  const now = Date.now()
  const snapshot = buildDebugSnapshot({
    now,
    gs,
    decision,
    activeAttackTarget,
    activeAttackUntil,
    activeAttackName,
    activeFollowEntityId,
    activeFollowRange,
    stuckForMs: getStuckForMs(now),
    stuckReason: stuckWatch.reason,
    pathStatus: bot ? getPathStatus(bot) : 'disconnected',
  })
  lastDebugSnapshot = snapshot
  if (now - lastDebugPushAt < DEBUG_PUSH_INTERVAL_MS) return
  lastDebugPushAt = now
  void import('./mc-ws-server.js').then(({ pushMcDebugToRenderer }) => {
    pushMcDebugToRenderer(snapshot)
  }).catch(() => { /* renderer push optional */ })
}

/** 瀹炴満璋冭瘯蹇収锛堜緵 IPC / UI 杞锛?*/
export function getBotDebugSnapshot(): McBotDebugSnapshot | null {
  if (lastDebugSnapshot) return lastDebugSnapshot
  const gs = gameState
  const b = bot
  if (!gs || !b?.entity) return null
  return buildDebugSnapshot({
    now: Date.now(),
    gs,
    decision: lastDecision,
    activeAttackTarget,
    activeAttackUntil,
    activeAttackName,
    activeFollowEntityId,
    activeFollowRange,
    stuckForMs: getStuckForMs(),
    stuckReason: stuckWatch.reason,
    pathStatus: getPathStatus(b),
  })
}

/** 鑾峰彇褰撳墠 bot 杩愯鐘舵€?*/
export function getBotStatus(): {
  connected: boolean
  username: string
  health: number
  hunger: number
  position: { x: number; y: number; z: number }
  dimension: string
  wsConnected: boolean
} | null {
  const b = bot
  if (!b?.entity) return null
  return {
    connected: isRunning,
    username: b.username,
    health: Math.round(b.health),
    hunger: Math.round(b.food),
    position: {
      x: Math.round(b.entity.position.x * 10) / 10,
      y: Math.round(b.entity.position.y * 10) / 10,
      z: Math.round(b.entity.position.z * 10) / 10,
    },
    dimension: (b as any).game.dimension,
    wsConnected: ws?.readyState === ws?.OPEN,
  }
}

function normalizeDimension(raw: unknown): McGameState['dimension'] {
  const value = String(raw ?? '').toLowerCase()
  if (value.includes('nether')) return 'nether'
  if (value.includes('end')) return 'end'
  return 'overworld'
}

function clearActiveFollowGoal(): void {
  activeFollowEntityId = null
  activeFollowRange = 0
  activeFollowSetAt = 0
}

/** 浠庝笘鐣屽疄浣撴垨 tab 鍒楄〃瑙ｆ瀽鏈€杩戠帺瀹讹紙瀹炰綋鏈姞杞芥椂 tab 甯告湁浣嶇疆锛?*/
function resolveNearestPlayer(b: Bot): { entity: any; username: string } | null {
  const fromWorld = Object.values(b.entities).filter(
    (e: any) => e.type === 'player' && e !== b.entity && e.position,
  )
  if (fromWorld.length > 0) {
    const nearest = fromWorld.reduce((a: any, c: any) =>
      a.position.distanceTo(b.entity!.position) < c.position.distanceTo(b.entity!.position) ? a : c,
    )
    const username = nearest.username ?? nearest.name ?? ''
    if (username) storedPlayerName = username
    return { entity: nearest, username }
  }
  for (const p of Object.values(b.players ?? {}) as any[]) {
    if (p?.entity && p.entity !== b.entity && p.entity.position) {
      if (p.username) storedPlayerName = p.username
      return { entity: p.entity, username: p.username ?? storedPlayerName }
    }
  }
  return null
}

function pathfinderHasGoal(b: Bot): boolean {
  const pf = (b as any).pathfinder
  if (!pf) return false
  return Boolean(pf.goal ?? pf.getGoal?.())
}

/** 璁剧疆璺熼殢鐩爣锛堜緵 tick / spawn 鍏滃簳锛?*/
async function ensureFollowPlayer(followDistance = 3, force = false): Promise<boolean> {
  const b = bot
  if (!b?.entity || !(b as any).pathfinder) return false

  const resolved = resolveNearestPlayer(b)
  const goals = await getGoals()
  if (!goals) return false

  const dimension = normalizeDimension((b as any).game?.dimension)
  const range = dimension === 'nether' ? Math.min(followDistance, 2) : followDistance
  const now = Date.now()

  if (resolved?.entity) {
    const targetId = resolved.entity.id ?? resolved.entity.uuid ?? resolved.username ?? 'player'
    if (
      !force &&
      pathfinderHasGoal(b) &&
      activeFollowEntityId === targetId &&
      Math.abs(activeFollowRange - range) < 0.25 &&
      now - activeFollowSetAt < FOLLOW_GOAL_REFRESH_MS
    ) {
      return true
    }
    if (goals.GoalFollow) {
      resetStuckWatch('ensure_follow')
      b.pathfinder.setGoal(new goals.GoalFollow(resolved.entity, range), true)
    } else {
      const p = resolved.entity.position
      resetStuckWatch('ensure_follow')
      b.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, range))
    }
    activeFollowEntityId = targetId
    activeFollowRange = range
    activeFollowSetAt = now
    return true
  }

  const gs = gameState
  if (gs && !gs.playerNotFound) {
    if (
      !force &&
      pathfinderHasGoal(b) &&
      now - activeFollowSetAt < FOLLOW_GOAL_REFRESH_MS
    ) {
      return true
    }
    resetStuckWatch('ensure_follow_pos')
    b.pathfinder.setGoal(new goals.GoalNear(
      gs.playerPosition.x,
      gs.playerPosition.y,
      gs.playerPosition.z,
      range,
    ))
    activeFollowEntityId = 'player_pos'
    activeFollowRange = range
    activeFollowSetAt = now
    log.info('follow fallback GoalNear', {
      x: Math.round(gs.playerPosition.x),
      y: Math.round(gs.playerPosition.y),
      z: Math.round(gs.playerPosition.z),
    })
    return true
  }

  return false
}

function resetStuckWatch(reason: string): void {
  const b = bot
  stuckWatch.lastPos = b?.entity?.position
    ? { x: b.entity.position.x, y: b.entity.position.y, z: b.entity.position.z }
    : null
  const now = Date.now()
  stuckWatch.lastMovedAt = now
  stuckWatch.lastCheckAt = now
  stuckWatch.reason = reason
}

/** 璁剧疆 Ackem 寮曟搸鐘舵€侊紙渚涜涓哄喅绛栧櫒浣跨敤锛?*/
export function setEngineState(state: EngineStateForGaming): void {
  engineState = state
}

function buildGameState(): McGameState | null {
  const b = bot
  if (!b?.entity) return null

  const entities = Object.values(b.entities) as any[]
  const hostileEntities = entities
    .filter((e: any) => {
      if (e === b.entity) return false
      return e.type === 'mob' && isHostileMob(e.name ?? '')
    })

  // 鏌ユ壘鏈€杩戠帺瀹讹紙涓栫晫瀹炰綋 + tab 鍒楄〃锛?
  let playerPos = b.entity.position
  let playerNotFound = false
  let nearestPlayerEntity: any = null
  const resolvedPlayer = resolveNearestPlayer(b)
  if (resolvedPlayer) {
    nearestPlayerEntity = resolvedPlayer.entity
    playerPos = resolvedPlayer.entity.position
  } else {
    const tabPlayers = Object.values(b.players ?? {}) as any[]
    if (tabPlayers.length > 0) {
      storedPlayerName = tabPlayers[0].username ?? storedPlayerName
      // tab 鏈夌帺瀹朵絾瀹炰綋鏈姞杞斤細涓嶇畻璺ㄧ淮搴︼紝閬垮厤璇Е鍙戞壘浼犻€侀棬
      playerNotFound = false
    } else {
      playerNotFound = true
    }
  }

  const px = playerPos.x, py = playerPos.y, pz = playerPos.z
  const bx = b.entity.position.x, by = b.entity.position.y, bz = b.entity.position.z
  const nearbyHostile = hostileEntities.map((e: any) => {
    const bdx = e.position.x - bx
    const bdy = e.position.y - by
    const bdz = e.position.z - bz
    const pdx = e.position.x - px
    const pdy = e.position.y - py
    const pdz = e.position.z - pz
    return {
      id: entityId(e),
      type: entityName(e),
      distance: Math.sqrt(bdx * bdx + bdy * bdy + bdz * bdz),
      distanceToPlayer: Math.sqrt(pdx * pdx + pdy * pdy + pdz * pdz),
      position: { x: e.position.x, y: e.position.y, z: e.position.z },
    }
  })

  // 鍒ゆ柇鏃堕棿
  const timeOfDay = (b as any).time?.timeOfDay ?? 0
  let tod: McGameState['timeOfDay'] = 'day'
  if (timeOfDay > 12500 && timeOfDay < 13500) tod = 'sunset'
  else if (timeOfDay > 13000 || timeOfDay < 1000) tod = 'night'
  else if (timeOfDay > 22000) tod = 'sunrise'

  // 澶╂皵锛圡ineflayer Bot 绫诲瀷鏈０鏄?rainState/thunderState锛岄€氳繃 any 璁块棶锛?
  let weather: McGameState['weather'] = 'clear'
  if ((b as any).rainState > 0) weather = (b as any).thunderState > 0 ? 'thunder' : 'rain'

  // 鑴氫笅鏂瑰潡妫€娴嬶細姘?/ 宀╂祮 + 缇ょ郴鎺ㄦ祴
  let botInWater = false
  let botInLava = false
  let biome: McGameState['biome'] = 'unknown'
  let isUnderground = false
  try {
    const feetBlock = b.blockAt(b.entity.position.offset(0, -0.1, 0))
    if (feetBlock) {
      const name = feetBlock.name?.toLowerCase() ?? ''
      botInWater = name.includes('water')
      botInLava = name.includes('lava')
    }

    // 绠€鍗曠兢绯绘帹娴嬶細閲囨牱鍛ㄥ洿 5 涓柟鍧楃殑琛ㄩ潰绫诲瀷
    const samples = [0, 2, -2, 4, -4]
    const surfaceNames: string[] = []
    for (const dx of samples) {
      for (const dz of samples) {
        try {
          // 浠庝笂寰€涓嬫壘绗竴涓潪绌烘皵鏂瑰潡
          for (let dy = 3; dy >= -1; dy--) {
            const blk = b.blockAt(b.entity.position.offset(dx, dy, dz))
            if (blk && blk.name !== 'air' && blk.name !== 'cave_air' && blk.name !== 'void_air') {
              surfaceNames.push(blk.name?.toLowerCase() ?? '')
              break
            }
          }
        } catch { /* skip */ }
      }
    }

    // 缇ょ郴鎺ㄦ祴瑙勫垯
    const dim = normalizeDimension((b as any).game.dimension)
    if (dim === 'nether') {
      biome = 'nether'
    } else if (dim === 'end') {
      biome = 'end'
    } else if (by < 55) {
      // 鍦颁笅锛歒<55 涓斿ご椤舵湁鏂瑰潡
      const above = b.blockAt(b.entity.position.offset(0, 3, 0))
      isUnderground = !above || above.name === 'air' ? false : true
      if (isUnderground) biome = 'underground'
    }

    if (biome === 'unknown') {
      const sand = surfaceNames.filter(n => n.includes('sand')).length
      const snow = surfaceNames.filter(n => n.includes('snow') || n.includes('ice')).length
      const water = surfaceNames.filter(n => n.includes('water')).length
      const leaves = surfaceNames.filter(n => n.includes('leaves') || n.includes('log')).length
      const grass = surfaceNames.filter(n => n.includes('grass') || n.includes('dirt')).length
      const stone = surfaceNames.filter(n => n.includes('stone')).length

      if (water > grass + leaves + sand) biome = 'ocean'
      else if (sand > grass + leaves + snow && sand > 3) biome = 'desert'
      else if (snow > grass + sand && snow > 3) biome = 'snowy'
      else if (leaves > grass && leaves > 5) biome = 'jungle'
      else if (leaves > 3) biome = 'forest'
      else if (stone > grass + leaves && by > 80) biome = 'mountain'
      else if (grass > 3) biome = 'plains'
    }
  } catch { /* blockAt may fail */ }

  // 鎵弿鍛ㄥ洿 8 鏍兼柟鍧楀悕锛堜緵宸ヤ綔妫€娴嬶級
  const nearbyBlockNames: string[] = []
  try {
    const scanRadius = 4
    for (let dx = -scanRadius; dx <= scanRadius; dx += 2) {
      for (let dy = -1; dy <= 2; dy++) {
        for (let dz = -scanRadius; dz <= scanRadius; dz += 2) {
          const blk = b.blockAt(b.entity.position.offset(dx, dy, dz))
          if (blk && blk.name !== 'air' && blk.name !== 'cave_air') {
            nearbyBlockNames.push(blk.name)
          }
        }
      }
    }
  } catch { /* block scan failure is non-critical */ }

  // 鑳屽寘鐗╁搧
  const botInventory: Array<{ slot: number; name: string }> = []
  try {
    for (const item of b.inventory.items()) {
      botInventory.push({ slot: item.slot, name: item.name })
    }
  } catch { /* inventory access may fail */ }

  const now = Date.now()
  tickHealthRegen(playerCombat, now)
  const playerPoint = { x: px, y: py, z: pz }
  const closeThreatToPlayer = nearestHostileToPoint(entities, playerPoint, 5, b.entity)
  const nearestHostileToPlayer = nearestHostileToPoint(entities, playerPoint, 12, b.entity)
  const creeperNearPlayer = nearbyHostile.some(
    m => m.type.toLowerCase().includes('creeper') && (m.distanceToPlayer ?? 99) < 10,
  )
  const playerInDanger =
    closeThreatToPlayer != null ||
    creeperNearPlayer ||
    isPlayerRecentlyHurt(playerCombat, now)

  return {
    playerHealth: resolvePlayerHealth(nearestPlayerEntity, playerCombat),
    playerHunger: resolvePlayerHunger(nearestPlayerEntity),
    botHealth: Math.round(b.health), botHunger: Math.round(b.food),
    playerPosition: { x: px, y: py, z: pz },
    botPosition: { x: bx, y: by, z: bz },
    dimension: normalizeDimension((b as any).game.dimension),
    nearbyHostileMobs: nearbyHostile, nearbyItems: [],
    timeOfDay: tod, weather,
    isPlayerSneaking: false, isPlayerSprinting: false, isPlayerLookingAtBot: false,
    botInWater, botInLava, biome, isUnderground, playerNotFound,
    nearbyBlockNames, botInventory,
    playerInDanger,
    nearestThreatToPlayer: closeThreatToPlayer?.type ?? null,
    nearestThreatToPlayerId: closeThreatToPlayer?.id ?? null,
    nearestHostileToPlayer: nearestHostileToPlayer?.type ?? null,
    nearestHostileToPlayerId: nearestHostileToPlayer?.id ?? null,
    playerAttacking: isSwingTargetValid(playerCombat, now) ? playerCombat.lastSwingTarget : null,
    playerAttackingId: isSwingTargetValid(playerCombat, now) ? playerCombat.lastSwingTargetId : null,
    playerHurtByHostile: isHurtByHostileValid(playerCombat, now) ? playerCombat.lastHurtByHostile : null,
    playerHurtByHostileId: isHurtByHostileValid(playerCombat, now) ? playerCombat.lastHurtByHostileId : null,
    playerRecentlyHurt: isPlayerRecentlyHurt(playerCombat, now),
    // 寤虹瓚妫€娴?
    ...(() => {
      const bld = detectBuilding(nearbyBlockNames, { x: bx, y: by, z: bz }, { x: px, y: py, z: pz })
      return { buildingDetected: bld.detected, buildingStyle: bld.style, buildingDescription: bld.description }
    })(),
    // 鐜╁鐫¤妫€娴嬶紙Mineflayer锛歱ose === 'sleeping' 鎴?isSleeping锛?
    playerSleeping: (() => {
      const nearPlayers = entities.filter((e: any) => e.type === 'player' && e !== b.entity)
      return nearPlayers.some((p: any) => p.isSleeping === true || p.pose === 'sleeping')
    })(),
    // 鎵弿闄勮繎搴婂潗鏍囷紙鍗婂緞 16 鏍硷級
    nearbyBeds: (() => {
      if (normalizeDimension((b as any).game.dimension) === 'nether') return []
      const beds: Array<{ x: number; y: number; z: number }> = []
      try {
        const bedBlocks = (b as any).findBlocks?.({
          matching: (block: any) => block.name?.includes('_bed') && !block.name?.includes('bedrock'),
          maxDistance: 16, count: 5,
        }) ?? b.findBlocks({
          matching: (block: any) => block.name?.includes('_bed') && !block.name?.includes('bedrock'),
          maxDistance: 16, count: 5,
        })
        if (bedBlocks) {
          for (const bp of bedBlocks) {
            beds.push({ x: bp.x, y: bp.y, z: bp.z })
          }
        }
      } catch { /* findBlocks may not be available */ }
      return beds
    })(),
  }
}

/** 浠?item entity 鐨?metadata 涓В鏋愮湡瀹炵墿鍝佸悕 */
function resolveItemName(entity: any): string {
  try {
    // 1) 灏濊瘯 metadata锛歁inecraft item entity 鐨?metadata 鍖呭惈 item stack 鏁版嵁
    if (entity.metadata && Array.isArray(entity.metadata)) {
      for (const entry of entity.metadata) {
        if (!entry) continue
        // metadata entry 鏍煎紡锛歿 key: number, value: ... } 鎴栫洿鎺ュ湪 entry 涓?
        const itemData = entry.item ?? entry.value?.item ?? entry.blockId ?? entry.itemId
        if (itemData !== undefined && itemData !== null) {
          // itemData 鍙兘鏄?{ blockId, itemCount, nbt } 鎴栫函鏁板瓧 id
          const id = typeof itemData === 'object' ? (itemData.blockId ?? itemData.itemId) : itemData
          if (id !== undefined && id !== null && mcData) {
            const itemDef = mcData.items?.[id]
            if (itemDef) return itemDef.name
          }
        }
      }
    }
    // 2) fallback锛歞isplayName
    if (entity.displayName && typeof entity.displayName === 'string' && entity.displayName !== 'item') {
      return entity.displayName
    }
    // 3) 鏈€鍚庡厹搴?
    return '鐗╁搧'
  } catch {
    return '鐗╁搧'
  }
}

/** 鑾峰彇 vec3 鏋勯€犲嚱鏁帮紙鎳掑姞杞斤級 */
let _Vec3: any = null
async function getVec3(): Promise<any> {
  if (_Vec3) return _Vec3
  _Vec3 = (await import('vec3')).default
  return _Vec3
}

/** 鑾峰彇 pathfinder goals锛堟噿鍔犺浇锛?*/
let _goals: any = null
async function getGoals(): Promise<any> {
  if (_goals) return _goals
  // mineflayer-pathfinder: CJS 妯″潡锛孍SM 鍔ㄦ€?import 鍚?goals 鍦?.default.goals
  const pfModule = await import('mineflayer-pathfinder')
  _goals = pfModule.default?.goals ?? pfModule.goals
  if (!_goals?.GoalNear) {
    log.error('failed to resolve mineflayer-pathfinder goals', { keys: Object.keys(pfModule) })
  }
  return _goals
}

function idsEqual(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b)
}

function entityMatchesTarget(e: any, targetName: string): boolean {
  if (!e?.position || e === bot?.entity || e.isValid === false) return false
  if (e.type === 'player' || e.type === 'object') return false
  const name = entityName(e).toLowerCase().replace(/^minecraft:/, '')
  const target = targetName.toLowerCase().replace(/^minecraft:/, '')
  return name === target || name.includes(target) || target.includes(name)
}

function findAttackTarget(b: Bot, targetName: string, targetId?: number | string | null): any | null {
  if (targetId != null) {
    const locked = Object.values(b.entities).find((e: any) =>
      e?.position &&
      e !== b.entity &&
      e.isValid !== false &&
      idsEqual(entityId(e), targetId) &&
      e.position.distanceTo(b.entity.position) <= ATTACK_CHASE_RANGE
    )
    if (locked) return locked
  }
  const candidates = Object.values(b.entities)
    .filter((e: any) => entityMatchesTarget(e, targetName))
    .filter((e: any) => e.position.distanceTo(b.entity.position) <= ATTACK_CHASE_RANGE)
    .sort((a: any, c: any) => a.position.distanceTo(b.entity.position) - c.position.distanceTo(b.entity.position))
  return candidates[0] ?? null
}

async function executeAttackTarget(targetName: string, targetId?: number | string | null): Promise<void> {
  const normalized = targetId ?? targetName.toLowerCase()
  const nowStart = Date.now()
  if (activeAttackTarget === normalized && nowStart < activeAttackUntil) return
  activeAttackTarget = normalized
  activeAttackName = targetName
  activeAttackUntil = nowStart + ATTACK_LOOP_MS + 500

  const started = Date.now()
  let lastAttackAt = 0
  const typeLower = targetName.toLowerCase()
  const isCreeper = typeLower.includes('creeper')

  try {
    while (isRunning && bot?.entity && Date.now() - started < ATTACK_LOOP_MS) {
      const b = bot
      const target = b ? findAttackTarget(b, targetName, targetId) : null
      if (!b?.entity || !target?.position || target.isValid === false) return

      const distance = target.position.distanceTo(b.entity.position)
      if (distance > ATTACK_CHASE_RANGE) return

      // 鑻﹀姏鎬曪細浠呰创鑴革紙<2.2鏍硷級鍚庢挙锛涘惁鍒欎繚鎸?3鈥? 鏍艰拷鍑诲苟鎸ュ垁
      if (isCreeper && distance < 2.2 && (b as any).pathfinder) {
        const goals = await getGoals()
        if (goals?.GoalNear) {
          clearActiveFollowGoal()
          const dx = b.entity.position.x - target.position.x
          const dz = b.entity.position.z - target.position.z
          const len = Math.sqrt(dx * dx + dz * dz) || 1
          b.pathfinder.setGoal(new goals.GoalNear(
            b.entity.position.x + (dx / len) * 4,
            b.entity.position.y,
            b.entity.position.z + (dz / len) * 4,
            1,
          ))
        }
        await new Promise(r => setTimeout(r, 280))
        continue
      }

      if (distance > ATTACK_REACH) {
        if ((b as any).pathfinder) {
          const goals = await getGoals()
          if (goals?.GoalNear) {
            clearActiveFollowGoal()
            const chaseRange = isCreeper ? 3.5 : 2
            b.pathfinder.setGoal(new goals.GoalNear(target.position.x, target.position.y, target.position.z, chaseRange))
          }
        }
        await new Promise(r => setTimeout(r, 250))
        continue
      }

      try {
        await b.lookAt(target.position.offset(0, (target.height ?? 1) * 0.6, 0), true)
      } catch { /* looking can fail while entities despawn */ }

      const now = Date.now()
      if (now - lastAttackAt >= ATTACK_COOLDOWN_MS) {
        b.attack(target as any)
        lastAttackAt = now
      }
      await new Promise(r => setTimeout(r, 120))
    }
  } finally {
    if (activeAttackTarget === normalized) {
      activeAttackTarget = null
      activeAttackName = null
      activeAttackUntil = 0
    }
  }
}

async function recoverFromPathProblem(reason: string): Promise<void> {
  const b = bot
  if (!b?.entity || !isRunning) return
  const now = Date.now()
  if (now - lastPathRecoveryAt < PATH_RECOVERY_COOLDOWN_MS) return
  const players = Object.values(b.entities).filter((e: any) => e.type === 'player' && e !== b.entity) as any[]
  if (players.length === 0) return
  const player = players.reduce((a: any, c: any) =>
    a.position.distanceTo(b.entity.position) < c.position.distanceTo(b.entity.position) ? a : c,
  )
  const dist = player.position.distanceTo(b.entity.position)
  const dimension = normalizeDimension((b as any).game?.dimension)
  if (dist < (dimension === 'nether' ? 6 : 10)) return

  lastPathRecoveryAt = now
  clearActiveFollowGoal()
  try { b.pathfinder?.stop?.() } catch { /* ignore */ }
  if (dist > 28 || dimension === 'nether') {
    const targetName = player.username ?? player.name ?? storedPlayerName
    if (targetName) {
      log.info('path recovery teleport', { reason, distance: Math.round(dist * 10) / 10 })
      b.chat(`/tp ${b.username} ${targetName}`)
    }
    return
  }

  try {
    const goals = await getGoals()
    if (goals?.GoalNear && b.pathfinder) {
      log.info('path recovery retry', { reason, distance: Math.round(dist * 10) / 10 })
      clearActiveFollowGoal()
      b.pathfinder.setGoal(new goals.GoalNear(player.position.x, player.position.y, player.position.z, 3))
    }
  } catch { /* ignore recovery failures */ }
}

function isPathingOrFighting(b: Bot): boolean {
  const pf = (b as any).pathfinder
  const goal = pf?.goal ?? pf?.getGoal?.()
  return Boolean(goal || activeFollowEntityId || activeAttackTarget)
}

async function checkAndRecoverIfStuck(gs: McGameState): Promise<void> {
  const b = bot
  if (!b?.entity || !isRunning) return
  const now = Date.now()
  if (now - stuckWatch.lastCheckAt < STUCK_CHECK_INTERVAL_MS) return
  stuckWatch.lastCheckAt = now

  const pos = b.entity.position
  const last = stuckWatch.lastPos
  stuckWatch.lastPos = { x: pos.x, y: pos.y, z: pos.z }
  if (!last) {
    stuckWatch.lastMovedAt = now
    return
  }

  const moved = Math.sqrt(
    Math.pow(pos.x - last.x, 2) +
    Math.pow(pos.y - last.y, 2) +
    Math.pow(pos.z - last.z, 2),
  )
  if (moved >= STUCK_POSITION_EPSILON) {
    stuckWatch.lastMovedAt = now
    stuckWatch.reason = 'moving'
    return
  }

  if (!isPathingOrFighting(b)) {
    stuckWatch.lastMovedAt = now
    stuckWatch.reason = 'idle'
    return
  }

  const stuckFor = now - stuckWatch.lastMovedAt
  if (stuckFor < STUCK_TRIGGER_MS) return
  if (now - stuckWatch.lastRecoveryAt < PATH_RECOVERY_COOLDOWN_MS) return

  stuckWatch.lastRecoveryAt = now
  stuckWatch.reason = 'no_movement'
  log.info('stuck detector recovery', {
    dimension: gs.dimension,
    stuckFor,
    activeFollowEntityId,
    activeAttackTarget,
  })

  try {
    b.setControlState('jump', true)
    setTimeout(() => { if (bot) bot.setControlState('jump', false) }, 350)
  } catch { /* ignore */ }

  const playerDistance = b.entity.position.distanceTo({
    x: gs.playerPosition.x,
    y: gs.playerPosition.y,
    z: gs.playerPosition.z,
  } as any)
  if (gs.dimension === 'nether' || playerDistance > STUCK_TELEPORT_DISTANCE) {
    await recoverFromPathProblem('stuck:no_movement')
    resetStuckWatch('teleport_recovery')
    return
  }

  clearActiveFollowGoal()
  try {
    const goals = await getGoals()
    if (goals?.GoalNear && b.pathfinder) {
      b.pathfinder.setGoal(new goals.GoalNear(gs.playerPosition.x, gs.playerPosition.y, gs.playerPosition.z, 2))
    }
  } catch { /* ignore recovery reset */ }
}

function isNether(): boolean {
  return normalizeDimension((bot as any)?.game?.dimension) === 'nether'
}

/** 鎵ц鍗曚釜 BotAction */
async function executeAction(action: import('./mc-behavior').BotAction): Promise<void> {
  const b = bot // local capture for null safety
  if (!b) return
  try {
    switch (action.kind) {
      case 'move_to': {
        if (!(b as any).pathfinder) break // pathfinder not loaded
        const goals = await getGoals()
        clearActiveFollowGoal()
        resetStuckWatch('move_to')
        b.pathfinder.setGoal(new goals.GoalNear(action.x, action.y, action.z, 1))
        break
      }
      case 'attack': {
        void executeAttackTarget(action.targetName, action.targetId)
        break
      }
      case 'mine': {
        const Vec3 = await getVec3()
        const block = b.blockAt(new Vec3(action.x, action.y, action.z))
        if (block && b.canDigBlock(block)) {
          await b.dig(block)
        }
        break
      }
      case 'place_block': {
        try {
          const Vec3 = await getVec3()
          const reference = b.blockAt(new Vec3(action.x, action.y - 1, action.z))
          if (reference) {
            const item = b.inventory.items().find((i: any) => i.name.includes(action.block))
            if (item) {
              await b.equip(item, 'hand')
              await b.placeBlock(reference, new Vec3(0, 1, 0))
            }
          }
        } catch { /* placement failed */ }
        break
      }
      case 'follow_player': {
        if (Date.now() < activeAttackUntil && activeAttackTarget != null) break
        await ensureFollowPlayer(action.distance, !pathfinderHasGoal(b))
        break
      }
      case 'hold_item': {
        const want = action.item.toLowerCase().replace(/^minecraft:/, '')
        let item = b.inventory.items().find((i: any) => {
          const n = i.name.replace(/^minecraft:/, '').toLowerCase()
          return n === want || n.includes(want) || want.includes(n)
        })
        if (!item && (b as any).heldItem) {
          const held = (b as any).heldItem
          const n = held.name?.replace(/^minecraft:/, '').toLowerCase() ?? ''
          if (n === want || n.includes(want) || want.includes(n)) item = held
        }
        if (item) await b.equip(item, 'hand')
        break
      }
      case 'give_item': {
        b.chat(`/give @p ${action.item} ${action.count}`)
        break
      }
      case 'chat':
        b.chat(action.message)
        break
      case 'look_at': {
        const Vec3 = await getVec3()
        await b.lookAt(new Vec3(action.x, action.y, action.z))
        break
      }
      case 'jump':
        b.setControlState('jump', true)
        setTimeout(() => { if (bot) bot.setControlState('jump', false) }, 200)
        break
      case 'spin': {
        const yaw = b.entity.yaw + Math.PI
        await b.look(yaw > Math.PI * 2 ? yaw - Math.PI * 2 : yaw, b.entity.pitch)
        break
      }
      case 'idle':
        break
      case 'toss': {
        const want = (action as { item?: string }).item?.toLowerCase().replace(/^minecraft:/, '')
        let stack = action.slot >= 0 ? b.inventory.slots[action.slot] : null
        if (!stack && want) {
          stack = b.inventory.items().find((i: any) => {
            const n = i.name.replace(/^minecraft:/, '').toLowerCase()
            return n === want || n.includes(want) || want.includes(n)
          }) ?? null
        }
        if (!stack) stack = (b as any).heldItem ?? null
        if (stack) {
          try { await b.tossStack(stack) } catch { /* ignore */ }
        }
        break
      }
      case 'teleport': {
        clearActiveFollowGoal()
        resetStuckWatch('teleport')
        // 鎵惧埌鏈€杩戠殑鐜╁骞朵紶閫佸埌鍏惰韩杈?
        const players = Object.values(b.entities).filter((e: any) => e.type === 'player' && e !== b.entity) as any[]
        if (players.length > 0) {
          const target = players[0]
          const targetName: string = target.username ?? target.name ?? ''
          // /tp <鑷繁> <鐩爣> 鐩存帴浼犻€佸埌鐜╁浣嶇疆
          if (targetName) {
            b.chat(`/tp ${b.username} ${targetName}`)
          } else {
            b.chat(`/tp ${b.username} @p`)
          }
        }
        break
      }
      case 'find_portal': {
        try {
          // 灏濊瘯 findBlocks锛堣緝鏂?mineflayer 鐗堟湰锛?
          const blocks = (b as any).findBlocks?.({
            matching: (block: any) => block.name === 'nether_portal' || block.name === 'end_portal' || block.name === 'end_gateway',
            maxDistance: 64, count: 1,
          })
          if (blocks && blocks.length > 0) {
            const goals = await getGoals()
            clearActiveFollowGoal()
            resetStuckWatch('find_portal')
            b.pathfinder.setGoal(new goals.GoalNear(blocks[0].x, blocks[0].y, blocks[0].z, 1))
            break
          }
          // 鍥為€€锛氱敤 findBlock锛堟墍鏈?mineflayer 鐗堟湰閮芥湁锛?
          const portal = b.findBlock({
            matching: (block: any) => block.name === 'nether_portal' || block.name === 'end_portal' || block.name === 'end_gateway',
            maxDistance: 64,
          })
          if (portal) {
            const goals = await getGoals()
            clearActiveFollowGoal()
            resetStuckWatch('find_portal')
            b.pathfinder.setGoal(new goals.GoalNear(portal.position.x, portal.position.y, portal.position.z, 1))
          }
        } catch { /* findBlocks/findBlock may fail */ }
        break
      }
      case 'tp_to_player': {
        const target = action.playerName || storedPlayerName
        if (target) {
          b.chat(`/tp ${b.username} ${target}`)
        }
        break
      }
      case 'sleep': {
        if (isNether()) {
          log.info('skip sleep in nether')
          break
        }
        const Vec3 = await getVec3()
        const bedBlock = b.blockAt(new Vec3(action.x, action.y, action.z))
        if (bedBlock) { await b.activateBlock(bedBlock) }
        break
      }
      case 'break_block': {
        const Vec3 = await getVec3()
        const block = b.blockAt(new Vec3(action.x, action.y, action.z))
        if (block && b.canDigBlock(block)) { await b.dig(block) }
        break
      }
      case 'place_bed': {
        if (isNether()) {
          log.info('skip place_bed in nether')
          break
        }
        const Vec3 = await getVec3()
        const reference = b.blockAt(new Vec3(action.x, action.y - 1, action.z))
        if (reference) {
          await b.placeBlock(reference, new Vec3(0, 1, 0))
        }
        break
      }
    }
  } catch (err) {
    callbacks.onError?.(`action ${action.kind} failed: ${(err as Error).message}`)
  }
}

/** 娓告垙鐘舵€佷笂鎶?+ 琛屼负鍐崇瓥 tick */
async function doTick(): Promise<void> {
  if (!bot?.entity || !isRunning) return
  if (tickInProgress) return
  tickInProgress = true

  try {
    const gs = buildGameState()
    if (!gs) return
    gameState = gs
    await checkAndRecoverIfStuck(gs)

    // 涓婃姤娓告垙鐘舵€佸埌 Ackem
    const socket = ws
    if (socket && socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify({ type: 'game_state', ...gs }))
    }
    callbacks.onStateChange?.(gs)

    // 琛屼负鍐崇瓥锛堥渶瑕佸紩鎿庣姸鎬侊級
    if (engineState) {
      const decision = decideBehavior({
        state: gs,
        engine: engineState,
        playerAfkSec,
        autoCombat: config?.autoCombat !== false,
      })
      lastDecision = decision
      const now = Date.now()
      const actions = filterActionsForCombatLock(decision.actions, decision, now, activeAttackUntil)

      callbacks.onDecision?.({ ...decision, actions })
      pushDebugSnapshot(gs, { ...decision, actions })

      // 鎵ц鍔ㄤ綔鍒楄〃
      if (decision.delayMs > 0) {
        await new Promise(r => setTimeout(r, Math.min(decision.delayMs, 3000)))
      }
      for (const action of actions) {
        if (!isRunning) break
        await executeAction(action)
      }
    } else {
      pushDebugSnapshot(gs, null)
      if (config?.autoFollow !== false) {
        await ensureFollowPlayer(3, !pathfinderHasGoal(bot))
      }
    }

    // 鏃犺矾寰勭洰鏍囦笖鏈湪鎴樻枟鏃跺己鍒惰ˉ璺熼殢锛堣В鍐宠繛鎺ュ悗绔欐々銆佺帺瀹跺疄浣撴櫄鍔犺浇锛?
    if (
      config?.autoFollow !== false &&
      bot &&
      !pathfinderHasGoal(bot) &&
      Date.now() >= activeAttackUntil
    ) {
      await ensureFollowPlayer(3, true)
    }
  } finally {
    tickInProgress = false
  }
}

/** 鎺ㄩ€?MC 娓告垙浜嬩欢 鈫?鑴氭湰鍙嶅簲 + 鑱婂ぉ + 娓叉煋杩涚▼ */
async function emitMcGameEvent(
  type: string,
  payload?: Record<string, string>,
  raw?: string,
): Promise<void> {
  const b = bot
  if (!b || !engineState) return
  const gameEvent: McGameEvent = {
    type,
    raw: raw ?? type,
    payload,
    timestamp: new Date().toISOString(),
  }
  try {
    const reaction = selectReaction(gameEvent, engineState)
    if (reaction?.text) {
      b.chat(reaction.text)
      const { pushMcEventToRenderer } = await import('./mc-ws-server.js')
      pushMcEventToRenderer(gameEvent.type, reaction.text, gameEvent.payload as Record<string, unknown>)
      callbacks.onEvent?.(gameEvent, reaction.text)
    }
  } catch { /* ignore reaction errors */ }
}

/** 浠庢湇鍔″櫒娑堟伅鎺ㄦ柇 MC 浜嬩欢绫诲瀷 */
function detectServerEventType(msg: string): string {
  if (msg.includes('has made the advancement') || msg.includes('has completed the challenge') || msg.includes('has reached the goal')) return 'mc:achievement_unlock'
  if (msg.includes('fell from a high place') || msg.includes('hit the ground too hard')) return 'mc:death_by_fall'
  if (msg.includes('tried to swim in lava') || msg.includes('went up in flames') || msg.includes('burned to death')) return 'mc:death_by_lava'
  if (msg.includes('drowned')) return 'mc:death_by_drown'
  if (msg.includes('blew up') || msg.includes('was killed by Creeper')) return 'mc:death_by_creeper'
  if (msg.includes('was slain by') || msg.includes('was killed by') || msg.includes('was shot by') || msg.includes('was fireballed by')) return 'mc:player_death_witnessed'
  if (msg.includes('starved to death')) return 'mc:player_hungry'
  if (msg.includes('froze to death')) return 'mc:death_by_freeze'
  if (msg.includes('fell out of the world')) return 'mc:death_by_void'
  if (msg.includes('was struck by lightning')) return 'mc:death_by_lightning'
  if (msg.includes('withered away')) return 'mc:death_by_dragon'
  if (msg.includes('was squashed by a falling anvil')) return 'mc:death_by_anvil'
  return 'mc:game_event'
}

/** 浠庢湇鍔″櫒娑堟伅涓彁鍙栧叧閿俊鎭?*/
function extractPayload(msg: string): Record<string, string> {
  const payload: Record<string, string> = {}
  const advMatch = msg.match(/\[(.+?)\]/)
  if (advMatch) payload['achievementName'] = advMatch[1]
  const mobMatch = msg.match(/was (?:slain|killed|shot|fireballed) by (\w+)/)
  if (mobMatch) payload['mobType'] = mobMatch[1]
  return payload
}

/** 鍒濆鍖?Mineflayer bot */
export async function startBot(cfg: Partial<BotConfig> & { host: string; username: string }): Promise<void> {
  if (isRunning) await stopBot()

  config = { ...DEFAULT_CONFIG, ...cfg } as BotConfig

  // 鍔ㄦ€佸鍏?Mineflayer锛圗SM 鍏煎锛?
  const { createBot } = await import('mineflayer')
  bot = createBot({
    host: config.host,
    port: config.port,
    username: config.username,
    password: config.password,
    // @ts-ignore - 绂荤嚎鏈嶅姟鍣ㄤ笉闇€瑕佽璇?
    auth: config.password ? 'microsoft' : 'offline',
  })

  // 浜嬩欢鐩戝惉 鈥?澶辫触閲嶈繛
  bot.on('error', (err) => {
    callbacks.onError?.(`Bot error: ${err.message}`)
  })

  bot.on('end', (reason) => {
    callbacks.onError?.(`Bot disconnected: ${reason}`)
    if (isRunning && reason !== 'manualDisconnect') {
      // 鑷姩閲嶈繛
      setTimeout(() => {
        if (isRunning && config) {
          startBot(config).catch(() => {})
        }
      }, 5000)
    }
  })

  bot.on('kicked', (reason) => {
    callbacks.onError?.(`Bot kicked: ${reason}`)
  })

  // 鑱婂ぉ鐩戝惉
  bot.on('chat', (username: string, message: string) => {
    if (username === bot!.username) return // 蹇界暐鑷繁鐨勬秷鎭?

    // 鏈嶅姟鍣ㄦ秷鎭?鈫?瑙ｆ瀽涓烘父鎴忎簨浠?鈫?鑴氭湰鍙嶅簲
    if (!username || username === 'Server' || username === '' || message.startsWith('[') || message.includes('has made the advancement') || message.includes('was slain') || message.includes('fell from') || message.includes('drowned') || message.includes('blew up') || message.includes('went up in flames') || message.includes('tried to swim in lava') || message.includes('starved to death') || message.includes('was killed by') || message.includes('hit the ground too hard') || message.includes('froze to death')) {
      const gameEvent: McGameEvent = {
        type: detectServerEventType(message),
        raw: message,
        payload: extractPayload(message),
        timestamp: new Date().toISOString()
      }
      void (async () => {
        await emitMcGameEvent(gameEvent.type, gameEvent.payload as Record<string, string>, gameEvent.raw)
        if (message.toLowerCase().includes('diamonds')) {
          const b2 = bot
          if (b2) {
            b2.setControlState('jump', true)
            setTimeout(() => { if (bot) bot.setControlState('jump', false) }, 300)
          }
        }
      })()
      return
    }

    reportPlayerAction()
    callbacks.onChatMessage?.(username, message)
  })

  bot.on('entitySwingArm', (entity: any) => {
    const bRef = bot
    if (!bRef?.entity || entity?.type !== 'player' || entity === bRef.entity) return
    const players = Object.values(bRef.entities).filter((e: any) => e.type === 'player' && e !== bRef.entity)
    if (players.length === 0) return
    const nearest = players.reduce((a: any, c: any) =>
      a.position.distanceTo(bRef.entity!.position) < c.position.distanceTo(bRef.entity!.position) ? a : c,
    )
    if (entity !== nearest) return
    reportPlayerAction()
    const target = entityInPlayerCrosshair(bRef, entity, 4)
    updateOnPlayerSwing(playerCombat, target)
  })

  // 鐜╁琛屼负鐩戝惉锛堢Щ鍔ㄣ€佹敾鍑荤瓑锛? Bot 鍙椾激鍚庨€€
  bot.on('entityHurt', (entity: any, source?: any) => {
    const hurtBot = bot
    if (!hurtBot?.entity) return

    if (entity?.type === 'player' && entity !== hurtBot.entity) {
      reportPlayerAction()
      const hostileName =
        source && source !== hurtBot.entity && source.type === 'mob' && isHostileMob(source.name ?? '')
          ? entityName(source)
          : null
      const hostileId = hostileName ? entityId(source) ?? null : null
      updateOnPlayerHurt(playerCombat, hostileName, hostileId)
      const now = Date.now()
      if (hostileName && now - lastMobHurtPlayerEventAt >= MOB_HURT_PLAYER_EVENT_COOLDOWN_MS) {
        lastMobHurtPlayerEventAt = now
        void emitMcGameEvent('mc:player_mob_hurt_player', { mobType: hostileName })
      }
      const hp = playerCombat.healthEstimate
      if (hp <= 10 && now - lastPlayerHealthEventAt >= PLAYER_HURT_EVENT_COOLDOWN_MS) {
        lastPlayerHealthEventAt = now
        void emitMcGameEvent(hp <= 6 ? 'mc:low_health' : 'mc:player_hurt', { playerHealth: String(hp) })
      }
    }

    // GAP-13: Bot 鑷繁琚€墦 鈫?鍚庨€€涓ゆ
    if (entity === hurtBot.entity) {
      const yaw = hurtBot.entity.yaw + Math.PI
      const backX = hurtBot.entity.position.x + Math.sin(yaw) * 2
      const backZ = hurtBot.entity.position.z + Math.cos(yaw) * 2
      import('mineflayer-pathfinder').then(m => {
        const goals = m.default?.goals ?? m.goals
        if (goals && hurtBot.pathfinder) {
          hurtBot.pathfinder.setGoal(new goals.GoalNear(backX, hurtBot.entity.position.y, backZ, 1))
          setTimeout(() => {
            const b2 = bot
            if (isRunning && b2 && b2.pathfinder && engineState) {
              const players = Object.values(b2.entities).filter((e: any) => e.type === 'player' && e !== b2.entity)
              if (players.length > 0) {
                const p = players[0].position
                b2.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 3))
              }
            }
          }, 600)
        }
      }).catch(() => {})
    }
  })

  // 鈹€鈹€ Bot 姝讳骸涓庨噸鐢?鈹€鈹€
  let deathMessageTimer: ReturnType<typeof setTimeout> | null = null

  bot.on('death', () => {
    const deathN = recordDeath()
    // 寤惰繜鍙戣█锛氶噸鐢熷悗鍐嶈璇濓紙閬垮厤姝诲湪姝讳骸鐣岄潰鍙戜笉鍑烘秷鎭級
    const personality = engineState?.personalityId ?? 'deredere'
    const line = deathReaction(personality, deathN)

    // 閫氱煡娓叉煋杩涚▼
    callbacks.onEvent?.({ type: 'mc:bot_death', raw: 'death#' + deathN, timestamp: new Date().toISOString() }, line)
    log.info('bot died', { count: deathN })
  })

  bot.on('spawn', () => {
    // 閲嶇敓鍚庡彂瑷€锛堥娆＄敓鎴愪笉璇磋瘽锛宒eathN=0锛?
    if (deathMessageTimer) clearTimeout(deathMessageTimer)
    deathMessageTimer = setTimeout(() => {
      const b = bot
      if (!isRunning || !b) return
      const deathN = getDeathCount()
      if (deathN > 0) {
        const personality = engineState?.personalityId ?? 'deredere'
        b.chat(deathReaction(personality, deathN))
        setTimeout(() => {
          const b2 = bot
          if (isRunning && b2) b2.chat(lostItemsLine(personality))
        }, 2500)
        setTimeout(() => {
          const b3 = bot
          if (isRunning && b3 && engineState) {
            const players = Object.values(b3.entities).filter((e: any) => e.type === 'player' && e !== b3.entity)
            if (players.length > 0 && b3.pathfinder) {
              const p = players[0].position
              import('mineflayer-pathfinder').then(m => {
                const goals = m.default?.goals ?? m.goals
                if (goals && b3.pathfinder) b3.pathfinder.setGoal(new goals.GoalNear(p.x, p.y, p.z, 3))
              }).catch(() => {})
            }
          }
        }, 4000)
      }
    }, 1500)
  })

  // 绛夊緟 bot 鐢熸垚瀹屾垚
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Bot spawn timeout')), 30_000)
    bot!.once('spawn', () => {
      clearTimeout(timeout)
      resolve()
    })
  })

  // 鈹€鈹€ 鑳屽寘浜嬩欢鐩戝惉 鈹€鈹€
  const b = bot!

  // 鎹¤捣鐗╁搧锛氬鏋滃湪鐜╁闄勮繎鎹＄殑锛屾爣璁颁负绀肩墿锛堝彧鍙嶅簲鏈変环鍊肩墿鍝侊級
  b.on('playerCollect', (collector: any, collected: any) => {
    if (collector !== b.entity) return
    const itemName = resolveItemName(collected)
    // 鏌ユ壘闄勮繎鐜╁
    const nearbyPlayers = Object.values(b.entities).filter(
      (e: any) => e.type === 'player' && e !== b.entity
    )
    const hasNearbyPlayer = nearbyPlayers.some((p: any) => {
      const d = p.position.distanceTo(b.entity.position)
      return d < 5
    })
    if (hasNearbyPlayer && itemName) {
      // 鍙鍊煎緱鎹＄殑鐗╁搧鏈夊弽搴旓紙閽荤煶銆侀搧銆侀噾绛夛紝鏃犺娉ュ湡/娌欏瓙/鑵愯倝锛?
      if (isWorthPickup(itemName)) {
        const slot = b.inventory.items().length - 1
        if (slot >= 0) markSlotAsGifted(slot)
        const { isFirst } = recordGiftReceived(itemName)
        const reaction = giftReaction(itemName, engineState?.personalityId ?? 'deredere')
        b.chat(reaction)
        if (isFirst) {
          const displayName = oreLabel(itemName) !== '鐭跨煶' ? oreLabel(itemName) : itemName.replace(/_/g, ' ')
          setTimeout(() => b.chat('杩欐槸鎴戠涓€娆℃敹鍒? + displayName + '锛?), 2000)
        }
        callbacks.onEvent?.({ type: 'mc:gift_received', raw: itemName, timestamp: new Date().toISOString(), payload: { itemName } }, reaction)
      }
    }
  })

  // 鑳屽寘鍙樺寲妫€娴嬶細婊′簡灏辨姳鎬?
  let lastInventorySize = 0
  setInterval(() => {
    if (!isRunning || !b?.inventory) return
    const items = b.inventory.items()
    const used = items.length
    const total = b.inventory.slots.length

    // 鑳屽寘鎺ヨ繎婊℃椂鎶辨€?
    if (used >= total - 2 && used !== lastInventorySize) {
      const stats = getGiftStats()
      const line = fullInventoryLine(engineState?.personalityId ?? 'deredere', stats.giftedCount)
      b.chat(line)

      // 灏濊瘯鑷姩涓㈠純浣庝环鍊奸潪绀肩墿鐗╁搧
      const discardSlot = findDiscardableSlot(items.map(i => ({ slot: i.slot, name: i.name, count: i.count })), engineState?.personalityId ?? 'deredere')
      if (discardSlot !== null) {
        try { b.tossStack(items.find(i => i.slot === discardSlot)!) } catch { /* toss may fail */ }
      }
    }
    lastInventorySize = used

    // 娓呯悊宸茬粡涓嶅瓨鍦ㄧ殑绀肩墿妲戒綅
    cleanupGiftedSlots(items.map(i => i.slot))
  }, 5000)

  // 鐜╁姝讳骸锛氭娴嬮檮杩戝ぇ閲忔帀钀界墿
  b.on('entitySpawn', (entity: any) => {
    if (entity.name !== 'item' && entity.displayName !== 'Item') return
    // 缁熻闄勮繎鎺夎惤鐗?
    const nearbyEntityItems = Object.values(b.entities).filter(
      (e: any) => e.name === 'item' || e.displayName === 'Item'
    ).length
    if (nearbyEntityItems >= 4) {
      const playerEntities = Object.values(b.entities).filter(
        (e: any) => e.type === 'player' && e !== b.entity
      )
      if (playerEntities.length > 0) {
        // 鐜╁姝讳簡锛氬府蹇欐崱瑁呭
        b.chat('浣犵殑涓滆タ锛佹垜甯綘鎹♀€︹€?)
        callbacks.onEvent?.({ type: 'mc:player_death_drops', raw: 'nearbyItems:' + String(nearbyEntityItems), timestamp: new Date().toISOString(), payload: { itemName: 'items_x' + String(nearbyEntityItems) } }, '浣犵殑涓滆タ鎺変簡锛佹垜甯綘鎹♀€︹€?)
      }
    }
  })

  // 鍔犺浇 pathfinder 鎻掍欢
  try {
    const { pathfinder, Movements } = await import('mineflayer-pathfinder')
    bot.loadPlugin(pathfinder)
    const mcDataLib = await import('minecraft-data')
    const versionData = (mcDataLib as any).default(bot.version)
    mcData = versionData
    // Movements 闇€瑕?MC 鏁版嵁鏉ヨ瘑鍒嵄闄╂柟鍧楋紙宀╂祮/姘寸瓑锛?
    const MovementsCtor = Movements as any
    const moves = new MovementsCtor(bot, versionData)
    moves.canDig = false
    moves.allowParkour = true
    // 鏄惧紡绂佹杩涘叆鍗遍櫓鏂瑰潡
    const dangerBlocks = ['lava', 'flowing_lava', 'water', 'flowing_water', 'fire', 'cactus', 'sweet_berry_bush', 'wither_rose', 'cobweb', 'powder_snow']
    for (const name of dangerBlocks) {
      const block = versionData.blocksByName[name]
      if (block) (moves.blocksToAvoid as Set<number>).add(block.id)
    }
    bot.pathfinder.setMovements(moves)
    bot.on('path_update', (results: any) => {
      if (results?.status === 'noPath' || results?.status === 'timeout') {
        void recoverFromPathProblem(results.status)
      }
    })
    bot.on('path_reset', (reason: string) => {
      if (reason === 'no_scaffolding_blocks' || reason === 'dig_error') {
        void recoverFromPathProblem(reason)
      }
    })
    log.info('pathfinder loaded', { version: bot.version, canDig: false, dangerBlocks: dangerBlocks.length })
    resetStuckWatch('pathfinder_ready')
    void ensureFollowPlayer(3, true)
  } catch (e) {
    log.error('failed to load pathfinder', e)
  }

  bot.on('entitySpawn', (entity: any) => {
    if (entity?.type !== 'player' || entity === bot?.entity) return
    clearActiveFollowGoal()
    void ensureFollowPlayer(3, true)
  })

  isRunning = true

  // 杩炴帴 Ackem WebSocket
  connectWs(config.AckemWsUrl)

  // 鍚姩琛屼负 tick 寰幆
  tickTimer = setInterval(() => {
    void doTick()
  }, config.tickIntervalMs)

  callbacks.onStateChange?.(buildGameState()!)
  log.info('connected', { username: config.username, host: config.host, port: config.port })
}

/** 鍋滄 bot */
export async function stopBot(): Promise<void> {
  isRunning = false
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null }

  disconnectWs()

  if (bot) {
    bot.removeAllListeners()
    // @ts-ignore - reason 鍙傛暟鏍囪鎵嬪姩鏂紑
    bot.end('manualDisconnect')
    bot = null
  }

  engineState = null
  gameState = null
  playerCombat = createPlayerCombatTrack()
  lastPlayerHealthEventAt = 0
  lastMobHurtPlayerEventAt = 0
  activeAttackTarget = null
  activeAttackName = null
  activeAttackUntil = 0
  lastDecision = null
  lastDebugSnapshot = null
  lastDebugPushAt = 0
  resetStuckWatch('stop')
  callbacks = {}
  log.info('stopped')
}

/** 璁剧疆鍥炶皟 */
export function setBotCallbacks(cbs: BotCallbacks): void {
  callbacks = cbs
}

/** 杩炴帴鍒?Ackem WebSocket */
async function connectWs(url: string): Promise<void> {
  try {
    const { default: WebSocket } = await import('ws')
    const socket = new WebSocket(url)
    ws = socket

    socket.on('open', () => {
      log.info('connected to Ackem WS')
      socket.send(JSON.stringify({ type: 'hello', client: 'mineflayer-bot', username: config?.username ?? 'unknown' }))
    })

    socket.on('message', (data: string) => {
      try {
        const msg = JSON.parse(data)
        if (msg.type === 'engine_state') {
          engineState = msg.state as EngineStateForGaming
        } else if (msg.type === 'reaction') {
          callbacks.onEvent?.(msg.event, msg.reaction?.text ?? null)
        }
      } catch { /* ignore */ }
    })

    socket.on('close', () => {
      log.info('WS disconnected')
      ws = null
    })

    socket.on('error', (err: Error) => {
      log.error('WS error', { message: err.message })
    })
  } catch (e) {
    log.error('failed to connect WS', e)
  }
}

function disconnectWs(): void {
  const socket = ws
  if (socket) {
    try { socket.close(1001, 'Bot shutdown') } catch { /* ignore */ }
    ws = null
  }
}

/** 鑾峰彇褰撳墠娓告垙鐘舵€侊紙渚涘閮ㄦ煡璇級 */
export function getCurrentGameState(): McGameState | null {
  return gameState
}

/** 鎵ц鑱婂ぉ鍛戒护瑙ｆ瀽鍑虹殑鍔ㄤ綔搴忓垪锛堝惈 hold 鈫?toss 闂撮殧锛?*/
export async function executeBotActions(actions: import('./mc-behavior').BotAction[]): Promise<void> {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i]
    await executeAction(action)
    if (action.kind === 'hold_item' && actions[i + 1]?.kind === 'toss') {
      await new Promise(r => setTimeout(r, 450))
    }
  }
}

/** 璁?bot 鍦ㄦ父鎴忓唴鍙戣█锛堜緵 Ackem LLM 鍥炲浣跨敤锛?*/
export function botSendChat(message: string): void {
  if (!bot || !isRunning) return
  // 鎴柇杩囬暱鐨勬秷鎭紙MC 鑱婂ぉ鏍忛檺鍒?256 瀛楃锛?
  const truncated = message.length > 250 ? message.slice(0, 250) + '鈥? : message
  bot.chat(truncated)
}

/** 鑾峰彇 bot 瀹炰緥寮曠敤锛堜緵鍥炶皟涓洿鎺ユ搷浣滐級 */
export function getBotInstance(): Bot | null {
  return bot
}

/** 鑾峰彇 Bot 褰撳墠鑳屽寘鐗╁搧锛堜緵鍛戒护瑙ｆ瀽鐢級 */
export function getBotInventory(): Array<{ slot: number; name: string; count: number }> {
  if (!bot?.inventory) return []
  return bot.inventory.items().map((i: any) => ({
    slot: i.slot, name: i.name, count: i.count ?? 1
  }))
}
