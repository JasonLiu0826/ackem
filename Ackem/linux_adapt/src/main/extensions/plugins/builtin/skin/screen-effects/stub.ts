// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；manifest.json 的 main 仅满足 schema。实装后注册 register.ts / skill.ts / bootstrap.ts。
// [P-10] 屏幕特效 — scaffold 占位入口（运行时见 bootstrap.ts + register.ts）

import { MANIFEST, PLUGIN_ID, SPEC_ID, SCREEN_EFFECTS_IMPLEMENTATION_STATUS } from './manifest'

/** 仍为 Stub，非 W8 粒子特效 */
export const PLACEHOLDER = true as const
export const IMPLEMENTATION_STATUS = SCREEN_EFFECTS_IMPLEMENTATION_STATUS

export { MANIFEST, PLUGIN_ID, SPEC_ID }
