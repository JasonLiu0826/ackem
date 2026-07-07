/**
 * FIX-033 鈥?extensions 涓?stub.ts 鍗犱綅鏂囦欢绾﹀畾锛堥潪杩愯鏃讹級
 *
 * 璇﹁鍚岀洰褰?STUB_FILES.md
 */

/** 姣忎釜 stub.ts 棣栬蹇呴』鍖呭惈姝?marker锛屼緵 stubFiles.test.ts 鏍￠獙 */
export const EXTENSION_STUB_MARKER = '@Ackem-extension-stub-not-runtime'

/** stub 鏂囦欢鎬绘暟锛坧lugins + skills catalog 鍗犱綅锛屽叡 35 涓級 */
export const EXTENSION_STUB_FILE_COUNT = 35

/** 杩愯鏃舵敞鍐岃〃 鈥?绂佹 import ./stub */
export const EXTENSION_RUNTIME_ENTRY_BASENAMES = [
  'register.ts',
  'skill.ts',
  'bootstrap.ts',
  'plugin.ts'
] as const

export function isExtensionStubMarkerPresent(source: string): boolean {
  return source.includes(EXTENSION_STUB_MARKER)
}

export function isExtensionStubPlaceholderExport(source: string): boolean {
  return /export const PLACEHOLDER = true as const/.test(source)
}
