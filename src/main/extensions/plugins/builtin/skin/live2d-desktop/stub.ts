// @Ackem-extension-stub-not-runtime 鈥?瑙?src/main/extensions/STUB_FILES.md
// 姝ゆ枃浠朵笉鏄繍琛屾椂鍏ュ彛锛沵anifest.json 鐨?main 浠呮弧瓒?schema銆傚疄瑁呭悗娉ㄥ唽 register.ts / skill.ts / bootstrap.ts銆?
// [P-01] Live2D 鈥?scaffold 鍗犱綅鍏ュ彛锛堣繍琛屾椂瑙?bootstrap.ts + Live2dCompanionSkin锛?

import {
  MANIFEST,
  PLUGIN_ID,
  SPEC_ID,
  LIVE2D_DESKTOP_IMPLEMENTATION_STATUS
} from './manifest'

/** 浠嶄负鍑犱綍棰勮锛岄潪 W8 Cubism */
export const PLACEHOLDER = true as const
export const IMPLEMENTATION_STATUS = LIVE2D_DESKTOP_IMPLEMENTATION_STATUS

export { MANIFEST, PLUGIN_ID, SPEC_ID }
