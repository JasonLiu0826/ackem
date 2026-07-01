/** 内置 Plugin 占位标记 — 实装模块可删除此 re-export */
export const EXTENSION_PLACEHOLDER = true as const

export type ExtensionPlaceholderMeta = {
  specId: string
  status: 'placeholder'
}
