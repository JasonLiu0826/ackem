/**
 * agentRegistry — Agent 花名册（DB + 内存缓存）
 * 负责 seed / get / list；启动时 seedIfNeeded
 */

import { rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  getAgent,
  insertAgent,
  listAgents,
  updateAgent,
  type AgentRow,
} from '../../db/repos/agentsRepo'
import { upsertEdge } from '../../db/repos/socialGraphRepo'
import { getDatabase } from '../../db/database'
import { INITIAL_AGENTS, LEGACY_BUILTIN_NAMES, seedToInsert } from './initialAgents'
import { PRIMARY_AGENT_ID, agentCardDir } from './agentPaths'
import { listRemovedBuiltinIds } from './builtinRemoval'
import { cardExists, writeCardBundle } from '../characterCard/agentCardStore'
import { buildAgentCard } from '../characterCard/buildAgentCard'
import type { ParsedIntermediate } from '../characterCard/types'

const cacheByRoot = new Map<string, Map<string, AgentRow>>()

function cacheFor(dataRoot: string): Map<string, AgentRow> {
  let m = cacheByRoot.get(dataRoot)
  if (!m) {
    m = new Map()
    cacheByRoot.set(dataRoot, m)
  }
  return m
}

let lastDataRoot: string | null = null

export function getCachedAgent(agentId: string): AgentRow | null {
  if (!lastDataRoot) return null
  return cacheByRoot.get(lastDataRoot)?.get(agentId) ?? null
}

export function invalidateAgentCache(dataRoot?: string, agentId?: string): void {
  if (!dataRoot) {
    cacheByRoot.clear()
    return
  }
  if (!agentId) {
    cacheByRoot.delete(dataRoot)
    return
  }
  cacheByRoot.get(dataRoot)?.delete(agentId)
}

function refreshCache(dataRoot: string): void {
  lastDataRoot = dataRoot
  const m = cacheFor(dataRoot)
  m.clear()
  for (const row of listAgents(dataRoot)) {
    m.set(row.id, row)
  }
}

function writeSeedCard(
  dataRoot: string,
  seed: (typeof INITIAL_AGENTS)[number],
  force: boolean
): void {
  if (seed.kind !== 'social_member' || !seed.personaMarkdown) return
  if (!force && cardExists(dataRoot, seed.id)) return
  if (force && cardExists(dataRoot, seed.id)) {
    const dir = agentCardDir(dataRoot, seed.id)
    try {
      rmSync(join(dir, 'agentCard.json'), { force: true })
      rmSync(join(dir, 'persona.md'), { force: true })
    } catch {
      /* ignore */
    }
  }
  const parsed: ParsedIntermediate = {
    displayName: seed.name,
    gender: seed.gender,
    roleOrTagline: seed.role ?? seed.name,
    personaMarkdown: seed.personaMarkdown,
    sourceFormat: 'local-form',
    formExtras: {
      speakingStyle: seed.speakingStyle,
      speechQuirks: seed.speechQuirks,
      coreConflict: seed.coreConflict,
      voiceSample: seed.voiceSample,
    },
  }
  const card = buildAgentCard(parsed, {
    presetId: seed.presetId,
    gender: seed.gender,
    social3D: { se: seed.se, sp: seed.sp, so: seed.so },
  })
  writeCardBundle(dataRoot, seed.id, card, seed.personaMarkdown)
}

export function seedIfNeeded(dataRoot: string): void {
  const db = getDatabase(dataRoot)
  if (!db) return
  const now = new Date().toISOString()
  const removed = listRemovedBuiltinIds(dataRoot)

  for (const seed of INITIAL_AGENTS) {
    if (seed.kind === 'social_member' && removed.has(seed.id)) continue

    const existing = getAgent(dataRoot, seed.id)
    if (!existing) {
      insertAgent(dataRoot, seedToInsert(seed, now))
      writeSeedCard(dataRoot, seed, false)
      continue
    }

    if (seed.kind !== 'social_member') continue

    const patch: Parameters<typeof updateAgent>[2] = {}
    if (existing.deletable !== 1) patch.deletable = 1

    const isStockName =
      LEGACY_BUILTIN_NAMES.has(existing.name) || existing.name === seed.name
    // 仅未改名的预制角色自动同步到最新人设；用户改过名的保留现状
    if (isStockName) {
      if (existing.gender !== seed.gender) patch.gender = seed.gender
      if (existing.preset_id !== seed.presetId) patch.preset_id = seed.presetId
      if (existing.se !== seed.se) patch.se = seed.se
      if (existing.sp !== seed.sp) patch.sp = seed.sp
      if (existing.so !== seed.so) patch.so = seed.so
      if (LEGACY_BUILTIN_NAMES.has(existing.name) && seed.name !== existing.name) {
        patch.name = seed.name
      }

      const needRewriteCard =
        Boolean(seed.personaMarkdown) &&
        (!cardExists(dataRoot, seed.id) ||
          existing.gender !== seed.gender ||
          existing.preset_id !== seed.presetId ||
          LEGACY_BUILTIN_NAMES.has(existing.name))

      if (needRewriteCard) {
        writeSeedCard(dataRoot, seed, true)
        patch.persona_source = 'preset+card'
        patch.persona_path = 'card/persona.md'
      }
    } else if (seed.personaMarkdown && !cardExists(dataRoot, seed.id)) {
      writeSeedCard(dataRoot, seed, false)
      patch.persona_source = 'preset+card'
      patch.persona_path = 'card/persona.md'
    }

    if (Object.keys(patch).length > 0) {
      patch.updated_at = now
      updateAgent(dataRoot, seed.id, patch)
    }
  }

  const all = listAgents(dataRoot)
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]
      const b = all[j]
      if (a.kind === 'primary' && b.kind === 'primary') continue
      upsertEdge(dataRoot, a.id, b.id, { trust: 25, stage: 'STRANGER' })
    }
  }
  refreshCache(dataRoot)
}

export function listRegisteredAgents(dataRoot: string): AgentRow[] {
  lastDataRoot = dataRoot
  const rows = listAgents(dataRoot)
  const m = cacheFor(dataRoot)
  m.clear()
  for (const r of rows) m.set(r.id, r)
  return rows
}

export function getRegisteredAgent(dataRoot: string, agentId: string): AgentRow | null {
  lastDataRoot = dataRoot
  const cached = cacheFor(dataRoot).get(agentId)
  if (cached) return cached
  const row = getAgent(dataRoot, agentId)
  if (row) cacheFor(dataRoot).set(agentId, row)
  return row
}

export function rememberAgent(dataRoot: string, row: AgentRow): void {
  lastDataRoot = dataRoot
  cacheFor(dataRoot).set(row.id, row)
}

export function forgetAgent(dataRoot: string, agentId: string): void {
  cacheFor(dataRoot).delete(agentId)
  if (agentId === PRIMARY_AGENT_ID) return
}
