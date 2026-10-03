// [ipc/social] — 社会成员 Agent 管理：列表、创建、编辑、删除、头像、角色卡解析

import { existsSync, readFileSync } from 'node:fs'
import { join, extname } from 'node:path'
import { ipcMain } from 'electron'
import { PERSONALITY_PRESETS, sortPresetsForDisplay } from '../personalityPresets'
import {
  listRegisteredAgents,
  getRegisteredAgent,
  invalidateAgentCache,
} from '../social/agents/agentRegistry'
import { agentCardDir } from '../social/agents/agentPaths'
import { createFromLocal } from '../social/characterCard/import'
import { updateAgent as updateUserAgent } from '../social/characterCard/update'
import { purgeUserAgent } from '../social/characterCard/purge'
import { writeAgentAvatar, clearAgentAvatar } from '../social/characterCard/avatarStore'
import { loadOrCreateAgentCard } from '../social/characterCard/ensureCard'
import { parseFilePreview } from '../social/characterCard/parse'
import { recommendPresets } from '../social/characterCard/presetMatcher'
import { parsePlatformCard } from '../social/characterCard/platformImport'
import { social3dForPreset } from '../social/social3dPresets'
import type { CreateAgentInput, UpdateAgentInput } from '../social/characterCard/types'
import { CharacterCardError } from '../social/characterCard/types'
import type { AgentRow } from '../db/repos/agentsRepo'
import { ensureDataLayout, loadSettings, resolveDataRoot } from './shared'

function agentSummary(row: AgentRow) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    origin: row.origin,
    deletable: row.deletable === 1,
    presetId: row.preset_id,
    gender: row.gender,
    sessionId: row.session_id,
    se: row.se,
    sp: row.sp,
    so: row.so,
    personaSource: row.persona_source,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mimeForAvatarPath(filePath: string): string {
  const ext = extname(filePath).toLowerCase()
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return 'image/webp'
}

