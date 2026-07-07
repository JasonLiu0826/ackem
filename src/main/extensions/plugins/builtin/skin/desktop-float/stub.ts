// @Ackem-extension-stub-not-runtime 鈥?瑙?src/main/extensions/STUB_FILES.md
// 姝ゆ枃浠朵笉鏄繍琛屾椂鍏ュ彛锛沵anifest.json 鐨?main 浠呮弧瓒?schema銆傚疄瑁呭悗娉ㄥ唽 register.ts / skill.ts / bootstrap.ts銆?
// [P-04] 妗岄潰鎮诞闄即 鈥?鍗犱綅鍏ュ彛
// 瀹炶鍚庯細瀹炵幇 plugin.ts + register.ts锛屽苟鍦?plugins/builtin/register-placeholders.ts 涓惎鐢?

import { MANIFEST, PLUGIN_ID, SPEC_ID } from './manifest'

/** 鏈疄瑁咃紱涓嶅弬涓庤繍琛屾椂娉ㄥ唽 */
export const PLACEHOLDER = true as const

export { MANIFEST, PLUGIN_ID, SPEC_ID }
