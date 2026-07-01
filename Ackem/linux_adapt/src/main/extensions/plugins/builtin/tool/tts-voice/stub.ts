// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；实装后注册 register.ts / bootstrap.ts。
// [P-04] voice-pipeline — 从 stub 升级为 dev

import { MANIFEST, PLUGIN_ID, SPEC_ID } from './manifest'

export const PLACEHOLDER = false as const
export const IMPLEMENTATION_STATUS = 'dev' as const

export { MANIFEST, PLUGIN_ID, SPEC_ID }
