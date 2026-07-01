// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；manifest.json 的 main 仅满足 schema。实装后注册 register.ts / skill.ts / bootstrap.ts。
// [P-16] 插件生态/市场 — 占位入口
// 实装后：实现 plugin.ts + register.ts，并在 plugins/builtin/register-placeholders.ts 中启用

import { MANIFEST, PLUGIN_ID, SPEC_ID } from './manifest'

/** 未实装；不参与运行时注册 */
export const PLACEHOLDER = true as const

export { MANIFEST, PLUGIN_ID, SPEC_ID }
