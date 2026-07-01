// [gaming/mc-combat-target] — 护主 / 帮打目标识别
// 职责：玩家坐标最近敌对、挥刀准星、护主目标优先级
// 引用：./mc-work, ./types

import type { Bot } from 'mineflayer'
import type { McGameState } from './types'
import { isHostileMob, mobThreatLevel } from './mc-work'

export interface CombatTarget {
  id?: number | string
  type: string
  distance: number
  position?: { x: number; y: number; z: number }
}

export interface PlayerCombatTrack {
  healthEstimate: number
  lastHurtAt: number
  lastSwingTarget: string | null
  lastSwingTargetId: number | string | null
  lastSwingAt: number
  lastHurtByHostile: string | null
  lastHurtByHostileId: number | string | null
  lastHurtByHostileAt: number
}

const SWING_TARGET_TTL_MS = 2500
const HURT_BY_HOSTILE_TTL_MS = 3000
const RECENTLY_HURT_MS = 3000
const HEALTH_REGEN_INTERVAL_MS = 30_000

export function createPlayerCombatTrack(): PlayerCombatTrack {
  return {
    healthEstimate: 20,
    lastHurtAt: 0,
    lastSwingTarget: null,
    lastSwingTargetId: null,
    lastSwingAt: 0,
    lastHurtByHostile: null,
    lastHurtByHostileId: null,
    lastHurtByHostileAt: 0,
  }
}

export function entityId(e: { id?: number | string; uuid?: string }): number | string | undefined {
  return e.id ?? e.uuid
}

export function entityName(e: { name?: string; username?: string; type?: string }): string {
  return (e.name ?? e.username ?? e.type ?? 'unknown') as string
}

export function dist2d(
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const dx = a.x - b.x
  const dz = a.z - b.z
  return Math.sqrt(dx * dx + dz * dz)
}

export function nearestHostileToPoint(
  entities: any[],
  point: { x: number; y: number; z: number },
  maxRange: number,
  excludeEntity?: any,
): CombatTarget | null {
  let best: CombatTarget | null = null
  for (const e of entities) {
    if (e === excludeEntity) continue
    if (e.type !== 'mob' || !isHostileMob(e.name ?? '')) continue
    const d = dist2d(e.position, point)
    if (d <= maxRange && (!best || d < best.distance)) {
      best = {
        id: entityId(e),
        type: entityName(e),
        distance: d,
        position: { x: e.position.x, y: e.position.y, z: e.position.z },
      }
    }
  }
  return best
}

/** 玩家准星内可攻击实体（mob/animal，排除玩家与 bot） */
export function entityInPlayerCrosshair(
  bot: Bot,
  playerEntity: any,
  maxDistance = 4,
): CombatTarget | null {
  if (!playerEntity?.position || playerEntity.pitch == null || playerEntity.yaw == null) {
    return null
  }
  try {
    const { Vec3 } = require('vec3')
    const { RaycastIterator } = require('prismarine-world').iterators

    const pitch = playerEntity.pitch
    const yaw = playerEntity.yaw
    const csPitch = Math.cos(pitch)
    const snPitch = Math.sin(pitch)
    const csYaw = Math.cos(yaw)
    const snYaw = Math.sin(yaw)
    const dir = new Vec3(-snYaw * csPitch, snPitch, -csYaw * csPitch)

    const eyeHeight = playerEntity.height ?? 1.62
    const origin = playerEntity.position.offset(0, eyeHeight, 0)

    // 方块遮挡缩短视线
    let sightMax = maxDistance
    if (typeof bot.blockAtEntityCursor === 'function') {
      const blockHit = bot.blockAtEntityCursor(playerEntity, maxDistance) as { intersect?: { distanceTo: (p: unknown) => number } } | null
      if (blockHit?.intersect) {
        sightMax = Math.min(sightMax, blockHit.intersect.distanceTo(origin))
      }
    }

    const candidates = Object.values(bot.entities).filter((e: any) => {
      if (e === bot.entity || e === playerEntity) return false
      if (e.type === 'player' || e.type === 'object') return false
      return origin.distanceTo(e.position) <= sightMax + 1
    })

    const iterator = new RaycastIterator(origin, dir.normalize(), sightMax)
    let target: any = null
    let targetDist = sightMax

    for (const entity of candidates) {
      const w = (entity.width ?? 0.6) / 2
      const h = entity.height ?? 1
      const shapes = [[-w, 0, -w, w, h, w]]
      const intersect = iterator.intersect(shapes, entity.position)
      if (!intersect) continue
      const entityDir = entity.position.minus(origin)
      if (Math.sign(entityDir.dot(dir)) === -1) continue
      const dist = origin.distanceTo(intersect.pos)
      if (dist < targetDist) {
        target = entity
        targetDist = dist
      }
    }

    return target
      ? {
          id: entityId(target),
          type: entityName(target),
          distance: targetDist,
          position: { x: target.position.x, y: target.position.y, z: target.position.z },
        }
      : null
  } catch {
    return null
  }
}

export function isSwingTargetValid(track: PlayerCombatTrack, now = Date.now()): boolean {
  return (
    track.lastSwingTarget != null &&
    now - track.lastSwingAt < SWING_TARGET_TTL_MS
  )
}

export function isHurtByHostileValid(track: PlayerCombatTrack, now = Date.now()): boolean {
  return (
    track.lastHurtByHostile != null &&
    now - track.lastHurtByHostileAt < HURT_BY_HOSTILE_TTL_MS
  )
}

