// [ipc/shared] 鈥?IPC 鍩熸ā鍧楀叡浜細鏁版嵁鏍广€佺储寮曠紦瀛樸€佸紩鎿庣姸鎬佸悎骞躲€佹墿灞曞崗璋冨櫒寮曠敤

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildIndex, persistDerivedIndex, tryLoadDerivedIndex, type IndexSnapshot } from '../indexer'
import { loadSettings, saveSettings, type AppSettings } from '../settings'
import { resolveDataRoot, formatDataRootDisplayPaths } from '../paths'
import { clearStructuredData } from '../db/database'
import { deleteChatHistoryFromDb } from '../db/repos/chatHistory'
import { ensureDataLayout } from '../layout'
import { loadState, saveState, defaultFullState } from '../engine/state-persistence'
import { defaultPersonalitySlice } from '../personalityPresets'
import { STATE_JSON_VERSION } from '../engine/AckemParams'
import type { FullState } from '../engine/types'
import { invalidateEngineCache } from '../engineCache'
import type { BuildContextArgs } from '../context'
import { MemoryConsolidator } from '../memory/consolidator'
import {
  getLastConsolidationTurn as getPersistedLastConsolidationTurn,
  setLastConsolidationTurn as setPersistedLastConsolidationTurn,
} from '../engine/state-persistence'
import type { ExtensionsCoordinator } from '../extensions/coordinator'
import type { MinecraftProvider } from '../extensions/gamemode/providers/minecraft/provider'

let indexCache: IndexSnapshot | null = null
export const sharedConsolidator = new MemoryConsolidator()

let extCoordinator: ExtensionsCoordinator | null = null
let minecraftProvider: MinecraftProvider | null = null
let registerExtensionsRendererPushRef: ((channel: string, payload: unknown) => void) | null = null

export type ContextBuildInvoke = Omit<BuildContextArgs, 'index' | 'settings'> & {
  sessionId?: string
  turnIndex?: number
  /** 鑱婂ぉ椤电數鑴戝姪鎵嬫ā寮忥紙鏈細璇濓級 */
  desktopAgentChatMode?: boolean
  /** dispatch:respond 閲嶅叆锛氱敤鎴峰凡纭/鎷掔粷鎵╁睍 */
  dispatchRespond?: { accepted: boolean; extensionId: string; remember?: boolean }
}

export function getExtensionsCoordinator(): ExtensionsCoordinator | null {
  return extCoordinator
}

export function setExtensionsCoordinatorRef(coordinator: ExtensionsCoordinator | null): void {
  extCoordinator = coordinator
}

export function getMinecraftProvider(): MinecraftProvider | null {
  return minecraftProvider
}

export function setMinecraftProviderRef(provider: MinecraftProvider | null): void {
  minecraftProvider = provider
}

export function registerExtensionsRendererPush(
  fn: (channel: string, payload: unknown) => void
): void {
  registerExtensionsRendererPushRef = fn
  minecraftProvider?.registerRendererPush(fn)
}

export function getExtensionsRendererPush(): ((channel: string, payload: unknown) => void) | null {
  return registerExtensionsRendererPushRef
}

export function getLastConsolidationTurn(): number {
  return getPersistedLastConsolidationTurn(currentDataRoot(), currentSessionId())
}

export function setLastConsolidationTurn(turn: number): void {
  setPersistedLastConsolidationTurn(currentDataRoot(), turn, currentSessionId())
}

export function currentDataRoot(): string {
  return resolveDataRoot(loadSettings())
}

export function currentSessionId(): string {
  return loadSettings().activeSessionId || 'default'
}

export function refreshIndex(): IndexSnapshot {
  const s = loadSettings()
  const root = resolveDataRoot(s)
  ensureDataLayout(root)
  const snap = buildIndex(s)
  persistDerivedIndex(root, snap)
  indexCache = snap
  return snap
}

export function getOrRebuildIndex(): IndexSnapshot {
  const s = loadSettings()
  const root = resolveDataRoot(s)
  ensureDataLayout(root)
  if (indexCache && indexCache.dataRoot === root) return indexCache
  const loaded = tryLoadDerivedIndex(root)
  if (loaded) {
    indexCache = loaded
    return loaded
  }
  return refreshIndex()
}

export function invalidateIndexCache(root: string): void {
  indexCache = null
  invalidateEngineCache(root)
}

export function mergeEngineState(root: string, settings: AppSettings): FullState {
  const pers = defaultPersonalitySlice(settings)
  const sessionId = settings.activeSessionId || 'default'
  const loaded = loadState(root, sessionId)
  if (!loaded) return defaultFullState(pers)
  const s = { ...loaded }
  if (!s.counters) s.counters = { totalTurns: 0, sharedEventsCount: 0, consecutiveMeaningfulTurns: 0 }
  if (!s.personality || s.personality.presetId !== settings.personalityPresetId) {
    s.personality = pers
    s.personalityBaseline = { T: pers.T, I: pers.I, S: pers.S, O: pers.O, R: pers.R }
  }
  if (!s.userProfile) {
    s.userProfile = defaultFullState(pers).userProfile
  }
  if (!s.externalAtmosphere) {
    s.externalAtmosphere = { level: 0, label: 'neutral' }
  }
  if (!s.personalityBaseline && s.personality) {
    const p = s.personality
    s.personalityBaseline = { T: p.T, I: p.I, S: p.S, O: p.O, R: p.R }
  }
  if (!s.desireStack) {
    s.desireStack = { slots: [null, null, null, null, null] }
  }
  if (!s.offlineThoughts) {
    s.offlineThoughts = []
  }
  if (s.version !== STATE_JSON_VERSION) s.version = STATE_JSON_VERSION
  return s
}

/** 鍒犻櫎 companion 涓嬪叏閮ㄨ亰澶╄褰曟枃浠讹紙鍚棫鐗?chat-history.json锛?*/
export function clearChatHistoryFiles(root: string): void {
  const companionDir = join(root, 'companion')
  if (!existsSync(companionDir)) return
  for (const entry of readdirSync(companionDir)) {
    const isLegacy = entry === 'chat-history.json'
    const isSession = entry.startsWith('chat-history-') && entry.endsWith('.json')
    if (!isLegacy && !isSession) continue
    try {
      rmSync(join(companionDir, entry))
    } catch {
      /* skip */
    }
  }
  deleteChatHistoryFromDb(root)
}

export function saveSessionsFile(
  root: string,
  sessions: Array<{ id: string; name: string; createdAt: string; lastActive: string }>
): void {
  writeFileSync(join(root, 'sessions.json'), JSON.stringify(sessions, null, 2), 'utf-8')
}

export function loadSessionsFile(
  root: string
): Array<{ id: string; name: string; createdAt: string; lastActive: string }> {
  const path = join(root, 'sessions.json')
  try {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf-8')) as Array<{
        id: string
        name: string
        createdAt: string
        lastActive: string
      }>
    }
  } catch {
    /* ignore */
  }
  const statePath = join(root, 'companion', 'state.json')
  if (existsSync(statePath)) {
    return [
      {
        id: 'default',
        name: '榛樿浼氳瘽',
        createdAt: new Date(0).toISOString(),
        lastActive: new Date().toISOString()
      }
    ]
  }
  return []
}

export { saveState, saveSettings, loadSettings, resolveDataRoot, formatDataRootDisplayPaths, ensureDataLayout, defaultFullState, defaultPersonalitySlice }
