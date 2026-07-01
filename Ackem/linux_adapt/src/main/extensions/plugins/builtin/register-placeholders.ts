// 内置 Plugin 注册表
// stub.ts 非运行时 — 见 extensions/STUB_FILES.md（FIX-033）

import type { PluginRegistry } from '../registry'
import { registerBuiltinThemeToggle } from './theme/theme-toggle/register'
import { registerBuiltinTtsVoice } from './tool/tts-voice/register'
// P-05 screenshot: deprecated 2026-06-06，代码保留作底层能力，不再注册
// import { registerBuiltinScreenshot } from './tool/screenshot/register'
import { registerBuiltinScreenEffects } from './skin/screen-effects/register'
import { registerBuiltinLive2dDesktop } from './skin/live2d-desktop/register'
import { registerBuiltinForegroundDetect } from './behavior/foreground-detect/register'

/** 注册所有已实装的内置 Plugin */
export async function registerBuiltinPlugins(registry: PluginRegistry): Promise<void> {
  await registerBuiltinThemeToggle(registry)
  await registerBuiltinTtsVoice(registry)
  // P-05 screenshot: deprecated 2026-06-06
  // await registerBuiltinScreenshot(registry)
  await registerBuiltinScreenEffects(registry)
  await registerBuiltinLive2dDesktop(registry)
  await registerBuiltinForegroundDetect(registry)
}

/** 规划中的占位 Plugin ID（与 register-catalog 同源，FIX-031） */
export { PLACEHOLDER_PLUGIN_IDS } from './register-catalog'

/** 已下线 catalog Plugin ID（FIX-032） */
export { CATALOG_DEPRECATED_PLUGIN_IDS as DEPRECATED_PLUGIN_IDS } from './register-deprecated-catalog'
