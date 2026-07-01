/**
 * FIX-033 — extensions 下 stub.ts 占位文件约定（非运行时）
 *
 * 详见同目录 STUB_FILES.md
 */

/** 每个 stub.ts 首行必须包含此 marker，供 stubFiles.test.ts 校验 */
export const EXTENSION_STUB_MARKER = '@ackem-extension-stub-not-runtime'

/** stub 文件总数（plugins + skills catalog 占位，共 35 个） */
export const EXTENSION_STUB_FILE_COUNT = 35

/** 运行时注册表 — 禁止 import ./stub */
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
