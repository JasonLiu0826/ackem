// [ipc] — IPC 注册入口：扩展引导 + 按域挂载 handler

import { loadSettings } from './settings'
import { resolveDataRoot } from './paths'
import { ExtensionsCoordinator } from './extensions/coordinator'
import { setExtensionsCoordinator } from './extensions/runtime'
import { startDispatchScheduler } from './extensions/dispatch/scheduler'
import { buildEngineSnapshot, buildMemoryMeta } from './extensions/snapshot'
import { createGameModeHostBridge } from './extensions/gamemode/host-bridge'
import { MinecraftProvider } from './extensions/gamemode/providers/minecraft/provider'
import { registerExtensionIpc } from './extensions/ipc'
import { registerOpenForUIpc } from './extensions/openforu/ipc'
import { registerMcIpc } from './extensions/gamemode/mc-ipc'
import { registerDesktopCompanionIpc } from './extensions/plugins/builtin/desktop-companion/ipc'
import { createLogger } from './logger'
import { registerDataIpc } from './ipc/data'
import { registerChatIpc } from './ipc/chat'
import { registerMemoryIpc } from './ipc/memory'
import { registerSessionIpc } from './ipc/session'
import { registerProfileIpc } from './ipc/profile'
import { registerWeixinIpc } from './ipc/weixin'
import { registerDesktopAgentIpc } from './desktop-agent/ipc'
import { registerSurfaceIpc } from './extensionSurfaceHost'
import { registerUpdateIpc } from './ipc/update'
import { ensureVoiceIpc } from './extensions/plugins/builtin/tool/tts-voice/bootstrap'
import { initLocale } from './i18n'
import {
  currentDataRoot,
  currentSessionId,
  getExtensionsCoordinator,
  getExtensionsRendererPush,
  getOrRebuildIndex,
  mergeEngineState,
  registerExtensionsRendererPush,
  setExtensionsCoordinatorRef,
  setMinecraftProviderRef
} from './ipc/shared'

export { getExtensionsCoordinator, registerExtensionsRendererPush } from './ipc/shared'

const log = createLogger('ipc')

export function registerIpc(): void {
  // Voice IPC available immediately; Python service starts after extensions boot.
  ensureVoiceIpc()

  const hostBridgeDeps = {
    loadSettings,
    resolveDataRoot,
    currentSessionId,
    mergeEngineState,
    getOrRebuildIndex
  }

  const root = resolveDataRoot(loadSettings())
  // 启动时从设置初始化 locale
  const settings = loadSettings()
  if (settings.locale) initLocale(settings.locale)
  const extCoordinator = new ExtensionsCoordinator(root)
  setExtensionsCoordinatorRef(extCoordinator)
  setExtensionsCoordinator(extCoordinator)
  const bridge = createGameModeHostBridge(hostBridgeDeps)
  const minecraftProvider = new MinecraftProvider(bridge)
  setMinecraftProviderRef(minecraftProvider)

  void (async () => {
    try {
      await extCoordinator.gameMode.registerProvider(minecraftProvider)
      const settings = loadSettings()
      const state = mergeEngineState(root, settings)
      const snap = buildEngineSnapshot(state, settings)
      await extCoordinator.boot(snap)
      minecraftProvider.ensureWsServer(19532)
      startDispatchScheduler({
        coordinator: extCoordinator,
        getSnapshot: () => {
          const s = loadSettings()
          const st = mergeEngineState(root, s)
          const sessionId = s.activeSessionId || 'default'
          return buildEngineSnapshot(st, s, buildMemoryMeta(root, sessionId))
        },
        onProactiveMessage: (payload) => {
          getExtensionsRendererPush()?.('dispatch:proactive', payload)
        }
      })
    } catch (e) {
      log.error('extensions boot failed', e)
    }
  })()

  registerExtensionIpc(extCoordinator)
  registerOpenForUIpc()
  registerDataIpc()
  registerChatIpc()
  registerMemoryIpc()
  registerProfileIpc()
  registerSessionIpc()
  registerWeixinIpc()
  registerDesktopAgentIpc()

  registerMcIpc(
    {
      loadSettings,
      resolveDataRoot,
      currentDataRoot,
      currentSessionId,
      mergeEngineState,
      getOrRebuildIndex
    },
    getExtensionsCoordinator
  )

  registerDesktopCompanionIpc()
  registerSurfaceIpc()
  registerUpdateIpc()
}
