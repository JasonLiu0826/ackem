// [extensions/ipc] — 扩展模块的 IPC 处理器
//
// 在主 IPC (ipc.ts) 中调用 registerExtensionIpc() 即可挂载所有扩展相关通道。
// 约定：所有扩展通道以 "ext:" 为前缀。

import { ipcMain } from 'electron'
import type { ExtensionsCoordinator } from './coordinator'
import type {
  GameProviderManifest,
  GameProviderConfig,
  GameModeInvokeRequest,
  GameModeInvokeResult
} from './gamemode/types'
import type {
  PluginManifest,
  PluginInstance,
  PluginPackage,
  PluginType,
  PluginPermission
} from './plugins/types'
import type {
  SkillManifest,
  SkillInstance,
  SkillFunctionDef
} from './skills/types'
import { isUserExtensionId } from '../../shared/openforuExtensions'

/** IPC-safe view — lifecycle hooks are functions and cannot be structured-cloned. */
export type SerializablePluginInstance = Omit<PluginInstance, 'hooks'> & { runnable: boolean }
export type SerializableSkillInstance = Omit<SkillInstance, 'hooks'> & { runnable: boolean }

function serializePlugin(
  p: PluginInstance,
  runnable: boolean
): SerializablePluginInstance {
  const { hooks: _hooks, ...rest } = p
  return { ...rest, runnable }
}

function serializeSkill(s: SkillInstance, runnable: boolean): SerializableSkillInstance {
  const { hooks: _hooks, ...rest } = s
  return { ...rest, runnable }
}
import { speakViaNotification } from './plugins/builtin/tool/tts-voice/bootstrap'
import { openLive2dPetShell } from './plugins/builtin/skin/live2d-desktop/bootstrap'
import { pulseScreenFx } from './plugins/builtin/skin/screen-effects/bootstrap'
import type { CompanionSkinBinding } from '../../shared/companionSkin'
import {
  listCompanionSkinCandidates,
  resolveActiveCompanionSkin,
  setActiveCompanionSkinPlugin,
  syncCompanionSkinOnPluginActivate,
  syncCompanionSkinOnPluginDeactivate
} from './plugins/companionSkin'