function resolveAvatarPath(dataRoot: string, agentId: string, avatarRel?: string | null): string | null {
  const dir = agentCardDir(dataRoot, agentId)
  const candidates = avatarRel
    ? [join(dir, avatarRel.replace(/^card\//, ''))]
    : [join(dir, 'avatar.webp'), join(dir, 'avatar.png')]
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  return null
}

function assertPathUnderRoot(dataRoot: string, filePath: string): void {
  const agentRoot = join(dataRoot, 'agents').replace(/\\/g, '/')
  const normalized = filePath.replace(/\\/g, '/')
  if (!normalized.startsWith(agentRoot)) {
    throw new Error('PATH_NOT_ALLOWED')
  }
  if (normalized.includes('..')) {
    throw new Error('PATH_NOT_ALLOWED')
  }
}

function mapCardError(e: unknown): { ok: false; code: string; message: string } {
  if (e instanceof CharacterCardError) {
    return { ok: false, code: e.code, message: e.message }
  }
  const msg = e instanceof Error ? e.message : String(e)
  if (msg === 'DATABASE_UNAVAILABLE') {
    return {
      ok: false,
      code: 'DATABASE_UNAVAILABLE',
      message:
        '本地数据库不可用（SQLite 未打开）。开发环境请执行：npx electron-builder install-app-deps 后重启应用。勿对 better-sqlite3 单独 npm rebuild（会破坏 Electron ABI）。',
    }
  }
  return { ok: false, code: 'INTERNAL', message: msg }
}

export function registerSocialIpc(): void {
  ipcMain.handle('social:listAgents', () => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    const rows = listRegisteredAgents(root).filter((r) => r.kind === 'social_member')
    return rows.map(agentSummary)
  })

  ipcMain.handle('social:getAgent', (_e, agentId: string) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    const row = getRegisteredAgent(root, agentId)
    return row ? agentSummary(row) : null
  })

  ipcMain.handle('social:getAgentCard', (_e, agentId: string) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    try {
      return { ok: true as const, card: loadOrCreateAgentCard(root, agentId) }
    } catch (e) {
      return mapCardError(e)
    }
  })

  ipcMain.handle(
    'social:parseCharacterCard',
    (
      _e,
      args: {
        format: 'md' | 'txt'
        content: string
        displayName?: string
        roleOrTagline?: string
        gender?: 'female' | 'male'
      }
    ) => {
      try {
        const parsed = parseFilePreview(args.format, args.content, {
          displayName: args.displayName,
          roleOrTagline: args.roleOrTagline,
          gender: args.gender,
        })
        const top3 = recommendPresets(parsed.displayName, parsed.personaMarkdown, parsed.gender, 3)
        return {
          ok: true as const,
          parsed: {
            displayName: parsed.displayName,
            gender: parsed.gender,
            roleOrTagline: parsed.roleOrTagline,
            personaMarkdown: parsed.personaMarkdown,
          },
          top3Presets: top3,
        }
      } catch (e) {
        return mapCardError(e)
      }
    }
  )

  ipcMain.handle('social:createAgent', async (_e, input: CreateAgentInput) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    try {
      const result = await createFromLocal(root, input, {
        ageConfirmed18: Boolean(settings.ageConfirmed18),
      })
      return { ok: true as const, agentId: result.agentId, warnings: result.warnings }
    } catch (e) {
      return mapCardError(e)
    }
  })

  ipcMain.handle('social:updateAgent', async (_e, input: UpdateAgentInput) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    try {
      await updateUserAgent(root, input, { ageConfirmed18: Boolean(settings.ageConfirmed18) })
      invalidateAgentCache(root, input.agentId)
      return { ok: true as const }
    } catch (e) {
      return mapCardError(e)
    }
  })

  ipcMain.handle('social:deleteAgent', async (_e, agentId: string) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    try {
      await purgeUserAgent(root, agentId)
      return { ok: true as const }
    } catch (e) {
      return mapCardError(e)
    }
  })

  ipcMain.handle(
    'social:setAgentAvatar',
    (
      _e,
      args: {
        agentId: string
        croppedBytes: Uint8Array
        mime: 'image/webp' | 'image/png'
        sourceBytes?: Uint8Array
        sourceMime?: string
        crop?: { x: number; y: number; width: number; height: number }
      }
    ) => {
      const settings = loadSettings()
      const root = resolveDataRoot(settings)
      ensureDataLayout(root)
      try {
        writeAgentAvatar(root, args.agentId, {
          croppedBytes: args.croppedBytes,
          mime: args.mime,
          sourceBytes: args.sourceBytes,
          sourceMime: args.sourceMime,
          crop: args.crop,
        })
        invalidateAgentCache(root, args.agentId)
        const row = getRegisteredAgent(root, args.agentId)
        return { ok: true as const, avatarUrl: row?.avatar_url ?? null }
      } catch (e) {
        return mapCardError(e)
      }
    }
  )

  ipcMain.handle('social:clearAgentAvatar', (_e, agentId: string) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    try {
      clearAgentAvatar(root, agentId)
      invalidateAgentCache(root, agentId)
      return { ok: true as const }
    } catch (e) {
      return mapCardError(e)
    }
  })

  ipcMain.handle('social:listPresetsForGender', (_e, gender?: 'female' | 'male') => {
    const g = gender ?? loadSettings().companionGender
    const filtered = PERSONALITY_PRESETS.filter((p) => p.gender === g)
    return sortPresetsForDisplay(filtered).map((p) => ({
      id: p.id,
      label: p.label,
      gender: p.gender,
      requiresAdult18: p.requiresAdult18 === true,
      social3D: social3dForPreset(p.id),
    }))
  })

  ipcMain.handle('social:parsePlatformCard', async (_e, _zipBytes: Uint8Array) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    return parsePlatformCard(root, _zipBytes)
  })

  ipcMain.handle('social:getAgentAvatarDataUrl', (_e, agentId: string) => {
    const settings = loadSettings()
    const root = resolveDataRoot(settings)
    ensureDataLayout(root)
    const row = getRegisteredAgent(root, agentId)
    if (!row) return { ok: false as const, code: 'NOT_FOUND', message: 'Agent 不存在' }
    const avatarPath = resolveAvatarPath(root, agentId, row.avatar_url)
    if (!avatarPath) return { ok: true as const, dataUrl: null }
    try {
      assertPathUnderRoot(root, avatarPath)
      const buf = readFileSync(avatarPath)
      const mime = mimeForAvatarPath(avatarPath)
      const dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      return { ok: true as const, dataUrl }
    } catch (e) {
      return mapCardError(e)
    }
  })
}
