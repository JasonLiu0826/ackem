// [openforu/uplugins] 占位标记
// 实装 Plugin 后由 loader.ts 扫描并注册

export const EXTENSION_PLACEHOLDER = true as const

export type UpluginPlaceholderMeta = {
  specId: string
  status: 'placeholder'
}