export function registerExtensionIpc(coordinator: ExtensionsCoordinator): void {

  // ═══════════════════════════════════════════════════════════
  // GameMode
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:gamemode:list', (): GameProviderManifest[] => {
    return coordinator.gameMode.listProviders()
  })

  ipcMain.handle('ext:gamemode:activate', async (_e, gameId: string, config: GameProviderConfig) => {
    await coordinator.gameMode.activateGame(gameId, config)
    return { ok: true }
  })

  ipcMain.handle('ext:gamemode:deactivate', async () => {
    await coordinator.gameMode.deactivateGame()
    return { ok: true }
  })

  ipcMain.handle('ext:gamemode:status', () => {
    return coordinator.gameMode.getActiveStatus()
  })

  ipcMain.handle(
    'ext:gamemode:invoke',
    async (_e, req: GameModeInvokeRequest): Promise<GameModeInvokeResult<unknown>> => {
      return coordinator.gameMode.invoke(req.gameId, req.method, req.params)
    }
  )

  // ═══════════════════════════════════════════════════════════
  // Plugins
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:plugins:list', (_e, type?: PluginType): SerializablePluginInstance[] => {
    const list = type
      ? coordinator.plugins.listByType(type)
      : coordinator.plugins.listInstalled()
    return list.map((p) => serializePlugin(p, coordinator.plugins.isRunnable(p.manifest.id)))
  })

  ipcMain.handle('ext:plugins:get', (_e, id: string): SerializablePluginInstance | undefined => {
    const p = coordinator.plugins.get(id)
    return p ? serializePlugin(p, coordinator.plugins.isRunnable(id)) : undefined
  })

  ipcMain.handle('ext:plugins:install', async (_e, pkg: PluginPackage, approvedPermissions?: PluginPermission[]) => {
    return coordinator.plugins.install(pkg, approvedPermissions)
  })

  ipcMain.handle('ext:plugins:activate', async (_e, id: string) => {
    if (isUserExtensionId(id)) {
      if (!coordinator.openforu.getUplugin(id)) {
        await coordinator.openforu.scanUplugins()
      }
      return coordinator.openforu.activateUplugin(id)
    }
    const result = await coordinator.plugins.activate(id)
    if (result.ok) syncCompanionSkinOnPluginActivate(id, coordinator.plugins)
    return result
  })

  ipcMain.handle('ext:plugins:deactivate', async (_e, id: string) => {
    if (isUserExtensionId(id)) {
      if (!coordinator.openforu.getUplugin(id)) {
        await coordinator.openforu.scanUplugins()
      }
      return coordinator.openforu.deactivateUplugin(id)
    }
    const result = await coordinator.plugins.deactivate(id)
    if (result.ok) syncCompanionSkinOnPluginDeactivate(id)
    return result
  })

  ipcMain.handle('ext:plugins:uninstall', async (_e, id: string) => {
    return coordinator.plugins.uninstall(id)
  })

  ipcMain.handle('ext:plugins:pendingPermissions', (_e, id: string): PluginPermission[] => {
    return coordinator.plugins.getPendingPermissions(id)
  })

  ipcMain.handle('ext:plugins:grantPermission', (_e, id: string, permission: PluginPermission) => {
    return coordinator.plugins.grantPermission(id, permission)
  })

  ipcMain.handle('ext:plugins:permissionInfo', (_e, permission: PluginPermission) => {
    return coordinator.plugins.getPermissionInfo(permission)
  })

  // ═══════════════════════════════════════════════════════════
  // 伴侣交互形象（skin 插件覆盖）
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:companionSkin:active', (): CompanionSkinBinding => {
    return resolveActiveCompanionSkin(coordinator.plugins)
  })

  ipcMain.handle('ext:companionSkin:list', (): CompanionSkinBinding[] => {
    return listCompanionSkinCandidates(coordinator.plugins)
  })

  ipcMain.handle('ext:companionSkin:setActive', (_e, pluginId: string | null | undefined) => {
    setActiveCompanionSkinPlugin(pluginId || undefined)
    return { ok: true }
  })

  // ═══════════════════════════════════════════════════════════
  // RuntimeContext — 用户活跃 / 时段 / 陪伴在场
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:runtime:context', () => {
    return coordinator.getRuntimeContext()
  })

  // ═══════════════════════════════════════════════════════════
  // Skills
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:skills:list', (): SerializableSkillInstance[] => {
    return coordinator.skills
      .listAll()
      .map((s) => serializeSkill(s, coordinator.skills.isRunnable(s.manifest.id)))
  })

  ipcMain.handle('ext:skills:get', (_e, id: string): SerializableSkillInstance | undefined => {
    const s = coordinator.skills.get(id)
    return s ? serializeSkill(s, coordinator.skills.isRunnable(id)) : undefined
  })

  ipcMain.handle('ext:skills:activate', async (_e, id: string) => {
    if (isUserExtensionId(id)) {
      if (!coordinator.openforu.getUskil(id)) {
        await coordinator.openforu.scanUskills()
      }
      return coordinator.openforu.activateUskil(id)
    }
    return coordinator.skills.activate(id)
  })

  ipcMain.handle('ext:skills:deactivate', async (_e, id: string) => {
    if (isUserExtensionId(id)) {
      if (!coordinator.openforu.getUskil(id)) {
        await coordinator.openforu.scanUskills()
      }
      return coordinator.openforu.deactivateUskil(id)
    }
    return coordinator.skills.deactivate(id)
  })

  ipcMain.handle('ext:skills:tools', (): SkillFunctionDef[] => {
    return coordinator.getAvailableTools()
  })

  // ═══════════════════════════════════════════════════════════
  // 扩展事件
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:events:pending', () => {
    return coordinator.drainAllEvents()
  })

  ipcMain.handle('ext:emotionHints', () => {
    return coordinator.getAggregatedEmotionHints()
  })

  // ═══════════════════════════════════════════════════════════
  // Extension Dispatch Catalog（ED-02）
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:catalog:list', (_e, sessionId?: string) => {
    return coordinator.getDispatchCatalog(sessionId)
  })

  ipcMain.handle('ext:catalog:byMode', (_e, sessionId?: string) => {
    return coordinator.getDispatchCatalogByMode(sessionId)
  })

  // ═══════════════════════════════════════════════════════════
  // W7 媒体会话状态（SMTC）
  // ═══════════════════════════════════════════════════════════

  ipcMain.handle('ext:media:status', async () => {
    const { getCachedMediaSession, formatMediaSession } = await import('../mediaSession.js')
    const info = getCachedMediaSession()
    return {
      title: info.title,
      artist: info.artist,
      album: info.album,
      isPlaying: info.isPlaying,
      formatted: formatMediaSession(info)
    }
  })

  /** FIX-026：TTS Stub — 诚实返回 notification_stub，非真语音 */
  ipcMain.handle('ext:tts:speak', (_e, payload: { text?: string }) => {
    return speakViaNotification(String(payload?.text ?? ''))
  })

  /** FIX-027：Live2D 桌宠 — 诚实返回 geometric_orb preview */
  ipcMain.handle('ext:live2d:openPet', () => openLive2dPetShell())

  /** FIX-028：屏幕特效 Stub — pulse 广播，非粒子 */
  ipcMain.handle('ext:screenFx:pulse', (_e, payload?: { ms?: number }) => {
    const ms = typeof payload?.ms === 'number' && payload.ms > 0 ? payload.ms : 1200
    return pulseScreenFx(ms)
  })
}