export function isPlayerRecentlyHurt(track: PlayerCombatTrack, now = Date.now()): boolean {
  return track.lastHurtAt > 0 && now - track.lastHurtAt < RECENTLY_HURT_MS
}

/** 缓慢回满 HP 估算（无受伤 30s +1） */
export function tickHealthRegen(track: PlayerCombatTrack, now = Date.now()): void {
  if (track.healthEstimate >= 20) {
    track.healthEstimate = 20
    return
  }
  if (track.lastHurtAt > 0 && now - track.lastHurtAt >= HEALTH_REGEN_INTERVAL_MS) {
    track.healthEstimate = Math.min(20, track.healthEstimate + 1)
    track.lastHurtAt = now
  }
}

export function updateOnPlayerSwing(
  track: PlayerCombatTrack,
  target: CombatTarget | null,
  now = Date.now(),
): void {
  if (!target) return
  track.lastSwingTarget = target.type
  track.lastSwingTargetId = target.id ?? null
  track.lastSwingAt = now
}

export function updateOnPlayerHurt(
  track: PlayerCombatTrack,
  hostileSourceName: string | null,
  hostileSourceId: number | string | null = null,
  now = Date.now(),
): void {
  track.lastHurtAt = now
  track.healthEstimate = Math.max(1, track.healthEstimate - 2)
  if (hostileSourceName) {
    track.lastHurtByHostile = hostileSourceName
    track.lastHurtByHostileId = hostileSourceId
    track.lastHurtByHostileAt = now
  }
}

function distToPlayer(m: { distanceToPlayer?: number; distance: number }): number {
  return m.distanceToPlayer ?? m.distance
}

function mobFromStateList(
  state: McGameState,
  type: string,
  id?: number | string | null,
): CombatTarget | null {
  const threats = state.nearbyHostileMobs ?? []
  const hit =
    (id != null ? threats.find(m => m.id != null && idsEqualCombat(m.id, id)) : undefined) ??
    threats.find(m => entityTypesMatch(m.type, type))
  if (hit) {
    return {
      id: hit.id,
      type: hit.type,
      distance: hit.distance,
      position: hit.position,
    }
  }
  return { id: id ?? undefined, type, distance: 99 }
}

function idsEqualCombat(a: unknown, b: unknown): boolean {
  return a != null && b != null && String(a) === String(b)
}

function entityTypesMatch(a: string, b: string): boolean {
  const na = a.toLowerCase().replace(/^minecraft:/, '')
  const nb = b.toLowerCase().replace(/^minecraft:/, '')
  return na === nb || na.includes(nb) || nb.includes(na)
}

/** 玩家附近最高威胁（苦力怕等按 mobThreatLevel 排序） */
export function pickThreatNearPlayer(state: McGameState, maxRange = 12): CombatTarget | null {
  const threats = (state.nearbyHostileMobs ?? []).filter(m => distToPlayer(m) <= maxRange)
  if (threats.length === 0) return null
  const best = threats.reduce((a, b) => {
    const scoreA = mobThreatLevel(a.type) * 1000 - distToPlayer(a)
    const scoreB = mobThreatLevel(b.type) * 1000 - distToPlayer(b)
    return scoreB > scoreA ? b : a
  })
  return {
    id: best.id,
    type: best.type,
    distance: distToPlayer(best),
    position: best.position,
  }
}

/** 护主战斗目标（含 id）：受伤来源 > 玩家挥刀 > 玩家边高威胁怪 */
export function pickGuardCombatTarget(state: McGameState): CombatTarget | null {
  if (state.playerHurtByHostile) {
    return mobFromStateList(state, state.playerHurtByHostile, state.playerHurtByHostileId)
  }
  if (state.playerAttacking) {
    return mobFromStateList(state, state.playerAttacking, state.playerAttackingId)
  }
  const near = pickThreatNearPlayer(state, 12)
  if (near) return near
  if (state.nearestHostileToPlayer) {
    return mobFromStateList(state, state.nearestHostileToPlayer, state.nearestHostileToPlayerId)
  }
  if (state.nearestThreatToPlayer) {
    return mobFromStateList(state, state.nearestThreatToPlayer, state.nearestThreatToPlayerId)
  }
  return null
}

/** 护主攻击目标：受伤来源 > 玩家边最近敌对 > 挥刀准星 */
export function pickGuardTarget(
  state: McGameState,
  track: PlayerCombatTrack,
  now = Date.now(),
): string | null {
  if (state.playerHurtByHostile) return state.playerHurtByHostile
  if (isHurtByHostileValid(track, now)) return track.lastHurtByHostile
  if (state.nearestThreatToPlayer) return state.nearestThreatToPlayer
  if (state.playerAttacking) return state.playerAttacking
  if (isSwingTargetValid(track, now)) return track.lastSwingTarget
  return null
}

/** 仅根据 McGameState 选择护主目标（供行为决策器，无 bot 依赖） */
export function pickGuardTargetFromState(state: McGameState): string | null {
  return pickGuardCombatTarget(state)?.type ?? null
}

export function resolvePlayerHealth(
  playerEntity: any | null,
  track: PlayerCombatTrack,
): number {
  if (playerEntity != null && typeof playerEntity.health === 'number' && playerEntity.health > 0) {
    return Math.round(playerEntity.health)
  }
  return track.healthEstimate
}

export function resolvePlayerHunger(playerEntity: any | null): number {
  if (playerEntity != null && typeof playerEntity.food === 'number') {
    return Math.round(playerEntity.food)
  }
  return 20
}
