import type { PluginRegistry } from '../../../registry'
import {
  setForegroundPollingEnabled,
  updateForegroundTitle
} from '../../../../../context/foregroundState'
import { FOREGROUND_DETECT_MANIFEST, FOREGROUND_DETECT_PLUGIN_ID } from './manifest'
import { readForegroundWindowTitle, startForegroundPolling, stopForegroundPolling } from './poll'

export async function registerBuiltinForegroundDetect(registry: PluginRegistry): Promise<void> {
  const reg = await registry.registerBuiltin(FOREGROUND_DETECT_MANIFEST, {
    onLoad: async () => {
      setForegroundPollingEnabled(true)
      const title = await readForegroundWindowTitle()
      updateForegroundTitle(title)
      startForegroundPolling()
      return { ok: true }
    },
    onUnload: async () => {
      stopForegroundPolling()
      setForegroundPollingEnabled(false)
      return { ok: true as const }
    }
  })
  if (!reg.ok && !String(reg.error).includes('已注册')) {
    throw new Error(reg.error ?? '前台检测插件注册失败')
  }
  // W6：默认关 — 不调用 ensurePluginActive
}

export { FOREGROUND_DETECT_PLUGIN_ID }
