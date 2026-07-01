/** 内置 Skill 占位标记 */
export const EXTENSION_PLACEHOLDER = true as const

export type ExtensionPlaceholderMeta = {
  specId: string
  status: 'placeholder'
}
