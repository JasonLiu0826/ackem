// [openforu/uskills] 占位标记
// 实装 Skill 后由 loader.ts 扫描并注册

export const EXTENSION_PLACEHOLDER = true as const

export type UskilPlaceholderMeta = {
  specId: string
  status: 'placeholder'
}
