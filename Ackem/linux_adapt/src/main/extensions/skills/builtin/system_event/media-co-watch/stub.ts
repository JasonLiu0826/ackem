// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；manifest.json 的 main 仅满足 schema。实装后注册 register.ts / skill.ts / bootstrap.ts。
// [S-08] media-co-watch — scaffold 占位入口（运行时见 skill.ts + register.ts）

import { MANIFEST, SKILL_ID, SPEC_ID, MEDIA_CO_WATCH_IMPLEMENTATION_STATUS } from './manifest'

export const PLACEHOLDER = true as const
export const IMPLEMENTATION_STATUS = MEDIA_CO_WATCH_IMPLEMENTATION_STATUS

export { MANIFEST, SKILL_ID, SPEC_ID }
