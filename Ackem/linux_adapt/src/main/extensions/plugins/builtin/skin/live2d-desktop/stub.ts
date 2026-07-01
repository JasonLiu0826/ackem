// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；manifest.json 的 main 仅满足 schema。实装后注册 register.ts / skill.ts / bootstrap.ts。
// [P-01] Live2D — scaffold 占位入口（运行时见 bootstrap.ts + Live2dCompanionSkin）

import {
  MANIFEST,
  PLUGIN_ID,
  SPEC_ID,
  LIVE2D_DESKTOP_IMPLEMENTATION_STATUS
} from './manifest'

/** 仍为几何预览，非 W8 Cubism */
export const PLACEHOLDER = true as const
export const IMPLEMENTATION_STATUS = LIVE2D_DESKTOP_IMPLEMENTATION_STATUS

export { MANIFEST, PLUGIN_ID, SPEC_ID }
