// [P-07] 鍓嶅彴绐楀彛鏍囬鎰熺煡 鈥?W6 JP-C v0
import type { PluginManifest } from '../../../types'

export const FOREGROUND_DETECT_MANIFEST: PluginManifest = {
  id: 'Ackem/foreground-detect@0.0.1',
  name: '鍓嶅彴绐楀彛鎰熺煡',
  version: '0.0.1',
  category: 'plugin',
  pluginType: 'behavior',
  description:
    '璇诲彇鍓嶅彴绐楀彛鏍囬锛屼緵 ExtensionPolicy 鍦ㄤ細璁?婕旂ず/涓撴敞鏃舵姂鍒朵箙鍧愪笌鍠濇按鎻愰啋锛涢粯璁ゅ叧闂紝闇€鍦ㄦ墿灞曚腑蹇冨惎鐢?,
  author: 'JasonLiu0826',
  license: 'AGPL-3.0',
  main: 'register.ts',
  engineVersion: '>=0.1.0 <1.0.0',
  permissions: ['engine_read', 'foreground_detect'],
  fallbackPermissions: ['readonly'],
  tags: ['builtin', 'w6', 'p-07']
} as PluginManifest

export const FOREGROUND_DETECT_PLUGIN_ID = 'Ackem/foreground-detect@0.0.1'
export const PLUGIN_ID = FOREGROUND_DETECT_PLUGIN_ID
export const SPEC_ID = 'P-07'
