// @ackem-extension-stub-not-runtime — 见 src/main/extensions/STUB_FILES.md
// 此文件不是运行时入口；manifest.json 的 main 仅满足 schema。实装后注册 register.ts / skill.ts / bootstrap.ts。
// [S-18] 桌宠交互 — 占位入口
// 实装后：实现 skill.ts（SkillHandler）并在 skills/builtin/register-placeholders.ts 中注册

import { MANIFEST, SKILL_ID, SPEC_ID } from './manifest'

export const PLACEHOLDER = true as const

export { MANIFEST, SKILL_ID, SPEC_ID }
